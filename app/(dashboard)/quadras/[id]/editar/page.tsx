import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PanelError } from "../../../_components/notes";
import { listCourtsAction } from "../../actions";
import { listCourtSlotsAction } from "./actions";
import { EditCourt } from "./edit-court";

export const dynamic = "force-dynamic";

/** Local yyyy-mm-dd for seeding the date-range inputs. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function EditarQuadraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // No single-court GET exists; the list carries everything this page needs
  // (name/surface/indoor + franchise id/name), so it is the source of truth.
  const { courts, error } = await listCourtsAction();
  if (error) return <PanelError eyebrow="Gestão" title="Editar Quadra" detail={error} />;

  const court = courts.find((c) => c.id === id);
  if (!court) notFound();

  const now = new Date();
  const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const slotsRes = await listCourtSlotsAction(id, now.toISOString(), to.toISOString());

  return (
    <div>
      <div className="px-8 pt-5">
        <Link
          href={`/academias/${court.franchise_id}`}
          className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={12} strokeWidth={2} />
          {court.franchise_name}
        </Link>
      </div>

      <PageHeader eyebrow="Gestão" title={`Editar · ${court.name}`} description={court.franchise_name} />

      <div className="px-8 py-6">
        <EditCourt
          court={court}
          initialSlots={slotsRes.slots ?? []}
          initialSlotsError={slotsRes.ok ? undefined : slotsRes.error}
          initialFrom={ymd(now)}
          initialTo={ymd(to)}
        />
      </div>
    </div>
  );
}
