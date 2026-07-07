import { Flag } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { reports, reasonLabel, type ReportStatus } from "@/lib/mock";
import { formatRelative } from "@/lib/utils";

function StatusBadge({ status }: { status: ReportStatus }) {
  const map: Record<ReportStatus, { variant: "error" | "warning" | "success" | "muted"; label: string }> = {
    open: { variant: "error", label: "Aberta" },
    under_review: { variant: "warning", label: "Em análise" },
    resolved: { variant: "success", label: "Resolvida" },
    dismissed: { variant: "muted", label: "Encerrada" },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export default function DenunciasPage() {
  const open = reports.filter(
    (r) => r.status === "open" || r.status === "under_review"
  );

  return (
    <div>
      <PageHeader
        eyebrow="#09"
        title="Denúncias"
        description="Denúncias ativas e encerradas. Ação rápida para proteger quem denunciou e decidir sobre o futuro do usuário no beta."
        action={
          open.length > 0 ? (
            <Badge variant="error">
              <Flag size={10} /> {open.length} ativas
            </Badge>
          ) : null
        }
      />

      <div className="px-8 py-6 space-y-4">
        {reports.map((report) => (
          <div
            key={report.id}
            className={`rounded-xl border p-5 ${
              report.status === "open"
                ? "bg-[var(--color-error-bg)] border-[var(--color-error)]/25"
                : report.status === "under_review"
                ? "bg-[var(--color-warning-bg)] border-[var(--color-warning)]/30"
                : "bg-[var(--surface)] border-[var(--border)] opacity-70"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                {/* Header */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <StatusBadge status={report.status} />
                  <Badge variant="muted">{reasonLabel[report.reason]}</Badge>
                </div>

                {/* Players */}
                <div className="flex items-center gap-2 mb-2 text-[13px] font-sans">
                  <span className="font-600 text-[var(--text-primary)]">
                    {report.reporter}
                  </span>
                  <span className="text-[var(--text-tertiary)] text-[11px]">
                    denunciou
                  </span>
                  <span className="font-600 text-[var(--color-error)]">
                    {report.reported}
                  </span>
                </div>

                {/* Description */}
                <p className="text-[13px] font-sans text-[var(--text-secondary)] leading-relaxed mb-3">
                  {report.description}
                </p>

                {/* Outcome */}
                {report.outcome && (
                  <div className="p-3 rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success)]/20 text-[12px] font-sans text-[var(--color-success)]">
                    <span className="font-600">Resolução: </span>
                    {report.outcome}
                  </div>
                )}

                {/* Timestamps */}
                <div className="flex items-center gap-4 mt-3 text-[11px] font-sans text-[var(--text-tertiary)]">
                  <span>Criada {formatRelative(report.createdAt)}</span>
                  {report.updatedAt > report.createdAt && (
                    <span>Atualizada {formatRelative(report.updatedAt)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
