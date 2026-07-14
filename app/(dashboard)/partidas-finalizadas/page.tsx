import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function PartidasFinalizadasPage() {
  return (
    <div>
      <PageHeader
        eyebrow="#02"
        title="Partidas Finalizadas"
        description="Partidas realizadas. Destaque para casos sem placar, conflitos ou no-show."
      />
      <div className="px-8 py-6">
        <EmptyState message="Em breve: captura de placar e resultados" />
      </div>
    </div>
  );
}
