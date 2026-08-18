"use server";

import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

export type DayBooking = components["schemas"]["DayBookingItem"];

export type DayResult =
  | {
      ok: true;
      date: string;
      bookings: DayBooking[];
      total: number;
      paidCents: number;
      pendingCents: number;
      freeCount: number;
    }
  | { ok: false; error: string };

const LIMIT = 500;

/**
 * Um dia do extrato. `date` vazio deixa o SERVIDOR decidir que dia é hoje —
 * ele conhece o fuso de São Paulo e o navegador do operador pode não estar
 * nele. É o que faz "quando virar o dia, muda pro dia vigente" ser verdade sem
 * o cliente calcular nada.
 */
export async function fetchDayAction(date?: string): Promise<DayResult> {
  try {
    const api = await getApi();
    const { data, error, response } = await api.GET("/v1/ops/day-bookings", {
      params: { query: { date: date || undefined, limit: LIMIT, offset: 0 } },
    });
    if (error || !data) {
      return {
        ok: false,
        error: error?.detail || error?.title || `O servidor respondeu ${response.status}.`,
      };
    }
    return {
      ok: true,
      date: data.date,
      bookings: data.bookings ?? [],
      total: data.total ?? 0,
      paidCents: data.paid_cents ?? 0,
      pendingCents: data.pending_cents ?? 0,
      freeCount: data.free_count ?? 0,
    };
  } catch {
    // openapi-fetch devolve `error` para resposta HTTP ruim mas LANÇA quando o
    // fetch em si morre. Sem este catch a action rejeita e a tela trava no
    // "carregando" para sempre.
    return { ok: false, error: "O servidor não respondeu." };
  }
}
