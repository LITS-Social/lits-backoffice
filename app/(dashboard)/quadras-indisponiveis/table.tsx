"use client";

import { MapPin } from "lucide-react";
import { DataTable, type DataTableColumn, type DataTableFilterGroup } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid } from "@/components/ui/detail-grid";
import { formatDate } from "@/lib/utils";
import type { components } from "@/lib/api/openapi";
import { When, rail } from "../_components/cells";

type CourtIssueItem = components["schemas"]["CourtIssueItem"];

/** People, not bookings. A booking with a guest strands two of them. */
function strandedCount(issue: CourtIssueItem): number {
  return (issue.affected_bookings ?? []).reduce((n, b) => n + (b.guest ? 2 : 1), 0);
}

const filters: DataTableFilterGroup<CourtIssueItem>[] = [
  {
    id: "impact",
    label: "Impacto",
    options: [
      {
        // The only filter that matters at 6am when a club calls: show me the ones
        // where somebody is about to be left standing there.
        value: "stranded",
        label: "Com jogadores na mão",
        predicate: (i) => strandedCount(i) > 0,
      },
      { value: "clear", label: "Sem reservas", predicate: (i) => strandedCount(i) === 0 },
    ],
  },
  {
    id: "origin",
    label: "Origem",
    options: [
      { value: "manual", label: "Bloqueio manual", predicate: (i) => i.manual === true },
      { value: "club", label: "Reportado pelo clube", predicate: (i) => i.manual === false },
    ],
  },
];

const columns: DataTableColumn<CourtIssueItem>[] = [
  {
    // The stranded players lead the row. Everything else on this panel — which
    // court, whose fault, what time — is detail hanging off the one question that
    // has a clock on it: who do I have to call?
    id: "stranded",
    header: "Quem fica na mão",
    width: "300px",
    sortAccessor: (i) => -strandedCount(i),
    render: (i) => {
      const bookings = i.affected_bookings ?? [];
      if (bookings.length === 0) {
        // A block that strands nobody is the good outcome. It says so plainly and
        // then gets out of the way.
        return <span className="text-[11.5px] text-[var(--text-tertiary)]">Ninguém — quadra vazia</span>;
      }

      return (
        <div className="flex flex-col gap-1.5">
          {bookings.map((b) => (
            <div key={b.booking_id} className="flex items-baseline gap-2">
              <span className="min-w-0 truncate text-[12px] font-600 text-[var(--text-primary)]">
                {b.host.name}
                {b.guest && (
                  <>
                    <span className="mx-1 font-400 text-[var(--text-tertiary)]">e</span>
                    {b.guest.name}
                  </>
                )}
              </span>
              <span className="shrink-0 whitespace-nowrap text-[10.5px] tabular-nums text-[var(--text-tertiary)]">
                {formatDate(new Date(b.starts_at))}
              </span>
            </div>
          ))}
        </div>
      );
    },
  },
  {
    id: "court",
    header: "Quadra",
    render: (i) => (
      <div className="min-w-0">
        <p className="truncate font-600 text-[var(--text-primary)]">{i.court_name}</p>
        <p className="flex items-center gap-1 truncate text-[11px] text-[var(--text-tertiary)]">
          <MapPin size={10} className="shrink-0" />
          <span className="truncate">{i.street_address}</span>
        </p>
      </div>
    ),
    sortAccessor: (i) => i.court_name,
  },
  {
    id: "slot",
    header: "Bloqueio",
    width: "104px",
    sortAccessor: (i) => new Date(i.slot_start).getTime(),
    render: (i) => <When iso={i.slot_start} />,
  },
  {
    id: "origin",
    header: "Origem",
    width: "158px",
    sortAccessor: (i) => (i.manual ? 1 : 0),
    render: (i) => (
      <div className="flex flex-col items-start gap-1">
        <Badge variant={i.manual ? "info" : "warning"}>
          {i.manual ? "Bloqueio manual" : "Reportado pelo clube"}
        </Badge>
        <Badge variant="muted">{i.status}</Badge>
      </div>
    ),
  },
  {
    id: "reason",
    header: "Motivo",
    width: "180px",
    sortAccessor: (i) => i.block_reason ?? "",
    /**
     * What the founder typed when he blocked the slot.
     *
     * This field could not be shown until now for an embarrassing reason: the
     * write path INSERTed it into a court_availability.block_reason column that no
     * migration had ever created, so "Bloquear quadra" — this panel's only write
     * action — returned HTTP 500 on every call, and the read path never selected
     * the column either. Both halves are fixed; this is the reason arriving where
     * it was always meant to land.
     *
     * ABSENT renders as nothing at all — not "—", not "sem motivo". A block pushed
     * by the club availability sync has no reason because nobody typed one, and
     * printing a placeholder there would dress up an empty column as an answer.
     */
    render: (i) =>
      i.block_reason ? (
        <span
          title={i.block_reason}
          className="block truncate text-[11.5px] text-[var(--text-secondary)]"
        >
          {i.block_reason}
        </span>
      ) : null,
  },
];

export function CourtIssuesTable({ issues }: { issues: CourtIssueItem[] }) {
  return (
    <DataTable
      rows={issues}
      columns={columns}
      filters={filters}
      // Most people stranded first — not chronological. The founder is triaging
      // damage here, and the biggest pile of damage goes at the top.
      initialSort={{ columnId: "stranded", direction: "asc" }}
      rowKey={(i) => `${i.court_id}-${i.slot_start}`}
      searchText={(i) =>
        `${i.court_name} ${i.street_address} ${i.status} ${i.block_reason ?? ""} ${(
          i.affected_bookings ?? []
        )
          .map((b) => `${b.host.name} ${b.guest?.name ?? ""}`)
          .join(" ")}`
      }
      searchPlaceholder="Buscar por quadra, endereço, motivo ou jogador..."
      emptyMessage="Nenhuma quadra indisponível."
      noResultsMessage="Nenhuma quadra indisponível encontrada para esse filtro ou busca."
      /**
       * The rail marks the blocks with people behind them — clay, because this is a
       * "go warn someone" job, not a debt and not moderation.
       *
       * A block with zero affected bookings is completely silent. A club pulling a
       * court that nobody had booked is not an incident; it is Tuesday. If those
       * rows glowed too, the ones with two players about to show up to a padlock
       * would look exactly the same as them.
       */
      rowClassName={(i) => (strandedCount(i) > 0 ? rail("attention", true) : undefined)}
      renderDetail={(i) => (
        <div className="space-y-5">
          <DetailGrid
            fields={[
              { label: "Court ID", value: i.court_id, mono: true, span: true },
              { label: "Quadra", value: i.court_name },
              { label: "Endereço", value: i.street_address },
              { label: "Status", value: i.status },
              { label: "Origem", value: i.manual ? "Bloqueio manual" : "Reportado pelo clube" },
              { label: "Início do bloqueio", value: new Date(i.slot_start).toLocaleString("pt-BR") },
              { label: "Fim do bloqueio", value: new Date(i.slot_end).toLocaleString("pt-BR") },
              // Spread-in, not a "—" row: a sync-pushed block has no reason because
              // nobody typed one, and an empty field is more honest than a dash
              // pretending to be the answer to "por que essa quadra sumiu?".
              ...(i.block_reason
                ? [{ label: "Motivo do bloqueio", value: i.block_reason, span: true }]
                : []),
            ]}
          />

          <div>
            <p className="eyebrow mb-3">
              Avisar {strandedCount(i)} {strandedCount(i) === 1 ? "jogador" : "jogadores"}
            </p>

            {i.affected_bookings && i.affected_bookings.length > 0 ? (
              <div className="space-y-2">
                {i.affected_bookings.map((b) => (
                  <div
                    key={b.booking_id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3"
                  >
                    {/* Both players, both ids. This is the card someone reads with a
                        phone already in their hand. */}
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-[12.5px] font-600 text-[var(--text-primary)]">
                        {b.host.name}
                      </span>
                      <span className="font-mono text-[10.5px] text-[var(--text-tertiary)]">
                        {b.host.user_id}
                      </span>
                    </div>

                    {b.guest ? (
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-[12.5px] font-600 text-[var(--text-primary)]">
                          {b.guest.name}
                        </span>
                        <span className="font-mono text-[10.5px] text-[var(--text-tertiary)]">
                          {b.guest.user_id}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">Sem convidado</p>
                    )}

                    <p className="mt-2 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-tertiary)]">
                      <span className="font-mono">{b.booking_id}</span>
                      {" · "}
                      {new Date(b.starts_at).toLocaleString("pt-BR")} –{" "}
                      {new Date(b.ends_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[var(--text-tertiary)]">
                Nenhuma reserva neste horário — ninguém para avisar.
              </p>
            )}
          </div>
        </div>
      )}
    />
  );
}
