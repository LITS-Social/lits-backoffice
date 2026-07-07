import { Star } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { playerRatings } from "@/lib/mock";
import { formatRelative } from "@/lib/utils";

function StarScore({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={11}
          className={
            i <= score
              ? "fill-[var(--color-warning)] text-[var(--color-warning)]"
              : "text-[var(--border-strong)]"
          }
        />
      ))}
    </span>
  );
}

function AvgStars({ avg }: { avg: number }) {
  return (
    <div className="flex items-center gap-1">
      <StarScore score={Math.round(avg)} />
      <span className="text-[12px] font-sans font-600 text-[var(--text-primary)]">
        {avg.toFixed(1)}
      </span>
    </div>
  );
}

export default function AvaliacoesPage() {
  const flagged = playerRatings.filter((p) => p.flag === "negative");

  return (
    <div>
      <PageHeader
        eyebrow="#08"
        title="Avaliações Entre Jogadores"
        description="Notas recebidas por adversários e quem foram os jogadores que avaliaram cada um. Avaliações consistentemente negativas indicam comportamento inadequado ou nível incorreto."
        action={
          flagged.length > 0 ? (
            <Badge variant="error">
              <Star size={10} /> {flagged.length} com avaliação baixa
            </Badge>
          ) : null
        }
      />

      <div className="px-8 py-6 space-y-3">
        {playerRatings.map((player) => (
          <div
            key={player.id}
            className={`rounded-xl border p-5 ${
              player.flag === "negative"
                ? "bg-[var(--color-error-bg)] border-[var(--color-error)]/25"
                : "bg-[var(--surface)] border-[var(--border)]"
            }`}
          >
            <div className="flex items-start justify-between gap-6">
              {/* Player identity + avg */}
              <div className="flex items-center gap-3 w-56 shrink-0">
                <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-[11px] text-white font-700 shrink-0">
                  {player.player[0]}
                </div>
                <div>
                  <p className="text-[14px] font-sans font-600 text-[var(--text-primary)] leading-tight">
                    {player.player}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="muted">{player.category}</Badge>
                    <Badge
                      variant={
                        player.flag === "positive"
                          ? "success"
                          : player.flag === "negative"
                          ? "error"
                          : "muted"
                      }
                    >
                      {player.flag === "positive"
                        ? "Positivo"
                        : player.flag === "negative"
                        ? "Atenção"
                        : "Neutro"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Avg rating */}
              <div className="shrink-0 pt-0.5">
                <p className="text-[10px] font-sans font-600 uppercase tracking-widest text-[var(--text-tertiary)] mb-1">
                  Média
                </p>
                <AvgStars avg={player.avgRating} />
              </div>

              {/* All raters */}
              <div className="flex-1">
                <p className="text-[10px] font-sans font-600 uppercase tracking-widest text-[var(--text-tertiary)] mb-2">
                  Avaliado por ({player.ratings.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {player.ratings.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 text-[12px] font-sans"
                    >
                      <StarScore score={r.score} />
                      <span className="text-[var(--text-primary)] font-500">
                        {r.ratedBy}
                      </span>
                      <span className="text-[var(--text-tertiary)]">
                        {formatRelative(r.at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
