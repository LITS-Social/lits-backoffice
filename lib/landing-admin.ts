import "server-only";

/**
 * Base comum dos clientes que leem a superfície admin da landing.
 *
 * Dois painéis vivem do mesmo canal: #15 Lista de Espera e #16 Professores.
 * Nenhum dos dois está no Postgres do produto — os dois cadastros nascem em
 * formulário da landing e ficam no Cloudflare D1 `lits-landing`. Em vez de
 * copiar para o Postgres (duas verdades e uma janela de divergência), o painel
 * lê na fonte, por Pages Functions autenticadas em
 * `LitsLandingPage/functions/api/admin/*`.
 *
 * Envs no worker do backoffice:
 *   WAITLIST_API_URL      origem da landing (default https://lits.social)
 *   WAITLIST_ADMIN_TOKEN  o MESMO secret configurado no projeto Pages
 *
 * Os nomes começam com WAITLIST porque a lista de espera veio primeiro; o que
 * eles endereçam não é uma tabela, é a fronteira "backoffice fala com a
 * landing". Um segundo par de envs por painel significaria dois valores para
 * manter em dois lugares e um painel respondendo 503 porque alguém setou um e
 * esqueceu o outro. Este arquivo existe justamente para que os dois clientes
 * não possam discordar sobre host, token ou tratamento de erro.
 */

export function landingBaseUrl(): string {
  return process.env.WAITLIST_API_URL || "https://lits.social";
}

/** null quando o secret não está configurado — o chamador vira isso em erro visível. */
export function landingAuthHeaders(staffEmail?: string | null): Record<string, string> | null {
  const token = process.env.WAITLIST_ADMIN_TOKEN;
  if (!token) return null;
  return {
    authorization: `Bearer ${token}`,
    ...(staffEmail ? { "x-lits-staff-email": staffEmail } : {}),
  };
}

/** Mensagem de erro da Function, sem deixar vazar corpo cru na tela. */
export async function errorFrom(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    /* corpo não-JSON: fica o fallback */
  }
  return `${fallback} (HTTP ${res.status})`;
}

export const TOKEN_MISSING =
  "WAITLIST_ADMIN_TOKEN não está configurado neste ambiente — o painel não consegue autenticar na base da landing.";
