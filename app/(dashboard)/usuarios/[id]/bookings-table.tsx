"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailGrid, type DetailField } from "@/components/ui/detail-grid";
import { Badge } from "@/components/ui/badge";
import { Timestamp } from "@/components/ui/timestamp";
import { Price } from "@/components/ui/payment-legs";
import { PlayerLink } from "@/components/ui/player-link";
import { formatCurrency } from "@/lib/utils";
import type { components } from "@/lib/api/openapi";

type Booking = components["schemas"]["OpsDossierBooking"];
type Leg = components["schemas"]["PaymentLeg"];

/**
 * A booking is TERMINAL when nobody is going to collect on it any more. This is
 * the same rule booking-service applies when it computes `unpaid_legs`
 * (isSettledTerminal), and the table has to agree with it: an unpaid leg on a
 * cancelled booking is not a debt, and painting it red would send the founder
 * chasing money that no longer exists. Red stays reserved for money he can
 * actually still collect.
 */
function isTerminal(status: string): boolean {
  return status === "cancelled" || status === "refunded";
}

/** Statuses the BFF actually emits. An unknown one falls through to `default`
    rather than being hidden — a status the UI has not learned about is still a
    fact about the booking. */
function statusVariant(status: string) {
  switch (status) {
    case "confirmed":
      return "success" as const;
    case "cancelled":
    case "no_show":
      return "error" as const;
    case "pending_payment":
    case "pending":
      return "warning" as const;
    case "refunded":
    case "completed":
      return "info" as const;
    default:
      return "default" as const;
  }
}

/**
 * This player's own half of the split, which is the whole reason this column
 * exists: LITS charges each side separately, so the booking-level
 * `payment_status` cannot tell you whether the PERSON you are looking at owes
 * anything. In the seeded data there are bookings sitting at
 * `payment_status: "approved"` whose host leg is still `paid: false` — the
 * booking-level field would have told the founder this player was square.
 */
function LegCell({ priceCents, status, leg }: { priceCents: number; status: string; leg: Leg }) {
  // Free booking (public court): nobody paid and nobody owes.
  if (priceCents === 0) {
    return <span className="text-[11px] text-[var(--text-tertiary)]">grátis</span>;
  }
  if (leg.paid) {
    return (
      <span
        title={
          leg.amount_cents > 0
            ? `Pagou ${formatCurrency(leg.amount_cents, leg.currency ?? "BRL")}`
            : "Perna quitada"
        }
        className="text-[11px] text-[var(--text-tertiary)]"
      >
        pago
      </span>
    );
  }
  // Unpaid, but the booking is dead — real, and not collectable. Stated, not alarmed.
  if (isTerminal(status)) {
    return (
      <span
        title="Perna não quitada, mas a reserva está encerrada — não há o que cobrar."
        className="text-[11px] text-[var(--text-tertiary)]"
      >
        não cobrado
      </span>
    );
  }
  return <Badge variant="error">Não pagou</Badge>;
}

export function DossierBookingsTable({ bookings }: { bookings: Booking[] }) {
  const columns: DataTableColumn<Booking>[] = [
    {
      id: "starts_at",
      header: "Partida",
      width: "150px",
      sortAccessor: (b) => (b.starts_at ? new Date(b.starts_at).getTime() : null),
      render: (b) =>
        b.starts_at ? (
          <Timestamp iso={b.starts_at} className="text-[11.5px]" />
        ) : (
          <span className="text-[var(--text-tertiary)]">—</span>
        ),
    },
    {
      id: "court",
      header: "Quadra",
      width: "1fr",
      sortAccessor: (b) => b.court_label,
      render: (b) => <span className="block truncate">{b.court_label}</span>,
    },
    {
      id: "role",
      header: "Papel",
      width: "82px",
      sortAccessor: (b) => b.role,
      render: (b) => (
        <span className="label-colus text-[8.5px] text-[var(--text-secondary)]">
          {b.role === "host" ? "Host" : "Convidado"}
        </span>
      ),
    },
    {
      id: "opponent",
      header: "Adversário",
      width: "1fr",
      sortAccessor: (b) => b.opponent?.name ?? null,
      render: (b) =>
        b.opponent ? (
          <PlayerLink userId={b.opponent.user_id} name={b.opponent.name} />
        ) : (
          // A booking with no guest is not a booking with a missing guest.
          <span className="text-[11px] text-[var(--text-tertiary)]">sem convidado</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      width: "118px",
      sortAccessor: (b) => b.status,
      render: (b) => <Badge variant={statusVariant(b.status)}>{b.status}</Badge>,
    },
    {
      id: "price",
      header: "Valor",
      width: "92px",
      align: "right",
      sortAccessor: (b) => b.price_cents,
      render: (b) => <Price cents={b.price_cents} currency={b.currency} />,
    },
    {
      id: "leg",
      header: "Sua parte",
      width: "100px",
      sortAccessor: (b) => (b.their_leg.paid ? 1 : 0),
      render: (b) => <LegCell priceCents={b.price_cents} status={b.status} leg={b.their_leg} />,
    },
  ];

  return (
    <DataTable
      rows={bookings}
      columns={columns}
      rowKey={(b) => b.booking_id}
      initialSort={{ columnId: "starts_at", direction: "desc" }}
      searchPlaceholder="Quadra, adversário, status…"
      searchText={(b) => `${b.court_label} ${b.opponent?.name ?? ""} ${b.status} ${b.role}`}
      filters={[
        {
          id: "money",
          label: "Pagamento",
          options: [
            {
              value: "unpaid",
              label: "Perna em aberto",
              // Exactly the BFF's unpaid_legs rule: chargeable, live, unsettled.
              predicate: (b) => b.price_cents > 0 && !isTerminal(b.status) && !b.their_leg.paid,
            },
            { value: "free", label: "Grátis", predicate: (b) => b.price_cents === 0 },
          ],
        },
        {
          id: "role",
          label: "Papel",
          options: [
            { value: "host", label: "Host", predicate: (b) => b.role === "host" },
            { value: "guest", label: "Convidado", predicate: (b) => b.role === "guest" },
          ],
        },
      ]}
      rowClassName={(b) =>
        b.price_cents > 0 && !isTerminal(b.status) && !b.their_leg.paid
          ? "bg-[var(--color-error-bg)]/25"
          : undefined
      }
      emptyMessage="Este jogador não tem nenhuma reserva — nem como host, nem como convidado."
      renderDetail={(b) => {
        const fields: DetailField[] = [
          { label: "Booking ID", value: b.booking_id, mono: true },
          { label: "Papel", value: b.role === "host" ? "Host" : "Convidado" },
          { label: "Status", value: b.status },
          {
            label: "Valor total",
            value: <Price cents={b.price_cents} currency={b.currency} />,
          },
          {
            label: "Perna deste jogador",
            value: b.their_leg.paid
              ? `Pago — ${formatCurrency(b.their_leg.amount_cents, b.their_leg.currency ?? "BRL")}`
              : "Não pago",
          },
        ];

        // Every field below is printed ONLY when the API actually sent it. An
        // absent played_at means the match was never marked as played; an absent
        // cancelled_at on a cancelled row is a legacy row whose lead time is
        // genuinely unknowable. Neither gets a "—" pretending to be a value.
        if (b.payment_status) {
          fields.push({ label: "Pagamento (reserva)", value: b.payment_status });
        }
        if (b.created_at) {
          fields.push({ label: "Criada em", value: <Timestamp iso={b.created_at} /> });
        }
        if (b.played_at) {
          fields.push({ label: "Jogada em", value: <Timestamp iso={b.played_at} /> });
        }
        if (b.cancelled_at) {
          fields.push({ label: "Cancelada em", value: <Timestamp iso={b.cancelled_at} /> });
        }
        if (b.hours_before !== undefined) {
          fields.push({
            label: "Antecedência",
            value: `${b.hours_before.toFixed(1)}h antes da partida`,
          });
        }
        if (b.cancel_reason) {
          // The reason does NOT say who cancelled — bookings has no cancelled_by
          // column. The label says "motivo", never "cancelado por".
          fields.push({ label: "Motivo do cancelamento", value: b.cancel_reason, span: true });
        }

        return <DetailGrid fields={fields} />;
      }}
    />
  );
}
