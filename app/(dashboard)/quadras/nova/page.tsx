import { PageHeader } from "@/components/ui/page-header";
import { PanelError } from "../../_components/notes";
import { listFranchisesAction } from "./actions";
import { NovaQuadraForm } from "./form";

export default async function NovaQuadraPage() {
  const { franchises, error } = await listFranchisesAction();

  if (error) {
    return (
      <PanelError
        eyebrow="Quadras"
        title="Nova Quadra"
        detail={error}
      />
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Gestão"
        title="Nova Quadra"
        description="Crie uma franquia (se necessário) e cadastre a quadra com disponibilidade gerada automaticamente."
      />

      <div className="px-8 py-6">
        <NovaQuadraForm franchises={franchises} />
      </div>
    </div>
  );
}
