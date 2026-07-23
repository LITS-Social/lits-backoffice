"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, ArrowRight, Check, ImageUp, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyPrintSlotsAction,
  parseSchedulePrintAction,
  type PrintCourt,
  type PrintKind,
} from "./actions";
import { blockDayLabel, buildPrintSlots, matchScore, validYmd } from "./print-lib";

/**
 * "Importar do print" — upload a screenshot of the club's booking calendar and
 * the occupied blocks come back pre-selected as BLOCKED slots for this court.
 *
 * The flow is deliberately review-first: the model's reading lands as checkboxes
 * (all on), the print column is mapped to this court by name similarity but the
 * mapping stays editable, and nothing is written until the operator confirms.
 * A misread grid corrected in one glance beats a silent wrong write.
 */

const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";
const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";

type Parsed = { date: string; courts: PrintCourt[] };
type ApplyResult = {
  createdBlocked: number;
  createdAvailable: number;
  blockedExisting: number;
  alreadyBlocked: number;
  unblocked: number;
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
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  // The model's reading of the print — operator-correctable via the toggle.
  const [kind, setKind] = useState<PrintKind>("occupied");
  const [courtIdx, setCourtIdx] = useState(0);
  const [date, setDate] = useState("");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [fillDay, setFillDay] = useState(true);
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
    const blocks = parsed.courts[courtIdx].occupied;
    if (blocks.some((b, i) => checked.has(i) && !validYmd(b.date) && !validYmd(date))) {
      setError("Há horários sem data no print — preencha o campo de data.");
      return;
    }

    const slots = buildPrintSlots({
      kind,
      blocks,
      checked,
      fallbackDate: date,
      fillDay,
    });
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
        createdBlocked: res.createdBlocked ?? 0,
        createdAvailable: res.createdAvailable ?? 0,
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
                          {b.date ? (
                            <span className="font-300 opacity-80">{blockDayLabel(b.date)} ·</span>
                          ) : validYmd(date) ? (
                            // Undated block inheriting the fallback field — the
                            // "*" and dimmer tone say "came from the date input".
                            <span className="font-300 opacity-55">{blockDayLabel(date)}* ·</span>
                          ) : null}
                          {b.start}–{b.end === "24:00" ? "00:00" : b.end}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {kind === "occupied" && (
              <button
                type="button"
                onClick={() => setFillDay((v) => !v)}
                aria-pressed={fillDay}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[11.5px] font-500 leading-snug transition-colors",
                  fillDay
                    ? "border-[var(--color-success)]/40 bg-[var(--color-success-bg)] text-[var(--color-success)]"
                    : "border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border",
                    fillDay ? "border-current bg-current/10" : "border-[var(--border-strong)]"
                  )}
                >
                  {fillDay && <Check size={10} strokeWidth={3} />}
                </span>
                Completar o dia: o resto (06h–23h) entra como disponível, no preço padrão
              </button>
              )}

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
                    : fillDay
                      ? `Aplicar dia completo (${checked.size} bloqueado${checked.size === 1 ? "" : "s"})`
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
              {result.createdBlocked} bloqueado{result.createdBlocked === 1 ? "" : "s"} e{" "}
              {result.createdAvailable} disponíve{result.createdAvailable === 1 ? "l" : "is"} criados
              {result.blockedExisting > 0 && <> · {result.blockedExisting} já existiam e foram bloqueados</>}
              {result.unblocked > 0 && <> · {result.unblocked} estavam bloqueados e foram liberados</>}
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
            {result.patchFailed} falharam ao atualizar — tente de novo.
          </p>
        )}
      </div>
    </section>
  );
}
