import { PageHeader } from "@/components/ui/page-header";
import { getApi } from "@/lib/api";
import { StatRail } from "../_components/stat-rail";
import { PanelError, TruncationNote } from "../_components/notes";
import { ReportsTable } from "./table";

const LIMIT = 500;

export default async function DenunciasPage() {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/reports", {
    params: { query: { limit: LIMIT, offset: 0 } },
  });

  if (error) {
    return <PanelError eyebrow="#09" title="Denúncias" detail={error.detail || error.title} />;
  }

  const reports = data.reports ?? [];
  const total = data.total ?? reports.length;

  const open = reports.filter((r) => r.status === "pending").length;
  const reviewing = reports.filter((r) => r.status === "reviewing").length;
  const closed = reports.filter(
    (r) => r.status === "resolved" || r.status === "dismissed"
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow="#09"
        title="Denúncias"
        description="Quem denunciou, quem foi denunciado, o que foi dito — e o que já foi feito a respeito."
      />

      <StatRail
        stats={[
          {
            label: "Abertas",
            value: open,
            tone: "money",
            hint: "ninguém olhou ainda — alguém está esperando",
          },
          { label: "Em análise", value: reviewing, tone: "attention" },
          { label: "Finalizadas", value: closed, tone: "calm", hint: "resolvidas ou encerradas" },
        ]}
      />

      <div className="space-y-3 px-4 sm:px-8 py-6">
        <TruncationNote shown={reports.length} total={total} noun="denúncias" />
        <ReportsTable reports={reports} />
      </div>
    </div>
  );
}
