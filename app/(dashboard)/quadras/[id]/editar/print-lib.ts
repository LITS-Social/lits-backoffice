import type { AddSlotInput, PrintBlock, PrintKind } from "./actions";

/**
 * Shared slot-building logic for the print import — used by the per-court
 * editor and by the academia page, which applies one print to every court at
 * once. Pure functions only: both callers are client components with their own
 * review UI; nothing here talks to the network.
 */

export const SP_OFFSET = "-03:00"; // same wall-clock anchor as edit-court.tsx

export function spStartMs(ymd: string, hm: string): number {
  return new Date(`${ymd}T${hm}:00${SP_OFFSET}`).getTime();
}

/** "HH:MM" → minutes since midnight; accepts "24:00" as end-of-day. */
export function toMin(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 24 * 60 ? v : null;
}

export function minToHm(min: number): string {
  return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export const validYmd = (y: string) => /^\d{4}-\d{2}-\d{2}$/.test(y);

/** "2026-07-24" → "sex 24/07" — how a block announces its own day on the chip. */
export function blockDayLabel(ymd: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  })
    .format(new Date(`${ymd}T12:00:00`))
    .replace(".", "");
}

/** Loose name match: shared normalized tokens between print column and court. */
export function matchScore(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  const ta = new Set(norm(a));
  return norm(b).filter((t) => ta.has(t)).length;
}

/** The panel's default generation window: hourly starts 06:00 through 22:00
    inclusive (CreateCourtBody's end_hour is last-start-inclusive, default 22).
    In "available" mode this is the day that gets blocked around the offers;
    in "occupied" mode with "completar o dia" it is the day that gets filled
    as available around the blocks. */
export const WINDOW_START_MIN = 6 * 60;
export const WINDOW_LAST_START_MIN = 22 * 60;

export type PrintWindow = { startMin: number; lastStartMin: number };

const defaultWindow = (): PrintWindow => ({
  startMin: WINDOW_START_MIN,
  lastStartMin: WINDOW_LAST_START_MIN,
});

/**
 * Turn the checked blocks of one print column into the slot writes for one
 * court. Occupied mode: blocks slice into hourly BLOCKED slots; with `fillDay`
 * every other window hour of each touched day goes in as available. Available
 * mode: for every touched day the whole window becomes hourly slots — offered
 * hours available, the rest blocked (an explicit offer outside the window still
 * sells). `windowFor` lets the academia page use its operating hours per day.
 */
export function buildPrintSlots(opts: {
  kind: PrintKind;
  blocks: PrintBlock[];
  checked: Set<number>;
  fallbackDate: string;
  fillDay: boolean;
  windowFor?: (ymd: string) => PrintWindow;
}): AddSlotInput[] {
  const { kind, blocks, checked, fallbackDate, fillDay } = opts;
  const windowFor = opts.windowFor ?? defaultWindow;
  const slots: AddSlotInput[] = [];

  if (kind === "occupied") {
    // Occupied blocks arrive as ranges; the grid sells hourly slots, so each
    // block is sliced at the top of the hour (a 90-minute tail keeps its
    // remainder). Everything imports as BLOCKED — the print shows what the
    // club already sold, which is exactly what LITS must stop offering.
    const occupiedByDay = new Map<string, { start: number; end: number }[]>();
    for (const [i, block] of blocks.entries()) {
      if (!checked.has(i)) continue;
      const ymd = validYmd(block.date) ? block.date : fallbackDate;
      const start = toMin(block.start);
      const end = toMin(block.end === "00:00" ? "24:00" : block.end);
      if (start == null || end == null || end <= start) continue;
      occupiedByDay.set(ymd, [...(occupiedByDay.get(ymd) ?? []), { start, end }]);
      for (let t = start; t < end; t += 60) {
        const sliceEnd = Math.min(t + 60, end);
        const startMs = spStartMs(ymd, minToHm(t));
        slots.push({
          slot_start: new Date(startMs).toISOString(),
          slot_end: new Date(startMs + (sliceEnd - t) * 60_000).toISOString(),
          status: "blocked",
        });
      }
    }
    // "Completar o dia": every window hour the print does NOT mark occupied
    // goes in as available, so the grid mirrors the club — bloqueado onde
    // ocupado, disponível no resto. Price stays unset (franchise default).
    if (fillDay) {
      for (const [ymd, ranges] of occupiedByDay) {
        const w = windowFor(ymd);
        for (let t = w.startMin; t <= w.lastStartMin; t += 60) {
          if (ranges.some((r) => r.start < t + 60 && r.end > t)) continue;
          const startMs = spStartMs(ymd, minToHm(t));
          slots.push({
            slot_start: new Date(startMs).toISOString(),
            slot_end: new Date(startMs + 3_600_000).toISOString(),
            status: "available",
          });
        }
      }
    }
    return slots;
  }

  // Available mode: the club vouched only for what it listed. For every
  // date with a checked offer, the whole generation window becomes hourly
  // slots — offered hours sell as available, every other hour is blocked.
  // Unchecking an offer simply drops it into the blocked rest.
  const byDate = new Map<string, { start: number; end: number }[]>();
  for (const [i, block] of blocks.entries()) {
    if (!checked.has(i)) continue;
    const ymd = validYmd(block.date) ? block.date : fallbackDate;
    const start = toMin(block.start);
    const end = toMin(block.end === "00:00" ? "24:00" : block.end);
    if (start == null || end == null || end <= start) continue;
    const list = byDate.get(ymd);
    if (list) list.push({ start, end });
    else byDate.set(ymd, [{ start, end }]);
  }
  for (const [ymd, intervals] of byDate) {
    // Union of the offers, so adjacent blocks cover a spanning hour.
    const merged = [...intervals]
      .sort((a, b) => a.start - b.start)
      .reduce<{ start: number; end: number }[]>((acc, cur) => {
        const last = acc[acc.length - 1];
        if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
        else acc.push({ ...cur });
        return acc;
      }, []);
    const offered = (t: number) => merged.some((m) => m.start <= t && t + 60 <= m.end);
    // The window's hours, plus offered hours outside it (an explicit late
    // offer still sells; hours the club never mentioned are never touched).
    const w = windowFor(ymd);
    const hours = new Set<number>();
    for (let t = w.startMin; t <= w.lastStartMin; t += 60) hours.add(t);
    for (const m of merged) {
      for (let t = Math.ceil(m.start / 60) * 60; t + 60 <= m.end; t += 60) hours.add(t);
    }
    for (const t of [...hours].sort((a, b) => a - b)) {
      const startMs = spStartMs(ymd, minToHm(t));
      slots.push({
        slot_start: new Date(startMs).toISOString(),
        slot_end: new Date(startMs + 60 * 60_000).toISOString(),
        status: offered(t) ? "available" : "blocked",
      });
    }
  }
  return slots;
}
