import { PageHeader } from "@/components/ui/page-header";
import { getApi } from "@/lib/api";
import { StatRail } from "../_components/stat-rail";
import { PanelError, TruncationNote } from "../_components/notes";
import { UpcomingMatchesTable } from "./table";

// The endpoint's default page is 50 and the closed beta already holds 66
// confirmed matches — so this panel used to open on a silent page of 50, and the
// tail of the founder's own week simply did not exist on screen.
//
// It accepts `limit`, so we ask for the lot. If the beta ever outgrows this, the
// TruncationNote below says so out loud rather than quietly clipping.
const LIMIT = 500;

const DAY_MS = 24 * 3600_000;

export default async function PartidasAguardandoPage() {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/upcoming-matches", {
    params: { query: { limit: LIMIT, offset: 0 } },
  });

  if (error) {
    return (
      <PanelError eyebrow="#01" title="Partidas Aguardando Jogo" detail={error.detail || error.title} />
    );
  }

  const matches = data.matches ?? [];
  const total = data.total ?? matches.length;

  // Counts of rows actually in hand — nothing estimated, nothing extrapolated
  // from the page to the whole. `payment_settled` is the BFF's own verdict: it
  // knows a free public-court booking owes nothing, and re-deriving it from the
  // two legs here would get exactly that case wrong.
  const now = Date.now();
  const unpaid = matches.filter((m) => !m.payment_settled).length;
  const next24h = matches.filter((m) => new Date(m.starts_at).getTime() - now < DAY_MS).length;
  const noGuest = matches.filter((m) => !m.guest).length;

  return (
    <div>
      <PageHeader
        eyebrow="#01"
        title="Partidas Aguardando Jogo"
        description="Confirmadas e ainda por acontecer — da mais próxima do apito para a mais distante."
      />

      <StatRail
        stats={[
          { label: "Partidas", value: total },
          {
            label: "Falta pagar",
            value: unpaid,
            tone: "money",
            hint: "alguém ainda deve a sua metade",
          },
          {
            label: "Nas próximas 24h",
            value: next24h,
            tone: "attention",
            hint: "já não dá para remarcar com calma",
          },
          {
            label: "Sem convidado",
            value: noGuest,
            tone: "attention",
            hint: "quadra reservada, ninguém do outro lado da rede",
          },
        ]}
      />

      <div className="space-y-3 px-8 py-6">
        <TruncationNote shown={matches.length} total={total} noun="partidas" />
        <UpcomingMatchesTable matches={matches} />
      </div>
    </div>
  );
}
