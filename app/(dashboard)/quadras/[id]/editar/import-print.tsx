"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, ArrowRight, Check, ImageUp, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyPrintSlotsAction,
  parseSchedulePrintAction,
  type AddSlotInput,
  type PrintCourt,
  type PrintKind,
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

/** "2026-07-24" → "sex 24/07" — how a block announces its own day on the chip. */
function blockDayLabel(ymd: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  })
    .format(new Date(`${ymd}T12:00:00`))
    .replace(".", "");
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
  unblocked: number;
  bookedConflicts: number;
  patchFailed: number;
};

/** The panel's slot-generation window: hourly starts 06:00 through 22:00
    inclusive (CreateCourtBody's end_hour is last-start-inclusive, default 22).
    In "available" mode this is the day that gets blocked around the offers. */
const WINDOW_START_MIN = 6 * 60;
const WINDOW_LAST_START_MIN = 22 * 60;

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
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  // The model's reading of the print — operator-correctable via the toggle.
  const [kind, setKind] = useState<PrintKind>("occupied");
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

  /** Client-side gate mirroring the action's limits — a dropped .pdf or a 12 MB
      screenshot fails here instantly instead of after a round-trip. */
  function handleFile(file: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      reset();
      setFileName(file.name);
      setError("Formato não suportado — use PNG, JPEG ou WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reset();
      setFileName(file.name);
      setError("Imagem muito grande (máx. 5 MB).");
      return;
    }
    parse(file);
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
      setKind(res.kind ?? "occupied");
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

    // Each block prefers its own date (chat prints span several days); the
    // date field is only the fallback for blocks the model couldn't date.
    const validYmd = (y: string) => /^\d{4}-\d{2}-\d{2}$/.test(y);
    const blocks = parsed.courts[courtIdx].occupied;
    if (blocks.some((b, i) => checked.has(i) && !validYmd(b.date) && !validYmd(date))) {
      setError("Há horários sem data no print — preencha o campo de data.");
      return;
    }

    const slots: AddSlotInput[] = [];
    if (kind === "occupied") {
      // Occupied blocks arrive as ranges; the grid sells hourly slots, so each
      // block is sliced at the top of the hour (a 90-minute tail keeps its
      // remainder). Everything imports as BLOCKED — the print shows what the
      // club already sold, which is exactly what LITS must stop offering.
      for (const [i, block] of blocks.entries()) {
        if (!checked.has(i)) continue;
        const ymd = validYmd(block.date) ? block.date : date;
        const start = toMin(block.start);
        const end = toMin(block.end === "00:00" ? "24:00" : block.end);
        if (start == null || end == null || end <= start) continue;
        for (let t = start; t < end; t += 60) {
          const sliceEnd = Math.min(t + 60, end);
          const startMs = spStartMs(ymd, minToHm(t));
          slots.push({
            slot_start: new Date(startMs).toISOString(),
            slot_end: new Date(startMs + (sliceEnd - t) * 60_000).toISOString(),
            status: "blocked",
          });
        }
      }
    } else {
      // Available mode: the club vouched only for what it listed. For every
      // date with a checked offer, the whole generation window becomes hourly
      // slots — offered hours sell as available, every other hour is blocked.
      // Unchecking an offer simply drops it into the blocked rest.
      const byDate = new Map<string, { start: number; end: number }[]>();
      for (const [i, block] of blocks.entries()) {
        if (!checked.has(i)) continue;
        const ymd = validYmd(block.date) ? block.date : date;
        const start = toMin(block.start);
        const end = toMin(block.end === "00:00" ? "24:00" : block.end);
        if (start == null || end == null || end <= start) continue;
        const list = byDate.get(ymd);
        if (list) list.push({ start, end });
        else byDate.set(ymd, [{ start, end }]);
      }
      for (const [ymd, intervals] of byDate) {
        // Union of the offers, so adjacent blocks cover a spanning hour.
        const merged = [...intervals]
          .sort((a, b) => a.start - b.start)
          .reduce<{ start: number; end: number }[]>((acc, cur) => {
            const last = acc[acc.length - 1];
            if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
            else acc.push({ ...cur });
            return acc;
          }, []);
        const offered = (t: number) => merged.some((m) => m.start <= t && t + 60 <= m.end);
        // The window's hours, plus offered hours outside it (an explicit late
        // offer still sells; hours the club never mentioned are never touched).
        const hours = new Set<number>();
        for (let t = WINDOW_START_MIN; t <= WINDOW_LAST_START_MIN; t += 60) hours.add(t);
        for (const m of merged) {
          for (let t = Math.ceil(m.start / 60) * 60; t + 60 <= m.end; t += 60) hours.add(t);
        }
        for (const t of [...hours].sort((a, b) => a - b)) {
          const startMs = spStartMs(ymd, minToHm(t));
          slots.push({
            slot_start: new Date(startMs).toISOString(),
            slot_end: new Date(startMs + 60 * 60_000).toISOString(),
            status: offered(t) ? "available" : "blocked",
          });
        }
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
        unblocked: res.unblocked ?? 0,
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
          Suba o print do calendário do clube — ou de uma mensagem com horários combinados ou
          oferecidos — e eles entram pré-selecionados nesta quadra: ocupados viram bloqueios;
          disponíveis liberam os horários listados e bloqueiam o resto do dia. Nada é gravado
          antes da sua revisão; horários com reserva real nunca são sobrescritos.
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
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        {/* The dropzone IS the upload control: click, keyboard, or drag a file
            straight from the screenshot preview. */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Enviar print — arraste a imagem ou clique para selecionar"
          onClick={() => !parsing && fileRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !parsing) {
              e.preventDefault();
              fileRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (parsing) return;
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className={cn(
            "cursor-pointer rounded-xl border border-dashed px-6 py-9 text-center transition-colors",
            dragOver
              ? "border-[var(--primary)] bg-[var(--primary)]/6"
              : "border-[var(--border-strong)] hover:border-[var(--primary)]/60"
          )}
        >
          {parsing ? (
            <>
              <ScanLine size={22} className="mx-auto animate-pulse text-[var(--primary)]" />
              <p className="mt-3 text-[13px] font-300 text-[var(--text-secondary)]">
                Lendo o print…
              </p>
              {fileName && (
                <p className="mt-1 truncate text-[11px] font-300 text-[var(--text-tertiary)]">
                  {fileName}
                </p>
              )}
            </>
          ) : (
            <>
              <ImageUp size={22} className="mx-auto text-[var(--text-tertiary)]" />
              <p className="mt-3 text-[13.5px] font-300 text-[var(--text-secondary)]">
                Arraste o print do calendário ou da mensagem do clube
              </p>
              <p className="mt-1 text-[11px] font-300 text-[var(--text-tertiary)]">
                PNG, JPEG ou WebP · máx. 5 MB
                {fileName && <> · {fileName}</>}
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90">
                Selecionar arquivo <ArrowRight size={11} strokeWidth={2.5} />
              </span>
            </>
          )}
        </div>

        {parsed && (
          <>
            <div>
              <p className={labelClass}>Entendi como</p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["occupied", "Horários OCUPADOS do clube"],
                    ["available", "Horários DISPONÍVEIS do clube"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setKind(k);
                      setResult(null);
                    }}
                    aria-pressed={kind === k}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-[11.5px] font-600 transition-colors",
                      kind === k
                        ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                        : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {kind === "available" && (
                <p className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-[11.5px] font-300 leading-relaxed text-[var(--text-secondary)]">
                  Os horários listados ficam disponíveis; o <strong>resto</strong> dos dias
                  mencionados (06h–22h) será bloqueado.
                </p>
              )}
            </div>

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

            {blocks.some((b) => !b.date) && (
              <div className="max-w-[240px]">
                <label htmlFor="print_date" className={labelClass}>
                  Data · para horários sem data no print
                </label>
                <input
                  id="print_date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={fieldClass}
                />
              </div>
            )}

            <div>
              <p className={labelClass}>
                {kind === "available" ? (
                  <>
                    Horários oferecidos pelo clube · entram como <strong>disponíveis</strong>
                  </>
                ) : (
                  <>
                    Horários ocupados no clube · entram como <strong>bloqueados</strong>
                  </>
                )}
              </p>
              {blocks.length === 0 ? (
                <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-4 text-center text-[12px] font-300 text-[var(--text-tertiary)]">
                  {kind === "available"
                    ? "Nenhum horário oferecido nesta coluna."
                    : "Nenhum bloco ocupado nesta coluna."}
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
                              ? kind === "available"
                                ? "border-[var(--color-success)]/40 bg-[var(--color-success-bg)] text-[var(--color-success)]"
                                : "border-[var(--color-clay)]/40 bg-[var(--color-warning-bg)] text-[var(--color-clay)]"
                              : "border-[var(--border)] text-[var(--text-tertiary)] line-through opacity-70 hover:opacity-100"
                          )}
                        >
                          {on && <Check size={11} strokeWidth={2.5} />}
                          {b.date && (
                            <span className="font-300 opacity-80">{blockDayLabel(b.date)} ·</span>
                          )}
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
                {applying
                  ? "Aplicando…"
                  : kind === "available"
                    ? `Aplicar ${checked.size} disponíve${checked.size === 1 ? "l" : "is"} · resto bloqueado`
                    : `Bloquear ${checked.size} selecionado${checked.size === 1 ? "" : "s"}`}
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
              {kind === "available" ? (
                <>
                  {result.created} horário{result.created === 1 ? "" : "s"} criado
                  {result.created === 1 ? "" : "s"} (disponíveis + resto bloqueado)
                </>
              ) : (
                <>
                  {result.created} criado{result.created === 1 ? "" : "s"} como bloqueado
                  {result.created === 1 ? "" : "s"}
                </>
              )}
              {result.blockedExisting > 0 && <> · {result.blockedExisting} já existiam e foram bloqueados</>}
              {result.alreadyBlocked > 0 && <> · {result.alreadyBlocked} já estavam bloqueados</>}
              {result.unblocked > 0 && <> · {result.unblocked} estavam bloqueados e foram liberados</>}
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
            {result.patchFailed} falharam ao atualizar — tente de novo.
          </p>
        )}
      </div>
    </section>
  );
}
