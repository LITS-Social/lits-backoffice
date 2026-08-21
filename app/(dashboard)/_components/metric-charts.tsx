"use client";

import { createPortal } from "react-dom";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";

/**
 * The Norte do Produto charts. Same contract as WeekChart: every mark is a
 * count of rows we actually hold — the server only ships raw instants when the
 * set is complete (lib/metrics.ts), so there is no interpolation and no
 * invented trend. Growth and pace re-bucket those instants client-side (daily
 * 12-day default, weekly toggle, or an explicit date range that overrides
 * both). Mounted after hydration behind fixed-height placeholders so recharts'
 * measured layout never fights the server HTML.
 */

const AXIS_TICK = {
  fill: "var(--text-tertiary)",
  fontSize: 9,
  fontFamily: "var(--font-sans)",
  fontWeight: 700,
  letterSpacing: "0.08em",
} as const;

const emptySubscribe = () => () => {};

/** False during SSR and the hydration render, true right after — without the
    setState-in-effect re-render the classic `useEffect(setMounted)` costs. */
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

function CardTooltip({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-lg">
      <p className="label-colus text-[8.5px] text-[var(--text-tertiary)]">{label}</p>
      {lines.map((l) => (
        <p key={l} className="mt-1 text-[12px] text-[var(--text-primary)]">
          {l}
        </p>
      ))}
    </div>
  );
}

/* ── Client-side bucketing ─────────────────────────────────────────────────── */

export type GrowthPoint = {
  label: string;
  total: number;
  novos: number;
  /** Quantos dos novos vieram por indicação (MGM); null = detalhe indisponível. */
  mgm: number | null;
  resto: number;
};
export type PacePoint = { label: string; count: number };

const DAY_MS = 24 * 3600_000;
const WEEK_MS = 7 * DAY_MS;

/** Default series depth — the beta is ~2 weeks old, so 12 daily bars carry
    real shape while 12 weekly buckets are still one lonely bar. */
const SERIES_LEN = 12;

/** A range longer than this re-buckets weekly — 31 daily bars still read;
    past a month they turn to noise. Documented in the card hints. */
const MAX_DAILY_RANGE_DAYS = 31;

type Granularity = "daily" | "weekly";
type Win = { start: number; end: number };

const fmtDay = (ms: number) =>
  new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** 12 rolling windows of `stepMs`, oldest→newest, ending now. */
function rollingWindows(stepMs: number): Win[] {
  const now = Date.now();
  return Array.from({ length: SERIES_LEN }, (_, i) => {
    const end = now - (SERIES_LEN - 1 - i) * stepMs;
    return { start: end - stepMs + 1, end };
  });
}

/** Explicit range chunked from its start: daily up to 31 days, weekly past
    that. The last chunk clips at the range end instead of spilling over. */
function rangeWindows(fromMs: number, toEndMs: number): { wins: Win[]; granularity: Granularity } {
  const spanDays = Math.round((toEndMs + 1 - fromMs) / DAY_MS);
  const step = spanDays <= MAX_DAILY_RANGE_DAYS ? DAY_MS : WEEK_MS;
  const wins: Win[] = [];
  for (let lo = fromMs; lo <= toEndMs; lo += step) {
    wins.push({ start: lo, end: Math.min(lo + step - 1, toEndMs) });
  }
  return { wins, granularity: step === DAY_MS ? "daily" : "weekly" };
}

/** Cumulative base at each window end; `dateless` accounts are folded into
    every total — they exist now and did not appear this quarter. */
function growthSeries(
  times: number[],
  dateless: number,
  wins: Win[],
  // Os MESMOS instantes de cadastro, filtrados a quem entrou por indicação —
  // null quando o detalhe do MGM falhou (a barra fica de uma cor só em vez de
  // fingir um zero).
  mgmTimes: number[] | null
): GrowthPoint[] {
  return wins.map((w) => {
    const novos = times.filter((t) => t >= w.start && t <= w.end).length;
    const mgm =
      mgmTimes === null ? null : mgmTimes.filter((t) => t >= w.start && t <= w.end).length;
    return {
      label: fmtDay(w.end),
      total: times.filter((t) => t <= w.end).length + dateless,
      novos,
      mgm,
      resto: mgm === null ? novos : novos - mgm,
    };
  });
}

/** "2026-07-21" (input[type=date]) → local midnight ms, or null when unparsable. */
function parseDay(v: string): number | null {
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}

/* ── Card shell (shared with the server page for the unfiltered cards) ─────── */

export function ChartCard({
  eyebrow,
  hint,
  className,
  children,
}: {
  eyebrow: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5", className)}>
      <div className="mb-4">
        <p className="eyebrow">{eyebrow}</p>
        {hint && (
          <p className="mt-2 text-[11px] font-300 text-[var(--text-tertiary)]">{hint}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function ChartUnavailable({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex h-[220px] items-center justify-center px-6 text-center text-[12px] font-300 leading-relaxed text-[var(--text-tertiary)]">
      {children}
    </p>
  );
}

/* ── Daily/weekly toggle — hidden while an explicit range overrides it ─────── */

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Granularity;
  onChange: (m: Granularity) => void;
}) {
  return (
    <div className="-mt-1 mb-2 flex justify-end gap-1">
      {(
        [
          { key: "daily", name: "12 dias" },
          { key: "weekly", name: "12 semanas" },
        ] as const
      ).map((m) => (
        <button
          key={m.key}
          type="button"
          aria-pressed={mode === m.key}
          onClick={() => onChange(m.key)}
          className={
            mode === m.key
              ? "rounded-md bg-[var(--surface-raised)] px-2 py-1 text-[9px] font-700 uppercase tracking-[0.1em] text-[var(--text-primary)]"
              : "rounded-md px-2 py-1 text-[9px] font-700 uppercase tracking-[0.1em] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
          }
        >
          {m.name}
        </button>
      ))}
    </div>
  );
}

/* ── Novos cadastros por bucket — a base acumulada fica no tooltip ─────────── */

function GrowthChart({
  points,
  granularity,
}: {
  points: GrowthPoint[];
  granularity: Granularity;
}) {
  const labelFor = (label: string) =>
    granularity === "daily" ? `dia ${label}` : `semana até ${label}`;
  const novosSuffix = granularity === "daily" ? "no dia" : "na semana";

  return (
    <div className="h-[196px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -4 }} barCategoryGap="32%">
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" opacity={0.7} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS_TICK} dy={6} interval="preserveStartEnd" />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={44}
            allowDecimals={false}
            tick={{ ...AXIS_TICK, fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 400 }}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-raised)", opacity: 0.6 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <CardTooltip
                  label={labelFor((payload[0].payload as GrowthPoint).label)}
                  lines={[
                    `+${(payload[0].payload as GrowthPoint).novos} ${novosSuffix}`,
                    ...((payload[0].payload as GrowthPoint).mgm !== null
                      ? [`via MGM: ${(payload[0].payload as GrowthPoint).mgm}`]
                      : []),
                    `base acumulada: ${(payload[0].payload as GrowthPoint).total}`,
                  ]}
                />
              ) : null
            }
          />
          {/* Empilhado: a fatia de baixo é quem chegou por indicação (MGM).
              Sem o detalhe, `resto` carrega o total e a barra fica de uma cor
              só — indisponível não vira zero. */}
          <Bar dataKey="mgm" stackId="novos" fill="var(--chart-cat-b)" isAnimationActive={false} />
          <Bar dataKey="resto" stackId="novos" fill="var(--primary)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Partidas por bucket: pagas × grátis empilhadas + linha de placares ─────
   O ritmo e o mix numa visualização só: quanto se jogou, quanto foi pago e
   quantos jogos tiveram placar publicado no feed. A linha usa a DATA DO POST
   (quando o placar foi publicado), então pode divergir do dia do jogo — e
   inclui jogos registrados sem reserva, podendo passar das barras. */

export type MatchMixPoint = {
  label: string;
  pagas: number;
  gratis: number;
  placares: number | null;
};

const MIX_NAMES: Record<string, string> = {
  pagas: "Pagas",
  gratis: "Grátis",
  placares: "Com placar publicado",
};

function MatchMixChart({
  points,
  granularity,
}: {
  points: MatchMixPoint[];
  granularity: Granularity;
}) {
  const labelFor = (label: string) =>
    granularity === "daily" ? `dia ${label}` : `semana até ${label}`;
  const hasPlacar = points.some((p) => p.placares != null);

  return (
    <div className="h-[196px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -4 }} barCategoryGap="32%">
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" opacity={0.7} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS_TICK} dy={6} interval="preserveStartEnd" />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={44}
            allowDecimals={false}
            tick={{ ...AXIS_TICK, fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 400 }}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-raised)", opacity: 0.6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as MatchMixPoint;
              const total = p.pagas + p.gratis;
              return (
                <CardTooltip
                  label={labelFor(p.label)}
                  lines={[
                    `${total} ${total === 1 ? "partida" : "partidas"} — ${p.pagas} pagas · ${p.gratis} grátis`,
                    ...(p.placares != null
                      ? [`${p.placares} ${p.placares === 1 ? "placar publicado" : "placares publicados"}`]
                      : []),
                  ]}
                />
              );
            }}
          />
          <Legend
            iconSize={9}
            formatter={(v: string) => (
              <span style={{ color: "var(--text-secondary)", fontSize: 10.5 }}>
                {MIX_NAMES[v] ?? v}
              </span>
            )}
          />
          {/* 2px surface stroke = the spacer between stacked segments. */}
          <Bar dataKey="pagas" stackId="m" fill="var(--chart-cat-a)" stroke="var(--surface)" strokeWidth={2} isAnimationActive={false} />
          <Bar
            dataKey="gratis"
            stackId="m"
            fill="var(--chart-cat-b)"
            stroke="var(--surface)"
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          {hasPlacar && (
            <Line
              type="monotone"
              dataKey="placares"
              stroke="var(--text-secondary)"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 3, fill: "var(--text-secondary)", stroke: "var(--surface)" }}
              legendType="plainline"
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── The filtered grid: growth + pace share one date-range filter ──────────── */

const fieldClass =
  "rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-[12px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";
const labelClass = "label-colus mb-1 block text-[8.5px] text-[var(--text-tertiary)]";

/**
 * Growth and pace with their per-chart daily/weekly toggles plus one shared
 * "de X a Y" range filter that overrides both windows (daily buckets up to 31
 * days, weekly past that). The engagement and completion cards ride along as
 * server-rendered slots so the grid keeps its 2+1 / 2+1 shape.
 */
export function ChartsGrid({
  userCreatedAtMs,
  mgmCreatedAtMs,
  userDateless,
  growthFallback,
  matchStartsAtMs,
  matchPaidStartsAtMs,
  placarMs,
  paceFallback,
  engagementSlot,
}: {
  /** Raw signup instants (ms) — null when the crawl failed or was truncated. */
  userCreatedAtMs: number[] | null;
  /** Instantes de cadastro de quem entrou por indicação (MGM) — subconjunto
      de userCreatedAtMs. Null quando o detalhe do MGM não veio. */
  mgmCreatedAtMs: number[] | null;
  userDateless: number;
  /** Why the growth series is missing, shown when `userCreatedAtMs` is null. */
  growthFallback: string;
  /** Raw match starts_at instants (ms) — null when the fetch failed or is partial. */
  matchStartsAtMs: number[] | null;
  /** starts_at das partidas pagas — mesmo gate de completude do total. */
  matchPaidStartsAtMs: number[] | null;
  /** Instantes de publicação dos placares no feed — null quando o crawl do
      feed falhou/foi truncado; o gráfico então omite a linha. */
  placarMs: number[] | null;
  paceFallback: string;
  engagementSlot: React.ReactNode;
}) {
  const mounted = useMounted();
  const [growthMode, setGrowthMode] = useState<Granularity>("daily");
  const [paceMode, setPaceMode] = useState<Granularity>("daily");
  const [fromStr, setFromStr] = useState("");
  const [toStr, setToStr] = useState("");

  const fromMs = fromStr ? parseDay(fromStr) : null;
  const toEndMs = (() => {
    const t = toStr ? parseDay(toStr) : null;
    return t != null ? t + DAY_MS - 1 : null;
  })();
  const invalidRange = fromMs != null && toEndMs != null && fromMs > toEndMs;
  const range =
    fromMs != null && toEndMs != null && !invalidRange ? rangeWindows(fromMs, toEndMs) : null;

  const growthGran = range ? range.granularity : growthMode;
  const paceGran = range ? range.granularity : paceMode;
  const growthPoints = userCreatedAtMs
    ? growthSeries(
        userCreatedAtMs,
        userDateless,
        range ? range.wins : rollingWindows(growthMode === "daily" ? DAY_MS : WEEK_MS),
        mgmCreatedAtMs,
      )
    : null;
  const mixPoints: MatchMixPoint[] | null =
    matchStartsAtMs && matchPaidStartsAtMs
      ? (range ? range.wins : rollingWindows(paceMode === "daily" ? DAY_MS : WEEK_MS)).map((w) => {
          const inWin = (t: number) => t >= w.start && t <= w.end;
          const pagas = matchPaidStartsAtMs.filter(inWin).length;
          const total = matchStartsAtMs.filter(inWin).length;
          return {
            label: fmtDay(w.end),
            pagas,
            gratis: Math.max(0, total - pagas),
            placares: placarMs ? placarMs.filter(inWin).length : null,
          };
        })
      : null;

  const rangeSuffix = range
    ? `de ${fmtDay(fromMs!)} a ${fmtDay(toEndMs!)}, por ${
        range.granularity === "daily" ? "dia" : "semana"
      } (diário até ${MAX_DAILY_RANGE_DAYS} dias)`
    : null;
  const placarNote =
    placarMs != null
      ? " Linha tracejada = placares publicados no feed (pela data do post; inclui jogos sem reserva)."
      : "";
  const paceHint = rangeSuffix
    ? `Reservas jogadas ${rangeSuffix}, empilhadas por cobrança.${placarNote}`
    : paceMode === "daily"
      ? `Reservas jogadas por dia — últimos 12 dias — empilhadas por cobrança; visão semanal no toggle.${placarNote}`
      : `Reservas jogadas por semana — últimas 12 semanas — empilhadas por cobrança.${placarNote}`;

  const hasAnySeries = growthPoints != null || mixPoints != null;

  // O filtro de período mora no CABEÇALHO da página (canto superior direito,
  // acima do primeiro separador), não aqui embaixo — mas o estado continua
  // neste componente, que é quem filtra. Portal no slot que a página renderiza;
  // sem slot (outra página usando o grid), cai no lugar de sempre.
  const [rangeSlot, setRangeSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setRangeSlot(document.getElementById("dashboard-range-slot")), 0);
    return () => clearTimeout(t);
  }, []);

  const rangeControls = hasAnySeries ? (
        <div className="flex flex-wrap items-end justify-end gap-3">
          {invalidRange && (
            <p className="self-center text-[11px] font-300 text-[var(--color-clay)]">
              Data final antes da inicial — intervalo ignorado.
            </p>
          )}
          <div>
            <label htmlFor="charts_range_from" className={labelClass}>
              De
            </label>
            <input
              id="charts_range_from"
              type="date"
              value={fromStr}
              onChange={(e) => setFromStr(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="charts_range_to" className={labelClass}>
              Até
            </label>
            <input
              id="charts_range_to"
              type="date"
              value={toStr}
              onChange={(e) => setToStr(e.target.value)}
              className={fieldClass}
            />
          </div>
          {(fromStr || toStr) && (
            <button
              type="button"
              onClick={() => {
                setFromStr("");
                setToStr("");
              }}
              className="rounded-full bg-[var(--surface-raised)] px-3 py-2 text-[12px] font-600 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Limpar
            </button>
          )}
        </div>
  ) : null;

  return (
    <div className="space-y-3">
      {rangeSlot ? createPortal(rangeControls, rangeSlot) : rangeControls}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard eyebrow="Crescimento da base" className="lg:col-span-2">
          {growthPoints ? (
            mounted ? (
              <>
                {!range && <ModeToggle mode={growthMode} onChange={setGrowthMode} />}
                <GrowthChart points={growthPoints} granularity={growthGran} />
              </>
            ) : (
              <div className="h-[220px]" aria-hidden />
            )
          ) : (
            <ChartUnavailable>{growthFallback}</ChartUnavailable>
          )}
        </ChartCard>

        {engagementSlot}

        <ChartCard eyebrow="Partidas — pagas × grátis × placares" hint={paceHint} className="lg:col-span-3">
          {mixPoints ? (
            mounted ? (
              <>
                {!range && <ModeToggle mode={paceMode} onChange={setPaceMode} />}
                <MatchMixChart points={mixPoints} granularity={paceGran} />
              </>
            ) : (
              <div className="h-[220px]" aria-hidden />
            )
          ) : (
            <ChartUnavailable>{paceFallback}</ChartUnavailable>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

/* ── Rumo ao BP — real acumulado × meta interpolada, em small multiples ───────
   O BP é mensal; a linha tracejada é a interpolação linear entre fechamentos
   de mês — régua de ritmo, não promessa diária. O real para em hoje; o resto
   da tracejada mostra o que o mês ainda cobra. Um gráfico por card do topo. */

export type BpPacePoint = {
  label: string;
  real: number | null;
  realParcial?: number | null;
  meta: number | null;
};
export type BpPaceItem = {
  key: string;
  label: string;
  kind: "count" | "brl";
  daily: BpPacePoint[];
  weekly: BpPacePoint[];
  realNow: number | null;
  metaNow: number | null;
};

const paceBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function paceFmt(kind: "count" | "brl", v: number): string {
  return kind === "brl" ? paceBRL(v) : Math.round(v).toLocaleString("pt-BR");
}

function PaceChartSmall({ item, mode }: { item: BpPaceItem; mode: Granularity }) {
  const points = mode === "daily" ? item.daily : item.weekly;
  return (
    <div className="h-[132px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 6, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" opacity={0.5} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ ...AXIS_TICK, fontSize: 8 }}
            dy={4}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={46}
            tickCount={3}
            allowDecimals={false}
            tick={{ ...AXIS_TICK, fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 400 }}
            tickFormatter={(v: number) =>
              item.kind === "brl" && v >= 1000
                ? `${Math.round(v / 1000)}k`
                : String(Math.round(v))
            }
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeDasharray: "2 4" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const pt = payload[0].payload as BpPacePoint;
              const lines: string[] = [];
              const real = pt.real ?? pt.realParcial ?? null;
              if (real != null)
                lines.push(
                  `real: ${paceFmt(item.kind, real)}${pt.real == null ? " (semana em curso)" : ""}`
                );
              if (pt.meta != null) lines.push(`meta BP: ${paceFmt(item.kind, pt.meta)}`);
              if (real != null && pt.meta != null)
                lines.push(`gap: ${paceFmt(item.kind, real - pt.meta)}`);
              return <CardTooltip label={pt.label} lines={lines} />;
            }}
          />
          <Line
            type="monotone"
            dataKey="meta"
            stroke="var(--text-secondary)"
            strokeWidth={1.75}
            strokeDasharray="5 3"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="real"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: "var(--primary)", stroke: "var(--surface)" }}
            isAnimationActive={false}
          />
          {/* A semana em curso: pontilhada e com o ponto do valor na ponta —
              ainda não fechou, não pode parecer fechada. */}
          <Line
            type="monotone"
            dataKey="realParcial"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeDasharray="2 4"
            dot={{ r: 2.5, fill: "var(--primary)", stroke: "var(--surface)", strokeWidth: 1 }}
            activeDot={{ r: 3, fill: "var(--primary)", stroke: "var(--surface)" }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BpPaceGrid({ items }: { items: BpPaceItem[] }) {
  const mounted = useMounted();
  const [mode, setMode] = useState<Granularity>("daily");
  if (items.length === 0) return null;

  return (
    <section className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="eyebrow">Rumo ao BP</h2>
          <p className="mt-2 flex items-center gap-4 text-[10px] font-300 text-[var(--text-tertiary)]">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-[2px] w-5 rounded-full bg-[var(--primary)]" />
              real
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-[2px] w-5 rounded-full"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, var(--text-secondary) 0 5px, transparent 5px 8px)",
                }}
              />
              meta BP
            </span>
          </p>
        </div>
        {mounted && (
          <div className="flex gap-1">
            {(
              [
                { key: "daily", name: "Dia a dia" },
                { key: "weekly", name: "Semana a semana" },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={mode === m.key}
                onClick={() => setMode(m.key)}
                className={
                  mode === m.key
                    ? "rounded-md bg-[var(--surface-raised)] px-2 py-1 text-[9px] font-700 uppercase tracking-[0.1em] text-[var(--text-primary)]"
                    : "rounded-md px-2 py-1 text-[9px] font-700 uppercase tracking-[0.1em] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
                }
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const behind =
            item.realNow != null && item.metaNow != null && item.realNow < item.metaNow;
          const pctOfMeta =
            item.realNow != null && item.metaNow != null && item.metaNow > 0
              ? item.realNow / item.metaNow
              : null;
          return (
            <div key={item.key}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="label-colus text-[8.5px] text-[var(--text-tertiary)]">{item.label}</p>
                <p className="flex items-baseline gap-2">
                  {item.realNow != null ? (
                    <span className="numeral text-[15px] text-[var(--text-primary)]">
                      {paceFmt(item.kind, item.realNow)}
                    </span>
                  ) : (
                    /* Sem instrumentação ainda — a rampa fica visível e o real é
                       declaradamente desconhecido, nunca um zero inventado. */
                    <span className="text-[10px] font-300 text-[var(--text-tertiary)]">
                      real sem dado
                      {item.metaNow != null &&
                        ` · meta de hoje: ${paceFmt(item.kind, item.metaNow)}`}
                    </span>
                  )}
                  {item.realNow != null && item.metaNow != null && (
                    <span
                      className="text-[9.5px] font-600 tabular-nums"
                      style={{ color: behind ? "var(--color-clay)" : "var(--color-success)" }}
                    >
                      {pctOfMeta != null
                        ? `${Math.round(pctOfMeta * 100)}% da meta de hoje`
                        : "no plano"}
                    </span>
                  )}
                </p>
              </div>
              {mounted ? (
                <PaceChartSmall item={item} mode={mode} />
              ) : (
                <div className="h-[132px]" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Pagas × grátis — pizza (pedido do founder, 18/08) ──────────────────────
   Era um meter de barra; virou donut com o share como número no centro. As
   cores e contagens da legenda continuam as mesmas da série diária. */

/**
 * O progresso de UM degrau do funil, dia a dia.
 *
 * Os funis mostram totais desde o início, e total não tem direção: 41 aceites
 * podem ser 41 na semana passada e zero desde então. Esta faixa devolve a
 * direção sem sair do card.
 *
 * A honestidade que ela precisa carregar: só os degraus DATÁVEIS entram. Os
 * agregados do topo (códigos criados, jogos abertos) chegam do BFF como
 * número, sem carimbo de tempo — inventar uma curva para eles seria desenhar
 * dias que ninguém mediu. Por isso o rótulo diz exatamente qual degrau está
 * no gráfico, e não "o funil".
 */
export function DayProgress({
  ms,
  label,
  dias = 14,
}: {
  /** Os instantes do evento. `null` = não dá para datar; a faixa some. */
  ms: number[] | null;
  /** Qual degrau está sendo contado. Precisa ser específico. */
  label: string;
  dias?: number;
}) {
  const mounted = useMounted();
  if (!mounted) return <div className="h-[64px]" aria-hidden />;
  if (!ms) return null;

  // Dias-calendário de São Paulo, do mais antigo ao mais recente. O fuso é o do
  // negócio: em UTC, tudo depois das 21h cairia no dia seguinte.
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const curto = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });

  const contagem = new Map<string, number>();
  for (const t of ms) contagem.set(key.format(new Date(t)), (contagem.get(key.format(new Date(t))) ?? 0) + 1);

  const hoje = new Date();
  const barras = Array.from({ length: dias }, (_, i) => {
    const d = new Date(hoje);
    d.setDate(d.getDate() - (dias - 1 - i));
    const k = key.format(d);
    return { k, rotulo: curto.format(d), valor: contagem.get(k) ?? 0 };
  });
  const max = Math.max(...barras.map((b) => b.valor), 1);
  const total = barras.reduce((s, b) => s + b.valor, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-colus text-[8px] text-[var(--text-tertiary)]">{label}</p>
        <p className="text-[10px] font-300 text-[var(--text-tertiary)]">
          <span className="numeral text-[12px] text-[var(--text-secondary)]">{total}</span> em{" "}
          {dias} dias
        </p>
      </div>
      {/* Altura fixa e barras de largura igual: a leitura é a SILHUETA, não o
          valor exato de cada dia — para o valor exato existe o title. */}
      <div className="mt-2 flex h-[38px] items-end gap-[3px]">
        {barras.map((b) => (
          <span
            key={b.k}
            title={`${b.rotulo}: ${b.valor}`}
            className="flex-1 rounded-[2px] transition-colors"
            style={{
              // Um dia zerado ainda ocupa um fio: a lacuna precisa ser visível
              // como ausência, não como buraco no gráfico.
              height: b.valor === 0 ? "2px" : `${Math.max((b.valor / max) * 100, 8)}%`,
              background: b.valor === 0 ? "var(--border)" : "var(--primary)",
              opacity: b.valor === 0 ? 1 : 0.35 + 0.65 * (b.valor / max),
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[8.5px] font-300 text-[var(--text-tertiary)]">
        <span>{barras[0]?.rotulo}</span>
        <span>{barras[barras.length - 1]?.rotulo}</span>
      </div>
    </div>
  );
}

/**
 * Duas fatias nomeadas, com o percentual da PRIMEIRA no buraco do donut.
 *
 * Mesmo desenho do PaidShareMeter — gráfico centrado, legenda embaixo — porque
 * duas pizzas com gramáticas diferentes na mesma tela custam mais para ler do
 * que as duas somadas. A diferença é só o vocabulário, que vem por parâmetro.
 */
export function TwoSlicePie({
  a,
  b,
  vazio = "Nada registrado ainda.",
}: {
  a: { label: string; value: number };
  b: { label: string; value: number };
  vazio?: string;
}) {
  const total = a.value + b.value;
  if (total === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-[11.5px] font-300 text-[var(--text-tertiary)]">
        {vazio}
      </div>
    );
  }
  const share = a.value / total;
  const rows = [
    { name: a.label, value: a.value, color: "var(--chart-cat-a)" },
    { name: b.label, value: b.value, color: "var(--chart-cat-b)" },
  ];
  return (
    <div className="flex h-[248px] w-full flex-col items-center justify-center gap-4">
      <div className="relative h-[176px] w-[176px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={85}
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive={false}
            >
              {rows.map((r) => (
                <Cell key={r.name} fill={r.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <CardTooltip
                    label={String(payload[0].name)}
                    lines={[`${payload[0].value} de ${total} partidas`]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="numeral text-[34px] leading-none text-[var(--text-primary)]">
            {Math.round(share * 100)}%
          </span>
          <span className="mt-1 max-w-[92px] text-center text-[10px] font-300 leading-snug text-[var(--text-tertiary)]">
            {a.label.toLowerCase()}
          </span>
        </div>
      </div>
      <ul className="flex items-center justify-center gap-7">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-[2px] border border-[var(--border)]"
              style={{ background: r.color }}
            />
            <span className="text-[11px] font-300 text-[var(--text-secondary)]">{r.name}</span>
            <span className="numeral text-[14px] text-[var(--text-primary)]">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PaidShareMeter({ pagas, gratis }: { pagas: number; gratis: number }) {
  const total = pagas + gratis;
  if (total === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-[11.5px] font-300 text-[var(--text-tertiary)]">
        Nenhuma partida jogada ainda.
      </div>
    );
  }
  const share = pagas / total;
  const rows = [
    { name: "Pagas", value: pagas, color: "var(--chart-cat-a)" },
    { name: "Grátis", value: gratis, color: "var(--chart-cat-b)" },
  ];
  return (
    <div className="flex h-[248px] w-full flex-col items-center justify-center gap-4">
      <div className="relative h-[176px] w-[176px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={85}
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive={false}
            >
              {rows.map((r) => (
                <Cell key={r.name} fill={r.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <CardTooltip
                    label={String(payload[0].name)}
                    lines={[`${payload[0].value} de ${total} partidas`]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        {/* O número no buraco do donut: a razão que o card existe para dar. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="numeral text-[34px] leading-none text-[var(--text-primary)]">
            {Math.round(share * 100)}%
          </span>
          <span className="mt-1 text-[10px] font-300 text-[var(--text-tertiary)]">pagas</span>
        </div>
      </div>
      {/* Legenda embaixo, em linha: o donut fica no centro do card e não
          empurrado para a esquerda por uma coluna de números ao lado. */}
      <ul className="flex items-center justify-center gap-7">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-[2px] border border-[var(--border)]"
              style={{ background: r.color }}
            />
            <span className="text-[11px] font-300 text-[var(--text-secondary)]">{r.name}</span>
            <span className="numeral text-[14px] text-[var(--text-primary)]">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Completion gauge: one rate against one target ─────────────────────────── */

export function CompletionGauge({
  rate,
  target,
  caption,
}: {
  rate: number;
  /** Sem meta definida (undefined): o arco fica neutro e a linha "meta ≥"
      some — melhor sem meta do que uma inventada. */
  target?: number;
  caption: string;
}) {
  const mounted = useMounted();
  if (!mounted) return <div className="h-[220px]" aria-hidden />;

  const color =
    target === undefined
      ? "var(--primary)"
      : rate >= target
        ? "var(--color-success)"
        : "var(--color-clay)";

  return (
    <div className="relative h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={[{ value: rate * 100 }]}
          innerRadius="72%"
          outerRadius="100%"
          startAngle={220}
          endAngle={-40}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar
            isAnimationActive={false}
            dataKey="value"
            cornerRadius={4}
            fill={color}
            background={{ fill: "var(--surface-raised)" }}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className="numeral text-[34px]" style={{ color }}>
          {Math.round(rate * 100)}%
        </span>
        {target !== undefined && (
          <span className="label-colus mt-1.5 text-[7.5px] text-[var(--text-tertiary)]">
            meta ≥ {Math.round(target * 100)}%
          </span>
        )}
        <span className="mt-2 max-w-[180px] text-center text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
          {caption}
        </span>
      </div>
    </div>
  );
}
