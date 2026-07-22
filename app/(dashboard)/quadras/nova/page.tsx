import { PageHeader } from "@/components/ui/page-header";
import { PanelError } from "../../_components/notes";
import { listFranchisesAction } from "./actions";
import { NovaQuadraForm } from "./form";

export default async function NovaQuadraPage({
  searchParams,
}: {
  searchParams: Promise<{ franquia?: string }>;
}) {
  const { franquia } = await searchParams;
  const { franchises, error } = await listFranchisesAction();

  // Deep link from the courts list ("Nova quadra nesta academia"): lands with
  // the academia pre-selected, straight on the court step.
  const initialFranchise = franquia ? franchises.find((f) => f.id === franquia) : undefined;

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
        <NovaQuadraForm franchises={franchises} initialFranchise={initialFranchise} />
      </div>
    </div>
  );
}
