"use client";

import { cn } from "@/lib/utils";

export interface FilterChipOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterChipsProps {
  label?: string;
  options: FilterChipOption[];
  value: string;
  onChange: (value: string) => void;
}

/**
 * Segmented single-select filter group. The active chip fills with court green:
 * selection is a navigation state, not an alarm, so it never borrows the red.
 */
export function FilterChips({ label, options, value, onChange }: FilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {label && (
        <span className="label-colus mr-1 text-[9px] text-[var(--text-tertiary)]">
          {label}
        </span>
      )}
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[5px] text-[11.5px] leading-none transition-colors",
              active
                ? "border-[var(--primary)] bg-[var(--primary)] font-600 text-[var(--primary-fg)]"
                : "border-[var(--border)] bg-transparent font-500 text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
            )}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  active ? "opacity-70" : "text-[var(--text-tertiary)]"
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
