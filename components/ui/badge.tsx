import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "muted";

/**
 * Tinted ground, solid text, hairline border drawn from the text colour itself
 * — so a badge holds together on warm greige and on near-black without a second
 * set of tokens.
 *
 * `warning` paints its text with --color-clay rather than --color-warning: clay
 * is the readable terracotta, and keeping warning visibly distinct from error is
 * what preserves the rule that red only ever means money or moderation.
 */
const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--border)]",
  success: "bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success)]/25",
  warning: "bg-[var(--color-warning-bg)] text-[var(--color-clay)] border-[var(--color-clay)]/25",
  error:   "bg-[var(--color-error-bg)] text-[var(--color-error)] border-[var(--color-error)]/30",
  info:    "bg-[var(--color-info-bg)] text-[var(--color-info)] border-[var(--color-info)]/25",
  muted:   "bg-transparent text-[var(--text-tertiary)] border-[var(--border)]",
};

interface BadgeProps {
  variant?: BadgeVariant;
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "default", pulse = false, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-[3.5px]",
        // Tracked-uppercase Nikkei — a status is a label, not prose.
        "font-700 text-[9px] leading-none uppercase tracking-[0.13em]",
        variantStyles[variant],
        className
      )}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="live-dot absolute inline-flex h-full w-full rounded-full bg-current opacity-60" />
          <span
            className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current"
            style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
          />
        </span>
      )}
      {children}
    </span>
  );
}
