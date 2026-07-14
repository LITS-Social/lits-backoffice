"use client";

import { Star } from "lucide-react";
import { DataTable, type DataTableColumn, type DataTableFilterGroup } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid } from "@/components/ui/detail-grid";
import { Timestamp } from "@/components/ui/timestamp";
import type { components } from "@/lib/api/openapi";
import { Player, rail } from "../_components/cells";

type PlayerEvaluationItem = components["schemas"]["PlayerEvaluationItem"];

/**
 * "Consistentemente mal avaliado" — the actual thing this panel hunts.
 *
 * TWO ratings, not one. A single 2★ is a bad night, a disagreement, or one
 * annoyed opponent; escalating on it would have the founder confronting players
 * over one stranger's opinion. Two or more below 3.0 is a pattern, and a pattern
 * is what "bad actor" means.
 *
 * Single low ratings are NOT hidden — they still show their score and still
 * carry a badge. They just do not set the row on fire.
 */
const LOW_SCORE = 3;
const PATTERN_MIN_RATINGS = 2;

function isRated(p: PlayerEvaluationItem): boolean {
  return p.count > 0;
}
function isLow(p: PlayerEvaluationItem): boolean {
  return isRated(p) && p.avg_rating < LOW_SCORE;
}
function isPattern(p: PlayerEvaluationItem): boolean {
  return p.count >= PATTERN_MIN_RATINGS && p.avg_rating < LOW_SCORE;
}

function StarScore({ score, muted = false }: { score: number; muted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${score} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={11}
          className={
            i <= score
              ? muted
                ? "fill-[var(--text-tertiary)] text-[var(--text-tertiary)]"
                : "fill-[var(--color-clay)] text-[var(--color-clay)]"
              : "text-[var(--border-strong)]"
          }
        />
      ))}
    </span>
  );
}

const filters: DataTableFilterGroup<PlayerEvaluationItem>[] = [
  {
    id: "flag",
    label: "Atenção",
    options: [
      {
        value: "pattern",
        label: "Mal avaliado (2+ notas)",
        predicate: isPattern,
      },
      {
        value: "low",
        label: "Nota baixa (< 3)",
        predicate: isLow,
      },
      {
        // Made visible rather than left to masquerade as a 0.0 score. "Nobody has
        // rated this player" is a fact about the beta's coverage, not about the player.
        value: "unrated",
        label: "Sem avaliações",
        predicate: (p) => !isRated(p),
      },
    ],
  },
];

const columns: DataTableColumn<PlayerEvaluationItem>[] = [
  {
    id: "player",
    header: "Jogador",
    sortAccessor: (p) => p.player.name,
    render: (p) => <Player name={p.player.name} id={p.player.user_id} strong />,
  },
  {
    id: "avg",
    header: "Média",
    width: "210px",
    /**
     * The bug this fixes, and it was a bad one.
     *
     * `avg_rating` is 0 for a player with NO ratings — that is the API contract,
     * not a low score. The panel's default sort is "worst first", so every
     * never-rated player in the beta sorted above the genuinely badly-rated ones:
     * the top of the "who is behaving badly" list was a wall of players nobody had
     * ever played with, and the one guy averaging 1.5★ was buried underneath them.
     *
     * Returning null for the unrated pushes them to the bottom (DataTable sinks
     * nulls in both directions), so the first row is now the worst player who
     * actually has a record. Same data, opposite answer.
     */
    sortAccessor: (p) => (isRated(p) ? p.avg_rating : null),
    render: (p) => {
      if (!isRated(p)) {
        // No stars, no 0.0. Rendering an empty 5-star row here would read as a
        // player rated zero out of five, which is a character assassination
        // performed by a rounding convention.
        return (
          <span className="text-[11.5px] text-[var(--text-tertiary)]">Sem avaliações</span>
        );
      }

      return (
        <div className="flex items-center gap-2">
          <StarScore score={Math.round(p.avg_rating)} muted={!isLow(p)} />
          <span
            className={`numeral text-[15px] ${isLow(p) ? "text-[var(--color-error)]" : "text-[var(--text-secondary)]"}`}
          >
            {p.avg_rating.toFixed(1)}
          </span>
          {isPattern(p) && <Badge variant="error">Recorrente</Badge>}
          {isLow(p) && !isPattern(p) && <Badge variant="warning">Nota única</Badge>}
        </div>
      );
    },
  },
  {
    id: "count",
    header: "Avaliações",
    width: "120px",
    align: "right",
    sortAccessor: (p) => p.count,
    // The denominator, always in view. An average of 1.0 means something very
    // different from one opponent than from nine, and the number that tells them
    // apart should not require opening the row.
    render: (p) => (
      <span className="tabular-nums text-[var(--text-secondary)]">{p.count}</span>
    ),
  },
];

export function PlayerEvaluationsTable({ evaluations }: { evaluations: PlayerEvaluationItem[] }) {
  return (
    <DataTable
      rows={evaluations}
      columns={columns}
      filters={filters}
      // Worst rated first — and now that unrated players sort as null, that
      // actually means what it says.
      initialSort={{ columnId: "avg", direction: "asc" }}
      rowKey={(p) => p.player.user_id}
      searchText={(p) =>
        `${p.player.name} ${(p.ratings ?? [])
          .map((r) => `${r.author.name} ${r.comment ?? ""} ${(r.tags ?? []).join(" ")}`)
          .join(" ")}`
      }
      searchPlaceholder="Buscar por jogador, avaliador ou comentário..."
      emptyMessage="Nenhuma avaliação registrada ainda."
      noResultsMessage="Nenhum jogador encontrado para esse filtro ou busca."
      /**
       * Red, and only for the pattern. Bad actors are moderation, which is one of
       * the two things red is for on this console.
       *
       * A single low rating gets no rail at all — it is flagged in the Média column
       * and left at that. This panel's entire value is that a red row here means
       * "this person keeps doing it", and lending that weight to one bad night from
       * one opponent would spend the signal on noise.
       */
      rowClassName={(p) => (isPattern(p) ? rail("money", true) : undefined)}
      renderDetail={(p) => (
        <div className="space-y-5">
          <DetailGrid
            fields={[
              { label: "Jogador ID", value: p.player.user_id, mono: true, span: true },
              {
                label: "Média",
                value: isRated(p) ? p.avg_rating.toFixed(2) : "— (nunca avaliado)",
              },
              { label: "Total de avaliações", value: p.count },
            ]}
          />

          <div>
            <p className="eyebrow mb-3">
              {p.count === 0
                ? "Nenhuma avaliação"
                : `Avaliado por ${p.count} ${p.count === 1 ? "adversário" : "adversários"}`}
            </p>

            {p.ratings && p.ratings.length > 0 ? (
              <div className="space-y-2">
                {p.ratings.map((r, i) => (
                  <div
                    key={`${r.author.user_id}-${r.created_at}-${i}`}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StarScore score={r.rating} muted={r.rating >= LOW_SCORE} />
                      <span className="text-[12px] font-600 text-[var(--text-primary)]">
                        {r.author.name}
                      </span>
                      <span className="font-mono text-[10.5px] text-[var(--text-tertiary)]">
                        {r.author.user_id}
                      </span>
                      <Timestamp
                        iso={r.created_at}
                        className="ml-auto text-[11px] text-[var(--text-tertiary)]"
                      />
                    </div>

                    {r.tags && r.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.tags.map((tag) => (
                          <Badge key={tag} variant="muted">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {r.comment && (
                      <p className="mt-2 border-t border-[var(--border)] pt-2 font-display text-[13px] italic leading-relaxed text-[var(--text-secondary)]">
                        &ldquo;{r.comment}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[var(--text-tertiary)]">
                Ninguém avaliou este jogador ainda.
              </p>
            )}
          </div>
        </div>
      )}
    />
  );
}
