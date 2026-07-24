"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, Check, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import type { CourtListItem } from "../../quadras/actions";
import { deleteCourtAction } from "../../quadras/actions";
import {
  regenerateAvailabilityAction,
  updateFranchiseAction,
} from "../../quadras/[id]/editar/actions";
import { FranchiseSection } from "../../quadras/[id]/editar/edit-court";
import { AcademiaCalendar } from "./calendar";
import { ImportPrintAcademia } from "./import-print-academia";

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

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";
const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";
const primaryBtn =
  "inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50";

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

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-error)]">
      <AlertCircle size={13} className="mt-px shrink-0" />
      {message}
    </p>
  );
}

function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-[var(--color-success)]/25 bg-[var(--color-success-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-success)]">
      <Check size={13} strokeWidth={2.5} className="shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/* ══ operating hours ══════════════════════════════════════════════════════ */

export type HourWindows = {
  weekStart: number; weekEnd: number;
  satStart: number; satEnd: number;
  sunStart: number; sunEnd: number;
};

function initialWindows(c: CourtListItem): HourWindows {
  return {
    weekStart: c.franchise_hours_week_start ?? 6,
    weekEnd:   c.franchise_hours_week_end ?? 22,
    satStart:  c.franchise_hours_sat_start ?? c.franchise_hours_week_start ?? 6,
    satEnd:    c.franchise_hours_sat_end ?? c.franchise_hours_week_end ?? 22,
    sunStart:  c.franchise_hours_sun_start ?? c.franchise_hours_week_start ?? 6,
    sunEnd:    c.franchise_hours_sun_end ?? c.franchise_hours_week_end ?? 22,
  };
}

function OperatingHoursSection({
  franchiseId,
  courts,
  onApplied,
}: {
  franchiseId: string;
  courts: CourtListItem[];
  onApplied: () => void;
}) {
  const [w, setW] = useState<HourWindows>(() => initialWindows(courts[0]));
  const [saved, setSaved] = useState<HourWindows | null>(null);
  const [days, setDays] = useState("30");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [savedNote, setSavedNote] = useState(false);
  const [applyNote, setApplyNote] = useState("");
  const [saving, startSaving] = useTransition();
  const [applying, startApplying] = useTransition();

  const rows = [
    ["Segunda a sexta", "weekStart", "weekEnd"],
    ["Sábado", "satStart", "satEnd"],
    ["Domingo", "sunStart", "sunEnd"],
  ] as const;

  function validate(): string {
    for (const [label, ks, ke] of rows) {
      if (w[ks] < 0 || w[ks] > 22 || w[ke] < 1 || w[ke] > 23 || w[ks] >= w[ke])
        return `${label}: início deve ser antes do fim (início 0–22, fim 1–23).`;
    }
    return "";
  }

  function save() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError("");
    setSavedNote(false);
    startSaving(async () => {
      const res = await updateFranchiseAction(franchiseId, { hours: w });
      if (!res.ok) {
        setError(res.error ?? "Falha ao salvar o horário de funcionamento.");
        return;
      }
      setSaved({ ...w });
      setSavedNote(true);
    });
  }

  function applyAll() {
    const v = validate();
    if (v) {
      setError(v);
      setConfirming(false);
      return;
    }
    const daysForward = Number(days);
    if (!Number.isInteger(daysForward) || daysForward < 1 || daysForward > 90) {
      setError("Dias à frente deve ser um inteiro entre 1 e 90.");
      setConfirming(false);
      return;
    }
    setError("");
    setApplyNote("");
    setConfirming(false);
    startApplying(async () => {
      // Sequential on purpose: each regenerate is a whole-court rewrite; a
      // clear per-court failure beats a pile of interleaved errors.
      let created = 0;
      let deleted = 0;
      const failures: string[] = [];
      for (const c of courts) {
        const res = await regenerateAvailabilityAction(c.id, {
          startHour: w.weekStart,
          endHour: w.weekEnd,
          daysForward,
          saturday: { startHour: w.satStart, endHour: w.satEnd },
          sunday: { startHour: w.sunStart, endHour: w.sunEnd },
        });
        if (res.ok) {
          created += res.slotsCreated ?? 0;
          deleted += res.slotsDeleted ?? 0;
        } else {
          failures.push(`${c.name}: ${res.error ?? "falha"}`);
        }
      }
      if (failures.length > 0) setError(failures.join(" · "));
      if (failures.length < courts.length) {
        setApplyNote(
          `Grade aplicada em ${courts.length - failures.length} de ${courts.length} quadras — ` +
            `${created} horários criados, ${deleted} antigos removidos (reservas reais preservadas).`
        );
        onApplied();
      }
    });
  }

  return (
    <SectionCard
      eyebrow="Horário de funcionamento"
      description={
        <>
          O horário padrão da academia — a grade de <strong>todas as quadras</strong> segue estas
          janelas. O fim é a hora do último horário que começa (22 = último slot 22h–23h). Salve
          para registrar, e use “Aplicar grade” para regerar os horários de todas as quadras de uma
          vez. Reservas reais nunca são apagadas.
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2.5">
          {rows.map(([label, ks, ke]) => (
            <div key={ks} className="flex flex-wrap items-end gap-3">
              <p className="w-full pb-0.5 text-[12px] font-500 text-[var(--text-secondary)] sm:w-[130px] sm:pb-2">
                {label}
              </p>
              <div className="w-[110px]">
                <label htmlFor={`h-${ks}`} className={labelClass}>
                  Início
                </label>
                <input
                  id={`h-${ks}`}
                  type="number"
                  min={0}
                  max={22}
                  value={w[ks]}
                  onChange={(e) => {
                    setW({ ...w, [ks]: Number(e.target.value) });
                    setSavedNote(false);
                  }}
                  className={fieldClass}
                />
              </div>
              <div className="w-[110px]">
                <label htmlFor={`h-${ke}`} className={labelClass}>
                  Último início
                </label>
                <input
                  id={`h-${ke}`}
                  type="number"
                  min={1}
                  max={23}
                  value={w[ke]}
                  onChange={(e) => {
                    setW({ ...w, [ke]: Number(e.target.value) });
                    setSavedNote(false);
                  }}
                  className={fieldClass}
                />
              </div>
              <p className="pb-2.5 text-[11px] font-300 tabular-nums text-[var(--text-tertiary)]">
                {String(w[ks]).padStart(2, "0")}h – {String(w[ke] + 1).padStart(2, "0")}h
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[var(--border)] pt-4">
          <div className="w-[130px]">
            <label htmlFor="hours-days" className={labelClass}>
              Dias à frente
            </label>
            <input
              id="hours-days"
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={saving} className={primaryBtn}>
              {saving ? "Salvando…" : "Salvar horário"}
            </button>
            {confirming ? (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={applyAll}
                  disabled={applying}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-error)] px-5 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Confirmar — regera {courts.length} quadra{courts.length === 1 ? "" : "s"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-[11px] font-500 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={applying}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary)] px-5 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary)] transition-colors hover:bg-[var(--primary)]/8 disabled:opacity-50"
              >
                {applying ? "Aplicando…" : "Aplicar grade em todas as quadras"}
              </button>
            )}
          </div>
        </div>

        {saved && savedNote && <SuccessNote>Horário de funcionamento salvo.</SuccessNote>}
        {applyNote && <SuccessNote>{applyNote}</SuccessNote>}
        {error && <ErrorNote message={error} />}
      </div>
    </SectionCard>
  );
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

export function AcademiaPage({ courts }: { courts: CourtListItem[] }) {
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
      <PageHeader
        eyebrow="Gestão"
        title={base.franchise_name}
        description={`${courts.length} quadra${courts.length === 1 ? "" : "s"}. Definições, horário de funcionamento, calendário e importação de print — tudo da academia num lugar só.`}
      />
      <div className="space-y-5 px-4 sm:px-8 py-6">
        <Link
          href="/academias"
          className="inline-flex items-center gap-1.5 text-[11px] font-600 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={12} /> Todas as academias
        </Link>

        <FranchiseSection
          franchiseId={base.franchise_id}
          franchiseName={base.franchise_name}
          initialKind={base.franchise_kind}
          initialDefaultPriceCents={base.franchise_default_price_cents}
          initialLat={base.franchise_lat}
          initialLng={base.franchise_lng}
          initialAddress={base.franchise_street_address}
        />

        <OperatingHoursSection
          franchiseId={base.franchise_id}
          courts={courts}
          onApplied={refresh}
        />

        <SectionCard
          eyebrow="Quadras"
          description="As quadras desta academia. Edite superfície, preço e horários individuais na página da quadra — o calendário abaixo mostra todas juntas."
        >
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {courts.map((c) => (
              <CourtCard key={c.id} court={c} />
            ))}
          </ul>
        </SectionCard>

        <AcademiaCalendar key={calendarEpoch} courts={courts} windows={windows} />

        <ImportPrintAcademia courts={courts} windows={windows} onDone={refresh} />
      </div>
    </div>
  );
}
