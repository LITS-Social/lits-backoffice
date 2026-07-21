"use client";

import { useState, useSyncExternalStore } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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

export type GrowthPoint = { label: string; total: number; novos: number };
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

function paceSeries(times: number[], wins: Win[]): PacePoint[] {
  return wins.map((w) => ({
    label: fmtDay(w.end),
    count: times.filter((t) => t >= w.start && t <= w.end).length,
  }));
}

/** Cumulative base at each window end; `dateless` accounts are folded into
    every total — they exist now and did not appear this quarter. */
function growthSeries(times: number[], dateless: number, wins: Win[]): GrowthPoint[] {
  return wins.map((w) => ({
    label: fmtDay(w.end),
    total: times.filter((t) => t <= w.end).length + dateless,
    novos: times.filter((t) => t >= w.start && t <= w.end).length,
  }));
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

/* ── Growth: cumulative user base, terracotta line over a soft wash ────────── */

function GrowthChart({
  points,
  target,
  granularity,
}: {
  points: GrowthPoint[];
  target: number;
  granularity: Granularity;
}) {
  const labelFor = (label: string) =>
    granularity === "daily" ? `dia ${label}` : `semana até ${label}`;
  const novosSuffix = granularity === "daily" ? "no dia" : "na semana";

  return (
    <div className="h-[196px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -4 }}>
          <defs>
            <linearGradient id="growth-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" opacity={0.7} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS_TICK} dy={6} interval="preserveStartEnd" />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={44}
            allowDecimals={false}
            domain={[0, (dataMax: number) => Math.max(dataMax, target)]}
            tick={{ ...AXIS_TICK, fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 400 }}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeDasharray: "2 4" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <CardTooltip
                  label={labelFor((payload[0].payload as GrowthPoint).label)}
                  lines={[
                    `${(payload[0].payload as GrowthPoint).total} usuários`,
                    `+${(payload[0].payload as GrowthPoint).novos} ${novosSuffix}`,
                  ]}
                />
              ) : null
            }
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="total"
            stroke="var(--primary)"
            strokeWidth={1.75}
            fill="url(#growth-fill)"
            dot={false}
            activeDot={{ r: 3, fill: "var(--primary)", stroke: "var(--surface)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Pace: matches per bucket, newest bucket in terracotta ─────────────────── */

function PaceChart({ points, granularity }: { points: PacePoint[]; granularity: Granularity }) {
  const labelFor = (label: string) =>
    granularity === "daily" ? `dia ${label}` : `semana até ${label}`;

  return (
    <div className="h-[196px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -4 }} barCategoryGap="32%">
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
                  label={labelFor((payload[0].payload as PacePoint).label)}
                  lines={[
                    `${(payload[0].payload as PacePoint).count} ${
                      (payload[0].payload as PacePoint).count === 1 ? "partida" : "partidas"
                    }`,
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {points.map((p, i) => (
              <Cell
                key={`${p.label}-${i}`}
                fill={i === points.length - 1 ? "var(--primary)" : "var(--border-strong)"}
              />
            ))}
          </Bar>
        </BarChart>
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
  userDateless,
  usersTarget,
  growthFallback,
  matchStartsAtMs,
  paceFallback,
  engagementSlot,
  completionSlot,
}: {
  /** Raw signup instants (ms) — null when the crawl failed or was truncated. */
  userCreatedAtMs: number[] | null;
  userDateless: number;
  usersTarget: number;
  /** Why the growth series is missing, shown when `userCreatedAtMs` is null. */
  growthFallback: string;
  /** Raw match starts_at instants (ms) — null when the fetch failed or is partial. */
  matchStartsAtMs: number[] | null;
  paceFallback: string;
  engagementSlot: React.ReactNode;
  completionSlot: React.ReactNode;
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
      )
    : null;
  const pacePoints = matchStartsAtMs
    ? paceSeries(
        matchStartsAtMs,
        range ? range.wins : rollingWindows(paceMode === "daily" ? DAY_MS : WEEK_MS),
      )
    : null;

  const rangeSuffix = range
    ? `de ${fmtDay(fromMs!)} a ${fmtDay(toEndMs!)}, por ${
        range.granularity === "daily" ? "dia" : "semana"
      } (diário até ${MAX_DAILY_RANGE_DAYS} dias)`
    : null;
  const growthHint = rangeSuffix
    ? `Usuários acumulados ${rangeSuffix}.`
    : growthMode === "daily"
      ? "Usuários acumulados por dia — últimos 12 dias; visão semanal no toggle."
      : "Usuários acumulados por semana — últimas 12 semanas.";
  const paceHint = rangeSuffix
    ? `Partidas com placar publicado ${rangeSuffix}.`
    : paceMode === "daily"
      ? "Partidas com placar publicado, por dia — últimos 12 dias; visão semanal no toggle."
      : "Partidas com placar publicado, por semana — últimas 12 semanas.";

  const hasAnySeries = growthPoints != null || pacePoints != null;

  return (
    <div className="space-y-3">
      {hasAnySeries && (
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
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard eyebrow="Crescimento da base" hint={growthHint} className="lg:col-span-2">
          {growthPoints ? (
            mounted ? (
              <>
                {!range && <ModeToggle mode={growthMode} onChange={setGrowthMode} />}
                <GrowthChart points={growthPoints} target={usersTarget} granularity={growthGran} />
              </>
            ) : (
              <div className="h-[220px]" aria-hidden />
            )
          ) : (
            <ChartUnavailable>{growthFallback}</ChartUnavailable>
          )}
        </ChartCard>

        {engagementSlot}

        <ChartCard eyebrow="Ritmo de partidas" hint={paceHint} className="lg:col-span-2">
          {pacePoints ? (
            mounted ? (
              <>
                {!range && <ModeToggle mode={paceMode} onChange={setPaceMode} />}
                <PaceChart points={pacePoints} granularity={paceGran} />
              </>
            ) : (
              <div className="h-[220px]" aria-hidden />
            )
          ) : (
            <ChartUnavailable>{paceFallback}</ChartUnavailable>
          )}
        </ChartCard>

        {completionSlot}
      </div>
    </div>
  );
}

/* ── Engagement: the whole base in four last-seen buckets ──────────────────── */

export type EngagementSlices = { hoje: number; semana: number; mes: number; inativos: number };

const ENGAGEMENT_SEGMENTS = [
  { key: "hoje", name: "Ativos hoje", color: "var(--primary)" },
  { key: "semana", name: "Na semana", color: "var(--color-info)" },
  { key: "mes", name: "No mês", color: "var(--border-strong)" },
  { key: "inativos", name: "Inativos 30d+", color: "var(--surface-raised)" },
] as const;

export function EngagementDonut({ slices }: { slices: EngagementSlices }) {
  const mounted = useMounted();
  const total = slices.hoje + slices.semana + slices.mes + slices.inativos;
  const wau = slices.hoje + slices.semana;

  if (!mounted) return <div className="h-[220px]" aria-hidden />;

  const data = ENGAGEMENT_SEGMENTS.map((s) => ({ ...s, value: slices[s.key] }));

  return (
    <div className="flex h-[220px] w-full items-center justify-center gap-5">
      {/* Fixed square: ResponsiveContainer measures a flex item as 0-wide on
          first paint and never recovers — the donut came out a sliver. */}
      <div className="relative h-[184px] w-[184px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              isAnimationActive={false}
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="92%"
              paddingAngle={2}
              strokeWidth={0}
              startAngle={90}
              endAngle={-270}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <CardTooltip
                    label={String(payload[0].name)}
                    lines={[`${payload[0].value} de ${total}`]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        {/* WAU in the hole — the one engagement number a CEO reads first. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="numeral text-[26px] text-[var(--text-primary)]">
            {total > 0 ? Math.round((wau / total) * 100) : 0}%
          </span>
          <span className="label-colus mt-1 text-[7.5px] text-[var(--text-tertiary)]">WAU</span>
        </div>
      </div>

      <ul className="w-[128px] shrink-0 space-y-2">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-[2px] border border-[var(--border)]"
              style={{ background: d.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[10.5px] font-300 text-[var(--text-secondary)]">
              {d.name}
            </span>
            <span className="numeral text-[12px] text-[var(--text-primary)]">{d.value}</span>
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
  target: number;
  caption: string;
}) {
  const mounted = useMounted();
  if (!mounted) return <div className="h-[220px]" aria-hidden />;

  const ok = rate >= target;
  const color = ok ? "var(--color-success)" : "var(--color-clay)";

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
        <span className="label-colus mt-1.5 text-[7.5px] text-[var(--text-tertiary)]">
          meta ≥ {Math.round(target * 100)}%
        </span>
        <span className="mt-2 max-w-[180px] text-center text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
          {caption}
        </span>
      </div>
    </div>
  );
}
