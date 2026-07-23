import { PageHeader } from "@/components/ui/page-header";
import { PanelError } from "../_components/notes";
import { listCourtsAction, type CourtListItem } from "../quadras/actions";
import { AcademiasTable } from "./academias-table";

export const dynamic = "force-dynamic";

export type AcademiaRow = {
  franchiseId: string;
  name: string;
  kind: string;
  brand: string | null;
  hasGeo: boolean;
  courts: CourtListItem[];
};

/**
 * The management index is organized by ACADEMIA — the unit staff actually
 * operate (schedule, price, print imports). Courts live inside each academia's
 * own page; this list only answers "which academias exist and are they sane".
 */
export default async function AcademiasPage() {
  const { courts, error } = await listCourtsAction();
  if (error) return <PanelError eyebrow="Gestão" title="Academias" detail={error} />;

  const byFranchise = new Map<string, AcademiaRow>();
  for (const c of courts) {
    const row = byFranchise.get(c.franchise_id);
    if (row) {
      row.courts.push(c);
    } else {
      byFranchise.set(c.franchise_id, {
        franchiseId: c.franchise_id,
        name: c.franchise_name,
        kind: c.franchise_kind,
        brand: c.franchise_brand,
        hasGeo: c.franchise_lat != null && c.franchise_lng != null,
        courts: [c],
      });
    }
  }
  const academias = [...byFranchise.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const totalCourts = courts.length;

  return (
    <div>
      <PageHeader
        eyebrow="Gestão"
        title="Academias"
        description={`${academias.length} academia${academias.length === 1 ? "" : "s"} · ${totalCourts} quadra${totalCourts === 1 ? "" : "s"}. Clique numa academia para gerenciar definições, horários, quadras e importar prints.`}
      />
      <div className="px-8 py-6">
        <AcademiasTable academias={academias} />
      </div>
    </div>
  );
}
