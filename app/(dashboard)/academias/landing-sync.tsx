"use client";

import { useState } from "react";
import { Globe, RefreshCw } from "lucide-react";
import { Timestamp } from "@/components/ui/timestamp";
import { publishAcademiasToLandingAction } from "./actions";

type Result = Awaited<ReturnType<typeof publishAcademiasToLandingAction>>;

/**
 * Estado do diretório publicado em lits.social + o botão de republicar.
 *
 * A landing usa essa lista no dropdown "onde você dá aula" do cadastro de
 * professores. O que esta faixa existe para responder é uma coisa só: o que
 * está no ar hoje é igual ao que temos aqui? Por isso os dois números ficam
 * lado a lado — o daqui e o de lá.
 */
export function LandingSync({
  publicado,
  syncedAt,
  origem,
  erro,
}: {
  /** Quantas academias a landing está oferecendo agora; null quando não deu para ler. */
  publicado: number | null;
  /** Segundos epoch da última publicação; null se nunca publicou. */
  syncedAt: number | null;
  /** Quantas academias ATIVAS existem aqui — o que uma publicação agora mandaria. */
  origem: number;
  /** Falha ao ler o estado da landing. */
  erro?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  // Depois de publicar, o número no ar é o que a resposta disse — não o que a
  // página renderizou antes do clique.
  const atual = res?.ok ? res.total : publicado;
  const quando = res?.ok ? res.syncedAt : syncedAt;
  const defasado = atual !== null && atual !== origem;

  function publicar(force: boolean) {
    setBusy(true);
    publishAcademiasToLandingAction(force)
      .then(setRes)
      .finally(() => setBusy(false));
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-700 uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
            <Globe size={11} strokeWidth={2.5} />
            Dropdown do lits.social/professores
          </p>
          <p className="mt-1 text-[12.5px] font-300 text-[var(--text-secondary)]">
            {erro ? (
              <span className="text-[var(--color-error)]">{erro}</span>
            ) : atual === null ? (
              "Estado desconhecido."
            ) : atual === 0 ? (
              <>
                Nada publicado ainda — o professor só vê a lista de emergência da página.{" "}
                <strong className="font-600 text-[var(--text-primary)]">{origem}</strong> academias
                ativas aqui.
              </>
            ) : (
              <>
                <strong className="font-600 text-[var(--text-primary)]">{atual}</strong> academias no
                ar
                {quando ? (
                  <>
                    {" · "}
                    <Timestamp iso={new Date(quando * 1000).toISOString()} className="text-[12px]" />
                  </>
                ) : null}
                {defasado && (
                  <span className="text-[var(--color-warning)]">
                    {" · "}
                    aqui temos {origem} — publique para igualar
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => publicar(false)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw size={11} strokeWidth={2.5} className={busy ? "animate-spin" : undefined} />
          {busy ? "Publicando…" : "Publicar agora"}
        </button>
      </div>

      {res && !res.ok && (
        <div className="mt-3 rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-bg)] px-3 py-2 text-[11.5px] text-[var(--color-error)]">
          <p>{res.error}</p>
          {res.needsForce && (
            // A landing recusa uma queda grande porque quase sempre é leitura
            // quebrada, não decisão. Quando a queda é real, quem está na tela
            // confirma — e é este botão.
            <button
              type="button"
              disabled={busy}
              onClick={() => publicar(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-error)]/50 px-3 py-1 font-700 text-[9.5px] uppercase tracking-[0.16em] disabled:opacity-50"
            >
              Publicar mesmo assim
            </button>
          )}
        </div>
      )}

      {res?.ok && (
        <p className="mt-3 text-[11.5px] text-[var(--text-tertiary)]">
          Publicado: {res.total} academias
          {res.removed > 0 && ` · ${res.removed} removida${res.removed === 1 ? "" : "s"} de lá`}
          {res.ignored > 0 && ` · ${res.ignored} ignorada${res.ignored === 1 ? "" : "s"} (sem nome)`}
          . A landing serve essa lista com cache de 5 minutos.
        </p>
      )}
    </div>
  );
}
