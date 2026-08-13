interface PageHeaderProps {
  /** Fólio da seção — "#08". Ausente na maioria das telas: um rótulo de
      categoria em cima do título ("Gestão" sobre o nome da academia) não
      informa nada que o título já não diga. */
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * The masthead of every panel: the title in upright Colus over the paper's own
 * grain — the design system's editorial grammar on an ops console.
 *
 * O fólio marca-d'água só aparece quando o eyebrow É um fólio ("#08"). Ele foi
 * desenhado para um NÚMERO; uma palavra a 172px não vira profundidade, vira
 * "GESTÃO" gigante atrás do nome da academia.
 *
 * O fundo é o granulado da marca, não o quadriculado de quadra: a linha de
 * quadra desenha uma grade sobre um painel que já é feito de grades.
 */
export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  const folio = eyebrow && /^#?\s*[\d\s·]+$/.test(eyebrow) ? eyebrow.replace("#", "") : null;

  return (
    <div className="grain relative overflow-hidden border-b border-[var(--border)] px-4 sm:px-8 pt-9 pb-7">
      {folio && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-5 bottom-0 select-none font-display leading-none text-[var(--text-primary)] opacity-[0.05] translate-y-[22%]"
          style={{ fontSize: "clamp(100px, 13vw, 172px)" }}
        >
          {folio}
        </span>
      )}

      <div className="relative">
        {eyebrow && <p className="eyebrow mb-3.5">{eyebrow}</p>}

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
