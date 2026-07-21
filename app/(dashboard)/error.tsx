"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center px-8">
      <div className="grain w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8">
        <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] text-[var(--color-error)]">
          <AlertTriangle size={19} strokeWidth={1.75} />
        </span>

        <p className="eyebrow mb-3">Falha</p>

        <h2 className="mb-2.5 font-display text-[24px] leading-tight tracking-[-0.01em] text-[var(--text-primary)]">
          Não deu para ler este painel
        </h2>

        <p className="mb-6 text-[13px] font-300 leading-relaxed text-[var(--text-secondary)]">
          O servidor não respondeu, ou algo quebrou no caminho. Nada aqui está zerado — está
          apenas desconhecido, o que é diferente.
        </p>

        {/* The digest is the only string that ties this screen to a line in the
            server logs. Printing it costs nothing and saves a debugging session. */}
        {error.digest && (
          <p className="mb-6 font-mono text-[10.5px] text-[var(--text-tertiary)]">
            digest: {error.digest}
          </p>
        )}

        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full bg-[var(--primary)] px-4 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
