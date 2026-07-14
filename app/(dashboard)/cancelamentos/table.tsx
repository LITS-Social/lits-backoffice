"use client";

import { MapPin } from "lucide-react";
import { DataTable, type DataTableColumn, type DataTableFilterGroup } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid } from "@/components/ui/detail-grid";
import type { components } from "@/lib/api/openapi";
import { Absent, Player, When } from "../_components/cells";

type CancellationItem = components["schemas"]["CancellationItem"];

const filters: DataTableFilterGroup<CancellationItem>[] = [
  {
    id: "policy",
    label: "Prazo",
    options: [
      { value: "outside", label: "Fora do prazo", predicate: (c) => c.within_policy === false },
      { value: "within", label: "Dentro do prazo", predicate: (c) => c.within_policy === true },
      { value: "unknown", label: "Sem registro", predicate: (c) => c.within_policy == null },
    ],
  },
];

/**
 * The lead time, as a number you can feel.
 *
 * `hours_before` is the magnitude, and that is where the real gradient lives: a
 * cancellation 47h out is a shrug, one 40 minutes out stranded a human being at
 * a court. The hours are set large and the table sorts on them ascending by
 * default — the worst thing that happened is the first row on the screen, and no
 * threshold had to be invented to put it there.
 *
 * The number is NOT colour-coded by `within_policy`. It used to go clay whenever
 * the cancellation was late, which sounds reasonable until you look at the data:
 * every row in the beta is late (22 of 22, all between 23.0h and 23.9h), so the
 * colour fired on 100% of rows and separated nothing from nothing. The magnitude
 * plus the sort already put the worst case on top; a tint that is always on is
 * just ink. Severity here is a gradient, and a binary colour cannot express one.
 */
function LeadTime({ c }: { c: CancellationItem }) {
  if (c.hours_before == null) {
    return (
      <span title="Cancelamento sem cancelled_at registrado — a antecedência é desconhecível">
        <Absent />
      </span>
    );
  }

  const h = c.hours_before;
  // Under a day, hours alone stop being descriptive: "0h antes" reads as a
  // rounding artefact when what actually happened is 40 minutes.
  const value = h < 1 ? `${Math.round(h * 60)}min` : `${h.toFixed(h < 10 ? 1 : 0)}h`;

  return (
    <span className="flex flex-col gap-0.5">
      <span className="numeral text-[16px] text-[var(--text-secondary)]">{value}</span>
      <span className="text-[10px] leading-none text-[var(--text-tertiary)]">antes</span>
    </span>
  );
}

const columns: DataTableColumn<CancellationItem>[] = [
  {
    id: "lead",
    header: "Antecedência",
    width: "96px",
    // Nulls sort last in DataTable regardless of direction, so the unknowable
    // rows sink to the bottom instead of masquerading as the most brutal ones.
    sortAccessor: (c) => c.hours_before ?? null,
    render: (c) => <LeadTime c={c} />,
  },
  {
    id: "policy",
    header: "Prazo (48h)",
    width: "128px",
    /**
     * The ONE place `within_policy` is encoded. It used to be three (this badge,
     * a clay tint on the lead-time numeral, and an orange rail down the row) — all
     * three firing on all 22 rows, because all 22 are late. Three alert-coloured
     * restatements of a fact that discriminates between no two rows on the panel.
     *
     * This one survives rather than the other two because it is the only one that
     * SAYS something when the value flips: a within-policy cancellation renders
     * quietly as "Dentro do prazo", and a record with no cancelled_at renders as
     * genuinely unknown. The others could only ever shout or stay silent.
     */
    sortAccessor: (c) => (c.within_policy == null ? null : c.within_policy ? 1 : 0),
    render: (c) =>
      c.within_policy == null ? (
        <Absent />
      ) : c.within_policy ? (
        // The healthy state says nothing loud. A green badge on every compliant
        // row is decoration that costs the eye something and returns nothing.
        <span className="text-[11.5px] text-[var(--text-tertiary)]">Dentro do prazo</span>
      ) : (
        <Badge variant="warning">Fora do prazo</Badge>
      ),
  },
  {
    id: "host",
    header: "Jogador",
    sortAccessor: (c) => c.host.name,
    render: (c) => <Player name={c.host.name} id={c.host.user_id} strong />,
  },
  {
    id: "guest",
    header: "Adversário",
    sortAccessor: (c) => c.guest?.name ?? "",
    render: (c) =>
      c.guest ? <Player name={c.guest.name} id={c.guest.user_id} /> : <Absent />,
  },
  {
    id: "reason",
    header: "Motivo",
    width: "200px",
    sortAccessor: (c) => c.cancel_reason,
    // Promoted out of the expand-row, where it had been sitting invisibly. It is
    // the single most informative field on the record — in this beta it reveals
    // that every last cancellation was a rejected payment, not a change of heart —
    // and it was reachable only by clicking each row open one at a time.
    render: (c) =>
      c.cancel_reason ? (
        <span
          title={c.cancel_reason}
          className="block truncate font-mono text-[10.5px] text-[var(--text-secondary)]"
        >
          {c.cancel_reason}
        </span>
      ) : (
        <Absent />
      ),
  },
  {
    id: "starts_at",
    header: "Partida",
    width: "104px",
    sortAccessor: (c) => new Date(c.starts_at).getTime(),
    render: (c) => <When iso={c.starts_at} />,
  },
  {
    id: "cancelled_at",
    header: "Cancelado",
    width: "104px",
    sortAccessor: (c) => (c.cancelled_at ? new Date(c.cancelled_at).getTime() : null),
    render: (c) => (c.cancelled_at ? <When iso={c.cancelled_at} /> : <Absent />),
  },
];

export function CancellationsTable({ cancellations }: { cancellations: CancellationItem[] }) {
  return (
    <DataTable
      rows={cancellations}
      columns={columns}
      filters={filters}
      // Worst first. Not newest first: a ledger of things that already happened is
      // read for severity, not recency.
      initialSort={{ columnId: "lead", direction: "asc" }}
      rowKey={(c) => c.booking_id}
      searchText={(c) => `${c.host.name} ${c.guest?.name ?? ""} ${c.court_label} ${c.cancel_reason}`}
      searchPlaceholder="Buscar por jogador, quadra ou motivo..."
      emptyMessage="Nenhum cancelamento encontrado."
      noResultsMessage="Nenhum cancelamento encontrado para esse filtro ou busca."
      /**
       * No rail, no wash, no row decoration at all.
       *
       * `within_policy === false` is true of 22 out of 22 rows in this beta, so a
       * rail keyed on it drew an alert-coloured stripe down the ENTIRE table. A
       * signal present on every row is not a signal — it is a background, and it
       * was the third redundant encoding of one constant fact (the badge in "Prazo
       * (48h)" said it, the clay lead-time numeral said it, and this said it again).
       *
       * Two of the three are gone. What survives is the badge, which is the only
       * one of them that is genuinely DATA-DRIVEN: the day a cancellation lands
       * inside the 48h window it will quietly read "Dentro do prazo" instead, and
       * that difference is the whole point of showing the field.
       *
       * The severity that actually varies — HOW late — lives in the lead-time
       * column, which the table sorts on by default. Worst case, first row.
       */
      renderDetail={(c) => (
        <DetailGrid
          fields={[
            { label: "Booking ID", value: c.booking_id, mono: true, span: true },
            {
              label: "Motivo registrado",
              value: c.cancel_reason || "—",
              mono: true,
              span: true,
            },
            { label: "Jogador", value: c.host.name },
            { label: "Jogador ID", value: c.host.user_id, mono: true },
            { label: "Adversário", value: c.guest?.name ?? "—" },
            { label: "Adversário ID", value: c.guest?.user_id ?? "—", mono: true },
            { label: "Quadra", value: c.court_label },
            { label: "Horário da partida", value: new Date(c.starts_at).toLocaleString("pt-BR") },
            {
              label: "Cancelado em",
              value: c.cancelled_at ? new Date(c.cancelled_at).toLocaleString("pt-BR") : "—",
            },
            {
              // A null here is not a hole in the UI — the booking was cancelled before
              // cancelled_at was persisted, so the 48h call is genuinely unknowable.
              label: "Antecedência do cancelamento",
              value:
                c.hours_before == null
                  ? "— (sem cancelled_at registrado)"
                  : `${c.hours_before.toFixed(1)}h antes da partida`,
            },
            {
              // Stated, because the obvious next question — "quem cancelou?" — has no
              // answer in this schema, and silence would invite someone to guess that
              // the host in the row above is the one who bailed.
              label: "Quem cancelou",
              value: "— (bookings não guarda cancelled_by)",
              span: true,
            },
          ]}
        />
      )}
    />
  );
}
