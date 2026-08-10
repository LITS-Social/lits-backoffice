"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, Plus, Trash2 } from "lucide-react";
import { cn, formatCurrency, reaisToCents } from "@/lib/utils";
import type { CourtListItem } from "../../quadras/actions";
import { applyPriceTableAction, updateFranchiseAction } from "../../quadras/[id]/editar/actions";
import type { HourWindows } from "./academia";

/**
 * A tabela de preços da academia: um preço base para o dia inteiro e, por cima
 * dele, faixas de horário — "manhã R$ 250, nobre R$ 400". Aplica em TODAS as
 * quadras de uma vez.
 *
 * O que fazia o operador perder a tarde era o caminho antigo: entrar em cada
 * quadra, digitar a mesma faixa nove vezes, e no fim não ter como conferir o
 * resultado sem abrir o calendário dia a dia. Aqui a tabela é uma coisa só,
 * a prévia mostra o que cada hora vai custar antes de gravar, e o "aplicar"
 * anda quadra a quadra com o progresso à vista.
 *
 * O preço base também vira o padrão da academia e o de cada quadra, então a
 * grade gerada daqui pra frente já nasce no preço certo — não é um retoque nos
 * 30 dias visíveis, é a regra da casa.
 */

const DOW_OPTIONS = [
  { v: 1, label: "Seg" },
  { v: 2, label: "Ter" },
  { v: 3, label: "Qua" },
  { v: 4, label: "Qui" },
  { v: 5, label: "Sex" },
  { v: 6, label: "Sáb" },
  { v: 0, label: "Dom" },
] as const;

const ALL_DAYS = DOW_OPTIONS.map((d) => d.v);

type BandDraft = {
  id: number;
  startHour: number;
  endHour: number;
  /** Texto cru do campo — só vira centavos na hora de aplicar. */
  price: string;
  weekdays: number[];
};

/** Atalhos para as faixas que toda academia repete. */
const PRESETS: { label: string; band: Omit<BandDraft, "id" | "price"> }[] = [
  { label: "Manhã 6–11", band: { startHour: 6, endHour: 11, weekdays: [] } },
  { label: "Tarde 12–17", band: { startHour: 12, endHour: 17, weekdays: [] } },
  { label: "Nobre 18–22", band: { startHour: 18, endHour: 22, weekdays: [] } },
  { label: "Fim de semana", band: { startHour: 6, endHour: 22, weekdays: [0, 6] } },
];

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";
const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";
const primaryBtn =
  "inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50";

/* ── prévia ───────────────────────────────────────────────────────────────── */

/** A janela de funcionamento daquele dia da semana (0=dom … 6=sáb). */
function windowFor(w: HourWindows, dow: number): [number, number] {
  if (dow === 0) return [w.sunStart, w.sunEnd];
  if (dow === 6) return [w.satStart, w.satEnd];
  return [w.weekStart, w.weekEnd];
}

/** O preço que a tabela manda naquela hora daquele dia — a última faixa que
    pega vence, que é como o operador lê a lista de cima para baixo. */
function priceAt(bands: BandDraft[], baseCents: number | null, dow: number, hour: number) {
  let price = baseCents;
  for (const b of bands) {
    if (hour < b.startHour || hour > b.endHour) continue;
    if (b.weekdays.length > 0 && !b.weekdays.includes(dow)) continue;
    const c = reaisToCents(b.price);
    if (c !== null) price = c;
  }
  return price;
}

function PricePreview({
  bands,
  baseCents,
  windows,
}: {
  bands: BandDraft[];
  baseCents: number | null;
  windows: HourWindows;
}) {
  // Todas as horas que a academia abre em algum dia da semana — a régua.
  const hours = useMemo(() => {
    let min = 23;
    let max = 0;
    for (const d of ALL_DAYS) {
      const [a, b] = windowFor(windows, d);
      min = Math.min(min, a);
      max = Math.max(max, b);
    }
    return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
  }, [windows]);

  // Os preços distintos que a tabela produz, do mais barato ao mais caro — a
  // escala de tom é feita por posto, não por valor: dois preços próximos
  // precisam ficar visivelmente diferentes.
  const scale = useMemo(() => {
    const set = new Set<number>();
    for (const d of ALL_DAYS) {
      const [a, b] = windowFor(windows, d);
      for (let h = a; h <= b; h++) {
        const p = priceAt(bands, baseCents, d, h);
        if (p !== null) set.add(p);
      }
    }
    return [...set].sort((x, y) => x - y);
  }, [bands, baseCents, windows]);

  /** Tom da célula: um só matiz (a regra das sete cores), variando a opacidade
      pelo POSTO do preço na escala — dois preços próximos precisam ficar
      visivelmente diferentes, e o valor bruto não garante isso. Grátis é
      ausência de dinheiro, não o preço mais barato: ganha o tom neutro.
      As classes são literais porque o Tailwind lê o código-fonte — string
      montada em runtime não gera CSS nenhum. */
  const TONES = [
    "bg-[var(--primary)]/12",
    "bg-[var(--primary)]/25",
    "bg-[var(--primary)]/40",
    "bg-[var(--primary)]/55",
    "bg-[var(--primary)]/70",
    "bg-[var(--primary)]/85",
  ];
  const paid = scale.filter((v) => v > 0);
  const toneOf = (cents: number | null) => {
    if (cents === null) return "bg-[var(--surface-sunken)]";
    if (cents === 0) return "bg-[var(--surface-raised)]";
    const rank =
      paid.length <= 1
        ? 3
        : Math.round((paid.indexOf(cents) / (paid.length - 1)) * (TONES.length - 1));
    return TONES[Math.max(0, Math.min(TONES.length - 1, rank))];
  };

  const hasClosed = useMemo(
    () =>
      ALL_DAYS.some((d) => {
        const [a, b] = windowFor(windows, d);
        return hours.some((h) => h < a || h > b);
      }),
    [hours, windows]
  );

  if (hours.length === 0) return null;

  return (
    <div>
      <span className={labelClass}>Prévia — o que cada hora vai custar</span>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-[2px] text-center">
          <thead>
            <tr>
              <th className="w-8" />
              {hours.map((h) => (
                <th
                  key={h}
                  className="numeral pb-1 text-[9px] font-300 text-[var(--text-tertiary)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOW_OPTIONS.map((d) => {
              const [a, b] = windowFor(windows, d.v);
              return (
                <tr key={d.v}>
                  <th className="pr-1.5 text-right text-[9.5px] font-400 text-[var(--text-tertiary)]">
                    {d.label}
                  </th>
                  {hours.map((h) => {
                    const open = h >= a && h <= b;
                    const p = open ? priceAt(bands, baseCents, d.v, h) : null;
                    return (
                      <td
                        key={h}
                        title={
                          open
                            ? `${d.label} ${h}h — ${p === null ? "sem mudança" : formatCurrency(p)}`
                            : `${d.label} ${h}h — fechado`
                        }
                        className={cn(
                          "h-5 rounded-[3px] text-[8.5px] leading-none",
                          open
                            ? toneOf(p)
                            : "border border-dashed border-[var(--border)] bg-transparent"
                        )}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {scale.map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-[2px]", toneOf(c))} />
            <span
              className={cn(
                "text-[10px] text-[var(--text-tertiary)]",
                c === 0 ? "font-300" : "numeral"
              )}
            >
              {c === 0 ? "grátis" : formatCurrency(c)}
            </span>
          </span>
        ))}
        {/* Só quando existe hora fechada de fato — legenda de um símbolo que
            não aparece na grade é ruído. */}
        {hasClosed && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px] border border-dashed border-[var(--border)]" />
            <span className="text-[10px] font-300 text-[var(--text-tertiary)]">fechado</span>
          </span>
        )}
      </div>
    </div>
  );
}

/* ── a seção ──────────────────────────────────────────────────────────────── */

type Progress = { done: number; total: number; court: string };
type Result = {
  courts: number;
  repriced: number;
  updated: number;
  skippedBooked: number;
  failed: number;
  /** Quadras que não responderam — nomeadas, para o operador repetir só nelas. */
  brokenCourts: string[];
};

export function PriceTableSection({
  courts,
  windows,
  onDone,
}: {
  courts: CourtListItem[];
  windows: HourWindows;
  onDone: () => void;
}) {
  const base = courts[0];
  const [basePrice, setBasePrice] = useState(
    base.franchise_default_price_cents != null
      ? String(base.franchise_default_price_cents / 100).replace(".", ",")
      : ""
  );
  const [bands, setBands] = useState<BandDraft[]>([]);
  const [nextId, setNextId] = useState(1);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const baseCents = reaisToCents(basePrice);
  const running = progress !== null;

  const addBand = (b?: Omit<BandDraft, "id" | "price">) => {
    setBands((cur) => [
      ...cur,
      { id: nextId, price: "", startHour: 18, endHour: 22, weekdays: [], ...b },
    ]);
    setNextId((v) => v + 1);
  };
  const patchBand = (id: number, patch: Partial<BandDraft>) =>
    setBands((cur) => cur.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const removeBand = (id: number) => setBands((cur) => cur.filter((b) => b.id !== id));

  async function apply() {
    setError("");
    setResult(null);

    if (basePrice.trim() !== "" && baseCents === null) {
      setError("Preço base inválido. Use ex: 400 ou 400,50.");
      return;
    }
    const payload = [];
    for (const b of bands) {
      const cents = reaisToCents(b.price);
      if (cents === null) {
        setError("Toda faixa precisa de um preço válido — ex: 400 ou 400,50.");
        return;
      }
      if (b.startHour > b.endHour) {
        setError("Em toda faixa, a hora inicial precisa ser menor ou igual à final.");
        return;
      }
      payload.push({
        startHour: b.startHour,
        endHour: b.endHour,
        priceCents: cents,
        weekdays: b.weekdays,
      });
    }
    if (baseCents === null && payload.length === 0) {
      setError("Preencha o preço base ou pelo menos uma faixa.");
      return;
    }

    const totals: Result = {
      courts: 0,
      repriced: 0,
      updated: 0,
      skippedBooked: 0,
      failed: 0,
      brokenCourts: [],
    };

    // O padrão da academia acompanha o base: sem isto, quadra criada amanhã
    // nasceria no preço velho e ninguém entenderia por quê.
    if (baseCents !== null) {
      await updateFranchiseAction(base.franchise_id, { defaultPriceCents: baseCents });
    }

    // Quadra a quadra, em série de propósito: o navegador vê o progresso andar
    // e o BFF não leva nove rajadas de PATCH ao mesmo tempo (dentro de cada
    // quadra os PATCHes já vão em paralelo).
    for (const [i, court] of courts.entries()) {
      setProgress({ done: i, total: courts.length, court: court.name });
      const res = await applyPriceTableAction(court.id, {
        baseCents,
        bands: payload,
      });
      if (!res.ok) {
        totals.brokenCourts.push(court.name);
        continue;
      }
      totals.courts++;
      totals.repriced += res.repriced ?? 0;
      totals.updated += res.updated ?? 0;
      totals.skippedBooked += res.skippedBooked ?? 0;
      totals.failed += res.failed ?? 0;
    }

    setProgress(null);
    setResult(totals);
    onDone();
  }

  return (
    <section className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="eyebrow">Tabela de preços</h2>
        <p className="mt-2 max-w-3xl text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Um preço base para o dia inteiro e, por cima dele, as faixas de horário. Aplica nas{" "}
          {courts.length} quadra{courts.length === 1 ? "" : "s"} de uma vez. O base pega todo
          horário futuro e ainda vira o padrão da academia, então a grade gerada daqui pra frente
          já nasce no preço certo; as faixas alcançam os próximos 30 dias. Quando duas faixas
          pegam a mesma hora, vale a de baixo. Reservas já vendidas mantêm o preço combinado.
        </p>
      </div>

      <div className="space-y-5">
        <div className="sm:max-w-[220px]">
          <label htmlFor="pt_base" className={labelClass}>
            Preço base da hora (R$)
          </label>
          <input
            id="pt_base"
            inputMode="decimal"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            placeholder="ex: 250"
            className={fieldClass}
          />
          <p className="mt-1.5 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
            Vale para toda hora que nenhuma faixa pegar. Em branco, o preço atual de cada horário
            fica como está.
          </p>
        </div>

        {/* ── faixas ──────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className={labelClass}>Faixas de horário</span>
            <button
              type="button"
              onClick={() => addBand()}
              className="inline-flex items-center gap-1 text-[10.5px] font-500 text-[var(--primary)] transition-opacity hover:opacity-70"
            >
              <Plus size={11} strokeWidth={2.5} /> Adicionar faixa
            </button>
          </div>

          {bands.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-[11.5px] font-300 leading-snug text-[var(--text-tertiary)]">
              Sem faixa nenhuma, todo horário sai pelo preço base. Comece por um atalho abaixo.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {bands.map((b) => (
                <li
                  key={b.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-[72px]">
                      <label className={labelClass} htmlFor={`b${b.id}_from`}>
                        Da hora
                      </label>
                      <input
                        id={`b${b.id}_from`}
                        type="number"
                        min={0}
                        max={23}
                        value={b.startHour}
                        onChange={(e) => patchBand(b.id, { startHour: Number(e.target.value) })}
                        className={fieldClass}
                      />
                    </div>
                    <div className="w-[72px]">
                      <label className={labelClass} htmlFor={`b${b.id}_to`}>
                        Até (incl.)
                      </label>
                      <input
                        id={`b${b.id}_to`}
                        type="number"
                        min={0}
                        max={23}
                        value={b.endHour}
                        onChange={(e) => patchBand(b.id, { endHour: Number(e.target.value) })}
                        className={fieldClass}
                      />
                    </div>
                    <div className="w-[110px]">
                      <label className={labelClass} htmlFor={`b${b.id}_price`}>
                        Preço (R$)
                      </label>
                      <input
                        id={`b${b.id}_price`}
                        inputMode="decimal"
                        value={b.price}
                        onChange={(e) => patchBand(b.id, { price: e.target.value })}
                        placeholder="ex: 400"
                        className={fieldClass}
                      />
                    </div>

                    <div className="min-w-[240px] flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className={labelClass}>Dias</span>
                        <button
                          type="button"
                          onClick={() =>
                            patchBand(b.id, {
                              weekdays: b.weekdays.length === 7 ? [] : [...ALL_DAYS],
                            })
                          }
                          className="text-[10px] font-500 text-[var(--primary)] transition-opacity hover:opacity-70"
                        >
                          {b.weekdays.length === 7 ? "Limpar" : "Todos"}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {DOW_OPTIONS.map((d) => {
                          const on = b.weekdays.includes(d.v);
                          return (
                            <button
                              key={d.v}
                              type="button"
                              aria-pressed={on}
                              onClick={() =>
                                patchBand(b.id, {
                                  weekdays: on
                                    ? b.weekdays.filter((v) => v !== d.v)
                                    : [...b.weekdays, d.v],
                                })
                              }
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-[10.5px] font-500 transition-colors",
                                on
                                  ? "border-[var(--primary)] bg-[var(--primary)]/12 text-[var(--primary)]"
                                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                              )}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeBand(b.id)}
                      aria-label="Remover faixa"
                      className="mb-1.5 inline-flex items-center gap-1 text-[10.5px] font-500 text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-error)]"
                    >
                      <Trash2 size={12} /> Remover
                    </button>
                  </div>
                  {b.weekdays.length > 0 && b.weekdays.length < 7 && (
                    <p className="mt-2 text-[10.5px] font-300 text-[var(--text-tertiary)]">
                      Vale só {b.weekdays.length === 1 ? "neste dia" : "nestes dias"}; nos outros,
                      o preço base.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-300 text-[var(--text-tertiary)]">Atalhos:</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => addBand({ ...p.band, weekdays: [...p.band.weekdays] })}
                className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[10.5px] font-500 text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <PricePreview bands={bands} baseCents={baseCents} windows={windows} />

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
          <button type="button" onClick={apply} disabled={running} className={primaryBtn}>
            {running ? "Aplicando…" : `Aplicar nas ${courts.length} quadras`}
            {!running && <Check size={11} strokeWidth={2.5} />}
          </button>
          {progress && (
            <span className="text-[11px] font-300 text-[var(--text-tertiary)]">
              {progress.done + 1} de {progress.total} · {progress.court}
            </span>
          )}
        </div>

        {progress && (
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
              style={{ width: `${((progress.done + 1) / progress.total) * 100}%` }}
            />
          </div>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-error)]">
            <AlertCircle size={13} className="mt-px shrink-0" />
            {error}
          </p>
        )}

        {result && (
          <p className="flex items-start gap-2 rounded-lg border border-[var(--color-success)]/25 bg-[var(--color-success-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-success)]">
            <Check size={13} strokeWidth={2.5} className="mt-px shrink-0" />
            <span>
              Tabela aplicada em {result.courts} quadra{result.courts === 1 ? "" : "s"} —{" "}
              {result.repriced.toLocaleString("pt-BR")} horário
              {result.repriced === 1 ? "" : "s"} no preço base e{" "}
              {result.updated.toLocaleString("pt-BR")} nas faixas.
              {result.skippedBooked > 0 &&
                ` ${result.skippedBooked} com reserva ${
                  result.skippedBooked === 1 ? "ficou" : "ficaram"
                } com o preço combinado.`}
              {result.failed > 0 &&
                ` ${result.failed} horário${result.failed === 1 ? "" : "s"} não responder${
                  result.failed === 1 ? "am" : "am"
                } — aplique de novo para pegar o que faltou.`}
              {result.brokenCourts.length > 0 &&
                ` Não deu para aplicar em: ${result.brokenCourts.join(", ")}.`}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
