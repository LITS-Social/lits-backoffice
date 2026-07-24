import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The sub-masthead every panel wears under its PageHeader: the two or three
 * numbers that answer the panel's question before you read a single row.
 *
 * Editorial grammar, borrowed from the landing: a Colus label over a serif
 * numeral, cells divided by hairlines. It is a magazine standfirst, not a row
 * of SaaS "KPI cards".
 *
 * ── The honesty rules this component enforces ──
 *
 * `tone` is a CATEGORY, not a severity dial (same law as the badges):
 *   money      → red. Reserved for cash owed and moderation. Nothing else.
 *   attention  → clay. Someone should look at this today.
 *   calm       → green. The healthy state, stated out loud.
 *   neutral    → ink. A count, with no opinion attached.
 *
 * A loud tone on a ZERO is self-defeating — "0 problemas de pagamento" printed
 * in red teaches the eye that red means nothing. So a numeric zero always
 * renders quiet, whatever tone the caller asked for.
 *
 * `unknown` is the one that matters most. It is NOT the same as zero: zero
 * means "we asked and there is nothing", unknown means "we could not ask".
 * An unknown stat renders an em-dash in muted ink and never a 0 — a phantom
 * zero on a stat we failed to fetch reads as calm when it should read as blind.
 */
export type StatTone = "neutral" | "attention" | "money" | "calm";

export interface Stat {
  label: string;
  /** A number, or an already-formatted string (currency, "3,4 ★"). */
  value: number | string;
  /** The denominator, the caveat, the unit. Where a partial count confesses. */
  hint?: ReactNode;
  tone?: StatTone;
  /** "We could not know this." Renders "—", never 0. */
  unknown?: boolean;
}

const toneClass: Record<StatTone, string> = {
  neutral: "text-[var(--text-primary)]",
  attention: "text-[var(--color-clay)]",
  money: "text-[var(--color-error)]",
  calm: "text-[var(--color-success)]",
};

export function StatRail({ stats }: { stats: Stat[] }) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface)]/60 px-4 sm:px-8 py-5">
      <dl className="flex flex-wrap items-stretch gap-y-4">
        {stats.map((stat) => {
          const tone = stat.tone ?? "neutral";
          // A zero is never an alarm, no matter what the caller believes.
          const quiet = stat.unknown || stat.value === 0;
          return (
            <div
              key={stat.label}
              className="min-w-[132px] border-l border-[var(--border)] px-6 first:border-l-0 first:pl-0"
            >
              <dt className="label-colus mb-2 text-[8.5px] leading-none text-[var(--text-tertiary)]">
                {stat.label}
              </dt>
              <dd
                className={cn(
                  "numeral text-[26px]",
                  quiet ? "text-[var(--text-tertiary)]" : toneClass[tone]
                )}
              >
                {stat.unknown ? "—" : stat.value}
              </dd>
              {stat.hint && (
                <dd className="mt-1.5 max-w-[210px] text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
                  {stat.hint}
                </dd>
              )}
            </div>
          );
        })}
      </dl>
    </div>
  );
}
