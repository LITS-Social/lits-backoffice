import { Star } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { playerRatings } from "@/lib/mock";
import { formatRelative } from "@/lib/utils";

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={12}
          className={
            i <= rating
              ? "fill-[var(--color-warning)] text-[var(--color-warning)]"
              : "text-[var(--border-strong)]"
          }
        />
      ))}
      <span className="ml-1 text-[12px] font-sans font-600 text-[var(--text-primary)]">
        {rating.toFixed(1)}
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
        description="Notas recebidas por adversários. Avaliações consistentemente negativas indicam comportamento inadequado ou nível incorreto."
        action={
          flagged.length > 0 ? (
            <Badge variant="error">
              <Star size={10} /> {flagged.length} com avaliação baixa
            </Badge>
          ) : null
        }
      />

      <div className="px-8 py-6">
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          <table className="w-full text-[13px] font-sans">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-raised)]">
                <th className="text-left px-5 py-3 text-[10px] font-600 uppercase tracking-widest text-[var(--text-tertiary)]">
                  Jogador
                </th>
                <th className="text-left px-5 py-3 text-[10px] font-600 uppercase tracking-widest text-[var(--text-tertiary)]">
                  Nível
                </th>
                <th className="text-left px-5 py-3 text-[10px] font-600 uppercase tracking-widest text-[var(--text-tertiary)]">
                  Média geral
                </th>
                <th className="text-left px-5 py-3 text-[10px] font-600 uppercase tracking-widest text-[var(--text-tertiary)]">
                  Avaliações
                </th>
                <th className="text-left px-5 py-3 text-[10px] font-600 uppercase tracking-widest text-[var(--text-tertiary)]">
                  Última avaliação
                </th>
                <th className="text-left px-5 py-3 text-[10px] font-600 uppercase tracking-widest text-[var(--text-tertiary)]">
                  Avaliado por
                </th>
                <th className="text-left px-5 py-3 text-[10px] font-600 uppercase tracking-widest text-[var(--text-tertiary)]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {playerRatings.map((player, i) => (
                <tr
                  key={player.id}
                  className={`border-b border-[var(--border)] last:border-0 ${
                    player.flag === "negative"
                      ? "bg-[var(--color-error-bg)]"
                      : i % 2 === 0
                      ? "bg-[var(--surface)]"
                      : "bg-[var(--surface-raised)]/40"
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[var(--primary)] flex items-center justify-center text-[10px] text-white font-700 shrink-0">
                        {player.player[0]}
                      </div>
                      <span className="font-500 text-[var(--text-primary)]">
                        {player.player}
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant="muted">{player.category}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <StarRating rating={player.avgRating} />
                  </td>
                  <td className="px-5 py-3.5 text-[var(--text-secondary)]">
                    {player.ratingsCount}
                  </td>
                  <td className="px-5 py-3.5">
                    <StarRating rating={player.lastRating} />
                  </td>
                  <td className="px-5 py-3.5 text-[var(--text-secondary)]">
                    {player.lastRatedBy}
                    <span className="block text-[10px] text-[var(--text-tertiary)]">
                      {formatRelative(player.lastRatedAt)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
