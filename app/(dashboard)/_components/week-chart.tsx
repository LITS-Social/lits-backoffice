"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * The week ahead: every confirmed upcoming match, bucketed by the day it is
 * played, split by whether the money is settled.
 *
 * ── Why this chart is allowed to exist ──
 *
 * It plots no time series. It is a histogram of rows we actually hold: each bar
 * is a count of real bookings, and the red segment is a count of real bookings
 * whose `payment_settled` is false. There is no interpolation, no trend line, no
 * "last 30 days" invented from a 2-day seed.
 *
 * It only renders when the caller confirms it holds the COMPLETE set
 * (`complete`). A histogram drawn over page 1 of 2 is not a rough picture, it is
 * a wrong one — the shape itself would be a fabrication. When the set is partial
 * the caller must not mount this component.
 *
 * A day with zero matches is drawn as an empty slot, not skipped. "Nobody booked
 * Thursday" is a fact worth seeing, and dropping the day would silently redraw
 * the week to look busier than it is.
 *
 * ── Why the buckets are computed here and not on the server ──
 *
 * Day boundaries are timezone-dependent. In production this UI is served from a
 * Cloudflare Worker running in UTC while the founder reads it in BRT; a 21:00
 * BRT match is already "tomorrow" in UTC. Bucketing on the server would shove
 * every evening match into the wrong bar. So we ship absolute instants (ISO) and
 * cut them into days in the browser, in the reader's own timezone — the only
 * place where "which day is this match on" has an answer he would agree with.
 *
 * That makes the first client render differ from the server's, so the chart
 * mounts after hydration behind a fixed-height placeholder. The alternative — a
 * hydration mismatch — is a chart that flickers between two different truths.
 */

const DAYS_AHEAD = 7;

export interface WeekMatch {
  starts_at: string;
  payment_settled: boolean;
}

interface Bucket {
  day: string;
  weekday: string;
  settled: number;
  unpaid: number;
  total: number;
  isToday: boolean;
}

function bucketize(matches: WeekMatch[]): Bucket[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const buckets: Bucket[] = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    buckets.push({
      day: day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      weekday: day.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
      settled: 0,
      unpaid: 0,
      total: 0,
      isToday: i === 0,
    });
  }

  for (const m of matches) {
    const d = new Date(m.starts_at);
    d.setHours(0, 0, 0, 0);
    const index = Math.round((d.getTime() - start.getTime()) / 86_400_000);
    // Matches beyond the window are simply not in this chart's question. They are
    // still counted in the panel's own total — the chart does not claim to be it.
    if (index < 0 || index >= DAYS_AHEAD) continue;
    const b = buckets[index];
    b.total++;
    if (m.payment_settled) b.settled++;
    else b.unpaid++;
  }

  return buckets;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Bucket }[];
}) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-lg">
      <p className="label-colus text-[8.5px] text-[var(--text-tertiary)]">
        {b.weekday} {b.day}
      </p>
      {b.total === 0 ? (
        <p className="mt-1.5 text-[12px] text-[var(--text-tertiary)]">Nenhuma partida</p>
      ) : (
        <div className="mt-1.5 space-y-0.5 text-[12px]">
          <p className="text-[var(--text-primary)]">
            <span className="numeral mr-1 text-[14px]">{b.total}</span>
            {b.total === 1 ? "partida" : "partidas"}
          </p>
          {b.unpaid > 0 && (
            <p className="font-600 text-[var(--color-error)]">{b.unpaid} com pagamento em aberto</p>
          )}
        </div>
      )}
    </div>
  );
}

export function WeekChart({ matches }: { matches: WeekMatch[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const buckets = useMemo(() => (mounted ? bucketize(matches) : []), [matches, mounted]);

  if (!mounted) {
    // Same height as the chart, so nothing jumps when it arrives.
    return <div className="h-[168px]" aria-hidden />;
  }

  const empty = buckets.every((b) => b.total === 0);

  return (
    <div className="h-[168px] w-full">
      {empty ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-[12.5px] font-300 text-[var(--text-tertiary)]">
            Nenhuma partida marcada para os próximos {DAYS_AHEAD} dias.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 8, right: 0, bottom: 0, left: -22 }} barCategoryGap="28%">
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="2 4"
              opacity={0.7}
            />
            <XAxis
              dataKey="weekday"
              axisLine={false}
              tickLine={false}
              tick={{
                fill: "var(--text-tertiary)",
                fontSize: 9,
                fontFamily: "var(--font-sans)",
                fontWeight: 700,
                letterSpacing: "0.12em",
              }}
              tickFormatter={(v: string) => v.toUpperCase()}
              dy={6}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              width={44}
              tick={{
                fill: "var(--text-tertiary)",
                fontSize: 10,
                fontFamily: "var(--font-display)",
              }}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-raised)", opacity: 0.6 }}
              content={<ChartTooltip />}
            />
            {/* Settled sits underneath and stays deliberately quiet — it is the
                healthy half and does not deserve ink. The unpaid segment rides on
                top in the money colour, so the eye lands on the debt, not the volume. */}
            <Bar dataKey="settled" stackId="d" fill="var(--border-strong)" radius={[0, 0, 2, 2]}>
              {buckets.map((b) => (
                <Cell
                  key={b.day}
                  fill={b.isToday ? "var(--primary)" : "var(--border-strong)"}
                  fillOpacity={b.isToday ? 0.55 : 1}
                />
              ))}
            </Bar>
            <Bar dataKey="unpaid" stackId="d" fill="var(--color-error)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
