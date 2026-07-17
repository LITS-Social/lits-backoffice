import { PageHeader } from "@/components/ui/page-header";
import { getApi } from "@/lib/api";
import { PanelError } from "../_components/notes";
import { AudiencesTable } from "./audiences-table";

export const dynamic = "force-dynamic";

/**
 * Panel #14 — Públicos.
 *
 * The only panel with real CRUD: it manages the saved audience filters that
 * panel #13 broadcasts to. Presets sort first (the BFF's ordering) and cannot be
 * deleted. The list loads without member counts on purpose — each count is a
 * user-service aggregate, so it is fetched per row on demand, not fanned out on
 * every render. Staff authorization is enforced by the BFF on every /v1/ops/* call.
 */
export default async function PublicosPage() {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/audiences", {});

  if (error) {
    return <PanelError eyebrow="#14" title="Públicos" detail={error.detail || error.title} />;
  }

  return (
    <div>
      <PageHeader
        eyebrow="#14"
        title="Públicos"
        description="Segmentos salvos para os anúncios: uma combinação de classe, sexo e clube. Crie um público, veja quantos membros ele alcança e use-o no painel Enviar Anúncio."
      />

      <div className="px-8 py-6">
        <AudiencesTable initial={data.audiences ?? []} />
      </div>
    </div>
  );
}
