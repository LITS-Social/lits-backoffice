"use server";

import { revalidatePath } from "next/cache";
import { getApi } from "@/lib/api";

export type CancelBookingResult =
  | { ok: true; refundedCents: number; currency?: string; refundedLegs: number }
  | { ok: false; error: string };

/**
 * Cancelamento pela ops, com ESTORNO INTEGRAL.
 *
 * Vive em `_actions/` e não dentro de um painel porque dois chamam o mesmo
 * botão: #10 (Reservas Pagas) e #06 (Pagamentos). Duplicar a ação por painel é
 * como as duas telas passam a divergir na regra de dinheiro.
 *
 * O backend devolve TUDO a quem pagou, ignorando de propósito a janela de
 * reembolso do app (100% com antecedência, 0% fora dela): quando quem cancela é
 * a ops, a culpa não é do jogador. A decisão é do founder (16/08) e mora no
 * booking-service — aqui não há regra de dinheiro nenhuma, e não deve haver.
 *
 * O ator do staff NÃO viaja no corpo: o BFF lê da sessão verificada do
 * Cloudflare Access. Campo que o chamador preenche serve pra auditoria, nunca
 * pra dizer quem ele é.
 */
export async function cancelBookingAction({
  bookingId,
  reason,
  revalidate,
}: {
  bookingId: string;
  reason: string;
  /** Rota a revalidar — o painel que chamou. Sem isto a linha cancelada continua na tela. */
  revalidate?: string;
}): Promise<CancelBookingResult> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    // Espelha o minLength do contrato. Barrar aqui evita uma ida ao servidor
    // pra receber 422 — e cancelamento sem motivo é impossível de auditar
    // depois, num caminho que mexe em dinheiro de terceiro.
    return { ok: false, error: "Escreva o motivo do cancelamento (mínimo 3 caracteres)." };
  }

  const api = await getApi();
  const { data, error } = await api.POST("/v1/ops/bookings/{booking_id}/cancel", {
    params: { path: { booking_id: bookingId } },
    body: { reason: trimmed },
  });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao cancelar a reserva." };
  }

  if (revalidate) revalidatePath(revalidate);

  return {
    ok: true,
    refundedCents: data.refunded_cents ?? 0,
    currency: data.currency,
    refundedLegs: data.refunded_legs ?? 0,
  };
}
