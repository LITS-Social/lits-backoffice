"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const URGENT_MS = 30 * 60_000;

/**
 * The live 2h invite window, ticking.
 *
 * This is the one number on the whole console the founder acts on in the moment
 * — he reads it and opens WhatsApp — so it is set as an editorial numeral, in
 * the serif, tabular, at a size you can read standing up.
 *
 * Colour follows the console's law: an expiring invite is urgent but it is not a
 * debt and it is not moderation, so it gets CLAY, never red. Red on this panel
 * belongs exclusively to the unpaid legs in the "Pagou?" column, and it stays
 * legible precisely because nothing else here competes for it.
 *
 * Expired is deliberately quiet rather than loud: the window is gone, there is
 * nothing left to sprint at. It reads as closed, not as an alarm.
 *
 * Reading the clock during render (formatCountdown calls Date.now internally) is
 * impure and would desync server and client HTML, so state starts null and is
 * only ever written from the effect, client-side, after mount.
 */
export function CountdownTimer({ expiresAt }: { expiresAt: string | Date }) {
  // A primitive (not a Date instance) so it is stable across re-renders with the
  // same input, and safe in the effect's dependency array.
  const expiresAtMs = (typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt).getTime();

  const [countdown, setCountdown] = useState<string | null>(null);
  const [state, setState] = useState<"expired" | "urgent" | "open">("open");

  useEffect(() => {
    function tick() {
      const remaining = expiresAtMs - Date.now();
      setCountdown(formatCountdown(new Date(expiresAtMs)));
      setState(remaining <= 0 ? "expired" : remaining < URGENT_MS ? "urgent" : "open");
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAtMs]);

  if (countdown === null) {
    // Pre-mount. A dash, not a fake "2h 00min" — we do not know the time yet.
    return <span className="numeral text-[15px] text-[var(--text-tertiary)]">—</span>;
  }

  if (state === "expired") {
    return (
      <span className="label-colus text-[9px] leading-none text-[var(--text-tertiary)]">
        Expirado
      </span>
    );
  }

  return (
    <span
      className={cn(
        "numeral whitespace-nowrap text-[16px]",
        state === "urgent" ? "text-[var(--color-clay)]" : "text-[var(--text-secondary)]"
      )}
    >
      {countdown}
    </span>
  );
}
