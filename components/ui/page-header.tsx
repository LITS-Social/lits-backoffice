interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * The masthead of every panel. Tracked Nikkei eyebrow with its leading rule,
 * the panel's folio number set as an oversized Colus watermark, then the title
 * in upright Colus — the design system's editorial grammar on an ops console.
 */
export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  const num = eyebrow.replace("#", "");

  return (
    <div className="relative overflow-hidden border-b border-[var(--border)] px-8 pt-9 pb-7">
      {/* Folio watermark — depth, not decoration: it tells you which panel you
          are standing in from across the room. */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-5 bottom-0 select-none font-display leading-none text-[var(--text-primary)] opacity-[0.05] translate-y-[22%]"
        style={{ fontSize: "clamp(100px, 13vw, 172px)" }}
      >
        {num}
      </span>

      {/* Court-line atmosphere, masked to nothing before it reaches the text. */}
      <span aria-hidden className="court-lines" />

      <div className="relative">
        <p className="eyebrow mb-3.5">{eyebrow}</p>

        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="mb-2 font-display text-[30px] leading-[1.1] tracking-[-0.01em] text-[var(--text-primary)]">
              {title}
            </h1>
            {description && (
              <p className="max-w-xl text-[13px] font-300 leading-relaxed text-[var(--text-secondary)]">
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
