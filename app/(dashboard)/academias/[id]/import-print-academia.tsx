"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, ArrowRight, Check, ImageUp, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourtListItem } from "../../quadras/actions";
import {
  applyPrintSlotsAction,
  parseSchedulePrintAction,
  type PrintCourt,
  type PrintKind,
} from "../../quadras/[id]/editar/actions";
import {
  blockDayLabel,
  buildPrintSlots,
  matchScore,
  validYmd,
  type PrintWindow,
} from "../../quadras/[id]/editar/print-lib";
import type { HourWindows } from "./academia";

/**
 * Academia-level print import: one upload, every court updated. Each column
 * the model reads gets mapped to one of the academia's courts (auto-matched by
 * name, always editable, "não importar" opts a column out), and a single
 * confirm applies all of them — no more re-uploading the same print once per
 * court tab. Review-first like the per-court flow: nothing is written before
 * the operator confirms, and booked slots are never touched.
 */

const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";
const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";

type Parsed = { date: string; courts: PrintCourt[] };
type CourtResult = {
  courtName: string;
  ok: boolean;
  error?: string;
  createdBlocked: number;
  createdAvailable: number;
  blockedExisting: number;
  alreadyBlocked: number;
  unblocked: number;
  bookedConflicts: number;
  patchFailed: number;
};

/** Greedy unique auto-match: best-scoring (column, court) pairs first, each
    column and court used at most once. Zero-score pairs fall back to index
    order — a print whose columns are "Quadra 1/2/3" still maps somewhere. */
function autoMap(columns: PrintCourt[], courts: CourtListItem[]): (string | null)[] {
  const pairs: { col: number; court: number; score: number }[] = [];
  columns.forEach((col, ci) =>
    courts.forEach((court, qi) =>
      pairs.push({ col: ci, court: qi, score: matchScore(court.name, col.name) })
    )
  );
  pairs.sort((a, b) => b.score - a.score || a.col - b.col || a.court - b.court);
  const mapping = new Array<string | null>(columns.length).fill(null);
  const usedCourt = new Set<number>();
  for (const p of pairs) {
    if (mapping[p.col] !== null || usedCourt.has(p.court)) continue;
    mapping[p.col] = courts[p.court].id;
    usedCourt.add(p.court);
  }
  return mapping;
}

export function ImportPrintAcademia({
  courts,
  windows,
  onDone,
}: {
  courts: CourtListItem[];
  windows: HourWindows;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [kind, setKind] = useState<PrintKind>("occupied");
  // Column index → target court id (null = não importar).
  const [mapping, setMapping] = useState<(string | null)[]>([]);
  // Column index → unchecked block indexes (checked is the default state).
  const [unchecked, setUnchecked] = useState<Map<number, Set<number>>>(new Map());
  const [date, setDate] = useState("");
  const [fillDay, setFillDay] = useState(true);
  const [error, setError] = useState("");
  const [results, setResults] = useState<CourtResult[] | null>(null);
  const [parsing, startParsing] = useTransition();
  const [applying, startApplying] = useTransition();

  // The academia's operating hours drive the fill window, per day of week.
  const windowFor = (ymd: string): PrintWindow => {
    const dow = new Date(`${ymd}T12:00:00`).getDay();
    if (dow === 0) return { startMin: windows.sunStart * 60, lastStartMin: windows.sunEnd * 60 };
    if (dow === 6) return { startMin: windows.satStart * 60, lastStartMin: windows.satEnd * 60 };
    return { startMin: windows.weekStart * 60, lastStartMin: windows.weekEnd * 60 };
  };

  function reset() {
    setParsed(null);
    setMapping([]);
    setUnchecked(new Map());
    setResults(null);
    setError("");
  }

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
      setParsed({ date: res.date ?? "", courts: res.courts });
      setKind(res.kind ?? "occupied");
      setDate(res.date || "");
      setMapping(autoMap(res.courts, courts));
    });
  }

  function toggleBlock(col: number, idx: number) {
    setUnchecked((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(col) ?? []);
      if (set.has(idx)) set.delete(idx);
      else set.add(idx);
      next.set(col, set);
      return next;
    });
  }

  function checkedFor(col: number, total: number): Set<number> {
    const off = unchecked.get(col);
    const set = new Set<number>();
    for (let i = 0; i < total; i++) if (!off?.has(i)) set.add(i);
    return set;
  }

  const mappedCount = mapping.filter(Boolean).length;

  function submit() {
    if (!parsed) return;
    setError("");
    setResults(null);

    const jobs: { courtId: string; courtName: string; col: number }[] = [];
    mapping.forEach((courtId, col) => {
      if (!courtId) return;
      const court = courts.find((c) => c.id === courtId);
      if (court) jobs.push({ courtId, courtName: court.name, col });
    });
    if (jobs.length === 0) {
      setError("Nenhuma coluna do print está mapeada para uma quadra.");
      return;
    }
    for (const j of jobs) {
      const blocks = parsed.courts[j.col].occupied;
      const checked = checkedFor(j.col, blocks.length);
      if (blocks.some((b, i) => checked.has(i) && !validYmd(b.date) && !validYmd(date))) {
        setError("Há horários sem data no print — preencha o campo de data.");
        return;
      }
    }

    startApplying(async () => {
      // Sequential per court: results stay attributable and the BFF isn't hit
      // with N concurrent two-pass writes for the same franchise.
      const out: CourtResult[] = [];
      for (const j of jobs) {
        const blocks = parsed.courts[j.col].occupied;
        const slots = buildPrintSlots({
          kind,
          blocks,
          checked: checkedFor(j.col, blocks.length),
          fallbackDate: date,
          fillDay,
          windowFor,
        });
        if (slots.length === 0) {
          out.push({
            courtName: j.courtName,
            ok: false,
            error: "nenhum horário selecionado",
            createdBlocked: 0, createdAvailable: 0, blockedExisting: 0,
            alreadyBlocked: 0, unblocked: 0, bookedConflicts: 0, patchFailed: 0,
          });
          continue;
        }
        const res = await applyPrintSlotsAction(j.courtId, slots);
        out.push({
          courtName: j.courtName,
          ok: res.ok,
          error: res.ok ? undefined : (res.error ?? "falha ao aplicar"),
          createdBlocked: res.createdBlocked ?? 0,
          createdAvailable: res.createdAvailable ?? 0,
          blockedExisting: res.blockedExisting ?? 0,
          alreadyBlocked: res.alreadyBlocked ?? 0,
          unblocked: res.unblocked ?? 0,
          bookedConflicts: res.bookedConflicts ?? 0,
          patchFailed: res.patchFailed ?? 0,
        });
      }
      setResults(out);
      if (out.some((r) => r.ok)) onDone();
    });
  }

  const anyUndated = parsed?.courts.some((c) => c.occupied.some((b) => !b.date)) ?? false;

  return (
    <section className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="eyebrow">Importar print · todas as quadras</h2>
        <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Suba <strong>um</strong> print do calendário ou da mensagem do clube e cada coluna é
          mapeada para uma quadra da academia — um clique aplica em todas. Ocupados viram
          bloqueios; disponíveis liberam os horários listados e bloqueiam o resto do horário de
          funcionamento. Nada é gravado antes da sua revisão; reservas reais nunca são tocadas.
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
                      setResults(null);
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
            </div>

            {anyUndated && (
              <div className="max-w-[240px]">
                <label htmlFor="acad_print_date" className={labelClass}>
                  Data · para horários sem data no print
                </label>
                <input
                  id="acad_print_date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={fieldClass}
                />
              </div>
            )}

            <div className="space-y-3">
              <p className={labelClass}>Colunas do print → quadras da academia</p>
              {parsed.courts.map((col, ci) => {
                const blocks = col.occupied;
                const checked = checkedFor(ci, blocks.length);
                const target = mapping[ci] ?? "";
                return (
                  <div
                    key={`${col.name}-${ci}`}
                    className={cn(
                      "rounded-lg border p-3.5 transition-colors",
                      target ? "border-[var(--border)]" : "border-[var(--border)] opacity-60"
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="min-w-[120px] text-[12.5px] font-600 text-[var(--text-primary)]">
                        {col.name}
                      </p>
                      <ArrowRight size={12} className="text-[var(--text-tertiary)]" />
                      <select
                        value={target}
                        onChange={(e) => {
                          const next = [...mapping];
                          next[ci] = e.target.value || null;
                          setMapping(next);
                          setResults(null);
                        }}
                        aria-label={`Quadra para a coluna ${col.name}`}
                        className={cn(fieldClass, "w-auto min-w-[180px]")}
                      >
                        <option value="">Não importar</option>
                        {courts.map((c) => (
                          <option
                            key={c.id}
                            value={c.id}
                            disabled={mapping.some((m, mi) => mi !== ci && m === c.id)}
                          >
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {blocks.length === 0 ? (
                      <p className="mt-2.5 text-[11.5px] font-300 text-[var(--text-tertiary)]">
                        Nenhum horário nesta coluna.
                      </p>
                    ) : (
                      <ul className="mt-2.5 flex flex-wrap gap-1.5">
                        {blocks.map((b, i) => {
                          const on = checked.has(i);
                          return (
                            <li key={`${b.start}-${b.end}-${i}`}>
                              <button
                                type="button"
                                onClick={() => toggleBlock(ci, i)}
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
                );
              })}
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
                  Completar o dia: o resto do horário de funcionamento entra como disponível
                </button>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={applying || mappedCount === 0}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {applying
                  ? "Aplicando…"
                  : `Aplicar em ${mappedCount} quadra${mappedCount === 1 ? "" : "s"}`}
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

        {results && (
          <ul className="space-y-1.5">
            {results.map((r) => (
              <li
                key={r.courtName}
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12px] leading-snug",
                  r.ok
                    ? "border-[var(--color-success)]/25 bg-[var(--color-success-bg)] text-[var(--color-success)]"
                    : "border-[var(--color-error)]/25 bg-[var(--color-error-bg)] text-[var(--color-error)]"
                )}
              >
                {r.ok ? (
                  <Check size={13} strokeWidth={2.5} className="mt-px shrink-0" />
                ) : (
                  <AlertCircle size={13} className="mt-px shrink-0" />
                )}
                <span>
                  <strong>{r.courtName}</strong>
                  {r.ok ? (
                    <>
                      : {r.createdBlocked} bloqueado{r.createdBlocked === 1 ? "" : "s"} e{" "}
                      {r.createdAvailable} disponíve{r.createdAvailable === 1 ? "l" : "is"} criados
                      {r.blockedExisting > 0 && <> · {r.blockedExisting} existentes bloqueados</>}
                      {r.unblocked > 0 && <> · {r.unblocked} liberados</>}
                      {r.alreadyBlocked > 0 && <> · {r.alreadyBlocked} já bloqueados</>}
                      {r.bookedConflicts > 0 && (
                        <>
                          {" "}
                          · <strong>{r.bookedConflicts} com reserva real — não tocados</strong>
                        </>
                      )}
                      {r.patchFailed > 0 && <> · {r.patchFailed} falharam ao atualizar</>}
                    </>
                  ) : (
                    <>: {r.error}</>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
