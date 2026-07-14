"use client";

import { cn, formatDate, formatRelative } from "@/lib/utils";

/**
 * ── The rail ──────────────────────────────────────────────────────────────────
 *
 * One 2px inset bar down the left edge of a row. It is how a table says "this
 * one" from across the room without shouting on every line.
 *
 * Drawn with an inset box-shadow rather than a border on purpose: a real
 * `border-l-2` on the row would shift every cell 2px right, and the column
 * header (rendered by DataTable, which knows nothing about rails) would not
 * shift with it. The shadow paints inside the box and costs no layout.
 *
 * Vocabulary, identical to the badges and the stat rail:
 *   money      → red.  Cash owed, or moderation. Never anything else.
 *   attention  → clay. Look at this today.
 *   none       → nothing at all. The healthy row is SILENT — no tint, no rail,
 *                no green glow. A table where every row is decorated is a table
 *                with no signal in it.
 *
 * `tint` adds a wash of the same colour behind the row. Use it sparingly: it is
 * for the handful of rows that are genuinely on fire, not for a whole column of
 * "unpaid" in a beta where half the bookings are unpaid by design.
 */
export type RailTone = "money" | "attention" | "none";

// Written out in full, never interpolated. Tailwind extracts class names by
// scanning the source as TEXT — a template literal like
// `shadow-[inset_2px_0_0_0_${color}]` produces a class at runtime that the
// compiler never saw, so the rule is never emitted and the rail silently does
// not exist. Every variant has to appear here verbatim.
const RAIL: Record<Exclude<RailTone, "none">, { bar: string; tint: string }> = {
  money: {
    bar: "shadow-[inset_2px_0_0_0_var(--color-error)]",
    tint: "bg-[var(--color-error-bg)]/40",
  },
  attention: {
    bar: "shadow-[inset_2px_0_0_0_var(--color-clay)]",
    tint: "bg-[var(--color-warning-bg)]/40",
  },
};

export function rail(tone: RailTone, tint = false): string | undefined {
  if (tone === "none") return undefined;
  const r = RAIL[tone];
  return cn(r.bar, tint && r.tint);
}

/**
 * ── When ──────────────────────────────────────────────────────────────────────
 *
 * A moment in time, read the way a human reads it: the clock face on top (what
 * you cross-reference against a booking) and how far away it is underneath (what
 * you actually act on).
 *
 * The relative half turns clay once the moment is inside `soonMs`, so a column
 * of times has its own gradient of urgency without a single extra column.
 *
 * Both halves come from `iso`. Nothing here is computed from a field the API did
 * not send.
 */
export function When({
  iso,
  soonMs,
  align = "left",
}: {
  iso: string;
  /** Below this distance from now, the relative half goes clay. Omit for never. */
  soonMs?: number;
  align?: "left" | "right";
}) {
  const date = new Date(iso);
  const soon = soonMs !== undefined && Math.abs(date.getTime() - Date.now()) < soonMs;

  return (
    <span
      title={iso}
      className={cn("flex flex-col gap-0.5", align === "right" && "items-end text-right")}
    >
      <span className="whitespace-nowrap tabular-nums leading-none text-[var(--text-primary)]">
        {formatDate(date)}
      </span>
      <span
        className={cn(
          "whitespace-nowrap text-[10.5px] leading-none",
          soon ? "font-600 text-[var(--color-clay)]" : "text-[var(--text-tertiary)]"
        )}
      >
        {formatRelative(date)}
      </span>
    </span>
  );
}

/**
 * A player, as the founder reads one: the name, and — when it matters — the fact
 * that user-service never gave them one.
 *
 * `name` falls back to a short id upstream (documented BFF behaviour: display_name,
 * else @username, else short id). A name that IS the id is a real signal — an
 * account that never finished onboarding — so it is rendered in mono to say so,
 * rather than being dressed up as a person's name.
 */
export function Player({
  name,
  id,
  strong = false,
}: {
  name: string;
  id: string;
  strong?: boolean;
}) {
  const nameless = id.startsWith(name) && name.length < 12;

  return (
    <span
      title={id}
      className={cn(
        "block truncate",
        nameless
          ? "font-mono text-[11px] text-[var(--text-tertiary)]"
          : strong
            ? "font-600 text-[var(--text-primary)]"
            : "text-[var(--text-primary)]"
      )}
    >
      {name}
    </span>
  );
}

/** An absent value the API genuinely did not send. Never a stand-in for one we forgot to fetch. */
export function Absent({ children = "—" }: { children?: string }) {
  return <span className="text-[var(--text-tertiary)]">{children}</span>;
}
