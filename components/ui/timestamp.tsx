import { cn, formatDate, formatRelative } from "@/lib/utils";

interface TimestampProps {
  iso: string;
  className?: string;
  /** Show only the relative form (e.g. inside a compact column). */
  relativeOnly?: boolean;
}

/**
 * Absolute + relative time, together: "15/07 22:00 (em 3h)". The absolute form
 * is what support needs to cross-reference against a booking; the relative
 * form is what a human scanning a list actually reads. Full ISO on hover via
 * `title` for when even the short absolute form isn't precise enough.
 *
 * The absolute half is tabular — a column of times should align on the colon,
 * so the eye can run down it without re-reading each row.
 */
export function Timestamp({ iso, className, relativeOnly = false }: TimestampProps) {
  const date = new Date(iso);
  return (
    <span title={iso} className={cn("whitespace-nowrap", className)}>
      {!relativeOnly && <span className="tabular-nums">{formatDate(date)} </span>}
      <span className="text-[var(--text-tertiary)]">
        {relativeOnly ? formatRelative(date) : `(${formatRelative(date)})`}
      </span>
    </span>
  );
}
