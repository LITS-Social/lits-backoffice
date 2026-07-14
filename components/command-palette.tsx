"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, CornerDownLeft, AlertTriangle } from "lucide-react";
import { cn, formatDate, formatCurrency } from "@/lib/utils";
import { searchAction, type SearchHit } from "./command-palette-action";

/* ══════════════════════════════════════════════════════════════════════════════
   Global search — ⌘K from anywhere.

   Type a name, a @username, or paste a UUID. The BFF decides which of those it
   got; this component just renders what came back.

   The one design problem worth naming: a BOOKING hit has nowhere to go. There is
   no /reservas/[id] page in this app — the dossier is the only detail view that
   exists. Making the booking row itself "selectable" would mean Enter either
   does nothing or navigates somewhere the user did not ask for. So a booking hit
   renders as a non-selectable context header (court, slot, status, price — all
   real fields) and the PEOPLE on it become the selectable rows beneath it. Every
   row you can land on has a real destination, and a pasted booking id answers
   the question staff actually paste it to ask: "who is on this, and did they
   pay?"
   ═══════════════════════════════════════════════════════════════════════════ */

type UserHit = NonNullable<SearchHit["user"]>;
type BookingHit = NonNullable<SearchHit["booking"]>;

/**
 * The flattened render list. Only `user` and `participant` rows are selectable —
 * arrow keys skip everything else, so the cursor can never park on a header.
 */
type Row =
  | { kind: "heading"; key: string; label: string }
  | { kind: "booking"; key: string; booking: BookingHit }
  | { kind: "user"; key: string; userId: string; user: UserHit; byId: boolean }
  | {
      kind: "participant";
      key: string;
      userId: string;
      name: string;
      role: "Host" | "Convidado";
    };

function isSelectable(r: Row): r is Extract<Row, { kind: "user" | "participant" }> {
  return r.kind === "user" || r.kind === "participant";
}

/** Build the render list out of the raw hits, preserving the server's ordering. */
function buildRows(results: SearchHit[]): Row[] {
  const users = results.filter((r) => r.kind === "user" && r.user);
  const bookings = results.filter((r) => r.kind === "booking" && r.booking);
  const rows: Row[] = [];

  if (users.length > 0) {
    rows.push({ kind: "heading", key: "h-users", label: "Jogadores" });
    for (const hit of users) {
      const u = hit.user as UserHit;
      rows.push({
        kind: "user",
        key: `u-${u.user_id}`,
        userId: u.user_id,
        user: u,
        byId: hit.matched_by === "user_id",
      });
    }
  }

  for (const hit of bookings) {
    const b = hit.booking as BookingHit;
    rows.push({ kind: "heading", key: `h-b-${b.booking_id}`, label: "Reserva" });
    rows.push({ kind: "booking", key: `b-${b.booking_id}`, booking: b });
    rows.push({
      kind: "participant",
      key: `p-h-${b.booking_id}`,
      userId: b.host.user_id,
      name: b.host.name,
      role: "Host",
    });
    // No guest is a real state (an invite nobody accepted), not a missing value.
    // It gets no row rather than an empty one.
    if (b.guest) {
      rows.push({
        kind: "participant",
        key: `p-g-${b.booking_id}`,
        userId: b.guest.user_id,
        name: b.guest.name,
        role: "Convidado",
      });
    }
  }

  return rows;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  // The query the CURRENT results belong to — so "nada encontrado" can name the
  // term it actually failed on, not whatever is in the box a keystroke later.
  const [settled, setSettled] = useState("");
  const [active, setActive] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Monotonic request id. A slow response for "an" must never overwrite a fast
      one for "ana" — without this, results silently disagree with the input. */
  const seq = useRef(0);

  const rows = useMemo(() => buildRows(results), [results]);
  const selectable = useMemo(() => rows.filter(isSelectable), [rows]);

  /* ── ⌘K / Ctrl+K, from every page ──────────────────────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── Fresh state on every open ─────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSettled("");
    setError(null);
    setHasMore(false);
    setActive(0);
    // Bump the sequence so any request still in flight from the last session
    // cannot land in this one.
    seq.current += 1;
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  /* ── Debounced search ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;

    const q = query.trim();
    if (!q) {
      seq.current += 1; // cancel anything in flight
      setResults([]);
      setSettled("");
      setError(null);
      setHasMore(false);
      setPending(false);
      return;
    }

    setPending(true);
    const id = ++seq.current;

    const t = setTimeout(async () => {
      const res = await searchAction(q);
      if (id !== seq.current) return; // stale — a newer keystroke owns the UI

      if (!res.ok) {
        setError(res.error);
        setResults([]);
        setHasMore(false);
      } else {
        setError(null);
        setResults(res.results);
        setHasMore(res.hasMore);
      }
      setSettled(q);
      setActive(0);
      setPending(false);
    }, 220);

    return () => clearTimeout(t);
  }, [query, open]);

  /* ── Keep the highlighted row on screen ────────────────────────────────── */
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, rows]);

  const openUser = useCallback(
    (userId: string) => {
      setOpen(false);
      router.push(`/usuarios/${userId}`);
    },
    [router]
  );

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (selectable.length) setActive((i) => (i + 1) % selectable.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (selectable.length) setActive((i) => (i - 1 + selectable.length) % selectable.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const target = selectable[active];
      if (target) openUser(target.userId);
    }
  }

  const activeKey = selectable[active]?.key;

  return (
    <>
      {/* ── Trigger (mounts into the sidebar's #global-search-slot) ───────── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md border border-[var(--border)]",
          "bg-[var(--surface-raised)] px-2.5 py-[7px] text-left transition-colors",
          "hover:border-[var(--border-strong)]"
        )}
      >
        <Search
          size={13}
          strokeWidth={1.75}
          className="shrink-0 text-[var(--text-tertiary)] transition-colors group-hover:text-[var(--text-secondary)]"
        />
        <span className="flex-1 truncate text-[12px] text-[var(--text-tertiary)]">Buscar</span>
        <kbd className="label-colus shrink-0 rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-[2px] text-[8px] leading-none text-[var(--text-tertiary)]">
          ⌘K
        </kbd>
      </button>

      {!open ? null : (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Busca global"
        >
          {/* Scrim */}
          <button
            type="button"
            aria-label="Fechar busca"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-[var(--color-ink-800)]/55 backdrop-blur-[2px]"
          />

          <div
            className={cn(
              "animate-fade-in-up relative flex w-full max-w-[560px] flex-col overflow-hidden",
              "rounded-xl border border-[var(--border-strong)] bg-[var(--surface)]",
              "shadow-[0_24px_60px_-12px_rgba(12,12,12,0.45)]"
            )}
          >
            {/* ── Input ────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3.5">
              {pending ? (
                <Loader2
                  size={15}
                  strokeWidth={1.75}
                  className="shrink-0 animate-spin text-[var(--primary)]"
                />
              ) : (
                <Search size={15} strokeWidth={1.75} className="shrink-0 text-[var(--text-tertiary)]" />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Nome, @usuário ou UUID…"
                autoComplete="off"
                spellCheck={false}
                className={cn(
                  "flex-1 bg-transparent text-[14px] leading-none text-[var(--text-primary)]",
                  "placeholder:text-[var(--text-tertiary)] focus:outline-none"
                )}
              />
              <kbd className="label-colus shrink-0 rounded border border-[var(--border)] px-1.5 py-[3px] text-[8px] leading-none text-[var(--text-tertiary)]">
                Esc
              </kbd>
            </div>

            {/* ── Body ─────────────────────────────────────────────────── */}
            <div ref={listRef} className="max-h-[54vh] overflow-y-auto">
              {error ? (
                <div className="flex items-start gap-2.5 px-4 py-8 text-[var(--color-error)]">
                  <AlertTriangle size={15} strokeWidth={1.75} className="mt-px shrink-0" />
                  <div>
                    <p className="text-[13px] leading-snug">{error}</p>
                    <p className="mt-1 text-[11.5px] leading-snug text-[var(--text-tertiary)]">
                      A busca falhou — isto não quer dizer que o jogador não existe.
                    </p>
                  </div>
                </div>
              ) : !query.trim() ? (
                <p className="px-4 py-10 text-center text-[12.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
                  Digite um nome ou @usuário.
                  <br />
                  Cole um UUID para abrir um jogador ou uma reserva direto.
                </p>
              ) : rows.length === 0 && !pending && settled ? (
                <p className="px-4 py-10 text-center text-[12.5px] font-300 text-[var(--text-tertiary)]">
                  Nada encontrado para{" "}
                  <span className="font-500 text-[var(--text-secondary)]">“{settled}”</span>.
                </p>
              ) : (
                <div className="py-1.5">
                  {rows.map((row) => {
                    if (row.kind === "heading") {
                      return (
                        <p
                          key={row.key}
                          className="label-colus px-4 pt-3 pb-1.5 text-[8.5px] text-[var(--text-tertiary)]"
                        >
                          {row.label}
                        </p>
                      );
                    }

                    if (row.kind === "booking") return <BookingContext key={row.key} b={row.booking} />;

                    const on = row.key === activeKey;
                    const idx = selectable.findIndex((s) => s.key === row.key);

                    return (
                      <button
                        key={row.key}
                        type="button"
                        data-active={on}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => openUser(row.userId)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                          on ? "bg-[var(--primary)]/12" : "hover:bg-[var(--surface-raised)]"
                        )}
                      >
                        {row.kind === "user" ? (
                          <UserRowBody user={row.user} byId={row.byId} on={on} />
                        ) : (
                          <ParticipantRowBody name={row.name} role={row.role} on={on} />
                        )}

                        {on && (
                          <CornerDownLeft
                            size={12}
                            strokeWidth={2}
                            className="shrink-0 text-[var(--primary)]"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Footer ───────────────────────────────────────────────── */}
            <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-2">
              <span className="text-[10.5px] text-[var(--text-tertiary)]">
                <span className="font-600">↑↓</span> navegar · <span className="font-600">↵</span>{" "}
                abrir dossiê
              </span>
              {/* The server's own has_more. Never "N resultados" — the search runs
                  no COUNT, so there is no total to report. */}
              {hasMore && (
                <span className="text-[10.5px] text-[var(--text-tertiary)]">
                  Há mais resultados — refine a busca.
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Row bodies ───────────────────────────────────────────────────────────── */

function UserRowBody({ user, byId, on }: { user: UserHit; byId: boolean; on: boolean }) {
  // Only a NON-active account gets a badge. Painting "ativo" on every healthy
  // player is noise that hides the one row that is soft_deleted.
  const flagged = user.status && user.status !== "active";

  return (
    <>
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span
          className={cn(
            "truncate text-[13px]",
            on ? "text-[var(--primary)] font-600" : "text-[var(--text-primary)] font-500"
          )}
        >
          {user.name}
        </span>
        {/* Absent for a player who never picked one — omitted, not "@—". */}
        {user.username && (
          <span className="shrink-0 truncate text-[11.5px] text-[var(--text-tertiary)]">
            @{user.username}
          </span>
        )}
      </span>

      {flagged && (
        <span className="label-colus shrink-0 rounded-full border border-[var(--color-error)]/30 bg-[var(--color-error-bg)] px-1.5 py-[3px] text-[8px] leading-none text-[var(--color-error)]">
          {user.status}
        </span>
      )}
      {byId && (
        <span className="label-colus shrink-0 text-[8px] leading-none text-[var(--text-tertiary)]">
          por ID
        </span>
      )}
      {user.created_at && (
        <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--text-tertiary)]">
          {formatDate(new Date(user.created_at))}
        </span>
      )}
    </>
  );
}

function ParticipantRowBody({
  name,
  role,
  on,
}: {
  name: string;
  role: string;
  on: boolean;
}) {
  return (
    <>
      <span className="label-colus w-[54px] shrink-0 text-[8px] leading-none text-[var(--text-tertiary)]">
        {role}
      </span>
      <span
        className={cn(
          "flex-1 truncate text-[13px]",
          on ? "text-[var(--primary)] font-600" : "text-[var(--text-primary)] font-500"
        )}
      >
        {name}
      </span>
    </>
  );
}

/**
 * The pasted-booking context line. Not selectable — it is what you needed to
 * know, and the rows under it are what you can do about it.
 *
 * `payment_status` is the BOOKING-level outcome and it is shown as exactly that,
 * next to the price. It is not evidence that either player has settled their own
 * half: a booking can read "approved" while the host's leg is still unpaid. The
 * per-person truth lives in the dossier, which is one Enter away.
 */
function BookingContext({ b }: { b: BookingHit }) {
  return (
    <div className="mx-2 mb-1 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[12.5px] font-500 text-[var(--text-primary)]">
          {b.court_label}
        </span>
        <span className="label-colus shrink-0 text-[8px] leading-none text-[var(--text-tertiary)]">
          {b.status}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-tertiary)]">
        {b.starts_at && <span className="tabular-nums">{formatDate(new Date(b.starts_at))}</span>}
        <span className="tabular-nums">
          {b.price_cents === 0 ? "grátis" : formatCurrency(b.price_cents, b.currency ?? "BRL")}
        </span>
        {/* Empty on legacy rows — then it simply is not printed. */}
        {b.payment_status && <span>pagamento: {b.payment_status}</span>}
      </div>
    </div>
  );
}
