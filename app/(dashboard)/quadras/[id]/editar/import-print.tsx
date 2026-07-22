"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, Check, ScanLine, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyPrintSlotsAction,
  parseSchedulePrintAction,
  type AddSlotInput,
  type PrintCourt,
} from "./actions";

/**
 * "Importar do print" — upload a screenshot of the club's booking calendar and
 * the occupied blocks come back pre-selected as BLOCKED slots for this court.
 *
 * The flow is deliberately review-first: the model's reading lands as checkboxes
 * (all on), the print column is mapped to this court by name similarity but the
 * mapping stays editable, and nothing is written until the operator confirms.
 * A misread grid corrected in one glance beats a silent wrong write.
 */

const SP_OFFSET = "-03:00"; // same wall-clock anchor as edit-court.tsx

function spStartMs(ymd: string, hm: string): number {
  return new Date(`${ymd}T${hm}:00${SP_OFFSET}`).getTime();
}

/** "HH:MM" → minutes since midnight; accepts "24:00" as end-of-day. */
function toMin(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 24 * 60 ? v : null;
}

function minToHm(min: number): string {
  return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Loose name match: shared normalized tokens between print column and court. */
function matchScore(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  const ta = new Set(norm(a));
  return norm(b).filter((t) => ta.has(t)).length;
}

const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";
const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";

type Parsed = { date: string; courts: PrintCourt[] };
type ApplyResult = {
  created: number;
  blockedExisting: number;
  alreadyBlocked: number;
  bookedConflicts: number;
  patchFailed: number;
};

export function ImportPrintSection({
  courtId,
  courtName,
  onDone,
}: {
  courtId: string;
  courtName: string;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [courtIdx, setCourtIdx] = useState(0);
  const [date, setDate] = useState("");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [parsing, startParsing] = useTransition();
  const [applying, startApplying] = useTransition();

  function reset() {
    setParsed(null);
    setChecked(new Set());
    setResult(null);
    setError("");
  }

  function parse(file: File) {
    reset();
    setFileName(file.name);
    const fd = new FormData();
    fd.set("print", file);
    startParsing(async () => {
      const res = await parseSchedulePrintAction(fd);
      if (!res.ok || !res.courts) {
        setError(res.error ?? "Falha ao ler o print.");
        return;
      }
      // Pre-select the column whose title best matches this court's name.
      let best = 0;
      let bestScore = -1;
      res.courts.forEach((c, i) => {
        const s = matchScore(courtName, c.name);
        if (s > bestScore) {
          best = i;
          bestScore = s;
        }
      });
      setParsed({ date: res.date ?? "", courts: res.courts });
      setCourtIdx(best);
      setDate(res.date || "");
      setChecked(new Set(res.courts[best].occupied.map((_, i) => i)));
    });
  }

  function pickCourt(idx: number) {
    if (!parsed) return;
    setCourtIdx(idx);
    setChecked(new Set(parsed.courts[idx].occupied.map((_, i) => i)));
    setResult(null);
  }

  function toggle(idx: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function submit() {
    if (!parsed) return;
    setError("");
    setResult(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Confirme a data do print (o cabeçalho não trouxe uma data válida).");
      return;
    }

    // Occupied blocks arrive as ranges; the grid sells hourly slots, so each
    // block is sliced at the top of the hour (a 90-minute tail keeps its
    // remainder). Everything imports as BLOCKED — the print shows what the
    // club already sold, which is exactly what LITS must stop offering.
    const slots: AddSlotInput[] = [];
    const blocks = parsed.courts[courtIdx].occupied;
    for (const [i, block] of blocks.entries()) {
      if (!checked.has(i)) continue;
      const start = toMin(block.start);
      const end = toMin(block.end === "00:00" ? "24:00" : block.end);
      if (start == null || end == null || end <= start) continue;
      for (let t = start; t < end; t += 60) {
        const sliceEnd = Math.min(t + 60, end);
        const startMs = spStartMs(date, minToHm(t));
        slots.push({
          slot_start: new Date(startMs).toISOString(),
          slot_end: new Date(startMs + (sliceEnd - t) * 60_000).toISOString(),
          status: "blocked",
        });
      }
    }
    if (slots.length === 0) {
      setError("Nenhum horário selecionado.");
      return;
    }

    startApplying(async () => {
      const res = await applyPrintSlotsAction(courtId, slots);
      if (!res.ok) {
        setError(res.error ?? "Falha ao aplicar horários.");
        return;
      }
      setResult({
        created: res.created ?? 0,
        blockedExisting: res.blockedExisting ?? 0,
        alreadyBlocked: res.alreadyBlocked ?? 0,
        bookedConflicts: res.bookedConflicts ?? 0,
        patchFailed: res.patchFailed ?? 0,
      });
      onDone();
    });
  }

  const blocks = parsed?.courts[courtIdx]?.occupied ?? [];

  return (
    <section className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="eyebrow">Importar do print</h2>
        <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Suba o print do calendário do clube e os horários ocupados entram pré-selecionados como
          bloqueados nesta quadra. Nada é gravado antes da sua revisão; horários com reserva real
          nunca são sobrescritos.
        </p>
      </div>

      <div className="space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) parse(f);
            e.target.value = "";
          }}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-raised)] px-4 py-2 text-[12px] font-600 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            {parsing ? <ScanLine size={13} className="animate-pulse" /> : <Upload size={13} />}
            {parsing ? "Lendo o print…" : parsed ? "Trocar imagem" : "Enviar print"}
          </button>
          {fileName && !parsing && (
            <span className="truncate text-[11px] font-300 text-[var(--text-tertiary)]">
              {fileName}
            </span>
          )}
        </div>

        {parsed && (
          <>
            <div>
              <p className={labelClass}>Coluna do print correspondente a esta quadra</p>
              <div className="flex flex-wrap gap-1.5">
                {parsed.courts.map((c, i) => (
                  <button
                    key={`${c.name}-${i}`}
                    type="button"
                    onClick={() => pickCourt(i)}
                    aria-pressed={i === courtIdx}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-[11px] font-600 transition-colors",
                      i === courtIdx
                        ? "border-[var(--primary)] bg-[var(--primary)]/8 text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-w-[220px]">
              <label htmlFor="print_date" className={labelClass}>
                Data
              </label>
              <input
                id="print_date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div>
              <p className={labelClass}>
                Horários ocupados no clube · entram como <strong>bloqueados</strong>
              </p>
              {blocks.length === 0 ? (
                <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-4 text-center text-[12px] font-300 text-[var(--text-tertiary)]">
                  Nenhum bloco ocupado nesta coluna.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {blocks.map((b, i) => {
                    const on = checked.has(i);
                    return (
                      <li key={`${b.start}-${b.end}-${i}`}>
                        <button
                          type="button"
                          onClick={() => toggle(i)}
                          aria-pressed={on}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-600 tabular-nums transition-colors",
                            on
                              ? "border-[var(--color-clay)]/40 bg-[var(--color-warning-bg)] text-[var(--color-clay)]"
                              : "border-[var(--border)] text-[var(--text-tertiary)] line-through opacity-70 hover:opacity-100"
                          )}
                        >
                          {on && <Check size={11} strokeWidth={2.5} />}
                          {b.start}–{b.end === "24:00" ? "00:00" : b.end}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={submit}
                disabled={applying || checked.size === 0}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {applying ? "Aplicando…" : `Bloquear ${checked.size} selecionado${checked.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-error)]">
            <AlertCircle size={13} className="mt-px shrink-0" />
            {error}
          </p>
        )}

        {result && (
          <p className="flex items-center gap-2 rounded-lg border border-[var(--color-success)]/25 bg-[var(--color-success-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-success)]">
            <Check size={13} strokeWidth={2.5} className="shrink-0" />
            <span>
              {result.created} criado{result.created === 1 ? "" : "s"} como bloqueado
              {result.created === 1 ? "" : "s"}
              {result.blockedExisting > 0 && <> · {result.blockedExisting} já existiam e foram bloqueados</>}
              {result.alreadyBlocked > 0 && <> · {result.alreadyBlocked} já estavam bloqueados</>}
              {result.bookedConflicts > 0 && (
                <>
                  {" "}
                  · <strong>{result.bookedConflicts} com reserva real — não tocados</strong>
                </>
              )}
            </span>
          </p>
        )}

        {result && result.patchFailed > 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-error)]">
            <AlertCircle size={13} className="mt-px shrink-0" />
            {result.patchFailed} falharam ao bloquear — tente de novo.
          </p>
        )}
      </div>
    </section>
  );
}
