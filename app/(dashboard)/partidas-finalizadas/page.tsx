import { PageHeader } from "@/components/ui/page-header";
import { getApi } from "@/lib/api";
import { StatRail } from "../_components/stat-rail";
import { PanelError, TruncationNote } from "../_components/notes";
import { FinishedMatchesTable } from "./table";

// Same reasoning as #01: the endpoint's default page is 50, the beta already holds
// more finished matches than that, and a silent page of 50 is a wrong answer to
// "quantas partidas foram jogadas?". Ask for the lot; the TruncationNote confesses
// out loud if we ever outgrow it.
const LIMIT = 500;

export default async function PartidasFinalizadasPage() {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/finished-matches", {
    params: { query: { limit: LIMIT, offset: 0 } },
  });

  if (error) {
    return (
      <PanelError eyebrow="#02" title="Partidas Finalizadas" detail={error.detail || error.title} />
    );
  }

  const matches = data.matches ?? [];
  const total = data.total ?? matches.length;

  // Counts of rows actually in hand — nothing extrapolated from the page to the
  // whole. `payment_settled` is the BFF's own verdict (a free public-court match
  // owes nothing); re-deriving it from the two legs would get that case wrong.
  const unpaid = matches.filter((m) => !m.payment_settled).length;
  const noGuest = matches.filter((m) => !m.guest).length;

  return (
    <div>
      <PageHeader
        eyebrow="#02"
        title="Partidas Finalizadas"
        description="Partidas realizadas. Destaque para casos sem placar, conflitos ou no-show."
      />

      <StatRail
        stats={[
          { label: "Partidas", value: total },
          {
            label: "Falta pagar",
            value: unpaid,
            tone: "money",
            hint: "partida já jogada e ainda em aberto",
          },
          {
            label: "Sem convidado",
            value: noGuest,
            tone: "attention",
            hint: "jogada sem outro jogador registrado",
          },
        ]}
      />

      <div className="space-y-3 px-4 sm:px-8 py-6">
        <TruncationNote shown={matches.length} total={total} noun="partidas" />
        <FinishedMatchesTable matches={matches} />
      </div>
    </div>
  );
}
