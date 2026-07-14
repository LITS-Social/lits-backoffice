"use client";

import { MapPin } from "lucide-react";
import { DataTable, type DataTableColumn, type DataTableFilterGroup } from "@/components/ui/data-table";
import { DetailGrid } from "@/components/ui/detail-grid";
import { PaymentLegs, Price } from "@/components/ui/payment-legs";
import { formatCurrency } from "@/lib/utils";
import type { components } from "@/lib/api/openapi";
import { Absent, MatchType, Player, When, matchTypeLabel, rail } from "../_components/cells";

type UpcomingMatchItem = components["schemas"]["UpcomingMatchItem"];

const DAY_MS = 24 * 3600_000;

const TIME_WINDOWS_MS = {
  "48h": 48 * 3600_000,
  "7d": 7 * DAY_MS,
};

const filters: DataTableFilterGroup<UpcomingMatchItem>[] = [
  {
    id: "window",
    label: "Janela",
    options: [
      {
        value: "today",
        label: "Hoje",
        predicate: (m) => {
          const startsAt = new Date(m.starts_at);
          const now = new Date();
          return (
            startsAt.getFullYear() === now.getFullYear() &&
            startsAt.getMonth() === now.getMonth() &&
            startsAt.getDate() === now.getDate()
          );
        },
      },
      {
        value: "48h",
        label: "48h",
        predicate: (m) => new Date(m.starts_at).getTime() - Date.now() <= TIME_WINDOWS_MS["48h"],
      },
      {
        value: "7d",
        label: "7 dias",
        predicate: (m) => new Date(m.starts_at).getTime() - Date.now() <= TIME_WINDOWS_MS["7d"],
      },
    ],
  },
  {
    id: "payment",
    label: "Pagamento",
    options: [
      // payment_settled is derived by the BFF, which knows a free booking owes
      // nothing. Re-deriving it here from the two legs would get that case wrong.
      { value: "unpaid", label: "Falta pagar", predicate: (m) => !m.payment_settled },
      { value: "settled", label: "Tudo pago", predicate: (m) => m.payment_settled },
    ],
  },
  {
    id: "guest",
    label: "Convidado",
    options: [
      { value: "missing", label: "Sem convidado", predicate: (m) => !m.guest },
      { value: "present", label: "Com convidado", predicate: (m) => !!m.guest },
    ],
  },
];

/**
 * Kickoff leads the row, because the panel's question begins with "when". Every
 * other cell is context for a match that is already coming at you.
 */
const columns: DataTableColumn<UpcomingMatchItem>[] = [
  {
    id: "starts_at",
    header: "Começa",
    width: "104px",
    sortAccessor: (m) => new Date(m.starts_at).getTime(),
    render: (m) => <When iso={m.starts_at} soonMs={DAY_MS} />,
  },
  {
    id: "host",
    header: "Host",
    sortAccessor: (m) => m.host.name,
    render: (m) => <Player name={m.host.name} id={m.host.user_id} strong />,
  },
  {
    id: "guest",
    header: "Convidado",
    sortAccessor: (m) => m.guest?.name ?? "",
    render: (m) =>
      m.guest ? <Player name={m.guest.name} id={m.guest.user_id} /> : <Absent>Aguardando</Absent>,
  },
  {
    id: "court",
    header: "Quadra",
    sortAccessor: (m) => m.court_label,
    render: (m) => (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1">
          <MapPin size={11} className="shrink-0 text-[var(--text-tertiary)]" />
          <span className="truncate">{m.court_label}</span>
        </span>
        <MatchType value={m.match_type} />
      </div>
    ),
  },
  {
    id: "price",
    header: "Valor",
    width: "84px",
    align: "right",
    sortAccessor: (m) => m.price_cents,
    render: (m) => <Price cents={m.price_cents} currency={m.currency} />,
  },
  {
    id: "payment",
    header: "Pagou?",
    width: "142px",
    // Unsettled first: the whole point of the column is finding who still owes.
    sortAccessor: (m) => (m.payment_settled ? 1 : 0),
    render: (m) => (
      <PaymentLegs
        priceCents={m.price_cents}
        host={m.host_payment}
        guest={m.guest_payment}
        hasGuest={!!m.guest}
      />
    ),
  },
  /**
   * There is no "Aviso" column, deliberately.
   *
   * It was 192px — the heaviest element in the row — and every badge it could
   * render restated something the row already said, louder:
   *
   *   HOST NÃO PAGOU   → the red "✗ Host" in Pagou?, the red rail, and the wash
   *   SEM CONVIDADO    → "Aguardando" in Convidado, AND "sem convidado" in Pagou?
   *   COMEÇA EM BREVE  → the Começa cell, which already tints itself under 24h
   *
   * Row 1 was carrying seven visual signals for three facts. And the worst of them
   * fired on 56 of 72 rows (78%): "começa em breve" is not an alert in a panel
   * whose stat rail reads "NAS PRÓXIMAS 24H 72" against "PARTIDAS 72" — it is the
   * baseline. An alert colour on four rows in five trains the eye to skip it, and
   * takes the genuine red down with it.
   *
   * The BFF still sends `alerts`; nothing here needs it. If a genuinely NOVEL
   * alert is ever added — one no other cell can express — this is where it goes.
   */
];

export function UpcomingMatchesTable({ matches }: { matches: UpcomingMatchItem[] }) {
  return (
    <DataTable
      rows={matches}
      columns={columns}
      filters={filters}
      initialSort={{ columnId: "starts_at", direction: "asc" }}
      rowKey={(m) => m.booking_id}
      // Only what the table actually shows. The raw alert slugs used to be in here,
      // which meant a search could match text that appears nowhere on screen.
      searchText={(m) => `${m.host.name} ${m.guest?.name ?? ""} ${m.court_label}`}
      searchPlaceholder="Buscar por jogador ou quadra..."
      /**
       * Two different problems, two different weights.
       *
       * Unpaid AND about to start is the emergency: the money is not in, and once
       * they are on court nobody is going to chase it. Red rail plus the wash.
       *
       * Unpaid but days out is a to-do, not a fire. A quarter of this beta's
       * bookings sit there for a while, and painting all of them the same red as
       * the one starting in three hours is precisely how a founder learns to stop
       * seeing red at all. It keeps the rail and loses the wash.
       *
       * Settled — or genuinely free — is silent. No green, no tint, nothing.
       */
      rowClassName={(m) => {
        if (m.payment_settled) return undefined;
        const soon = new Date(m.starts_at).getTime() - Date.now() < DAY_MS;
        return rail("money", soon);
      }}
      emptyMessage="Nenhuma partida aguardando jogo."
      noResultsMessage="Nenhuma partida encontrada para esse filtro ou busca."
      renderDetail={(m) => (
        <DetailGrid
          fields={[
            { label: "Booking ID", value: m.booking_id, mono: true, span: true },
            { label: "Host", value: m.host.name },
            { label: "Host ID", value: m.host.user_id, mono: true },
            { label: "Convidado", value: m.guest?.name ?? "—" },
            { label: "Convidado ID", value: m.guest?.user_id ?? "—", mono: true },
            { label: "Quadra", value: m.court_label },
            { label: "Tipo de partida", value: matchTypeLabel(m.match_type) },
            { label: "Início", value: new Date(m.starts_at).toLocaleString("pt-BR") },
            { label: "Fim", value: new Date(m.ends_at).toLocaleString("pt-BR") },
            { label: "Criada em", value: new Date(m.created_at).toLocaleString("pt-BR") },
            {
              label: "Valor da partida",
              value:
                m.price_cents === 0
                  ? "Grátis (quadra pública)"
                  : formatCurrency(m.price_cents, m.currency ?? "BRL"),
            },
            {
              label: "Host pagou",
              value:
                m.price_cents === 0
                  ? "— (nada a pagar)"
                  : m.host_payment.paid
                    ? `Sim — ${formatCurrency(m.host_payment.amount_cents, m.host_payment.currency ?? "BRL")}`
                    : "Não",
            },
            {
              label: "Convidado pagou",
              value: !m.guest
                ? "— (sem convidado)"
                : m.price_cents === 0
                  ? "— (nada a pagar)"
                  : m.guest_payment?.paid
                    ? `Sim — ${formatCurrency(m.guest_payment.amount_cents, m.guest_payment.currency ?? "BRL")}`
                    : "Não",
            },
            {
              // Deliberately labelled as the BOOKING-level field it is. Real rows in
              // this beta carry payment_status "approved" while host_payment.paid is
              // false: the charge on the booking cleared, that player's own leg did
              // not. Printing it as a bare "Status do pagamento" directly under
              // "Host pagou: Não" reads as a contradiction and gets the whole panel
              // disbelieved. Naming the level it describes lets both facts be true.
              label: "Status da cobrança (reserva)",
              value: m.payment_status || "—",
            },
          ]}
        />
      )}
    />
  );
}
