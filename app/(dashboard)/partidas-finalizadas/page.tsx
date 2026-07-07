import { AlertCircle, Swords, UserMinus, CheckCircle2, MapPin } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { finishedMatches, type FinishedIssue } from "@/lib/mock";
import { formatDate } from "@/lib/utils";

function IssueBadge({ issue }: { issue: FinishedIssue }) {
  if (!issue)
    return (
      <Badge variant="success">
        <CheckCircle2 size={10} /> OK
      </Badge>
    );
  if (issue === "no_score")
    return (
      <Badge variant="warning">
        <AlertCircle size={10} /> Sem placar
      </Badge>
    );
  if (issue === "score_conflict")
    return (
      <Badge variant="error">
        <Swords size={10} /> Conflito de placar
      </Badge>
    );
  return (
    <Badge variant="error">
      <UserMinus size={10} /> No-show
    </Badge>
  );
}

export default function PartidasFinalizadasPage() {
  const withIssues = finishedMatches.filter((m) => m.issue !== null);

  return (
    <div>
      <PageHeader
        eyebrow="#02"
        title="Partidas Finalizadas"
        description="Partidas realizadas. Destaque para casos sem placar, conflitos ou no-show."
        action={
          withIssues.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-warning-bg)] border border-[var(--color-warning)]/30 text-[12px] font-sans font-600 text-[var(--color-clay)]">
              <AlertCircle size={13} />
              {withIssues.length} requerem atenção
            </span>
          ) : null
        }
      />

      <div className="px-8 py-6 space-y-3">
        {finishedMatches.map((match) => (
          <div
            key={match.id}
            className={`rounded-xl border p-5 ${
              match.issue
                ? "bg-[var(--surface)] border-[var(--color-warning)]/30"
                : "bg-[var(--surface)] border-[var(--border)]"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-[14px] font-sans font-600 text-[var(--text-primary)]">
                    {match.player1}
                  </span>
                  <span className="text-[11px] font-sans text-[var(--text-tertiary)]">vs</span>
                  <span className="text-[14px] font-sans font-600 text-[var(--text-primary)]">
                    {match.player2}
                  </span>
                  <Badge variant="muted">{match.category}</Badge>
                </div>
                <div className="flex items-center gap-4 text-[12px] font-sans text-[var(--text-secondary)] mb-2">
                  <span className="flex items-center gap-1">
                    <MapPin size={11} /> {match.club}
                  </span>
                  <span>{formatDate(match.datetime)}</span>
                </div>
                {/* Score conflict */}
                {match.issue === "score_conflict" && (
                  <div className="mt-2 p-3 rounded-lg bg-[var(--color-error-bg)] border border-[var(--color-error)]/20">
                    <p className="text-[11px] font-sans font-600 text-[var(--color-error)] mb-1">
                      Placares divergentes
                    </p>
                    <div className="flex gap-4 text-[12px] font-sans text-[var(--text-secondary)]">
                      <span>
                        <span className="font-600 text-[var(--text-primary)]">{match.player1}:</span>{" "}
                        {match.score1}
                      </span>
                      <span>
                        <span className="font-600 text-[var(--text-primary)]">{match.player2}:</span>{" "}
                        {match.score2}
                      </span>
                    </div>
                  </div>
                )}
                {match.issue === "no_show" && match.winner && (
                  <p className="text-[12px] font-sans text-[var(--text-secondary)] mt-1">
                    No-show declarado por{" "}
                    <span className="font-600 text-[var(--text-primary)]">{match.winner}</span>
                  </p>
                )}
              </div>
              <div className="shrink-0">
                <IssueBadge issue={match.issue} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
