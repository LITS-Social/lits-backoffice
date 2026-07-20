import { PageHeader } from "@/components/ui/page-header";
import { getApi } from "@/lib/api";
import { StatRail } from "../_components/stat-rail";
import { PanelError, TruncationNote } from "../_components/notes";
import { BlockCourtModal } from "./block-court-modal";
import { CourtIssuesTable } from "./table";

const LIMIT = 500;

export default async function QuadrasIndisponiveisPage() {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/court-issues", {
    params: { query: { limit: LIMIT } },
  });

  if (error) {
    return <PanelError eyebrow="#07" title="Quadras Indisponíveis" detail={error.detail || error.title} />;
  }

  const issues = data.issues ?? [];
  const total = data.total ?? issues.length;

  const affectedBookings = issues.reduce((n, i) => n + (i.affected_bookings?.length ?? 0), 0);

  const strandedPlayers = issues.reduce(
    (n, i) => n + (i.affected_bookings ?? []).reduce((m, b) => m + (b.guest ? 2 : 1), 0),
    0
  );

  return (
    <div>
      <PageHeader
        eyebrow="#07"
        title="Quadras Indisponíveis"
        description="Quadras que sumiram do mapa — e exatamente quem vai chegar lá e não encontrar nada."
        action={<BlockCourtModal />}
      />

      <StatRail
        stats={[
          { label: "Bloqueios", value: total },
          {
            label: "Reservas afetadas",
            value: affectedBookings,
            tone: "attention",
            hint: "partidas marcadas em cima de um bloqueio",
          },
          {
            label: "Jogadores na mão",
            value: strandedPlayers,
            tone: "attention",
            hint: "pessoas para avisar, contando os dois lados de cada partida",
          },
        ]}
      />

      <div className="space-y-3 px-8 py-6">
        <TruncationNote shown={issues.length} total={total} noun="bloqueios" />
        {/*
          Deleted from here: a note asserting that "a API só retorna o host de cada
          reserva afetada, não o adversário".

          That was false. AffectedBookingItem carries an optional `guest`, and the BFF
          populates it from ab.GetOpponentUserId() — the table below has been rendering
          both names all along. A caveat describing a limitation that no longer exists
          is not a harmless leftover: it teaches the founder to distrust a column that
          is in fact complete, and to go phone people the panel already told him about.
        */}
        <CourtIssuesTable issues={issues} />
      </div>
    </div>
  );
}
