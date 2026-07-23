import { PanelError } from "../../_components/notes";
import { listCourtsAction } from "../../quadras/actions";
import { AcademiaPage } from "./academia";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { courts, error } = await listCourtsAction();
  if (error) return <PanelError eyebrow="Gestão" title="Academia" detail={error} />;

  const mine = courts.filter((c) => c.franchise_id === id);
  if (mine.length === 0) {
    return (
      <PanelError
        eyebrow="Gestão"
        title="Academia"
        detail="Academia não encontrada — ou ainda sem quadras cadastradas. Crie a primeira quadra em Nova Academia."
      />
    );
  }
  return <AcademiaPage courts={mine} />;
}
