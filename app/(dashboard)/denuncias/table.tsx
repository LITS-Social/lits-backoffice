"use client";

import { useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { DataTable, type DataTableColumn, type DataTableFilterGroup } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid } from "@/components/ui/detail-grid";
import type { components } from "@/lib/api/openapi";
import { Absent, Player, When, rail } from "../_components/cells";
import { updateReportStatusAction, type ReportStatusTarget } from "./actions";

type PostReportItem = components["schemas"]["PostReportItem"];

// Real values off the wire (feed-service domain.ReportStatus, serialized as plain
// lowercase strings). The panel used to match against "REPORT_STATUS_OPEN" &c.,
// which matched nothing real — every badge fell through to the raw string.
const STATUS_MAP: Record<string, { variant: "error" | "warning" | "success" | "muted"; label: string }> = {
  pending: { variant: "error", label: "Aberta" },
  reviewing: { variant: "warning", label: "Em análise" },
  resolved: { variant: "success", label: "Resolvida" },
  dismissed: { variant: "muted", label: "Encerrada" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_MAP[status] || { variant: "muted" as const, label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

const filters: DataTableFilterGroup<PostReportItem>[] = [
  {
    id: "status",
    label: "Status",
    options: [
      { value: "pending", label: "Aberta", predicate: (r) => r.status === "pending" },
      { value: "reviewing", label: "Em análise", predicate: (r) => r.status === "reviewing" },
      { value: "resolved", label: "Resolvida", predicate: (r) => r.status === "resolved" },
      { value: "dismissed", label: "Encerrada", predicate: (r) => r.status === "dismissed" },
    ],
  },
];

const columns: DataTableColumn<PostReportItem>[] = [
  {
    id: "status",
    header: "Status",
    width: "112px",
    sortAccessor: (r) => (r.status === "pending" ? 0 : r.status === "reviewing" ? 1 : 2),
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    // The subject of the complaint leads. "Quem foi denunciado" is the first thing
    // asked and the thing every other cell qualifies.
    id: "reported",
    header: "Denunciado",
    sortAccessor: (r) => r.reported_user.name,
    render: (r) => <Player name={r.reported_user.name} id={r.reported_user.user_id} strong />,
  },
  {
    id: "reason",
    header: "Motivo",
    width: "280px",
    sortAccessor: (r) => r.reason,
    // `details` — the reporter's own words, the actual substance of the complaint —
    // was reachable only by expanding the row. A moderation queue where you cannot
    // see WHAT was said without opening every entry is a queue nobody triages.
    render: (r) => (
      <div className="min-w-0">
        <Badge variant="muted">{r.reason}</Badge>
        {r.details && (
          <p
            title={r.details}
            className="mt-1 truncate text-[11px] font-300 leading-snug text-[var(--text-secondary)]"
          >
            {r.details}
          </p>
        )}
      </div>
    ),
  },
  {
    id: "reporter",
    header: "Denunciante",
    sortAccessor: (r) => r.reporter.name,
    render: (r) => <Player name={r.reporter.name} id={r.reporter.user_id} />,
  },
  {
    id: "created_at",
    header: "Criada",
    width: "104px",
    sortAccessor: (r) => new Date(r.created_at).getTime(),
    render: (r) => <When iso={r.created_at} />,
  },
];

function ResolveControls({ report }: { report: PostReportItem }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isTerminal = report.status === "resolved" || report.status === "dismissed";

  function resolve(status: ReportStatusTarget) {
    setError(null);
    startTransition(async () => {
      const res = await updateReportStatusAction(report.report_id, status);
      if (!res.ok) setError(res.error ?? "Falha ao atualizar a denúncia.");
    });
  }

  if (isTerminal) {
    return (
      <p className="text-[12px] text-[var(--text-tertiary)]">
        Denúncia finalizada — sem mais ações disponíveis.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2">
        {report.status !== "reviewing" && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => resolve("reviewing")}
            className="rounded-full border border-[var(--color-clay)]/30 bg-[var(--color-warning-bg)] px-3.5 py-2 font-colus text-[9px] uppercase tracking-[0.14em] text-[var(--color-clay)] transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            Marcar em análise
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => resolve("resolved")}
          className="rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success-bg)] px-3.5 py-2 font-colus text-[9px] uppercase tracking-[0.14em] text-[var(--color-success)] transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          Resolver
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => resolve("dismissed")}
          className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-2 font-colus text-[9px] uppercase tracking-[0.14em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Encerrar (improcedente)
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2 text-[12px] text-[var(--color-error)]">
          <AlertCircle size={13} className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export function ReportsTable({ reports }: { reports: PostReportItem[] }) {
  return (
    <DataTable
      rows={reports}
      columns={columns}
      filters={filters}
      // Open ones first, then oldest — a moderation queue is worked from the top.
      initialSort={{ columnId: "status", direction: "asc" }}
      rowKey={(r) => r.report_id}
      searchText={(r) => `${r.reporter.name} ${r.reported_user.name} ${r.reason} ${r.details}`}
      searchPlaceholder="Buscar por denunciante, denunciado ou motivo..."
      emptyMessage="Nenhuma denúncia registrada."
      noResultsMessage="Nenhuma denúncia encontrada para esse filtro ou busca."
      // Red is for money and moderation. This is moderation: an open report is a
      // person waiting on the founder to look at something someone did to them.
      // Once it has been touched — reviewing, resolved, dismissed — it goes quiet.
      rowClassName={(r) => (r.status === "pending" ? rail("money", true) : undefined)}
      renderDetail={(r) => (
        <div className="space-y-5">
          <DetailGrid
            fields={[
              { label: "Report ID", value: r.report_id, mono: true },
              { label: "Post ID", value: r.post_id, mono: true },
              { label: "Denunciado", value: r.reported_user.name },
              { label: "Denunciado ID", value: r.reported_user.user_id, mono: true },
              { label: "Denunciante", value: r.reporter.name },
              { label: "Denunciante ID", value: r.reporter.user_id, mono: true },
              { label: "Motivo", value: r.reason },
              { label: "Descrição", value: r.details || <Absent />, span: true },
              { label: "Criada em", value: new Date(r.created_at).toLocaleString("pt-BR") },
              {
                label: "Resolvida em",
                value: r.resolved_at ? new Date(r.resolved_at).toLocaleString("pt-BR") : "—",
              },
              // resolved_by is the staff email the BFF derives from the Access JWT —
              // it is who ACTED, and it is empty until someone has.
              { label: "Resolvida por", value: r.resolved_by || "—" },
            ]}
          />

          <div>
            <p className="eyebrow mb-3">Ação</p>
            <ResolveControls report={r} />
          </div>
        </div>
      )}
    />
  );
}
