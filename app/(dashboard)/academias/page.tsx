import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PanelError } from "../_components/notes";
import { listCourtsAction, type CourtListItem } from "../quadras/actions";
import { listFranchisesAction } from "../quadras/nova/actions";
import { ClubAnalyticsBoard } from "./club-analytics";
import { AcademiasTable } from "./academias-table";

export const dynamic = "force-dynamic";

export type AcademiaRow = {
  franchiseId: string;
  name: string;
  kind: string;
  brand: string | null;
  hasGeo: boolean;
  courts: CourtListItem[];
  /** Mesmas duas métricas do StatRail da página de detalhe — vêm do diretório
      (GET /v1/ops/franchises), não das quadras. `undefined` quando a academia
      não apareceu no diretório (franchisesError), pra não fabricar um zero. */
  preferredByUsersCount?: number;
  bookingsCount?: number;
};

/**
 * The management index is organized by ACADEMIA — the unit staff actually
 * operate (schedule, price, print imports). Courts live inside each academia's
 * own page; this list only answers "which academias exist and are they sane".
 */
export default async function AcademiasPage() {
  // O diretório de franquias vem junto só para achar as academias ÓRFÃS — as
  // que existem em `franchises` e não têm nenhuma quadra, e por isso não
  // aparecem nesta lista (que é derivada das quadras). Elas ficam num bloco
  // recolhido no rodapé, e não misturadas na grade: são centenas de venues de
  // diretório do crawler, e a grade é a tela de trabalho do dia a dia.
  const [{ courts, error }, { franchises, error: franchisesError }] = await Promise.all([
    listCourtsAction(),
    listFranchisesAction(),
  ]);
  if (error) return <PanelError eyebrow="Gestão" title="Academias" detail={error} />;

  // As duas métricas vêm do diretório (franquias), não das quadras — CourtListItem
  // não as carrega. Indexa por id pra anexar aos grupos montados abaixo.
  const statsByFranchise = new Map(
    franchises.map((f) => [f.id, { preferred: f.preferred_by_users_count, bookings: f.bookings_count }])
  );

  const byFranchise = new Map<string, AcademiaRow>();
  for (const c of courts) {
    const row = byFranchise.get(c.franchise_id);
    if (row) {
      row.courts.push(c);
    } else {
      const stats = statsByFranchise.get(c.franchise_id);
      byFranchise.set(c.franchise_id, {
        franchiseId: c.franchise_id,
        name: c.franchise_name,
        kind: c.franchise_kind,
        brand: c.franchise_brand,
        hasGeo: c.franchise_lat != null && c.franchise_lng != null,
        courts: [c],
        preferredByUsersCount: stats?.preferred,
        bookingsCount: stats?.bookings,
      });
    }
  }
  const academias = [...byFranchise.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const totalCourts = courts.length;
  const orfas = franchises
    .filter((f) => !byFranchise.has(f.id))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div>
      <PageHeader title="Academias"
        description={`${academias.length} academia${academias.length === 1 ? "" : "s"} · ${totalCourts} quadra${totalCourts === 1 ? "" : "s"}. Clique numa academia para gerenciar definições, horários, quadras e importar prints.`}
        action={
          <Link
            href="/quadras/nova"
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90"
          >
            <Plus size={11} strokeWidth={2.5} /> Nova academia
          </Link>
        }
      />
      <div className="space-y-5 px-4 sm:px-8 py-6">
        {/* O dashboard de liquidez — parceiras LITS apenas, uma por vez. */}
        <ClubAnalyticsBoard
          partners={(franchises ?? [])
            .filter((f) => f.kind === "partner")
            .map((f) => ({ id: f.id, name: f.name }))
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))}
        />

        <AcademiasTable academias={academias} />

        {franchisesError ? (
          <p className="text-[11.5px] font-300 text-[var(--text-tertiary)]">
            Não foi possível checar academias sem quadras: {franchisesError}
          </p>
        ) : (
          orfas.length > 0 && (
            <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
              <summary className="cursor-pointer list-none text-[12px] font-600 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                {orfas.length} academia{orfas.length === 1 ? "" : "s"} sem nenhuma quadra
                cadastrada
              </summary>
              <p className="mt-2.5 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
                Existem em <code>franchises</code> mas não têm quadra, então ficam de fora da grade
                acima — que é montada a partir das quadras. Abra para cadastrar a primeira quadra ou
                apagar a academia.
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {orfas.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/academias/${f.id}`}
                      className="inline-block rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-500 text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    >
                      {f.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )
        )}
      </div>
    </div>
  );
}
