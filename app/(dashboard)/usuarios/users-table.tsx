"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import { PlayerLink } from "@/components/ui/player-link";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatRelative } from "@/lib/utils";
import type { components } from "@/lib/api/openapi";
import { Absent, Avatar, When } from "../_components/cells";
import { listUsersAction, type UsersPage } from "./actions";

type OpsUserRow = components["schemas"]["OpsUserRow"];

// Written verbatim, one column per grid track — the sunken header band and every
// data row share this template so cells line up down the table.
const GRID =
  "minmax(0,1.7fr) minmax(0,1fr) minmax(0,1.5fr) 132px 84px 108px";

const QUIET_LINK = cn(
  "truncate rounded-sm underline-offset-2 transition-colors",
  "hover:text-[var(--primary)] hover:underline",
  "focus-visible:text-[var(--primary)] focus-visible:underline"
);

const HEADS = ["Jogador", "Usuário", "Contato", "Cadastro", "Nível", "Últ. acesso"];

export function UsersTable({ initial }: { initial: UsersPage }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<OpsUserRow[]>(initial.rows);
  const [cursor, setCursor] = useState<string | undefined>(initial.nextCursor);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loadingMore, setLoadingMore] = useState(false);

  // Monotonic id: a slow response for "jo" must not overwrite a newer one for
  // "joao". Only the response whose id still matches the latest request wins.
  const reqId = useRef(0);
  const didMount = useRef(false);

  useEffect(() => {
    // The server already rendered the first page — do not immediately re-fetch it.
    if (!didMount.current) {
      didMount.current = true;
      return;
    }

    const id = ++reqId.current;
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await listUsersAction({ q: query });
        if (id !== reqId.current) return; // a newer query already fired
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
  }, [query]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const id = reqId.current; // tie this page to the current query
    setLoadingMore(true);
    const res = await listUsersAction({ q: query, cursor });
    setLoadingMore(false);
    if (id !== reqId.current) return; // query changed mid-load — drop it
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setRows((prev) => [...prev, ...res.rows]);
    setCursor(res.nextCursor);
    setHasMore(res.hasMore);
  }

  const searching = query.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
          <span className="font-600 text-[var(--text-secondary)]">{rows.length}</span>{" "}
          {searching ? "resultado(s)" : "carregado(s)"}
          {hasMore && " — há mais"}
        </span>
        <div className="sm:w-80">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar por nome, @usuário, email ou telefone..."
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
            searching
              ? "Nenhum usuário encontrado para essa busca."
              : "Nenhum usuário cadastrado."
          }
          tone={searching ? "neutral" : "success"}
        />
      ) : (
        <div
          className={cn(
            "overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-opacity",
            isPending && "opacity-60"
          )}
        >
          <div
            className="grid items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-2.5"
            style={{ gridTemplateColumns: GRID }}
          >
            {HEADS.map((h) => (
              <span key={h} className="label-colus text-[8.5px] text-[var(--text-tertiary)]">
                {h}
              </span>
            ))}
          </div>

          <div>
            {rows.map((u) => (
              <div
                key={u.id}
                className="grid items-center gap-3 border-b border-[var(--border)] px-4 py-[11px] text-[12.5px] leading-snug text-[var(--text-primary)] last:border-b-0"
                style={{ gridTemplateColumns: GRID }}
              >
                {/* Jogador — avatar + name, the name a door into the dossier. */}
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar src={u.avatar_url} name={u.name} />
                  <PlayerLink userId={u.id} name={u.name} className="font-500" />
                </span>

                {/* Usuário */}
                <span className="min-w-0 truncate text-[var(--text-secondary)]">
                  {u.username ? `@${u.username}` : <Absent />}
                </span>

                {/* Contato — email over WhatsApp, both quiet links. */}
                <span className="flex min-w-0 flex-col gap-0.5">
                  {u.email ? (
                    <a
                      href={`mailto:${u.email}`}
                      className={cn(QUIET_LINK, "break-all text-[11.5px]")}
                    >
                      {u.email}
                    </a>
                  ) : null}
                  {u.phone_e164 ? (
                    <a
                      href={`https://wa.me/${u.phone_e164.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(QUIET_LINK, "text-[11.5px]")}
                    >
                      {u.phone_e164}
                    </a>
                  ) : null}
                  {!u.email && !u.phone_e164 && <Absent />}
                </span>

                {/* Cadastro */}
                {u.created_at ? <When iso={u.created_at} /> : <Absent />}

                {/* Nível — category, empty until nivelamento (not a default "D"). */}
                <span>
                  {u.level ? (
                    <Badge variant="muted">{u.level}</Badge>
                  ) : (
                    <span className="text-[11px] text-[var(--text-tertiary)]">não nivelado</span>
                  )}
                </span>

                {/* Último acesso — empty until first stamped activity: "nunca", not epoch. */}
                <span className="text-[11.5px] text-[var(--text-secondary)]">
                  {u.last_seen_at ? (
                    <span title={u.last_seen_at}>{formatRelative(new Date(u.last_seen_at))}</span>
                  ) : (
                    <span className="text-[var(--text-tertiary)]">nunca</span>
                  )}
                </span>
              </div>
            ))}
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
    </div>
  );
}
