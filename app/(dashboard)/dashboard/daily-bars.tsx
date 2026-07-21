"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

type DailyPoint = { date: string; count: number };

const TONE_COLOR: Record<"calm" | "money", string> = {
  calm: "var(--color-success)",
  money: "var(--color-error)",
};

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

/** 14-day bar chart for the dashboard's signups/bookings series. */
export function DailyBars({ data, tone }: { data: DailyPoint[]; tone: "calm" | "money" }) {
  if (data.length === 0) {
    return (
      <p className="rounded-xl border border-[var(--border)] px-4 py-8 text-center text-[12px] text-[var(--text-tertiary)]">
        Sem dados nos últimos 14 dias.
      </p>
    );
  }

  const color = TONE_COLOR[tone];

  return (
    <div className="rounded-xl border border-[var(--border)] px-4 py-4">
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="date"
            tickFormatter={formatDay}
            tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            interval={1}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-raised)" }}
            labelFormatter={(v) => formatDay(String(v))}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
