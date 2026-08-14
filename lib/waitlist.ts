import "server-only";
import { TOKEN_MISSING, errorFrom, landingAuthHeaders, landingBaseUrl } from "./landing-admin";

/**
 * Cliente da lista de espera (painel #15).
 *
 * A waitlist NÃO está no Postgres do produto: ela nasce no formulário da
 * landing e vive num Cloudflare D1 (`lits-landing`), a base que a própria
 * landing tem bindada. Em vez de copiar isso para o Postgres — duas verdades e
 * uma janela de divergência —, o painel lê na fonte, por uma Pages Function
 * autenticada em `LitsLandingPage/functions/api/admin/waitlist.ts`.
 *
 * Host, token e tratamento de erro vêm de `lib/landing-admin` — compartilhados
 * com o painel #16 (Professores), que lê pelo mesmo canal.
 *
 * Mesma forma do `pushRiSnapshot` (lib/ri-sync.ts), com uma diferença que
 * importa: aquele é fire-and-forget porque manda agregado e perder um snapshot
 * não mente para ninguém. Aqui é PII e é LEITURA — sem token, ou com a chamada
 * falhando, isto devolve erro. Nunca uma lista vazia, que o painel desenharia
 * como "não tem ninguém na lista de espera".
 */

/** Uma linha de `waitlist` no D1. Espelha o SELECT da Pages Function. */
export interface WaitlistRow {
  id: number;
  name: string;
  email: string;
  whatsapp: string;
  instagram: string | null;
  club: string;
  region: string | null;
  court: string | null;
  /** Colunas do schema 0001, anteriores ao formulário atual — nulas nas inscrições novas. */
  city: string | null;
  state: string | null;
  locale: string;
  source: string;
  ip_country: string | null;
  /** Segundos epoch. */
  created_at: number;
  /** Segundos epoch; null enquanto ninguém marcou "já chamei". */
  called_at: number | null;
  /** E-mail de quem marcou; null junto com called_at. */
  called_by: string | null;
}

export type WaitlistResult =
  | { ok: true; rows: WaitlistRow[]; truncated: boolean }
  | { ok: false; error: string };

export type MarkResult =
  | { ok: true; calledAt: number | null; calledBy: string | null }
  | { ok: false; error: string };

/**
 * A lista, opcionalmente recortada por período de inscrição.
 *
 * `from`/`to` são segundos epoch e batem no índice `idx_waitlist_created`. O
 * painel carrega tudo de uma vez e filtra no cliente (mesma decisão do console
 * de usuários — filtro e contagem só dizem a verdade sobre o conjunto
 * inteiro), então na prática vem sem recorte; os parâmetros existem para
 * quando a lista crescer o suficiente para valer a pena.
 */
export async function fetchWaitlist(opts?: {
  from?: number;
  to?: number;
  limit?: number;
}): Promise<WaitlistResult> {
  const headers = landingAuthHeaders();
  if (!headers) return { ok: false, error: TOKEN_MISSING };

  const url = new URL("/api/admin/waitlist", landingBaseUrl());
  if (opts?.from !== undefined) url.searchParams.set("from", String(opts.from));
  if (opts?.to !== undefined) url.searchParams.set("to", String(opts.to));
  if (opts?.limit !== undefined) url.searchParams.set("limit", String(opts.limit));

  let res: Response;
  try {
    res = await fetch(url, { headers, cache: "no-store" });
  } catch {
    return { ok: false, error: "Não foi possível falar com a base da lista de espera." };
  }

  if (!res.ok) {
    return { ok: false, error: await errorFrom(res, "Falha ao carregar a lista de espera.") };
  }

  try {
    const body = (await res.json()) as { items?: WaitlistRow[]; truncated?: boolean };
    return { ok: true, rows: body.items ?? [], truncated: body.truncated === true };
  } catch {
    return { ok: false, error: "Resposta inválida da base da lista de espera." };
  }
}

/** Marca (ou desmarca) alguém como já chamado, atribuído a `staffEmail`. */
export async function markWaitlistCalled(
  id: number,
  called: boolean,
  staffEmail: string | null
): Promise<MarkResult> {
  const headers = landingAuthHeaders(staffEmail);
  if (!headers) return { ok: false, error: TOKEN_MISSING };
  if (called && !staffEmail) {
    // O check só vale se registrar QUEM chamou; sem identidade a marcação
    // seria um booleano anônimo, que é o que foi pedido para não ser.
    return {
      ok: false,
      error: "Não foi possível identificar quem está marcando — recarregue a página e entre de novo.",
    };
  }

  let res: Response;
  try {
    res = await fetch(new URL("/api/admin/waitlist", landingBaseUrl()), {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ id, called }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Não foi possível falar com a base da lista de espera." };
  }

  if (!res.ok) {
    return { ok: false, error: await errorFrom(res, "Falha ao marcar.") };
  }

  try {
    const body = (await res.json()) as { called_at?: number | null; called_by?: string | null };
    return { ok: true, calledAt: body.called_at ?? null, calledBy: body.called_by ?? null };
  } catch {
    return { ok: false, error: "Resposta inválida da base da lista de espera." };
  }
}
