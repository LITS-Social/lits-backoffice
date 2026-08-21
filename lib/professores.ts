import "server-only";
import { TOKEN_MISSING, errorFrom, landingAuthHeaders, landingBaseUrl } from "./landing-admin";

/**
 * Cliente do cadastro de professores embaixadores (painel #16).
 *
 * Mesma arquitetura da lista de espera e pelo mesmo motivo: o cadastro nasce
 * no formulário de `lits.social/professores` e vive no Cloudflare D1
 * `lits-landing`, não no Postgres do produto. O painel lê na fonte, por
 * `LitsLandingPage/functions/api/admin/professores.ts`.
 *
 * É PII e é LEITURA: sem token, ou com a chamada falhando, isto devolve erro —
 * nunca uma lista vazia, que o painel desenharia como "nenhum professor se
 * cadastrou".
 */

/** Uma linha de `professores` no D1. Espelha o SELECT da Pages Function. */
export interface ProfessorRow {
  id: number;
  nome: string;
  email: string;
  whatsapp: string;
  /** Clubes onde dá aula. A Function já entrega parseado (no banco é JSON em TEXT). */
  clubes: string[];
  origem: string;
  ip_country: string | null;
  /** Segundos epoch. */
  created_at: number;
  /** Segundos epoch; null enquanto ninguém marcou "já chamei". */
  called_at: number | null;
  /** E-mail de quem marcou; null junto com called_at. */
  called_by: string | null;
}

export type ProfessoresResult =
  | { ok: true; rows: ProfessorRow[]; truncated: boolean }
  | { ok: false; error: string };

export type MarkProfessorResult =
  | { ok: true; calledAt: number | null; calledBy: string | null }
  | { ok: false; error: string };

/**
 * Normaliza `clubes` vindo da rede.
 *
 * A Function já devolve array, mas isto é fronteira de processo: se um dia ela
 * mudar (ou uma versão antiga estiver no ar durante um deploy), a tela não
 * pode quebrar num `.map` de string. Valor inesperado vira lista vazia, e a
 * linha continua aparecendo — o professor existe mesmo que o clube não abra.
 */
function clubesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((c): c is string => typeof c === "string");
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((c): c is string => typeof c === "string");
    } catch {
      /* TEXT cru: melhor mostrar do que sumir */
    }
    return [value];
  }
  return [];
}

/**
 * A lista, opcionalmente recortada por período de cadastro.
 *
 * Como no #15, o painel carrega tudo e filtra no cliente — filtro e contagem
 * só dizem a verdade sobre o conjunto inteiro. `from`/`to` (segundos epoch)
 * existem para quando a lista crescer.
 */
export async function fetchProfessores(opts?: {
  from?: number;
  to?: number;
  limit?: number;
}): Promise<ProfessoresResult> {
  const headers = landingAuthHeaders();
  if (!headers) return { ok: false, error: TOKEN_MISSING };

  const url = new URL("/api/admin/professores", landingBaseUrl());
  if (opts?.from !== undefined) url.searchParams.set("from", String(opts.from));
  if (opts?.to !== undefined) url.searchParams.set("to", String(opts.to));
  if (opts?.limit !== undefined) url.searchParams.set("limit", String(opts.limit));

  let res: Response;
  try {
    res = await fetch(url, { headers, cache: "no-store" });
  } catch {
    return { ok: false, error: "Não foi possível falar com a base de professores." };
  }

  if (!res.ok) {
    return { ok: false, error: await errorFrom(res, "Falha ao carregar os professores.") };
  }

  try {
    const body = (await res.json()) as { items?: unknown[]; truncated?: boolean };
    const rows = (body.items ?? []).map((raw) => {
      const r = raw as ProfessorRow;
      return { ...r, clubes: clubesOf((raw as { clubes?: unknown }).clubes) };
    });
    return { ok: true, rows, truncated: body.truncated === true };
  } catch {
    return { ok: false, error: "Resposta inválida da base de professores." };
  }
}

/** Marca (ou desmarca) um professor como já chamado, atribuído a `staffEmail`. */
export type LiberarResult =
  | { ok: true; ate: number }
  | { ok: false; error: string };

/**
 * Abre a janela de primeiro acesso: por algumas horas, o e-mail daquele
 * professor sozinho entra no painel — e só até ele criar a senha lá dentro.
 *
 * Substitui a senha provisória por WhatsApp, que fica no histórico da
 * conversa e quase nunca é trocada. O e-mail sozinho não abre nada por conta
 * própria: a Function exige esta liberação, a janela viva e a conta ainda sem
 * senha, as três juntas (o raciocínio está em `migrations/0014` da landing).
 *
 * Quem liberou fica gravado, e por isso a identidade é obrigatória aqui — sem
 * ela, "quem abriu o painel do fulano?" fica sem resposta.
 */
export async function liberarPrimeiroAcesso(
  id: number,
  staffEmail: string | null
): Promise<LiberarResult> {
  const headers = landingAuthHeaders(staffEmail);
  if (!headers) return { ok: false, error: TOKEN_MISSING };
  if (!staffEmail) {
    return {
      ok: false,
      error: "Não foi possível identificar quem está liberando — recarregue a página e entre de novo.",
    };
  }

  let res: Response;
  try {
    res = await fetch(new URL("/api/admin/professor-liberar", landingBaseUrl()), {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ id }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "não deu para falar com a landing agora." };
  }

  if (!res.ok) {
    return { ok: false, error: await errorFrom(res, "a landing recusou a liberação") };
  }
  try {
    const body = (await res.json()) as { primeiro_acesso_ate?: unknown };
    const ate = typeof body.primeiro_acesso_ate === "number" ? body.primeiro_acesso_ate : 0;
    return { ok: true, ate };
  } catch {
    return { ok: true, ate: 0 };
  }
}

export async function markProfessorCalled(
  id: number,
  called: boolean,
  staffEmail: string | null
): Promise<MarkProfessorResult> {
  const headers = landingAuthHeaders(staffEmail);
  if (!headers) return { ok: false, error: TOKEN_MISSING };
  if (called && !staffEmail) {
    // O check só vale se registrar QUEM chamou — sem identidade seria um
    // booleano anônimo, e a pergunta que aparece depois ("quem falou com esse
    // professor?") ficaria sem resposta.
    return {
      ok: false,
      error: "Não foi possível identificar quem está marcando — recarregue a página e entre de novo.",
    };
  }

  let res: Response;
  try {
    res = await fetch(new URL("/api/admin/professores", landingBaseUrl()), {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ id, called }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Não foi possível falar com a base de professores." };
  }

  if (!res.ok) {
    return { ok: false, error: await errorFrom(res, "Falha ao marcar.") };
  }

  try {
    const body = (await res.json()) as { called_at?: number | null; called_by?: string | null };
    return { ok: true, calledAt: body.called_at ?? null, calledBy: body.called_by ?? null };
  } catch {
    return { ok: false, error: "Resposta inválida da base de professores." };
  }
}
