"use client";

import { MapPin } from "lucide-react";
import { DataTable, type DataTableColumn, type DataTableFilterGroup } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid } from "@/components/ui/detail-grid";
import { PaymentLegs, Price } from "@/components/ui/payment-legs";
import type { components } from "@/lib/api/openapi";
import { Player, When, rail } from "../_components/cells";
import { CountdownTimer, URGENT_MS } from "./countdown-timer";

type OpenInviteItem = components["schemas"]["OpenInviteItem"];

const filters: DataTableFilterGroup<OpenInviteItem>[] = [
  {
    id: "urgency",
    label: "Prazo",
    options: [
      {
        value: "soon",
        label: "Expirando (< 30min)",
        predicate: (i) => {
          const left = new Date(i.expires_at).getTime() - Date.now();
          return left > 0 && left < URGENT_MS;
        },
      },
      {
        // The window has closed and the guest never answered. Was hidden inside
        // the "expiring" bucket before, which lumped "call him NOW" together with
        // "too late, this one is dead" — opposite actions, same chip.
        value: "expired",
        label: "Expirado",
        predicate: (i) => new Date(i.expires_at).getTime() <= Date.now(),
      },
      {
        value: "stale",
        label: "Partida já passou",
        predicate: (i) => new Date(i.starts_at).getTime() < Date.now(),
      },
    ],
  },
];

/**
 * The countdown leads. This panel exists to answer one question — "quem eu
 * preciso cutucar agora?" — and the answer is whichever row is at the top.
 * The guest, the person he actually messages, sits immediately beside it.
 */
const columns: DataTableColumn<OpenInviteItem>[] = [
  {
    id: "expires_at",
    header: "Expira em",
    width: "104px",
    /**
     * Expired invites sort as null, which sinks them to the bottom (DataTable puts
     * nulls last in both directions).
     *
     * Sorting on the raw timestamp looked right and read backwards: an expired
     * invite has the EARLIEST expires_at of all, so the four dead ones took the top
     * four rows and the two the founder could still save — 4 minutes and 18 minutes
     * left on the clock — sat below the fold of his attention. The panel's own
     * subtitle promises "o topo da lista é quem precisa de um WhatsApp agora"; this
     * is what makes that sentence true.
     */
    sortAccessor: (i) => {
      const left = new Date(i.expires_at).getTime() - Date.now();
      return left > 0 ? left : null;
    },
    render: (i) => <CountdownTimer expiresAt={i.expires_at} />,
  },
  {
    id: "guest",
    header: "Convidado",
    sortAccessor: (i) => i.guest.name,
    render: (i) => <Player name={i.guest.name} id={i.guest.user_id} strong />,
  },
  {
    id: "host",
    header: "Host",
    sortAccessor: (i) => i.host.name,
    render: (i) => <Player name={i.host.name} id={i.host.user_id} />,
  },
  {
    id: "court",
    header: "Quadra",
    sortAccessor: (i) => i.court_label,
    render: (i) => (
      <span className="flex min-w-0 items-center gap-1">
        <MapPin size={11} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="truncate">{i.court_label}</span>
      </span>
    ),
  },
  {
    id: "starts_at",
    header: "Partida",
    width: "148px",
    sortAccessor: (i) => new Date(i.starts_at).getTime(),
    render: (i) => {
      // An invite still open for a match that ALREADY HAPPENED is not a countdown
      // to anything — it is a dead row, and there are real ones in the beta right
      // now. Saying "há 3 dias" in muted grey next to a live timer would let it
      // pass for normal, so it gets named.
      const past = new Date(i.starts_at).getTime() < Date.now();
      return (
        <div className="flex flex-col gap-1">
          <When iso={i.starts_at} />
          {past && <Badge variant="warning">Já passou</Badge>}
        </div>
      );
    },
  },
  {
    id: "price",
    header: "Valor",
    width: "84px",
    align: "right",
    sortAccessor: (i) => i.price_cents,
    render: (i) => <Price cents={i.price_cents} currency={i.currency} />,
  },
  {
    id: "payment",
    header: "Pagou?",
    width: "142px",
    /**
     * The HOST leg is the only one that carries information here.
     *
     * Every row on this panel is a booking in awaiting_guest_accept, and
     * booking-service only accepts a guest payment from awaiting_guest_PAYMENT —
     * the status the booking reaches AFTER the guest accepts. So the guest leg is
     * unpaid on 100% of these rows by construction; it was painting a red "✗ Conv."
     * on all 8 of 8, which is a debt the guest does not owe and an alert colour
     * spent on nothing. It now reads "aguardando aceite", in neutral.
     *
     * The host leg is genuinely variable — an invite CAN go out on a slot the host
     * never settled — so it keeps the red, and sorts to the top when unpaid.
     */
    sortAccessor: (i) => (i.host_payment.paid ? 1 : 0),
    render: (i) => (
      <PaymentLegs
        priceCents={i.price_cents}
        host={i.host_payment}
        guest={i.guest_payment}
        hasGuest
        guestAwaitingAccept
      />
    ),
  },
];

export function OpenInvitesTable({ invites }: { invites: OpenInviteItem[] }) {
  return (
    <DataTable
      rows={invites}
      columns={columns}
      filters={filters}
      initialSort={{ columnId: "expires_at", direction: "asc" }}
      rowKey={(i) => i.booking_id}
      searchText={(i) => `${i.host.name} ${i.guest.name} ${i.court_label}`}
      searchPlaceholder="Buscar por jogador ou quadra..."
      emptyMessage="Nenhum convite em aberto."
      noResultsMessage="Nenhum convite encontrado para esse filtro ou busca."
      /**
       * Clay, not red: a closing invite is time pressure, not money owed. Red is
       * spent on the unpaid legs in the "Pagou?" column and nowhere else on this
       * panel, which is exactly why it still means something there.
       *
       * An already-expired invite gets NO rail. The window is shut; decorating it
       * would put weight on the one row he can no longer do anything about.
       */
      rowClassName={(i) => {
        const left = new Date(i.expires_at).getTime() - Date.now();
        if (left <= 0) return undefined;
        return left < URGENT_MS ? rail("attention", true) : undefined;
      }}
      renderDetail={(i) => (
        <DetailGrid
          fields={[
            { label: "Booking ID", value: i.booking_id, mono: true, span: true },
            { label: "Convidado", value: i.guest.name },
            { label: "Convidado ID", value: i.guest.user_id, mono: true },
            { label: "Host", value: i.host.name },
            { label: "Host ID", value: i.host.user_id, mono: true },
            { label: "Quadra", value: i.court_label },
            { label: "Início da partida", value: new Date(i.starts_at).toLocaleString("pt-BR") },
            { label: "Criado em", value: new Date(i.created_at).toLocaleString("pt-BR") },
            {
              // expires_at is computed by the BFF as created_at + 2h — it is not a
              // stored column. Worth stating where it comes from, so nobody goes
              // looking for a bookings.expires_at that does not exist.
              label: "Expira em",
              value: `${new Date(i.expires_at).toLocaleString("pt-BR")} (criado + 2h)`,
            },
          ]}
        />
      )}
    />
  );
}
