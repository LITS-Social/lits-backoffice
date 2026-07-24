"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, CornerDownRight, Radio, Send, Users2, X } from "lucide-react";
import { countAnnouncementAudienceAction, sendAnnouncementAction } from "./actions";
import {
  ANNOUNCEMENT_DESTINATIONS,
  CUSTOM_DESTINATION,
  destinationLabel,
  isValidDeepLink,
} from "@/lib/announcement-destinations";
import type { Audience, SendAnnouncementState } from "./types";

const idle: SendAnnouncementState = { ok: false };

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors placeholder:font-300 placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";

const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";

type CountState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; matched: number; missingCategory: number }
  | { status: "error"; message: string };

/** Preset first, else the first audience, else none (legacy all-members target). */
function defaultAudienceId(audiences: Audience[]): string {
  return audiences.find((a) => a.is_preset)?.id ?? audiences[0]?.id ?? "";
}

/**
 * The "Enviar anúncio" write surface: composes a push + inbox broadcast to a
 * chosen audience (panel #14).
 *
 * The Enviar button never sends. It opens a confirm dialog first — this messages
 * real users and cannot be recalled, so a single accidental click must not reach
 * production. The dialog names the audience, its live member count, and previews
 * the exact title and body about to go out; the confirm inside it is the only
 * thing that fires the action.
 *
 * When no audiences are available (the list fetch failed), the picker collapses
 * to the legacy fixed target and the send carries an empty audience_id — exactly
 * the behaviour that shipped before audiences existed.
 */
export function AnnouncementForm({ audiences }: { audiences: Audience[] }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // The picked screen: a canonical lits://<host> or the CUSTOM_DESTINATION
  // sentinel that reveals the advanced free-text input below. Defaults to feed,
  // matching the legacy "empty deep_link = feed" behaviour.
  const [destination, setDestination] = useState<string>(ANNOUNCEMENT_DESTINATIONS[0].value);
  const [customDeepLink, setCustomDeepLink] = useState("");
  const [audienceId, setAudienceId] = useState(() => defaultAudienceId(audiences));
  // Loading from the start when a default audience exists, so the reach preview is
  // never briefly blank on first paint before the mount fetch resolves.
  const [count, setCount] = useState<CountState>(() =>
    defaultAudienceId(audiences) ? { status: "loading" } : { status: "idle" }
  );
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<SendAnnouncementState>(idle);
  const [isPending, startTransition] = useTransition();

  const reqId = useRef(0);

  const isCustom = destination === CUSTOM_DESTINATION;
  // The lits://<host> string that actually goes out: the picked screen, or the
  // trimmed free-text value when "Outro (avançado)" is chosen.
  const effectiveDeepLink = isCustom ? customDeepLink.trim() : destination;
  // In advanced mode the free-text value must be a well-formed lits:// link, so
  // the escape hatch can't reintroduce the dead-link typo the picker fixes.
  const customValid = !isCustom || isValidDeepLink(customDeepLink);
  const canSend = title.trim().length > 0 && body.trim().length > 0 && customValid;
  const hasPicker = audiences.length > 0;

  const selectedName = useMemo(
    () => audiences.find((a) => a.id === audienceId)?.name ?? "todos os membros PlayTennis",
    [audiences, audienceId]
  );

  // Live reach of the selected audience. A discrete select, so no debounce — the
  // loading state is set by whoever changes the selection (initial state on mount,
  // onChange on switch); the effect only fetches and settles the result, keeping
  // the same monotonic guard the other panels use against out-of-order responses.
  useEffect(() => {
    if (!audienceId) return;
    const id = ++reqId.current;
    countAnnouncementAudienceAction(audienceId).then((res) => {
      if (id !== reqId.current) return;
      if (!res.ok) {
        setCount({ status: "error", message: res.error });
        return;
      }
      setCount({ status: "done", matched: res.matched, missingCategory: res.missingCategory });
    });
  }, [audienceId]);

  function chooseAudience(id: string) {
    setAudienceId(id);
    setCount(id ? { status: "loading" } : { status: "idle" });
  }

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
    if (effectiveDeepLink) formData.set("deep_link", effectiveDeepLink);
    if (audienceId) formData.set("audience_id", audienceId);

    startTransition(async () => {
      const result = await sendAnnouncementAction(idle, formData);
      setState(result);
      if (result.ok) {
        setConfirming(false);
        setTitle("");
        setBody("");
        setDestination(ANNOUNCEMENT_DESTINATIONS[0].value);
        setCustomDeepLink("");
      }
    });
  }

  const confirmTitle =
    count.status === "done"
      ? `Enviar para ${selectedName} — ${count.matched} ${count.matched === 1 ? "membro" : "membros"}?`
      : `Enviar para ${selectedName}?`;

  return (
    <div className="px-4 sm:px-8 py-6">
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

          {/* Destino — a curated list of the app's navigable screens (mirrors the
              lits-mobile deep-link resolver), so a hand-typed host can't dead-end.
              "Outro (avançado)" reveals a validated free-text input for parametric
              links (lits://profile/{id}) that no fixed screen entry can express. */}
          <div>
            <label htmlFor="destination" className={labelClass}>
              Destino <span className="normal-case tracking-normal opacity-70">(para onde o toque leva)</span>
            </label>
            <select
              id="destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className={fieldClass}
            >
              {ANNOUNCEMENT_DESTINATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
              <option value={CUSTOM_DESTINATION}>Outro (avançado)…</option>
            </select>

            {isCustom && (
              <input
                id="custom_deep_link"
                aria-label="Deep link customizado"
                value={customDeepLink}
                onChange={(e) => setCustomDeepLink(e.target.value)}
                placeholder="lits://profile/123"
                aria-invalid={!customValid}
                className={`${fieldClass} mt-2 font-mono text-[12px] ${
                  !customValid ? "border-[var(--color-error)]" : ""
                }`}
              />
            )}

            <p className="mt-1.5 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
              {isCustom
                ? "Deep link paramétrico (avançado). Precisa começar com lits://."
                : "A tela do app que o anúncio abre. O padrão é o feed."}
            </p>
          </div>

          {/* Público — a saved audience from panel #14. Defaults to the preset that
              preserves the old "all PlayTennis members" reach. */}
          <div>
            <label htmlFor="audience_id" className={labelClass}>
              Público
            </label>
            {hasPicker ? (
              <>
                <select
                  id="audience_id"
                  value={audienceId}
                  onChange={(e) => chooseAudience(e.target.value)}
                  className={fieldClass}
                >
                  {audiences.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.is_preset ? " (preset)" : ""}
                    </option>
                  ))}
                </select>

                {/* Reach preview, before the confirm even opens. */}
                <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-300 leading-snug text-[var(--text-secondary)]">
                  <Users2 size={12} strokeWidth={2} className="shrink-0 text-[var(--primary)]" />
                  {count.status === "loading" || count.status === "idle" ? (
                    <span className="text-[var(--text-tertiary)]">Calculando alcance…</span>
                  ) : count.status === "error" ? (
                    <span className="text-[var(--color-error)]">{count.message}</span>
                  ) : (
                    <span>
                      Vai enviar para{" "}
                      <span className="font-600 tabular-nums text-[var(--text-primary)]">
                        {count.matched}
                      </span>{" "}
                      {count.matched === 1 ? "pessoa" : "pessoas"}
                      {count.missingCategory > 0 && (
                        <span className="text-[var(--text-tertiary)]">
                          {" "}· {count.missingCategory} sem classe declarada (fora do envio)
                        </span>
                      )}
                    </span>
                  )}
                </p>
              </>
            ) : (
              // Legacy fallback: the audience list could not be loaded, so the send
              // targets every PlayTennis member with an empty audience_id.
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <Radio size={13} strokeWidth={2} className="shrink-0 text-[var(--primary)]" />
                <span className="text-[13px] font-500 text-[var(--text-primary)]">Membros PlayTennis</span>
                <span className="ml-auto label-colus text-[8px] text-[var(--text-tertiary)]">
                  Todos
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-end border-t border-[var(--border)] pt-4">
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-40"
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
                  className="font-display text-[21px] leading-tight tracking-[-0.01em] text-[var(--text-primary)]"
                >
                  {confirmTitle}
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
                {effectiveDeepLink && (
                  <p className="mt-2.5 flex items-center gap-1.5 text-[11px] font-300 text-[var(--text-tertiary)]">
                    <CornerDownRight size={11} strokeWidth={2} className="shrink-0" />
                    <span>
                      Abre em{" "}
                      <span className="font-500 text-[var(--text-secondary)]">
                        {destinationLabel(effectiveDeepLink)}
                      </span>
                    </span>
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
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50"
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
