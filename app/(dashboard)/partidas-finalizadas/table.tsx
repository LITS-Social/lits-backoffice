"use client";

import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn, type DataTableFilterGroup } from "@/components/ui/data-table";
import { DetailGrid } from "@/components/ui/detail-grid";
import { PaymentLegs, Price } from "@/components/ui/payment-legs";
import { formatCurrency } from "@/lib/utils";
import type { components } from "@/lib/api/openapi";
import { Absent, MatchType, Player, When, matchTypeLabel, rail } from "../_components/cells";

type FinishedMatchItem = components["schemas"]["FinishedMatchItem"];

/**
 * ── Avisos ────────────────────────────────────────────────────────────────────
 *
 * The reason this panel exists, once the score-capture backend lands. Today the
 * BFF only emits the two PAYMENT slugs (`host_unpaid`, `guest_unpaid`); Phase 2
 * adds `no_score`, `score_disputed`, and `no_show`. Those three are already
 * mapped below so that shipping them is a backend flip, not a frontend reshape —
 * the moment the API sends the slug, the badge renders with the right word and
 * the right colour.
 *
 * Colour law, same as everywhere else: red (error) is money owed OR a genuine
 * conflict; clay (warning) is "look at this". A slug this map does not know still
 * renders — as a muted chip carrying the raw slug — because on an ALERTS panel a
 * silently-dropped signal is the one failure mode worse than an ugly label.
 */
const ALERT_META: Record<string, { label: string; variant: "error" | "warning" }> = {
  host_unpaid: { label: "Host não pagou", variant: "error" },
  guest_unpaid: { label: "Convidado não pagou", variant: "error" },
  // Phase 2 — dormant until the score-capture backend emits them.
  no_score: { label: "Sem placar", variant: "warning" },
  score_disputed: { label: "Placar em disputa", variant: "error" },
  no_show: { label: "No-show", variant: "warning" },
};

function AlertBadges({ alerts }: { alerts?: string[] | null }) {
  if (!alerts || alerts.length === 0) return <Absent />;
  return (
    <div className="flex flex-wrap gap-1">
      {alerts.map((slug) => {
        const meta = ALERT_META[slug];
        return meta ? (
          <Badge key={slug} variant={meta.variant}>
            {meta.label}
          </Badge>
        ) : (
          <Badge key={slug} variant="muted">
            {slug}
          </Badge>
        );
      })}
    </div>
  );
}

const filters: DataTableFilterGroup<FinishedMatchItem>[] = [
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
    id: "alerts",
    label: "Avisos",
    options: [
      { value: "flagged", label: "Com aviso", predicate: (m) => !!m.alerts && m.alerts.length > 0 },
      { value: "clear", label: "Sem aviso", predicate: (m) => !m.alerts || m.alerts.length === 0 },
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
 * "Jogada em" leads the row, because the panel reads newest-first and the founder
 * scans it by date. Everything after is context for a match that already happened
 * — no urgency tint here (nothing is "coming"), so `When` gets no `soonMs`.
 */
const columns: DataTableColumn<FinishedMatchItem>[] = [
  {
    id: "starts_at",
    header: "Jogada em",
    width: "104px",
    sortAccessor: (m) => new Date(m.starts_at).getTime(),
    render: (m) => <When iso={m.starts_at} />,
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
      m.guest ? <Player name={m.guest.name} id={m.guest.user_id} /> : <Absent>Sem convidado</Absent>,
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
    // Unsettled first: on a match already played, an open leg is money that now
    // has to be chased, so it should sort to the top.
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
  {
    id: "alerts",
    header: "Aviso",
    width: "168px",
    // Flagged rows sort to the top — the whole point of the panel is finding them.
    sortAccessor: (m) => m.alerts?.length ?? 0,
    render: (m) => <AlertBadges alerts={m.alerts} />,
  },
];

export function FinishedMatchesTable({ matches }: { matches: FinishedMatchItem[] }) {
  return (
    <DataTable
      rows={matches}
      columns={columns}
      filters={filters}
      // Newest first, matching the BFF's own starts_at_desc order.
      initialSort={{ columnId: "starts_at", direction: "desc" }}
      rowKey={(m) => m.booking_id}
      // Only what the table actually shows — the raw alert slugs stay out of the
      // haystack so a search never matches text that is nowhere on screen. The
      // alert LABELS are already covered by their own column.
      searchText={(m) => `${m.host.name} ${m.guest?.name ?? ""} ${m.court_label}`}
      searchPlaceholder="Buscar por jogador ou quadra..."
      /**
       * Two weights, forward-compatible with Phase 2.
       *
       * Money still open on a match already played is the emergency — nobody is on
       * court to chase, so it gets the red rail. Any OTHER alert (a dispute, a
       * missing score, a no-show, once those exist) is "revisar isto" — the clay
       * rail. A clean, settled match is silent: no rail, no tint.
       */
      rowClassName={(m) => {
        if (!m.payment_settled) return rail("money");
        if (m.alerts && m.alerts.length > 0) return rail("attention");
        return undefined;
      }}
      emptyMessage="Nenhuma partida finalizada ainda."
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
              // Deliberately labelled as the BOOKING-level field it is: real rows
              // carry payment_status "approved" while a per-player leg is still
              // unpaid. Naming the level it describes keeps both facts true.
              label: "Status da cobrança (reserva)",
              value: m.payment_status || "—",
            },
            {
              label: "Avisos",
              value:
                m.alerts && m.alerts.length > 0
                  ? m.alerts.map((slug) => ALERT_META[slug]?.label ?? slug).join(", ")
                  : "—",
              span: true,
            },
          ]}
        />
      )}
    />
  );
}
