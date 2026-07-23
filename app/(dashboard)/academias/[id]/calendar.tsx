"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Lock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourtListItem } from "../../quadras/actions";
import type { CourtSlotItem } from "../../quadras/[id]/editar/actions";
import {
  addCourtSlotsAction,
  listCourtSlotsAction,
  updateCourtSlotAction,
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
    <section className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="eyebrow">Calendário das quadras</h2>
          <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
            Todas as quadras lado a lado, como numa planilha. Clique numa célula para alternar{" "}
            <strong>disponível ↔ bloqueado</strong>; célula vazia vira disponível. Horários com
            reserva real ficam travados.
          </p>
        </div>
        <div className="flex items-end gap-2">
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
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-[64px]" />
              {courts.map((c) => (
                <th
                  key={c.id}
                  className="rounded-md bg-[var(--surface-raised)] px-2 py-2 text-center text-[11px] font-600 text-[var(--text-secondary)]"
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h}>
                <td className="pr-2 text-right text-[11px] font-500 tabular-nums text-[var(--text-tertiary)]">
                  {String(h).padStart(2, "0")}:00
                </td>
                {courts.map((c) => {
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
                          "flex h-9 w-full items-center justify-center gap-1 rounded-md border text-[10.5px] font-600 transition-colors",
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
