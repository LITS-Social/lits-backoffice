import "server-only";

/**
 * Repete um GET que tropeçou, e devolve uma mensagem que dá para consertar.
 *
 * Duas coisas que faltavam nas listas do painel:
 *
 * 1. Uma resposta ruim apagava a tela inteira. As listas de quadras e de
 *    academias sustentam TODA página de gestão, e um 502 que passa em meio
 *    segundo derrubava tudo. GET é idempotente — insistir é barato e certo.
 *
 * 2. Quando o servidor não explicava o erro, sobrava um texto pelado ("Falha
 *    ao listar quadras") que não diz se caiu o login (401), se o serviço
 *    morreu (502) ou se estourou o tempo (504). O status entra na mensagem
 *    sempre que o corpo não trouxer nada melhor.
 *
 * 4xx não volta a funcionar por repetição — o pedido é que está errado, ou a
 * sessão caiu. Só 5xx ganha outra chance.
 *
 * 429 NÃO se repete, por mais tentador que pareça. O BFF conta 600 requisições
 * por minuto por pessoa numa janela fixa, e o contador sobe A CADA requisição,
 * inclusive nas que ele mesmo rejeita: insistir cava o buraco mais fundo e
 * ainda atrasa a hora em que a janela abre. O certo é dizer quanto falta.
 *
 * A pegadinha: o Next MEMOIZA fetches GET idênticos dentro do mesmo render.
 * Repetir a mesma chamada devolvia a resposta 502 guardada em memória, sem
 * tocar na rede — o retry rodava três vezes e o servidor via uma. Por isso
 * cada tentativa manda um cabeçalho próprio: ele entra na chave da
 * memoização e obriga a ida de verdade. (Medido: com o servidor falhando as
 * duas primeiras chamadas, o log ia de UMA chamada por render para três.)
 */

type ApiResult<T> = {
  data?: T;
  error?: { detail?: string; title?: string };
  response: Response;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getWithRetry<T>(
  /** Recebe o número da tentativa: repasse-o em `headers` para escapar da
      memoização do Next (veja acima). */
  call: (attempt: number) => Promise<ApiResult<T>>,
  /** Como chamar o serviço na mensagem de erro: "de quadras", "de academias". */
  what: string,
  attempts = 3
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let lastError = "";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const { data, error, response } = await call(attempt);
      if (!error && data !== undefined) return { ok: true, data };

      if (response.status === 429) {
        const after = Number(response.headers.get("Retry-After") || 60);
        return {
          ok: false,
          error: `Limite de requisições do servidor ${what} atingido. Espere ${after}s e recarregue — nada foi perdido.`,
        };
      }

      const detail = error?.detail || error?.title || "";
      lastError = detail || `O servidor ${what} respondeu ${response.status}.`;

      if (response.status < 500 || attempt === attempts) break;
    } catch {
      // openapi-fetch devolve `error` para resposta HTTP ruim, mas LANÇA
      // quando o fetch em si morre (timeout, conexão derrubada).
      lastError = `O servidor ${what} não respondeu.`;
      if (attempt === attempts) break;
    }
    await wait(300 * attempt);
  }

  return { ok: false, error: `${lastError} Tente de novo.` };
}
