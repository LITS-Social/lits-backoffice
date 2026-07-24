import { PageHeader } from "@/components/ui/page-header";
import { getApi } from "@/lib/api";
import { StatRail } from "../_components/stat-rail";
import { PanelError, TruncationNote } from "../_components/notes";
import { PlayerEvaluationsTable } from "./table";

const LOW_SCORE = 3;
const PATTERN_MIN_RATINGS = 2;

export default async function AvaliacoesPage() {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/player-evaluations");

  if (error) {
    return (
      <PanelError eyebrow="#08" title="Avaliações Entre Jogadores" detail={error.detail || error.title} />
    );
  }

  const evaluations = data.players ?? [];
  const total = data.total ?? evaluations.length;

  const rated = evaluations.filter((p) => p.count > 0);
  const flagged = evaluations.filter(
    (p) => p.count >= PATTERN_MIN_RATINGS && p.avg_rating < LOW_SCORE
  ).length;

  // Weighted by how many opponents actually rated each player — a mean of per-player
  // means would let one player with a single 5★ pull the beta's average as hard as
  // one with forty ratings. Computed only across rated players: folding in the
  // never-rated (whose avg_rating is 0 by contract) would drag the whole thing
  // toward zero and invent a crisis out of missing data.
  const ratingCount = rated.reduce((n, p) => n + p.count, 0);
  const weightedAvg =
    ratingCount > 0
      ? rated.reduce((sum, p) => sum + p.avg_rating * p.count, 0) / ratingCount
      : null;

  return (
    <div>
      <PageHeader
        eyebrow="#08"
        title="Avaliações Entre Jogadores"
        description="Quem está sendo mal avaliado de forma recorrente — e por quem."
      />

      <StatRail
        stats={[
          {
            label: "Mal avaliados",
            value: flagged,
            tone: "money",
            hint: `média abaixo de ${LOW_SCORE},0 com ${PATTERN_MIN_RATINGS}+ avaliações — é padrão, não azar`,
          },
          {
            label: "Média do beta",
            // null, not 0.0. With no ratings on the wire there is no average to
            // state, and a confident "0,0" would read as a beta full of awful
            // players when what it really means is that nobody has rated anyone.
            value: weightedAvg === null ? "—" : weightedAvg.toFixed(2).replace(".", ","),
            unknown: weightedAvg === null,
            hint:
              weightedAvg === null
                ? "nenhuma avaliação registrada ainda"
                : `ponderada por ${ratingCount} ${ratingCount === 1 ? "avaliação" : "avaliações"}`,
          },
          {
            label: "Jogadores avaliados",
            value: rated.length,
            hint: `de ${total} no painel`,
          },
        ]}
      />

      <div className="space-y-3 px-4 sm:px-8 py-6">
        <TruncationNote
          shown={evaluations.length}
          total={total}
          noun="jogadores"
          reason="O endpoint /v1/ops/player-evaluations não aceita paginação."
        />
        <PlayerEvaluationsTable evaluations={evaluations} />
      </div>
    </div>
  );
}
