interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  const num = eyebrow.replace("#", "");

  return (
    <div className="relative overflow-hidden border-b border-[var(--border)] px-8 pt-9 pb-7">
      {/* Giant editorial number — depth layer */}
      <span
        aria-hidden
        className="pointer-events-none select-none absolute right-4 bottom-0 translate-y-[22%] font-display italic leading-none text-[var(--text-primary)] opacity-[0.045]"
        style={{ fontSize: "clamp(100px, 13vw, 172px)" }}
      >
        {num}
      </span>

      <div className="relative">
        {/* Eyebrow */}
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-block w-4 h-px bg-[var(--color-clay)]" />
          <p className="text-[10px] font-sans font-700 tracking-[0.22em] uppercase text-[var(--color-clay)]">
            {eyebrow}
          </p>
        </div>

        {/* Title row */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="font-display italic text-[27px] leading-tight text-[var(--text-primary)] mb-2">
              {title}
            </h1>
            {description && (
              <p className="text-[13px] font-sans text-[var(--text-secondary)] leading-relaxed max-w-xl">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0 pt-0.5">{action}</div>}
        </div>
      </div>
    </div>
  );
}
