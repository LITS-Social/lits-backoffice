"use client";

import { Check, X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

export type PaymentLeg = {
  paid: boolean;
  amount_cents: number;
  currency?: string;
};

/**
 * Who has paid their half, at a glance.
 *
 * LITS splits a booking: the host settles their share, the guest settles theirs,
 * and the court is only really paid for when both have. The founder's question,
 * standing at the club, is "quem ainda não pagou?" — so this answers it per
 * person instead of making him decode a single booking-level status.
 *
 * A FREE booking (public court, price 0) is the case worth getting right: nobody
 * paid and nobody owes. Rendering a red ✗ there would send someone chasing a debt
 * that does not exist, so `priceCents === 0` renders as "grátis" and stops.
 */
export function PaymentLegs({
  priceCents,
  host,
  guest,
  hasGuest,
  guestAwaitingAccept = false,
}: {
  priceCents: number;
  host: PaymentLeg;
  guest?: PaymentLeg;
  hasGuest: boolean;
  /**
   * The guest has been invited but has NOT ACCEPTED YET (booking is in
   * awaiting_guest_accept). Set it on panel #03, where it is true of every row.
   *
   * Why it needs to exist: booking-service only lets a guest pay from
   * awaiting_guest_PAYMENT, which is the status AFTER accepting. So on an
   * unaccepted invite `guest.paid` is false BY CONSTRUCTION — not because the
   * guest owes money and is dodging it, but because nobody has asked him for any.
   * Rendering the red "✗ Conv." there fired the loudest colour in the console on
   * 100% of the rows /convites can ever show, which is the exact failure the
   * colour law names: an alert that fires on healthy rows is an alert nobody
   * reads. Red stays reserved for a guest who accepted and THEN failed to pay.
   */
  guestAwaitingAccept?: boolean;
}) {
  if (priceCents === 0) {
    return <span className="text-[11px] text-[var(--text-tertiary)]">grátis</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <Leg label="Host" paid={host.paid} />
      {!hasGuest ? (
        // No guest yet is a different state from an unpaid guest: nobody has been
        // asked for money, so nobody is late. Say that, don't imply a debt.
        <span className="whitespace-nowrap text-[10px] text-[var(--text-tertiary)]">
          sem convidado
        </span>
      ) : guestAwaitingAccept && !guest?.paid ? (
        // Invited, not yet accepted → no debt exists. Neutral, and it says which
        // state it is instead of leaving a silence for the eye to fill in.
        <span
          title="O convidado ainda não aceitou — só pode pagar depois de aceitar"
          className="whitespace-nowrap text-[10px] text-[var(--text-tertiary)]"
        >
          aguardando aceite
        </span>
      ) : (
        <Leg label="Conv." paid={guest?.paid ?? false} />
      )}
    </div>
  );
}

/**
 * An unpaid leg is money owed, so it gets the red — this is exactly what red is
 * reserved for. A paid leg is deliberately quiet: it is the healthy state, and a
 * table where every row glows green is as unreadable as one where every row glows
 * red. The eye should land only on the ✗.
 */
function Leg({ label, paid }: { label: string; paid: boolean }) {
  return (
    <span
      title={paid ? `${label}: pago` : `${label}: não pagou`}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-[3px] text-[10px] font-600 leading-none",
        paid
          ? "bg-transparent text-[var(--text-tertiary)]"
          : "bg-[var(--color-error-bg)] text-[var(--color-error)]"
      )}
    >
      {paid ? <Check size={9} strokeWidth={3} /> : <X size={9} strokeWidth={3} />}
      {label}
    </span>
  );
}

/*
 * MatchAlerts (the #01 "Aviso" badges) lived here and has been REMOVED.
 *
 * Every alert it could render — host_unpaid, guest_unpaid, no_guest,
 * starting_soon — restated a fact the same row already showed in a dedicated
 * column, and it restated it in the loudest styling on the page. `starting_soon`
 * fired on 78% of rows. See the note where the column used to be, in
 * app/(dashboard)/partidas-aguardando/table.tsx.
 *
 * The BFF still emits `alerts`; if a genuinely novel one ever appears (something
 * no column can say), reintroduce a renderer for THAT — not for the whole vocab.
 */

export function Price({ cents, currency }: { cents: number; currency?: string }) {
  if (cents === 0) {
    return <span className="text-[var(--text-tertiary)]">grátis</span>;
  }
  return <span className="tabular-nums">{formatCurrency(cents, currency ?? "BRL")}</span>;
}
