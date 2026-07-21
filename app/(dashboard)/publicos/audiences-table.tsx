"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Lock, Pencil, Plus, Trash2, Users2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { audienceChips, isEveryone } from "@/lib/audiences";
import { AudienceForm } from "./audience-form";
import {
  countAudienceAction,
  deleteAudienceAction,
  listAudiencesAction,
  type Audience,
} from "./actions";

const GRID = "minmax(0,1.4fr) minmax(0,2fr) 150px 96px";
const HEADS = ["Nome", "Filtros", "Membros", ""];

/** On-demand reach for one saved audience. Never fetched on list load — the
 *  count is a user-service aggregate, so N of them on every render would be slow
 *  and pointless; the operator asks for the one row they care about. */
function RowCount({ audienceId }: { audienceId: string }) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done"; matched: number; missingCategory: number }
    | { status: "error" }
  >({ status: "idle" });

  async function run() {
    setState({ status: "loading" });
    const res = await countAudienceAction({ audienceId });
    setState(
      res.ok
        ? { status: "done", matched: res.matched, missingCategory: res.missingCategory }
        : { status: "error" }
    );
  }

  if (state.status === "done") {
    return (
      <span
        className="text-[12px] tabular-nums text-[var(--text-secondary)]"
        title={
          state.missingCategory > 0
            ? `${state.missingCategory} sem classe declarada ficam fora do envio`
            : undefined
        }
      >
        <span className="font-600 text-[var(--text-primary)]">{state.matched}</span> membros
        {state.missingCategory > 0 && (
          <span className="text-[var(--text-tertiary)]"> · {state.missingCategory} s/ classe</span>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={state.status === "loading"}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-[5px] text-[11px] font-500 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
    >
      <Users2 size={12} strokeWidth={2} />
      {state.status === "loading" ? "Contando…" : state.status === "error" ? "Tentar de novo" : "Contar"}
    </button>
  );
}

export function AudiencesTable({ initial }: { initial: Audience[] }) {
  const [audiences, setAudiences] = useState<Audience[]>(initial);
  const [editing, setEditing] = useState<{ mode: "create" } | { mode: "edit"; audience: Audience } | null>(
    null
  );
  const [deleting, setDeleting] = useState<Audience | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // After any mutation, re-pull the list from the BFF rather than patching local
  // state — the server owns preset-first ordering and the canonical row shape.
  async function refresh() {
    const res = await listAudiencesAction();
    if (res.ok) {
      setAudiences(res.audiences);
      setError(null);
    } else {
      setError(res.error);
    }
  }

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startTransition(async () => {
      const res = await deleteAudienceAction(target.id);
      if (!res.ok) {
        setError(res.error);
        setDeleting(null);
        return;
      }
      setDeleting(null);
      await refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
          <span className="font-600 text-[var(--text-secondary)]">{audiences.length}</span>{" "}
          {audiences.length === 1 ? "público" : "públicos"}
        </span>
        <button
          type="button"
          onClick={() => setEditing({ mode: "create" })}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90"
        >
          <Plus size={12} strokeWidth={2.5} />
          Novo público
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2.5 text-[12px] text-[var(--color-error)]">
          <AlertCircle size={13} className="mt-px shrink-0" />
          {error}
        </p>
      )}

      {audiences.length === 0 ? (
        <EmptyState message="Nenhum público salvo ainda. Crie o primeiro para segmentar os anúncios." tone="neutral" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <div
            className="grid items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-2.5"
            style={{ gridTemplateColumns: GRID }}
          >
            {HEADS.map((h, i) => (
              <span
                key={h || `head-${i}`}
                className="label-colus text-[8.5px] text-[var(--text-tertiary)]"
              >
                {h}
              </span>
            ))}
          </div>

          <div>
            {audiences.map((a) => {
              const chips = audienceChips(a);
              return (
                <div
                  key={a.id}
                  className="grid items-center gap-3 border-b border-[var(--border)] px-4 py-[13px] text-[12.5px] leading-snug text-[var(--text-primary)] last:border-b-0"
                  style={{ gridTemplateColumns: GRID }}
                >
                  {/* Nome + preset marker */}
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-500">{a.name}</span>
                    {a.is_preset && (
                      <span>
                        <Badge variant="muted">preset</Badge>
                      </span>
                    )}
                  </span>

                  {/* Filtros — one chip per dimension, or the everyone-chip. */}
                  <span className="flex flex-wrap items-center gap-1">
                    {isEveryone(a) ? (
                      <span className="text-[11.5px] text-[var(--text-tertiary)]">
                        Todos os membros
                      </span>
                    ) : (
                      chips.map((c) => (
                        <span
                          key={c}
                          className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-[3px] text-[10.5px] font-500 text-[var(--text-secondary)]"
                        >
                          {c}
                        </span>
                      ))
                    )}
                  </span>

                  {/* Membros — on demand */}
                  <RowCount audienceId={a.id} />

                  {/* Ações */}
                  <span className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing({ mode: "edit", audience: a })}
                      aria-label={`Editar ${a.name}`}
                      className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                    >
                      <Pencil size={14} strokeWidth={2} />
                    </button>
                    {a.is_preset ? (
                      <span
                        title="Presets do sistema não podem ser apagados"
                        className="cursor-not-allowed p-1.5 text-[var(--text-tertiary)] opacity-40"
                      >
                        <Lock size={14} strokeWidth={2} />
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleting(a)}
                        aria-label={`Apagar ${a.name}`}
                        className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--color-error-bg)] hover:text-[var(--color-error)]"
                      >
                        <Trash2 size={14} strokeWidth={2} />
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editing && (
        <AudienceForm
          mode={editing.mode}
          audience={editing.mode === "edit" ? editing.audience : undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      )}

      {/* Delete confirm — never reachable for presets (their button is a lock). */}
      {deleting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
          onClick={() => !isPending && setDeleting(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-audience-title"
            onClick={(e) => e.stopPropagation()}
            className="grain animate-fade-in-up w-full max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 pt-6 pb-5">
              <div>
                <p className="eyebrow mb-2.5">Apagar público</p>
                <h2
                  id="delete-audience-title"
                  className="font-display text-[21px] leading-tight tracking-[-0.01em] text-[var(--text-primary)]"
                >
                  Apagar “{deleting.name}”?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => !isPending && setDeleting(null)}
                aria-label="Fechar"
                disabled={isPending}
                className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>

            <div className="px-6 py-5">
              <p className="text-[12px] font-300 leading-relaxed text-[var(--text-secondary)]">
                O público sai da lista de destino dos anúncios. Anúncios já enviados não são
                afetados.
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                disabled={isPending}
                className="rounded-full px-4 py-2 text-[12.5px] font-600 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-error)] px-4 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Trash2 size={12} strokeWidth={2.5} />
                {isPending ? "Apagando…" : "Apagar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
