"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { AlertCircle, Users2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLASS_OPTIONS, GENDER_OPTIONS } from "@/lib/audiences";
import {
  countAudienceAction,
  createAudienceAction,
  updateAudienceAction,
  type Audience,
} from "./actions";

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors placeholder:font-300 placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";

const labelClass = "label-colus mb-2 block text-[8.5px] text-[var(--text-tertiary)]";

/** A multi-select chip row: each chip toggles its value in/out of `selected`. */
function MultiToggle({
  options,
  selected,
  onToggle,
}: {
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-[5px] text-[11.5px] leading-none transition-colors",
              active
                ? "border-[var(--primary)] bg-[var(--primary)] font-600 text-[var(--primary-fg)]"
                : "border-[var(--border)] bg-transparent font-500 text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

type CountState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; matched: number; missingCategory: number }
  | { status: "error"; message: string };

/**
 * Create / edit modal for panel #14.
 *
 * The count block is the point of the whole feature: as the operator builds a
 * filter, a debounced inline count says how many members it would reach and how
 * many are silently dropped for having no declared class. It uses the INLINE
 * count (classes/genders/club_brand) even when editing a saved audience — the
 * number must reflect the filter on screen, not the one last persisted.
 */
export function AudienceForm({
  mode,
  audience,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  audience?: Audience;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(audience?.name ?? "");
  const [classes, setClasses] = useState<string[]>(audience?.classes ?? []);
  const [genders, setGenders] = useState<string[]>(audience?.genders ?? []);
  const [clubBrand, setClubBrand] = useState(audience?.club_brand ?? "");
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<CountState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  // Same monotonic guard the users table uses: a slow count for an earlier
  // filter must never overwrite the number for the filter now on screen.
  const reqId = useRef(0);

  const canSave = name.trim().length > 0 && !isPending;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPending, onClose]);

  // Debounced live count. Fires on any filter change (name is irrelevant to reach).
  // The "loading" set lives inside the timeout, not the effect body, so it never
  // runs synchronously on render — same shape the users table uses.
  useEffect(() => {
    const id = ++reqId.current;
    const t = setTimeout(() => {
      setCount({ status: "loading" });
      countAudienceAction({ filter: { classes, genders, clubBrand } }).then((res) => {
        if (id !== reqId.current) return; // a newer filter already fired
        if (!res.ok) {
          setCount({ status: "error", message: res.error });
          return;
        }
        setCount({ status: "done", matched: res.matched, missingCategory: res.missingCategory });
      });
    }, 400);
    return () => clearTimeout(t);
  }, [classes, genders, clubBrand]);

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSave) return;
    const filter = { classes, genders, clubBrand };
    startTransition(async () => {
      const res =
        mode === "edit" && audience
          ? await updateAudienceAction(audience.id, name, filter)
          : await createAudienceAction(name, filter);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
      onClick={() => !isPending && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="audience-form-title"
        onClick={(e) => e.stopPropagation()}
        className="grain animate-fade-in-up w-full max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 pt-6 pb-5">
          <div>
            <p className="eyebrow mb-2.5">Painel 14</p>
            <h2
              id="audience-form-title"
              className="font-display text-[21px] italic leading-tight tracking-[-0.02em] text-[var(--text-primary)]"
            >
              {mode === "edit" ? "Editar público" : "Novo público"}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !isPending && onClose()}
            aria-label="Fechar"
            disabled={isPending}
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          <div>
            <label htmlFor="audience-name" className={labelClass}>
              Nome
            </label>
            <input
              id="audience-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              placeholder="Ex.: Classe A — São Paulo"
              className={fieldClass}
            />
          </div>

          <div role="group" aria-labelledby="audience-class-label">
            <span id="audience-class-label" className={labelClass}>Classe</span>
            <MultiToggle
              options={CLASS_OPTIONS}
              selected={classes}
              onToggle={(v) => toggle(classes, setClasses, v)}
            />
            <p className="mt-1.5 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
              Nenhuma marcada = qualquer classe.
            </p>
          </div>

          <div role="group" aria-labelledby="audience-gender-label">
            <span id="audience-gender-label" className={labelClass}>Sexo</span>
            <MultiToggle
              options={GENDER_OPTIONS}
              selected={genders}
              onToggle={(v) => toggle(genders, setGenders, v)}
            />
            <p className="mt-1.5 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
              Nenhum marcado = qualquer sexo.
            </p>
          </div>

          <div>
            <label htmlFor="audience-club" className={labelClass}>
              Clube <span className="normal-case tracking-normal opacity-70">(opcional)</span>
            </label>
            <input
              id="audience-club"
              value={clubBrand}
              onChange={(e) => setClubBrand(e.target.value)}
              placeholder="playtennis — vazio = qualquer clube"
              className={fieldClass}
            />
          </div>

          {/* Live reach — the "avisar quantas vão enviar" the founder asked for. */}
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3.5 py-3">
            <Users2 size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--primary)]" />
            <div className="min-w-0 text-[12px] leading-relaxed">
              {count.status === "loading" || count.status === "idle" ? (
                <span className="font-300 text-[var(--text-tertiary)]">Calculando alcance…</span>
              ) : count.status === "error" ? (
                <span className="font-300 text-[var(--color-error)]">{count.message}</span>
              ) : (
                <span className="font-300 text-[var(--text-secondary)]">
                  <span className="font-600 tabular-nums text-[var(--text-primary)]">
                    {count.matched}
                  </span>{" "}
                  {count.matched === 1 ? "membro" : "membros"}
                  {count.missingCategory > 0 && (
                    <>
                      {" "}·{" "}
                      <span className="font-600 tabular-nums text-[var(--color-clay)]">
                        {count.missingCategory}
                      </span>{" "}
                      sem classe declarada{" "}
                      <span className="text-[var(--text-tertiary)]">(fora do envio)</span>
                    </>
                  )}
                </span>
              )}
            </div>
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-error)]">
              <AlertCircle size={13} className="mt-px shrink-0" />
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={() => !isPending && onClose()}
              disabled={isPending}
              className="rounded-full px-4 py-2 text-[12.5px] font-600 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="rounded-full bg-[var(--primary)] px-4 py-2 font-colus text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {isPending ? "Salvando…" : mode === "edit" ? "Salvar" : "Criar público"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
