"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { AlertCircle, Plus, X } from "lucide-react";
import { blockCourtSlotAction } from "./actions";
import type { BlockCourtSlotState } from "./types";

const initialState: BlockCourtSlotState = { ok: false };

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors placeholder:font-300 placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";

const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";

/**
 * The #07 write action: manually block a court slot.
 *
 * There is no court-listing endpoint in this API, so `court_id` is a raw text
 * field. A dropdown would have to be populated from somewhere, and the only
 * "somewhere" available is a list of courts nobody is serving — inventing one to
 * make the form feel finished is exactly the move this codebase is done making.
 * A UUID box that admits it is a UUID box beats a select full of fiction.
 *
 * Submission is awaited inside the transition rather than run through
 * useActionState + an effect watching the result: closing the modal should be a
 * direct consequence of the submit, not a side effect synchronised off a state
 * change.
 */
export function BlockCourtModal() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Esc closes it. A modal you can only leave with the mouse is a modal that gets
  // left open on a screen the founder walked away from.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await blockCourtSlotAction(initialState, formData);
      setState(result);
      if (result.ok) {
        formRef.current?.reset();
        setOpen(false);
      }
    });
  }

  function closeModal() {
    setOpen(false);
    setState(initialState);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 font-colus text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90"
      >
        <Plus size={12} strokeWidth={2.5} />
        Bloquear quadra
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-court-title"
            onClick={(e) => e.stopPropagation()}
            className="grain animate-fade-in-up w-full max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 pt-6 pb-5">
              <div>
                <p className="eyebrow mb-2.5">Painel 07</p>
                <h2
                  id="block-court-title"
                  className="font-display text-[21px] italic leading-tight tracking-[-0.02em] text-[var(--text-primary)]"
                >
                  Bloquear horário de quadra
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Fechar"
                className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              <div>
                <label htmlFor="court_id" className={labelClass}>
                  ID da quadra
                </label>
                <input
                  id="court_id"
                  name="court_id"
                  required
                  placeholder="UUID da quadra"
                  className={`${fieldClass} font-mono text-[12px]`}
                />
                <p className="mt-1.5 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
                  A API não expõe uma lista de quadras, então o ID vai na mão.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="starts_at" className={labelClass}>
                    Início
                  </label>
                  <input
                    id="starts_at"
                    name="starts_at"
                    type="datetime-local"
                    required
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor="ends_at" className={labelClass}>
                    Fim
                  </label>
                  <input
                    id="ends_at"
                    name="ends_at"
                    type="datetime-local"
                    required
                    className={fieldClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reason" className={labelClass}>
                  Motivo
                </label>
                <textarea
                  id="reason"
                  name="reason"
                  required
                  rows={2}
                  placeholder="Ex.: manutenção do piso, evento do clube..."
                  className={`${fieldClass} resize-none`}
                />
              </div>

              {state.error && (
                <p className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-error)]">
                  <AlertCircle size={13} className="mt-px shrink-0" />
                  {state.error}
                </p>
              )}

              <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-full px-4 py-2 text-[12.5px] font-600 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-full bg-[var(--primary)] px-4 py-2 font-colus text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {isPending ? "Bloqueando…" : "Bloquear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
