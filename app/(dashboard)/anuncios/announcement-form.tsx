"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Radio, Send, X } from "lucide-react";
import { sendAnnouncementAction } from "./actions";
import type { SendAnnouncementState } from "./types";

const idle: SendAnnouncementState = { ok: false };

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors placeholder:font-300 placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";

const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";

/**
 * The "Enviar anúncio" write surface: composes a push + inbox broadcast to every
 * PlayTennis member.
 *
 * The Enviar button never sends. It opens a confirm dialog first — this messages
 * real users and cannot be recalled, so a single accidental click must not reach
 * production. The dialog previews the exact title and body about to go out, then
 * the confirm inside it is the only thing that fires the action.
 *
 * Inputs are controlled so the preview shows precisely what will be sent, not a
 * stale snapshot of a form the person kept editing.
 */
export function AnnouncementForm() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<SendAnnouncementState>(idle);
  const [isPending, startTransition] = useTransition();

  const canSend = title.trim().length > 0 && body.trim().length > 0;

  // Esc closes the confirm dialog — but never mid-send, when there is no longer a
  // safe way to back out and cancelling the UI would just hide an in-flight fan-out.
  useEffect(() => {
    if (!confirming) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) setConfirming(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, isPending]);

  function openConfirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSend) return;
    setState(idle);
    setConfirming(true);
  }

  function send() {
    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("body", body.trim());
    if (deepLink.trim()) formData.set("deep_link", deepLink.trim());

    startTransition(async () => {
      const result = await sendAnnouncementAction(idle, formData);
      setState(result);
      if (result.ok) {
        setConfirming(false);
        setTitle("");
        setBody("");
        setDeepLink("");
      }
    });
  }

  return (
    <div className="px-8 py-6">
      <div className="max-w-xl">
        {/* ── Result banner ─────────────────────────────────────────────────
            Only ever shown after a real attempt. Success is green and states the
            count; a partial (some pushes failed) still counts as sent but says so. */}
        {state.ok && state.result && (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-4 py-3.5">
            <CheckCircle2 size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--primary)]" />
            <div>
              <p className="label-colus text-[9px] text-[var(--primary)]">Anúncio enviado</p>
              <p className="mt-1.5 text-[13px] font-300 leading-relaxed text-[var(--text-secondary)]">
                Enviado para{" "}
                <span className="font-600 tabular-nums text-[var(--text-primary)]">
                  {state.result.sent}
                </span>{" "}
                {state.result.sent === 1 ? "membro" : "membros"}
                {state.result.failed > 0 ? (
                  <>
                    {" "}·{" "}
                    <span className="font-600 tabular-nums text-[var(--color-error)]">
                      {state.result.failed}
                    </span>{" "}
                    {state.result.failed === 1 ? "falha" : "falhas"}
                  </>
                ) : null}{" "}
                <span className="text-[var(--text-tertiary)]">
                  (de {state.result.total} no total)
                </span>
              </p>
            </div>
          </div>
        )}

        {state.error && (
          <p className="mb-5 flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3.5 py-2.5 text-[12px] leading-snug text-[var(--color-error)]">
            <AlertCircle size={13} className="mt-px shrink-0" />
            {state.error}
          </p>
        )}

        <form onSubmit={openConfirm} className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-6">
          <div>
            <label htmlFor="title" className={labelClass}>
              Título
            </label>
            <input
              id="title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={80}
              placeholder="Ex.: Torneio relâmpago neste sábado"
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="body" className={labelClass}>
              Mensagem
            </label>
            <textarea
              id="body"
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={4}
              maxLength={280}
              placeholder="O texto que chega no push e na caixa de entrada do app."
              className={`${fieldClass} resize-none`}
            />
          </div>

          <div>
            <label htmlFor="deep_link" className={labelClass}>
              Deep link <span className="normal-case tracking-normal opacity-70">(opcional)</span>
            </label>
            <input
              id="deep_link"
              name="deep_link"
              value={deepLink}
              onChange={(e) => setDeepLink(e.target.value)}
              placeholder="lits://..."
              className={`${fieldClass} font-mono text-[12px]`}
            />
            <p className="mt-1.5 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
              Para onde o toque no anúncio leva dentro do app. Deixe vazio para abrir só o feed.
            </p>
          </div>

          {/* Audience — fixed, not chosen. There is exactly one broadcast target
              today, so this states it rather than offering a select of one option. */}
          <div>
            <span className={labelClass}>Público</span>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
              <Radio size={13} strokeWidth={2} className="shrink-0 text-[var(--primary)]" />
              <span className="text-[13px] font-500 text-[var(--text-primary)]">Membros PlayTennis</span>
              <span className="ml-auto label-colus text-[8px] text-[var(--text-tertiary)]">
                Todos
              </span>
            </div>
          </div>

          <div className="flex justify-end border-t border-[var(--border)] pt-4">
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 font-colus text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Send size={12} strokeWidth={2.5} />
              Enviar
            </button>
          </div>
        </form>
      </div>

      {/* ── Confirm dialog ─────────────────────────────────────────────────── */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
          onClick={() => !isPending && setConfirming(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-announcement-title"
            onClick={(e) => e.stopPropagation()}
            className="grain animate-fade-in-up w-full max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 pt-6 pb-5">
              <div>
                <p className="eyebrow mb-2.5">Confirmar envio</p>
                <h2
                  id="confirm-announcement-title"
                  className="font-display text-[21px] italic leading-tight tracking-[-0.02em] text-[var(--text-primary)]"
                >
                  Enviar para todos os membros PlayTennis?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => !isPending && setConfirming(false)}
                aria-label="Fechar"
                disabled={isPending}
                className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>

            <div className="px-6 py-5">
              <p className="mb-4 text-[12px] font-300 leading-relaxed text-[var(--text-secondary)]">
                Isto dispara um push e uma notificação na caixa de entrada. Não dá para
                recolher depois de enviado.
              </p>

              {/* Preview of exactly what goes out. */}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3.5">
                <p className="label-colus mb-1.5 text-[8px] text-[var(--text-tertiary)]">Prévia</p>
                <p className="text-[13.5px] font-600 leading-snug text-[var(--text-primary)]">
                  {title.trim()}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] font-300 leading-relaxed text-[var(--text-secondary)]">
                  {body.trim()}
                </p>
                {deepLink.trim() && (
                  <p className="mt-2.5 truncate font-mono text-[10.5px] text-[var(--text-tertiary)]">
                    {deepLink.trim()}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={isPending}
                className="rounded-full px-4 py-2 text-[12.5px] font-600 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={send}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 font-colus text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Send size={12} strokeWidth={2.5} />
                {isPending ? "Enviando…" : "Confirmar envio"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
