"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertCircle, Ban, Check, ChevronLeft, ChevronRight, GripVertical, Lock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourtListItem } from "../../quadras/actions";
import type { CourtSlotItem } from "../../quadras/[id]/editar/actions";
import {
  addCourtSlotsAction,
  applyPrintSlotsAction,
  listCourtSlotsAction,
  reorderCourtsAction,
  updateCourtSlotAction,
  type AddSlotInput,
} from "../../quadras/[id]/editar/actions";
import { SP_OFFSET, spStartMs } from "../../quadras/[id]/editar/print-lib";
import type { HourWindows } from "./academia";

/**
 * Sheets-style day view across every court of the academia: rows are hours,
 * columns are courts, each cell is that court's slot. One click toggles
 * disponível ↔ bloqueado; an empty cell becomes disponível; booked cells are
 * locked (real reservations are never touched from here).
 */

const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";
const fieldClass =
  "rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";

function spToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** Hour-of-day of an instant, on the São Paulo wall clock. */
function spHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(iso))
  );
}

function windowFor(ymd: string, w: HourWindows): { start: number; end: number } {
  const dow = new Date(`${ymd}T12:00:00`).getDay();
  if (dow === 0) return { start: w.sunStart, end: w.sunEnd };
  if (dow === 6) return { start: w.satStart, end: w.satEnd };
  return { start: w.weekStart, end: w.weekEnd };
}

function priceShort(cents: number | null): string {
  if (cents == null) return "";
  const v = cents / 100;
  return `R$${Number.isInteger(v) ? v : v.toFixed(2).replace(".", ",")}`;
}

type CellState = { slot: CourtSlotItem | null };

export function AcademiaCalendar({
  courts,
  windows,
}: {
  courts: CourtListItem[];
  windows: HourWindows;
}) {
  const [date, setDate] = useState(spToday);
  // Reload handle: bumping the tick invalidates the loaded snapshot below.
  const [tick, setTick] = useState(0);
  const loadKey = `${date}:${tick}`;
  // Last completed fetch — courtId → (hour → slot); missing hour = no slot.
  // "Loading" is derived: the snapshot's key lagging behind loadKey.
  const [loaded, setLoaded] = useState<{
    key: string;
    byCourt: Map<string, Map<number, CourtSlotItem>>;
    loadError: string;
  } | null>(null);
  const loading = loaded?.key !== loadKey;
  const byCourt = useMemo(
    () => loaded?.byCourt ?? new Map<string, Map<number, CourtSlotItem>>(),
    [loaded]
  );
  const [writeError, setWriteError] = useState("");
  const error = writeError || (loaded?.key === loadKey ? loaded.loadError : "");
  // Cells with a write in flight — locked against double-clicks.
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [, startWriting] = useTransition();

  // Column order — drag a court name to rearrange. Saved to the backend
  // (courts.display_order) so EVERY operator and every login sees the same
  // order; localStorage doubles as instant cache and rollout fallback.
  const orderKey = `lits-court-order:${courts[0]?.franchise_id ?? ""}`;
  const [order, setOrder] = useState<string[] | null>(null);
  // Ref carries the dragged id (synchronous — the drop can land in the same
  // tick); the state twin only drives the dimmed-column styling.
  const dragRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  useEffect(() => {
    // rAF defers the setState out of the effect body (lint: no sync setState
    // in effects); localStorage is only readable on the client anyway.
    const raf = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(orderKey);
        if (raw) setOrder(JSON.parse(raw));
      } catch {
        /* stale/corrupt preference — fall back to natural order */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [orderKey]);
  const orderedCourts = useMemo(() => {
    if (!order) return courts;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...courts].sort(
      (a, b) => (rank.get(a.id) ?? courts.indexOf(a)) - (rank.get(b.id) ?? courts.indexOf(b))
    );
  }, [courts, order]);
  function dropOn(targetId: string) {
    const dragged = dragRef.current;
    if (!dragged || dragged === targetId) return;
    const ids = orderedCourts.map((c) => c.id);
    const next = ids.filter((id) => id !== dragged);
    next.splice(next.indexOf(targetId), 0, dragged);
    setOrder(next);
    try {
      localStorage.setItem(orderKey, JSON.stringify(next));
    } catch {
      /* private mode etc. — order still applies for the session */
    }
    startWriting(async () => {
      const res = await reorderCourtsAction(next);
      if (!res.ok) setWriteError(res.error ?? "Falha ao salvar a ordem das colunas.");
    });
  }

  // "Bloquear dia(s)": every window hour of the shown day (and the next N−1)
  // becomes blocked on every court — existing available slots are blocked,
  // missing ones are created blocked, booked ones are reported and untouched.
  const [blockDaysN, setBlockDaysN] = useState("1");
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [blockNote, setBlockNote] = useState("");
  const [blocking, startBlocking] = useTransition();

  function blockDays() {
    const n = Number(blockDaysN);
    if (!Number.isInteger(n) || n < 1 || n > 60) {
      setWriteError("Dias em sequência deve ser um inteiro entre 1 e 60.");
      setConfirmingBlock(false);
      return;
    }
    setWriteError("");
    setBlockNote("");
    setConfirmingBlock(false);
    startBlocking(async () => {
      const slots: AddSlotInput[] = [];
      for (let d = 0; d < n; d++) {
        const day = new Date(`${date}T12:00:00${SP_OFFSET}`);
        day.setDate(day.getDate() + d);
        const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
        const w = windowFor(ymd, windows);
        for (let h = w.start; h <= w.end; h++) {
          const startMs = spStartMs(ymd, `${String(h).padStart(2, "0")}:00`);
          slots.push({
            slot_start: new Date(startMs).toISOString(),
            slot_end: new Date(startMs + 3_600_000).toISOString(),
            status: "blocked",
          });
        }
      }
      let blocked = 0;
      let booked = 0;
      const failures: string[] = [];
      for (const c of courts) {
        const res = await applyPrintSlotsAction(c.id, slots);
        if (res.ok) {
          blocked +=
            (res.createdBlocked ?? 0) + (res.blockedExisting ?? 0) + (res.alreadyBlocked ?? 0);
          booked += res.bookedConflicts ?? 0;
        } else {
          failures.push(`${c.name}: ${res.error ?? "falha"}`);
        }
      }
      if (failures.length > 0) setWriteError(failures.join(" · "));
      if (failures.length < courts.length) {
        setBlockNote(
          `${blocked} horários bloqueados em ${courts.length - failures.length} quadra${courts.length - failures.length === 1 ? "" : "s"}` +
            (n > 1 ? ` × ${n} dias` : "") +
            (booked > 0 ? ` · ${booked} com reserva real — não tocados` : "") +
            "."
        );
      }
      setTick((t) => t + 1);
    });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const from = new Date(`${date}T00:00:00${SP_OFFSET}`).toISOString();
      const to = new Date(new Date(from).getTime() + 24 * 3_600_000).toISOString();
      const results = await Promise.all(courts.map((c) => listCourtSlotsAction(c.id, from, to)));
      if (cancelled) return;
      const next = new Map<string, Map<number, CourtSlotItem>>();
      const failures: string[] = [];
      results.forEach((res, i) => {
        const m = new Map<number, CourtSlotItem>();
        if (res.ok) for (const s of res.slots ?? []) m.set(spHour(s.slot_start), s);
        else failures.push(courts[i].name);
        next.set(courts[i].id, m);
      });
      setLoaded({
        key: loadKey,
        byCourt: next,
        loadError: failures.length > 0 ? `Falha ao carregar: ${failures.join(", ")}.` : "",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [loadKey, date, courts]);

  const hours = useMemo(() => {
    const w = windowFor(date, windows);
    const set = new Set<number>();
    for (let h = w.start; h <= w.end; h++) set.add(h);
    for (const m of byCourt.values()) for (const h of m.keys()) set.add(h);
    return [...set].sort((a, b) => a - b);
  }, [date, windows, byCourt]);

  /** Step the day picker ±1 day. Noon anchor dodges DST edges: shifting the
      calendar date never depends on the viewer's local midnight. */
  function shiftDay(delta: number) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    setDate(`${y}-${m}-${day}`);
  }

  function setCell(courtId: string, hour: number, slot: CourtSlotItem) {
    setLoaded((prev) => {
      if (!prev) return prev;
      const byCourtNext = new Map(prev.byCourt);
      const m = new Map(byCourtNext.get(courtId) ?? []);
      m.set(hour, slot);
      byCourtNext.set(courtId, m);
      return { ...prev, byCourt: byCourtNext };
    });
  }

  function clickCell(courtId: string, hour: number, cell: CellState) {
    const key = `${courtId}:${hour}`;
    if (pending.has(key)) return;
    const slot = cell.slot;
    if (slot?.status === "booked") return;
    setWriteError("");
    setPending((p) => new Set(p).add(key));
    const done = () =>
      setPending((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    startWriting(async () => {
      if (!slot) {
        // Empty cell → create an available slot at this hour (franchise price).
        const startMs = spStartMs(date, `${String(hour).padStart(2, "0")}:00`);
        const slotStart = new Date(startMs).toISOString();
        const res = await addCourtSlotsAction(courtId, [
          { slot_start: slotStart, slot_end: new Date(startMs + 3_600_000).toISOString(), status: "available" },
        ]);
        if (res.ok) {
          setCell(courtId, hour, {
            slot_start: slotStart,
            slot_end: new Date(startMs + 3_600_000).toISOString(),
            status: "available",
            price_cents: null,
            block_reason: null,
          });
        } else {
          setWriteError(res.error ?? "Falha ao criar horário.");
        }
        done();
        return;
      }
      const toBlocked = slot.status === "available";
      const res = await updateCourtSlotAction(courtId, slot.slot_start, {
        status: toBlocked ? "blocked" : "available",
        blockReason: toBlocked ? "Bloqueado no calendário da academia" : "",
      });
      if (res.ok && res.slot) setCell(courtId, hour, res.slot);
      else setWriteError(res.error ?? "Falha ao atualizar horário.");
      done();
    });
  }

  return (
    <section className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="eyebrow">Calendário das quadras</h2>
          <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
            Todas as quadras lado a lado, como numa planilha. Clique numa célula para alternar{" "}
            <strong>disponível ↔ bloqueado</strong>; célula vazia vira disponível. Arraste o nome
            de uma quadra para reordenar as colunas. Horários com reserva real ficam travados.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-end gap-x-2 gap-y-3">
          <div>
            <label htmlFor="cal-date" className={labelClass}>
              Dia
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => shiftDay(-1)}
                aria-label="Dia anterior"
                className="rounded-lg border border-[var(--border)] p-2.5 text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              >
                <ChevronLeft size={13} />
              </button>
              <input
                id="cal-date"
                type="date"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className={fieldClass}
              />
              <button
                type="button"
                onClick={() => shiftDay(1)}
                aria-label="Próximo dia"
                className="rounded-lg border border-[var(--border)] p-2.5 text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setWriteError("");
              setTick((t) => t + 1);
            }}
            aria-label="Recarregar"
            className="mb-px rounded-lg border border-[var(--border)] p-2.5 text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
          </button>
          <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
            <div className="w-[92px]">
              <label htmlFor="block-days" className={labelClass}>
                Dias seguidos
              </label>
              <input
                id="block-days"
                type="number"
                min={1}
                max={60}
                value={blockDaysN}
                onChange={(e) => setBlockDaysN(e.target.value)}
                className={cn(fieldClass, "w-full")}
              />
            </div>
            {confirmingBlock ? (
              <span className="flex items-center gap-2 pb-px">
                <button
                  type="button"
                  onClick={blockDays}
                  disabled={blocking}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-error)] px-4 py-2 font-700 text-[9.5px] uppercase tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Confirmar — {blockDaysN} dia{Number(blockDaysN) === 1 ? "" : "s"} × {courts.length}{" "}
                  quadra{courts.length === 1 ? "" : "s"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingBlock(false)}
                  className="text-[11px] font-500 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingBlock(true)}
                disabled={blocking || loading}
                className="mb-px inline-flex items-center gap-1.5 rounded-full border border-[var(--color-clay)]/50 px-4 py-2 font-700 text-[9.5px] uppercase tracking-[0.14em] text-[var(--color-clay)] transition-colors hover:bg-[var(--color-warning-bg)] disabled:opacity-50"
              >
                <Ban size={11} strokeWidth={2.5} />
                {blocking ? "Bloqueando…" : "Bloquear dia"}
              </button>
            )}
          </div>
        </div>
      </div>

      {blockNote && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--color-success)]/25 bg-[var(--color-success-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-success)]">
          <Check size={13} strokeWidth={2.5} className="shrink-0" />
          {blockNote}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-[56px] bg-[var(--surface)] sm:w-[64px]" />
              {orderedCourts.map((c) => (
                <th
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    dragRef.current = c.id;
                    setDragId(c.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropOn(c.id);
                    dragRef.current = null;
                    setDragId(null);
                  }}
                  onDragEnd={() => {
                    dragRef.current = null;
                    setDragId(null);
                  }}
                  className={cn(
                    "min-w-[84px] cursor-grab rounded-md bg-[var(--surface-raised)] px-2 py-2 text-center text-[11px] font-600 text-[var(--text-secondary)] transition-opacity active:cursor-grabbing",
                    dragId === c.id && "opacity-40"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    <GripVertical size={10} className="shrink-0 opacity-40" />
                    {c.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h}>
                <td className="sticky left-0 z-10 bg-[var(--surface)] pr-2 text-right text-[11px] font-500 tabular-nums text-[var(--text-tertiary)]">
                  {String(h).padStart(2, "0")}:00
                </td>
                {orderedCourts.map((c) => {
                  const slot = byCourt.get(c.id)?.get(h) ?? null;
                  const key = `${c.id}:${h}`;
                  const busy = pending.has(key);
                  const status = slot?.status;
                  return (
                    <td key={c.id} className="p-0">
                      <button
                        type="button"
                        disabled={busy || loading || status === "booked"}
                        onClick={() => clickCell(c.id, h, { slot })}
                        title={
                          status === "booked"
                            ? "Reserva real — não editável"
                            : slot
                              ? `${status === "available" ? "Disponível" : "Bloqueado"}${slot.price_cents != null ? ` · ${priceShort(slot.price_cents)}` : ""}${slot.block_reason ? ` · ${slot.block_reason}` : ""}`
                              : "Sem horário — clique para criar como disponível"
                        }
                        className={cn(
                          "flex h-11 w-full min-w-[84px] items-center justify-center gap-1 rounded-md border text-[10.5px] font-600 transition-colors sm:h-9 sm:min-w-0",
                          busy && "opacity-50",
                          status === "available" &&
                            "border-[var(--color-success)]/35 bg-[var(--color-success-bg)] text-[var(--color-success)] hover:opacity-80",
                          status === "blocked" &&
                            "border-[var(--color-clay)]/35 bg-[var(--color-warning-bg)] text-[var(--color-clay)] hover:opacity-80",
                          status === "booked" &&
                            "cursor-not-allowed border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]",
                          !slot &&
                            "border-dashed border-[var(--border)] text-[var(--text-tertiary)]/60 hover:border-[var(--color-success)]/50 hover:text-[var(--color-success)]"
                        )}
                      >
                        {status === "booked" && <Lock size={10} />}
                        {status === "booked"
                          ? "Reservado"
                          : status === "available"
                            ? priceShort(slot?.price_cents ?? null) || "Livre"
                            : status === "blocked"
                              ? "Bloq."
                              : "—"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-[10.5px] font-500 text-[var(--text-tertiary)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-[var(--color-success)]/40 bg-[var(--color-success-bg)]" />
          Disponível
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-[var(--color-clay)]/40 bg-[var(--color-warning-bg)]" />
          Bloqueado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-[var(--primary)]/40 bg-[var(--primary)]/10" />
          Reservado (travado)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-[var(--border-strong)]" />
          Sem horário
        </span>
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-error)]">
          <AlertCircle size={13} className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </section>
  );
}
