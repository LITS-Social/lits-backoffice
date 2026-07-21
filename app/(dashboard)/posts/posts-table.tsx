"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, Trash2, ImageIcon, Flag } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/api/openapi";
import { Absent, Avatar, When } from "../_components/cells";
import { listPostsAction, deletePostAction, type PostsPage } from "./actions";

type OpsPostRow = components["schemas"]["OpsPostRow"];
type OpsPostAuthor = components["schemas"]["OpsPostAuthor"];

const GRID =
  "minmax(0,1.6fr) 96px minmax(0,2fr) 88px 132px 92px";

const HEADS = ["Autor", "Tipo", "Legenda", "Engajamento", "Publicado", ""];

const TYPE_LABEL: Record<string, string> = {
  photo: "Foto",
  score: "Placar",
  match: "Partida",
  general: "Texto",
  unspecified: "—",
};

function authorLine(authors: OpsPostAuthor[] | null | undefined): string {
  const list = authors ?? [];
  if (list.length === 0) return "—";
  const names = list.map((a) => a.name).filter(Boolean);
  if (names.length <= 1) return names[0] ?? "—";
  return `${names[0]} e ${names[1]}`;
}

export function PostsView({ initial }: { initial: PostsPage }) {
  const [query, setQuery] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [rows, setRows] = useState<OpsPostRow[]>(initial.rows);
  const [cursor, setCursor] = useState<string | undefined>(initial.nextCursor);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loadingMore, setLoadingMore] = useState(false);

  // Delete flow: the row queued for confirmation + the typed reason + status.
  const [confirming, setConfirming] = useState<OpsPostRow | null>(null);
  const [reason, setReason] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reqId = useRef(0);
  const didMount = useRef(false);

  // Re-fetch on query OR include-deleted change (debounced). The server already
  // rendered the first page, so skip the very first run.
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const id = ++reqId.current;
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await listPostsAction({ q: query, includeDeleted });
        if (id !== reqId.current) return;
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setError(null);
        setRows(res.rows);
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [query, includeDeleted]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const id = reqId.current;
    setLoadingMore(true);
    const res = await listPostsAction({ q: query, cursor, includeDeleted });
    setLoadingMore(false);
    if (id !== reqId.current) return;
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setRows((prev) => [...prev, ...res.rows]);
    setCursor(res.nextCursor);
    setHasMore(res.hasMore);
  }

  async function confirmDelete() {
    if (!confirming) return;
    const target = confirming;
    setDeletingId(target.id);
    const res = await deletePostAction({ id: target.id, reason });
    setDeletingId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    // Reflect the soft-delete in place. Drop it when deleted rows are hidden,
    // otherwise stamp deleted_at so the row renders as removed.
    setRows((prev) =>
      includeDeleted
        ? prev.map((r) =>
            r.id === target.id
              ? { ...r, deleted_at: res.deletedAt ?? new Date().toISOString() }
              : r,
          )
        : prev.filter((r) => r.id !== target.id),
    );
    setConfirming(null);
    setReason("");
  }

  const searching = query.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
            <span className="font-600 text-[var(--text-secondary)]">{rows.length}</span>{" "}
            {searching ? "resultado(s)" : "carregado(s)"}
            {hasMore && " — há mais"}
          </span>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="accent-[var(--primary)]"
            />
            incluir deletados
          </label>
        </div>
        <div className="sm:w-80">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar pela legenda..."
          />
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2.5 text-[12px] text-[var(--color-error)]">
          <AlertCircle size={13} className="mt-px shrink-0" />
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          message={
            searching ? "Nenhum post encontrado para essa busca." : "Nenhum post."
          }
          tone="neutral"
        />
      ) : (
        <div
          className={cn(
            "overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-opacity",
            isPending && "opacity-60",
          )}
        >
          <div
            className="grid items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-2.5"
            style={{ gridTemplateColumns: GRID }}
          >
            {HEADS.map((h, i) => (
              <span
                key={h || i}
                className="label-colus text-[8.5px] text-[var(--text-tertiary)]"
              >
                {h}
              </span>
            ))}
          </div>

          <div>
            {rows.map((p) => {
              const deleted = Boolean(p.deleted_at);
              const authors = p.authors ?? [];
              const photoCount = p.photo_urls?.length ?? 0;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "grid items-center gap-3 border-b border-[var(--border)] px-4 py-[11px] text-[12.5px] leading-snug text-[var(--text-primary)] last:border-b-0",
                    deleted && "opacity-45",
                  )}
                  style={{ gridTemplateColumns: GRID }}
                >
                  {/* Autor(es) — stacked avatars for collab, "A e B" byline. */}
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex -space-x-2">
                      {authors.slice(0, 2).map((a) => (
                        <Avatar key={a.user_id} src={a.avatar_url} name={a.name} />
                      ))}
                      {authors.length === 0 && <Avatar name="?" />}
                    </span>
                    <span className="min-w-0 truncate font-500">
                      {authorLine(authors)}
                    </span>
                  </span>

                  {/* Tipo */}
                  <span>
                    <Badge variant="muted">
                      {TYPE_LABEL[p.post_type] ?? p.post_type}
                    </Badge>
                  </span>

                  {/* Legenda + flags */}
                  <span className="flex min-w-0 flex-col gap-1">
                    <span
                      className={cn(
                        "min-w-0 truncate text-[var(--text-secondary)]",
                        deleted && "line-through",
                      )}
                    >
                      {p.caption?.trim() ? p.caption : <Absent />}
                    </span>
                    <span className="flex items-center gap-2">
                      {photoCount > 0 && (
                        <span className="flex items-center gap-1 text-[10.5px] text-[var(--text-tertiary)]">
                          <ImageIcon size={11} /> {photoCount}
                        </span>
                      )}
                      {p.reported && (
                        <span className="flex items-center gap-1 text-[10.5px] text-[var(--color-error)]">
                          <Flag size={11} /> reportado
                        </span>
                      )}
                      {deleted && <Badge variant="muted">deletado</Badge>}
                    </span>
                  </span>

                  {/* Engajamento */}
                  <span className="text-[11.5px] tabular-nums text-[var(--text-secondary)]">
                    {p.likes_count}❤ · {p.comments_count}💬
                  </span>

                  {/* Publicado */}
                  {p.created_at ? <When iso={p.created_at} /> : <Absent />}

                  {/* Ação — apagar (oculto se já deletado). */}
                  <span className="flex justify-end">
                    {!deleted && (
                      <button
                        type="button"
                        onClick={() => {
                          setReason("");
                          setConfirming(p);
                        }}
                        disabled={deletingId === p.id}
                        title="Remover post"
                        className="flex items-center gap-1 rounded-md border border-[var(--color-error)]/25 px-2 py-1 text-[10.5px] text-[var(--color-error)] transition-colors hover:bg-[var(--color-error-bg)] disabled:opacity-50"
                      >
                        <Trash2 size={12} /> Apagar
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasMore && rows.length > 0 && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore || isPending}
            className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-5 py-2 font-700 text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            {loadingMore ? "Carregando…" : "Carregar mais"}
          </button>
        </div>
      )}

      {/* Confirmação de remoção (destrutivo + auditado). */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => deletingId === null && setConfirming(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-600 text-[var(--text-primary)]">
              Remover este post?
            </h3>
            <p className="mt-1.5 text-[12px] text-[var(--text-secondary)]">
              {authorLine(confirming.authors)} ·{" "}
              {TYPE_LABEL[confirming.post_type] ?? confirming.post_type}. É um
              soft-delete (registrado no audit log) — o post some do feed mas
              não é apagado do banco.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Motivo (opcional) — fica registrado no audit log"
              className="mt-3 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                disabled={deletingId !== null}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-[12px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deletingId !== null}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--color-error)] px-4 py-2 text-[12px] font-500 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Trash2 size={13} />
                {deletingId !== null ? "Removendo…" : "Apagar post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
