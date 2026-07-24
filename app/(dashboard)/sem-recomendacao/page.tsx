import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function SemRecomendacaoPage() {
  return (
    <div>
      <PageHeader
        eyebrow="#04"
        title="Jogadores Sem Recomendação Compatível"
        description="Jogadores para quem o app não encontrou adversário compatível. Indica gaps de densidade no beta — níveis, bairros ou horários sem massa crítica."
      />
      <div className="px-4 sm:px-8 py-6">
        <EmptyState message="Em breve: telemetria de zero-candidato" />
      </div>
    </div>
  );
}
