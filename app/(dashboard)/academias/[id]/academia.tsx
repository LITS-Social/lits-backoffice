"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import type { CourtListItem } from "../../quadras/actions";
import { deleteCourtAction } from "../../quadras/actions";
import { FranchiseSection } from "../../quadras/[id]/editar/edit-court";
import { AcademiaCalendar } from "./calendar";
import { DangerZone } from "./danger-zone";
import { ImportPrintAcademia } from "./import-print-academia";
import { MatchesSection } from "./matches-section";
import { PriceTableSection } from "./price-table";
import { reapplySavedTable } from "./price-table-store";
import type { AcademiaMatches } from "./matches";

/**
 * The academia page is the operating unit of the panel: definições (nome,
 * tipo, preço, localização), the standard operating hours that every court's
 * grid follows, the courts themselves, a sheets-style calendar across all
 * courts, and one print import that lands on every court at once.
 */

const SURFACE_LABEL: Record<string, string> = {
  clay:   "Saibro",
  hard:   "Duro",
  grass:  "Grama",
  beach:  "Areia",
  carpet: "Carpete",
};

function SectionCard({
  eyebrow,
  description,
  children,
}: {
  eyebrow: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="eyebrow">{eyebrow}</h2>
        <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

/* ══ operating hours ══════════════════════════════════════════════════════ */

export type HourWindows = {
  weekStart: number; weekEnd: number;
  satStart: number; satEnd: number;
  sunStart: number; sunEnd: number;
};

/** As janelas de funcionamento da academia dona da quadra. Exportado porque o
    editor de UMA quadra reusa o mesmo calendário da academia. */
export function initialWindows(c: CourtListItem): HourWindows {
  return {
    weekStart: c.franchise_hours_week_start ?? 6,
    weekEnd:   c.franchise_hours_week_end ?? 22,
    satStart:  c.franchise_hours_sat_start ?? c.franchise_hours_week_start ?? 6,
    satEnd:    c.franchise_hours_sat_end ?? c.franchise_hours_week_end ?? 22,
    sunStart:  c.franchise_hours_sun_start ?? c.franchise_hours_week_start ?? 6,
    sunEnd:    c.franchise_hours_sun_end ?? c.franchise_hours_week_end ?? 22,
  };
}

/* ══ courts ═══════════════════════════════════════════════════════════════ */

function CourtCard({ court }: { court: CourtListItem }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [deleting, startDeleting] = useTransition();

  function remove() {
    setConfirming(false);
    startDeleting(async () => {
      const res = await deleteCourtAction(court.id);
      if (!res.ok) {
        setError(res.error ?? "Falha ao remover a quadra.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[13.5px] font-600 text-[var(--text-primary)]">
          {court.name}
        </p>
        <Badge variant={court.is_active ? "success" : "muted"}>
          {court.is_active ? "Ativa" : "Inativa"}
        </Badge>
      </div>
      <p className="mt-1 text-[11px] font-300 text-[var(--text-tertiary)]">
        {SURFACE_LABEL[court.surface] ?? court.surface} · {court.indoor ? "Coberta" : "Descoberta"}
      </p>
      <div className="mt-3 flex items-center gap-2 border-t border-[var(--border)] pt-3">
        <Link
          href={`/quadras/${court.id}/editar`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3.5 py-1.5 text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          <Pencil size={10} /> Editar quadra
        </Link>
        {confirming ? (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--color-error)] px-3.5 py-1.5 text-[10px] font-700 uppercase tracking-[0.14em] text-white hover:opacity-90 disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-[10.5px] font-500 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              Cancelar
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={deleting}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-error)]/80 transition-colors hover:text-[var(--color-error)] disabled:opacity-50"
          >
            <Trash2 size={10} /> {deleting ? "Removendo…" : "Remover"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-[11px] text-[var(--color-error)]">{error}</p>}
    </li>
  );
}

/* ══ page ═════════════════════════════════════════════════════════════════ */

export function AcademiaPage({
  courts,
  matches,
  franchiseSlug,
}: {
  courts: CourtListItem[];
  matches: AcademiaMatches;
  /** Chave natural da academia, vinda do diretório (`GET /v1/ops/franchises`) —
      CourtListItem não a carrega. É o que o operador redigita para apagar;
      ausente quando o diretório não respondeu. */
  franchiseSlug?: string;
}) {
  const router = useRouter();
  const base = courts[0];
  // Bumping this remounts the calendar so it refetches after grid rewrites.
  const [calendarEpoch, setCalendarEpoch] = useState(0);
  const refresh = () => {
    setCalendarEpoch((v) => v + 1);
    router.refresh();
  };

  const windows = initialWindows(base);

  return (
    <div>
      <PageHeader title={base.franchise_name}
        description={`${courts.length} quadra${courts.length === 1 ? "" : "s"}. Definições, horário de funcionamento, calendário e importação de print — tudo da academia num lugar só.`}
      />
      <div className="space-y-5 px-4 sm:px-8 py-6">
        <Link
          href="/academias"
          className="inline-flex items-center gap-1.5 text-[11px] font-600 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={12} /> Todas as academias
        </Link>

        {/* Nome, tipo, localização e funcionamento num card só: eram dois, com
            dois botões de salvar, gravando a MESMA franquia pela mesma ação. */}
        <FranchiseSection
          franchiseId={base.franchise_id}
          franchiseName={base.franchise_name}
          initialKind={base.franchise_kind}
          initialLat={base.franchise_lat}
          initialLng={base.franchise_lng}
          initialAddress={base.franchise_street_address}
          courts={courts}
          onApplied={refresh}
        />

        {/* A tabela vem logo depois do horário de funcionamento porque é a mesma
            pergunta em sequência: quando abre, e quanto custa cada hora. */}
        <PriceTableSection courts={courts} windows={windows} onDone={refresh} />

        <SectionCard
          eyebrow="Quadras"
          description="As quadras desta academia. Edite superfície, preço e horários individuais na página da quadra — o calendário abaixo mostra todas juntas."
        >
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {courts.map((c) => (
              <CourtCard key={c.id} court={c} />
            ))}
            <li>
              <Link
                href={`/quadras/nova?franquia=${base.franchise_id}`}
                className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-strong)] p-4 text-[var(--text-tertiary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                <Plus size={16} strokeWidth={2} />
                <span className="font-700 text-[9.5px] uppercase tracking-[0.16em]">
                  Adicionar quadra
                </span>
              </Link>
            </li>
          </ul>
        </SectionCard>

        <MatchesSection data={matches} />

        <AcademiaCalendar key={calendarEpoch} courts={courts} windows={windows} />

        {/* Import de print também CRIA horários — a tabela volta por cima. */}
        <ImportPrintAcademia
          courts={courts}
          windows={windows}
          onDone={async () => {
            await reapplySavedTable(base.franchise_id, courts);
            refresh();
          }}
        />

        <DangerZone
          franchiseId={base.franchise_id}
          franchiseName={base.franchise_name}
          franchiseKind={base.franchise_kind}
          franchiseSlug={franchiseSlug}
          courtCount={courts.length}
        />
      </div>
    </div>
  );
}
