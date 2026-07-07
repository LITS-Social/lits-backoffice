import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { courtIssues } from "@/lib/mock";
import { formatDate, formatRelative } from "@/lib/utils";

export default function QuadrasIndisponiveisPage() {
  const open = courtIssues.filter((c) => !c.resolved);

  return (
    <div>
      <PageHeader
        eyebrow="#07"
        title="Quadras Indisponíveis"
        description="Partidas marcadas cuja quadra foi reportada como indisponível. Ação imediata necessária para buscar alternativa."
        action={
          open.length > 0 ? (
            <Badge variant="error">
              <AlertTriangle size={10} /> {open.length} sem solução
            </Badge>
          ) : null
        }
      />

      <div className="px-8 py-6 space-y-3">
        {courtIssues.map((issue) => (
          <div
            key={issue.id}
            className={`rounded-xl border p-5 ${
              !issue.resolved
                ? "bg-[var(--color-error-bg)] border-[var(--color-error)]/25"
                : "bg-[var(--surface)] border-[var(--border)]"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[15px] font-sans font-600 text-[var(--text-primary)]">
                    {issue.club}
                  </span>
                  <span className="text-[12px] font-sans text-[var(--text-secondary)]">
                    — {issue.court}
                  </span>
                  <Badge variant="muted">{issue.neighborhood}</Badge>
                </div>

                <div className="flex items-center gap-4 text-[12px] font-sans text-[var(--text-secondary)] mb-2">
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> Partida: {formatDate(issue.matchDatetime)}
                  </span>
                  <span className="text-[var(--text-tertiary)]">
                    Reportado {formatRelative(issue.reportedAt)}
                  </span>
                </div>

                <p className="text-[12px] font-sans text-[var(--text-secondary)] mb-3 italic">
                  &ldquo;{issue.reason}&rdquo;
                </p>

                <div className="flex items-center gap-2 text-[12px] font-sans text-[var(--text-secondary)]">
                  <span className="font-500 text-[var(--text-primary)]">{issue.player1}</span>
                  <span className="text-[var(--text-tertiary)]">vs</span>
                  <span className="font-500 text-[var(--text-primary)]">{issue.player2}</span>
                </div>

                {issue.alternativeOffered && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success)]/20 text-[12px] font-sans font-500 text-[var(--color-success)]">
                    <CheckCircle2 size={12} /> {issue.alternativeOffered}
                  </div>
                )}
              </div>
              <div className="shrink-0">
                <Badge variant={issue.resolved ? "success" : "error"}>
                  {issue.resolved ? "Resolvido" : "Pendente"}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
