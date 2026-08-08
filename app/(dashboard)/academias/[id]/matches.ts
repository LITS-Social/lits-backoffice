import "server-only";
import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

export type FinishedMatch = components["schemas"]["FinishedMatchItem"];

/** Quantas partidas varrer atrás das desta academia. O endpoint não filtra por
    quadra, então a varredura é do topo da lista global; no beta a base inteira
    cabe folgada aqui. `truncated` avisa quando não coube. */
const SCAN_LIMIT = 300;

export type AcademiaMatches = {
  matches: FinishedMatch[];
  /** A varredura bateu o teto — pode haver partidas mais antigas fora da lista. */
  truncated: boolean;
  /** O BFF respondeu, mas sem `court_id` nos itens: é a versão antiga, e sem o
      id não dá para dizer de qual academia é a partida ("Quadra 1" existe em
      toda academia). Melhor dizer isso do que atribuir partida errada. */
  needsDeploy: boolean;
  failed: boolean;
};

/**
 * As partidas jogadas nas quadras desta academia, mais recente primeiro.
 *
 * Filtra por `court_id` e nunca por nome: `court_label` é só o nome da quadra,
 * e nomes genéricos ("Quadra 1") se repetem entre academias — casar por nome
 * mostraria partida de outro clube como se fosse desta.
 */
export async function getAcademiaMatches(courtIds: string[]): Promise<AcademiaMatches> {
  const empty = { matches: [], truncated: false, needsDeploy: false, failed: false };
  if (courtIds.length === 0) return empty;

  const api = await getApi();
  // try/catch e não só `error`: openapi-fetch devolve `error` para resposta HTTP
  // ruim, mas LANÇA quando o fetch em si morre (timeout, conexão derrubada).
  // Logo depois de reescrever a grade inteira o BFF fica lento, e sem isto uma
  // busca de partidas que estourou levava a PÁGINA junto — o operador via
  // "não deu para ler este painel" e perdia o que tinha acabado de salvar de
  // vista. Regra da casa: um endpoint quebrado apaga um bloco, não a tela.
  let data;
  try {
    const res = await api.GET("/v1/ops/finished-matches", {
      params: { query: { limit: SCAN_LIMIT, offset: 0 } },
    });
    if (res.error) return { ...empty, failed: true };
    data = res.data;
  } catch {
    return { ...empty, failed: true };
  }

  const all = data.matches ?? [];
  if (all.length > 0 && all.every((m) => !m.court_id)) {
    return { ...empty, needsDeploy: true };
  }

  const mine = new Set(courtIds);
  return {
    matches: all.filter((m) => m.court_id && mine.has(m.court_id)),
    truncated: all.length >= SCAN_LIMIT,
    needsDeploy: false,
    failed: false,
  };
}
