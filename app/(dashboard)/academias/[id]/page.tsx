import { PanelError } from "../../_components/notes";
import { listCourtsAction } from "../../quadras/actions";
import { AcademiaPage } from "./academia";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { courts, error } = await listCourtsAction();
  if (error) return <PanelError eyebrow="Gestão" title="Academia" detail={error} />;

  // display_order is the shared drag-to-reorder preference; unordered courts
  // trail in name order. The BFF already sorts this way — re-sorting here
  // keeps the page honest during the deploy window where the field is absent.
  const mine = courts
    .filter((c) => c.franchise_id === id)
    .sort(
      (a, b) =>
        (a.display_order ?? 1e9) - (b.display_order ?? 1e9) ||
        a.name.localeCompare(b.name, "pt-BR")
    );
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
