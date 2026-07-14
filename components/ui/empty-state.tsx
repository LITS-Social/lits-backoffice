import { CheckCircle2, SearchX, type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  message: string;
  /** Custom icon; defaults based on `tone` when omitted. */
  icon?: LucideIcon;
  /**
   * "success" (default) = "we asked, there is genuinely nothing here" — green
   * check, calm tone. "neutral" = "there IS data, your search/filter just
   * doesn't match any of it" — a different situation that deserves a
   * different, less celebratory treatment so it isn't mistaken for "all clear".
   */
  tone?: "success" | "neutral";
}

/**
 * An honestly-empty panel is a success, not a bug. It gets the calm check and a
 * lot of negative space — the visual reward for nothing being on fire.
 *
 * `message` is the only thing this component actually knows to be true, so it is
 * the only prose it renders. An earlier draft crowned it with a Colus "TUDO
 * LIMPO" kicker, which read beautifully and lied: panels #02 and #04 have no
 * backend and pass the default tone, so the kicker announced an all-clear for a
 * question nobody had asked. A headline the component cannot substantiate is
 * invented data like any other — it does not get to exist here.
 */
export function EmptyState({ message, icon, tone = "success" }: EmptyStateProps) {
  const Icon = icon ?? (tone === "success" ? CheckCircle2 : SearchX);
  const success = tone === "success";

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <span
        className={
          success
            ? "flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-success)]/25 bg-[var(--color-success-bg)] text-[var(--color-success)]"
            : "flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]"
        }
      >
        <Icon size={20} strokeWidth={1.5} />
      </span>

      <p className="max-w-sm text-[14px] font-300 leading-relaxed text-[var(--text-secondary)]">
        {message}
      </p>
    </div>
  );
}
