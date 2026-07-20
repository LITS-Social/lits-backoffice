import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Relative time, both directions: "há 2min", "há 3h", "há 5 dias" for the past,
 * "em 2min", "em 3h", "em 5 dias" for the future. Ops panels show both past
 * events (cancelled_at, resolved_at) and future ones (starts_at on upcoming
 * matches), so the direction has to be a first-class part of the output, not
 * just a trailing "atrás" that silently collapses to "agora" for anything not
 * yet in the past.
 */
export function formatRelative(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const future = diffMs > 0;
  const abs = Math.abs(diffMs);
  const diffMin = Math.floor(abs / 60000);
  const diffH = Math.floor(abs / 3600000);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return "agora";
  if (diffMin < 60) return future ? `em ${diffMin}min` : `há ${diffMin}min`;
  if (diffH < 24) return future ? `em ${diffH}h` : `há ${diffH}h`;
  return future ? `em ${diffD} dia${diffD === 1 ? "" : "s"}` : `há ${diffD} dia${diffD === 1 ? "" : "s"}`;
}

/**
 * BRL currency formatting from integer centavos, e.g. 12000 -> "R$ 120,00".
 * Every ops amount comes off the wire as centavos (booking total_cents /
 * amount_cents) — dividing by 100 and hand-formatting invites off-by-one cent
 * rounding bugs that Intl's currency formatter already solves correctly.
 */
export function formatCurrency(cents: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function formatCountdown(targetDate: Date): string {
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  if (diffMs <= 0) return "Expirado";
  const diffMin = Math.floor(diffMs / 60000);
  const diffSec = Math.floor((diffMs % 60000) / 1000);
  if (diffMin >= 60) return `${Math.floor(diffMin / 60)}h ${diffMin % 60}min`;
  return `${diffMin}min ${diffSec}s`;
}

/**
 * Parse a BRL reais string typed by staff into integer centavos. Handles the
 * pt-BR convention where "." is the thousands separator and "," the decimal:
 *   "220" -> 22000, "220,50" -> 22050, "220.50" -> 22050 (US decimal),
 *   "1.500" -> 150000, "1.500,00" -> 150000, "1.234.567" -> 123456700.
 * The rightmost separator counts as decimal only when it is followed by 1-2
 * digits; otherwise every separator is treated as a thousands group. Empty/blank
 * or non-numeric input returns null so callers can omit the field entirely and
 * let the backend fall back to its default pricing. Rounds to the nearest cent.
 */
export function reaisToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[^\d.,-]/g, "")
  if (cleaned === "" || cleaned === "-") return null
  const lastSep = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."))
  let normalized: string
  if (lastSep === -1) {
    normalized = cleaned
  } else {
    const decimals = cleaned.length - lastSep - 1
    const intPart = cleaned.slice(0, lastSep).replace(/[.,]/g, "")
    const fracPart = cleaned.slice(lastSep + 1)
    // 1-2 trailing digits => decimal separator; anything else => thousands group.
    normalized = decimals >= 1 && decimals <= 2 ? `${intPart}.${fracPart}` : intPart + fracPart
  }
  const reais = Number(normalized)
  if (!Number.isFinite(reais) || reais < 0) return null
  return Math.round(reais * 100)
}
