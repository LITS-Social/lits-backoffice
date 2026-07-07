import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-8 pt-8 pb-6 border-b border-[var(--border)]",
        className
      )}
    >
      <div>
        <p className="text-[10px] font-sans font-600 tracking-widest uppercase text-[var(--color-clay)] mb-1.5">
          {eyebrow}
        </p>
        <h1 className="font-display text-[28px] font-400 text-[var(--text-primary)] leading-tight tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-[13px] font-sans text-[var(--text-secondary)] leading-relaxed max-w-xl">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0 mt-1">{action}</div>}
    </div>
  );
}
