"use client";

import { useSyncExternalStore } from "react";
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

/**
 * The Norte do Produto charts. Same contract as WeekChart: every mark is a
 * count of rows we actually hold — the callers only mount these when the set
 * is complete, so there is no interpolation and no invented trend. Series and
 * labels are computed on the server (lib/metrics.ts); these components only
 * draw. Mounted after hydration behind fixed-height placeholders so recharts'
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

/* ── Growth: cumulative user base, terracotta line over a soft wash ────────── */

export type GrowthPoint = { label: string; total: number; novos: number };

export function GrowthChart({ points, target }: { points: GrowthPoint[]; target: number }) {
  const mounted = useMounted();
  if (!mounted) return <div className="h-[220px]" aria-hidden />;

  return (
    <div className="h-[220px] w-full">
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
                  label={`semana até ${(payload[0].payload as GrowthPoint).label}`}
                  lines={[
                    `${(payload[0].payload as GrowthPoint).total} usuários`,
                    `+${(payload[0].payload as GrowthPoint).novos} na semana`,
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

/* ── Pace: matches per rolling week, current week in terracotta ────────────── */

export type PacePoint = { label: string; count: number };

export function PaceChart({ points }: { points: PacePoint[] }) {
  const mounted = useMounted();
  if (!mounted) return <div className="h-[220px]" aria-hidden />;

  return (
    <div className="h-[220px] w-full">
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
                  label={`semana até ${(payload[0].payload as PacePoint).label}`}
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
                key={p.label}
                fill={i === points.length - 1 ? "var(--primary)" : "var(--border-strong)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
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
