import { PageHeader } from "@/components/ui/page-header";
import { getApi } from "@/lib/api";
import { StatRail } from "../_components/stat-rail";
import { PanelError, TruncationNote } from "../_components/notes";
import { OpenInvitesTable } from "./table";

const URGENT_MS = 30 * 60_000;

export default async function ConvitesPage() {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/open-invites", {
    params: { query: { limit: 500, offset: 0 } },
  });

  if (error) {
    return <PanelError eyebrow="#03" title="Convites em Aberto" detail={error.detail || error.title} />;
  }

  const invites = data.invites ?? [];
  const total = data.total ?? invites.length;

  // Counted on the server at request time. Comparing absolute instants (not
  // calendar days) makes this timezone-proof: "30 minutes from now" is the same
  // 30 minutes in UTC on the Worker and in BRT on the founder's screen.
  const now = Date.now();
  const expiring = invites.filter((i) => {
    const left = new Date(i.expires_at).getTime() - now;
    return left > 0 && left < URGENT_MS;
  }).length;
  const expired = invites.filter((i) => new Date(i.expires_at).getTime() <= now).length;
  const alreadyPlayed = invites.filter((i) => new Date(i.starts_at).getTime() < now).length;

  return (
    <div>
      <PageHeader
        eyebrow="#03"
        title="Convites em Aberto"
        description="A janela de 2h correndo em tempo real. O topo da lista é quem precisa de um WhatsApp agora."
      />

      <StatRail
        stats={[
          { label: "Em aberto", value: total },
          {
            label: "Expirando",
            value: expiring,
            tone: "attention",
            hint: "menos de 30 minutos de janela",
          },
          {
            label: "Expirados",
            value: expired,
            tone: "attention",
            hint: "a janela fechou sem resposta do convidado",
          },
          {
            label: "Partida já passou",
            value: alreadyPlayed,
            tone: "attention",
            hint: "convite ainda aberto para um horário que já aconteceu",
          },
        ]}
      />

      <div className="space-y-3 px-4 sm:px-8 py-6">
        {/* Still honest if the set ever outgrows the 500-row fetch: the table paginates
            what it holds, and this says so when it does not hold everything. */}
        <TruncationNote
          shown={invites.length}
          total={total}
          noun="convites"
          reason="O fetch traz as primeiras 500; o restante não chega ao painel."
        />
        <OpenInvitesTable invites={invites} />
      </div>
    </div>
  );
}
