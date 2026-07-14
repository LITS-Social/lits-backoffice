import type { ReactNode } from "react";

export interface DetailField {
  label: string;
  value: ReactNode;
  /** Monospace rendering — IDs, UUIDs. */
  mono?: boolean;
  /** Take the full width of the grid instead of one cell. */
  span?: boolean;
}

/**
 * Label/value grid for an expanded row's full record — every field the API
 * returned, including IDs useful for support, laid out consistently across
 * every panel so staff learn the pattern once.
 *
 * Labels are Colus over a hairline rule: the same eyebrow gesture as the panel
 * masthead, shrunk to field scale. The rule is what makes a dense grid scannable
 * — the eye follows the ticks, not the text.
 */
export function DetailGrid({ fields }: { fields: DetailField[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
      {fields.map((field) => (
        <div key={field.label} className={field.span ? "col-span-full" : undefined}>
          <dt className="mb-1.5 border-t border-[var(--border)] pt-1.5">
            <span className="label-colus text-[8.5px] text-[var(--text-tertiary)]">
              {field.label}
            </span>
          </dt>
          <dd
            className={
              field.mono
                ? "break-all font-mono text-[11px] leading-snug text-[var(--text-secondary)]"
                : "text-[12.5px] leading-snug text-[var(--text-primary)]"
            }
          >
            {field.value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
