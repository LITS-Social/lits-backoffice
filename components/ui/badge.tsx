import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "muted";

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border)]",
  success:
    "bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success)]/20",
  warning:
    "bg-[var(--color-warning-bg)] text-[var(--color-clay)] border border-[var(--color-warning)]/30",
  error:
    "bg-[var(--color-error-bg)] text-[var(--color-error)] border border-[var(--color-error)]/20",
  info: "bg-[var(--color-info-bg)] text-[var(--color-info)] border border-[var(--color-info)]/20",
  muted:
    "bg-[var(--surface-raised)] text-[var(--text-tertiary)] border border-[var(--border)]",
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({
  variant = "default",
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-sans font-600 leading-none",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
