"use client";

import { Badge } from "@/components/ui/badge";
import { PlayerLink } from "@/components/ui/player-link";
import type { components } from "@/lib/api/openapi";
import { cn, formatDate, formatRelative } from "@/lib/utils";

type OpsUserRef = components["schemas"]["OpsUserRef"];

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
 *
 * Every name is a door into the player's dossier — this is the single place that
 * makes it so, by wrapping the name in `PlayerLink`. A nameless account links too:
 * an account that never finished onboarding is exactly the one staff wants to open.
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
    <PlayerLink
      userId={id}
      name={name}
      className={cn(
        "block",
        nameless
          ? "font-mono text-[11px] text-[var(--text-tertiary)]"
          : strong
            ? "font-600 text-[var(--text-primary)]"
            : "text-[var(--text-primary)]"
      )}
    />
  );
}

/** An absent value the API genuinely did not send. Never a stand-in for one we forgot to fetch. */
export function Absent({ children = "—" }: { children?: string }) {
  return <span className="text-[var(--text-tertiary)]">{children}</span>;
}

/**
 * ── Match type ────────────────────────────────────────────────────────────────
 *
 * The booking's mode, as a quiet piece of metadata — not an alert. It is context
 * for a row, so it uses the `muted` badge: transparent ground, tertiary text, a
 * hairline border. Red stays reserved for money and moderation; this never spends
 * an alert colour on describing what kind of match it is.
 *
 * The BFF sends the five slugs enumerated in the OpenAPI spec. An absent value —
 * or a slug this map does not know — renders NOTHING rather than a raw slug: a
 * chip is worth showing only when it can say a real word.
 */
const MATCH_TYPE_LABELS: Record<string, string> = {
  casual: "Casual",
  ranked: "Rank",
  quick: "Rápida",
  social: "Social",
  event: "Evento",
};

/** The human label for a booking's `match_type`, or undefined when absent/unknown. */
export function matchTypeLabel(value?: string): string | undefined {
  if (!value) return undefined;
  return MATCH_TYPE_LABELS[value];
}

export function MatchType({ value }: { value?: string }) {
  const label = matchTypeLabel(value);
  if (!label) return null;
  return <Badge variant="muted">{label}</Badge>;
}

/**
 * ── Contact ───────────────────────────────────────────────────────────────────
 *
 * A player's reachable channels — email as a `mailto:`, phone as a WhatsApp
 * deep-link — for the two panels the BFF enriches with them (convites,
 * cancelamentos). Everywhere else `OpsUserRef.email`/`phone` are absent, and this
 * renders the honest `Absent` dash rather than a placeholder.
 *
 * Phone arrives E.164 ("+5511999999999"); `wa.me` wants bare digits, so the "+"
 * and any punctuation are stripped. Phone is empty on most rows today (PhoneSync
 * has not backfilled it) — that is expected, and an email-only or fully-empty
 * contact is shown as-is, never hidden.
 *
 * Quiet exactly like `PlayerLink`: inherits the surrounding type, reveals colour
 * and underline only on hover/focus. Each link stops propagation because
 * DataTable rows are click targets that expand — a click on a contact must open
 * mail/WhatsApp without also toggling the row open behind it.
 */
const QUIET_LINK = cn(
  "rounded-sm underline-offset-2 transition-colors",
  "hover:text-[var(--primary)] hover:underline",
  "focus-visible:text-[var(--primary)] focus-visible:underline"
);

/**
 * ── Avatar ────────────────────────────────────────────────────────────────────
 *
 * A player's or author's profile photo, small, round, on a hairline ring — the
 * glance-level "who" for the directory (#11) and the feed (#12), the two panels
 * whose rows are about a person rather than a booking.
 *
 * When user-service has no photo (`avatar_url` empty, which is most beta accounts)
 * it falls back to the first letter of the name on a recessed ground, never a
 * broken-image icon. Plain `<img>` on purpose: these are arbitrary user-service /
 * CDN hosts, and next/image would demand each one be allow-listed in
 * remotePatterns — a config that silently breaks on the first unlisted host.
 */
export function Avatar({
  src,
  name,
  size = 26,
}: {
  src?: string;
  name: string;
  size?: number;
}) {
  const initial = name?.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="font-colus text-[10px] leading-none">{initial}</span>
      )}
    </span>
  );
}

export function Contact({ user }: { user: OpsUserRef }) {
  const email = user.email?.trim();
  const phone = user.phone?.trim();
  const waDigits = phone ? phone.replace(/\D/g, "") : "";

  if (!email && !waDigits) return <Absent />;

  return (
    <span className="flex flex-col gap-0.5">
      {email && (
        <a
          href={`mailto:${email}`}
          onClick={(e) => e.stopPropagation()}
          className={cn(QUIET_LINK, "break-all")}
        >
          {email}
        </a>
      )}
      {waDigits && (
        <a
          href={`https://wa.me/${waDigits}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={QUIET_LINK}
        >
          {phone}
        </a>
      )}
    </span>
  );
}
