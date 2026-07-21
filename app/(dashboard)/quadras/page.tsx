import { PageHeader } from "@/components/ui/page-header";
import { PanelError } from "../_components/notes";
import { listCourtsAction } from "./actions";
import { CourtsTable } from "./table";

export default async function QuadrasPage() {
  const { courts, error } = await listCourtsAction();

  if (error) {
    return <PanelError eyebrow="Gestão" title="Quadras" detail={error} />;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Gestão"
        title="Quadras"
        description={`${courts.length} quadra${courts.length !== 1 ? "s" : ""} cadastrada${courts.length !== 1 ? "s" : ""}.`}
      />

      <div className="space-y-3 px-8 py-6">
        <CourtsTable courts={courts} />
      </div>
    </div>
  );
}
