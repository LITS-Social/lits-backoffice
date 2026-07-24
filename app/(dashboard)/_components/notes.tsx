import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

/**
 * "Mostrando 50 de 84."
 *
 * The single most valuable sentence in this codebase, and the one that keeps
 * getting deleted because it makes a panel look incomplete. It IS incomplete —
 * that is the point. A table that quietly renders a page of 50 out of 84 stuck
 * payments is not a smaller truth, it is a different and wrong answer to
 * "quantos pagamentos estão presos?".
 *
 * Renders nothing at all when the panel really did load everything, so a
 * complete panel stays silent and this note never becomes wallpaper.
 */
export function TruncationNote({
  shown,
  total,
  noun,
  reason,
}: {
  shown: number;
  total: number;
  /** Plural noun, e.g. "pagamentos". */
  noun: string;
  /** Why we could not get the rest. Omit when it is just a page-size choice. */
  reason?: ReactNode;
}) {
  if (shown >= total) return null;

  return (
    <p className="flex items-start gap-2 rounded-lg border border-[var(--color-warning)]/25 bg-[var(--color-warning-bg)] px-3.5 py-2.5 text-[11.5px] font-300 leading-relaxed text-[var(--text-secondary)]">
      <AlertTriangle
        size={13}
        strokeWidth={2}
        className="mt-px shrink-0 text-[var(--color-clay)]"
      />
      <span>
        Mostrando{" "}
        <span className="font-600 tabular-nums text-[var(--text-primary)]">{shown}</span> de{" "}
        <span className="font-600 tabular-nums text-[var(--text-primary)]">{total}</span> {noun}.
        {reason ? <> {reason}</> : null}
      </span>
    </p>
  );
}

/** A neutral, factual aside about what the data does or does not contain. */
export function PanelNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
      <Info size={12} strokeWidth={2} className="mt-0.5 shrink-0 opacity-70" />
      <span>{children}</span>
    </p>
  );
}

/**
 * The whole-panel failure state, shared by all seven panels instead of being
 * copy-pasted seven times with seven slightly different wordings.
 *
 * It says "we could not read this", never "there is nothing here" — those are
 * opposite facts and the founder acts differently on each.
 */
export function PanelError({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
}) {
  return (
    <div>
      <PageHeader eyebrow={eyebrow} title={title} description="Não foi possível carregar este painel." />
      <div className="px-4 sm:px-8 py-6">
        <div className="flex items-start gap-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-bg)] px-4 py-3.5">
          <AlertTriangle size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--color-error)]" />
          <div>
            <p className="label-colus text-[9px] text-[var(--color-error)]">Falha na API</p>
            <p className="mt-1.5 text-[13px] font-300 leading-relaxed text-[var(--text-secondary)]">
              {detail || "O serviço não respondeu."} Os números deste painel estão
              indisponíveis — não os interprete como zero.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
