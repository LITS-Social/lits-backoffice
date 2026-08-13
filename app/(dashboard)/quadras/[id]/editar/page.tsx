import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PanelError } from "../../../_components/notes";
import { listCourtsAction } from "../../actions";
import { EditCourt } from "./edit-court";

export const dynamic = "force-dynamic";

export default async function EditarQuadraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // No single-court GET exists; the list carries everything this page needs
  // (name/surface/indoor + franchise id/name), so it is the source of truth.
  const { courts, error } = await listCourtsAction();
  if (error) return <PanelError eyebrow="Gestão" title="Editar Quadra" detail={error} />;

  const court = courts.find((c) => c.id === id);
  if (!court) notFound();

  // Nada de grade aqui: a tabela de preços e o calendário buscam a própria,
  // no cliente. Esta busca existia para semear o preço "atual" do editor
  // antigo, que saiu.
  return (
    <div>
      <div className="px-4 sm:px-8 pt-5">
        <Link
          href={`/academias/${court.franchise_id}`}
          className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={12} strokeWidth={2} />
          {court.franchise_name}
        </Link>
      </div>

      <PageHeader eyebrow="Gestão" title={`Editar · ${court.name}`} description={court.franchise_name} />

      <div className="px-4 sm:px-8 py-6">
        <EditCourt court={court} />
      </div>
    </div>
  );
}
