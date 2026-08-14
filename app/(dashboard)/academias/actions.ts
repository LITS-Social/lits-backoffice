"use server";

import { revalidatePath } from "next/cache";
import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";
import {
  academiasParaPublicar,
  publishAcademias,
  type FranchiseLike,
  type PublishResult,
} from "@/lib/landing-academias";

/* ══ o relatório que o BFF devolve ═════════════════════════════════════════ */

/**
 * Corpo de resposta de DELETE /v1/ops/franchises/{id} — o MESMO na prévia e na
 * exclusão confirmada. `deleted` é o único campo que os distingue, porque a rota
 * é registrada com `DefaultStatus: http.StatusOK` nos dois ramos: a prévia
 * também responde 200.
 *
 * Vem do OpenAPI do bff-backoffice, não escrito à mão: foi um tipo inventado à
 * mão (`courts_deleted`, campo que o servidor nunca mandou) que deixou a
 * primeira versão desta tela passar no compilador enquanto lia um corpo que não
 * existe. Depois de mexer no backend, `pnpm generate:api`.
 */
export type FranchiseDeleteReport = components["schemas"]["FranchiseDeleteResultBody"];

/** Linhas que RECUSAM a exclusão. Qualquer campo > 0 e a academia fica. */
export type FranchiseDeleteBlockers = components["schemas"]["FranchiseDeleteBlockers"];

/** O que o BANCO apaga junto com a academia (ON DELETE CASCADE). Ninguém pediu
    por isso — por isso é contado e mostrado antes. */
export type FranchiseDeleteCascade = components["schemas"]["FranchiseDeleteCascade"];

/** Linhas que SOBREVIVEM com a referência à academia limpa — por SET NULL do
    schema ou pelo próprio handler, na mesma transação. NÃO bloqueiam. */
export type FranchiseDeleteDetached = components["schemas"]["FranchiseDeleteDetached"];

/** Contagens do 409, lidas dos `errors[]` machine-readable que o BFF manda
    junto com a frase — o servidor recontou sob os locks, então elas mandam
    mais que as da prévia (uma reserva pode ter nascido no meio). */
export type BlockerCounts = {
  bookingsOnVenue: number;
  bookingsOnCourts: number;
  quickMatches: number;
};

export type FranchiseDeleteFailure = {
  ok: false;
  /** 409 — dependência recusou. NADA foi apagado. */
  blocked?: boolean;
  blockers?: BlockerCounts;
  /** 422 do guard — o slug digitado não é o da academia por trás deste id. */
  mismatch?: boolean;
  /** 404/405 — o bff-backoffice publicado ainda não expõe a rota. */
  unavailable?: boolean;
  error: string;
};

export type FranchiseDeleteState =
  | { ok: true; report: FranchiseDeleteReport }
  | FranchiseDeleteFailure;

/* ══ erro do Huma ══════════════════════════════════════════════════════════ */

type ErrorModel = components["schemas"]["ErrorModel"];

/**
 * O `error` do openapi-fetch é tipado como ErrorModel, mas em runtime ele é o
 * que deu para ler: a lib faz `response.text()` e só then tenta `JSON.parse`,
 * devolvendo a STRING crua quando falha. É exatamente o caso que interessa
 * aqui — o 405 do router e o HTML do Access não são JSON. Sem esta guarda,
 * `error.detail` num corpo de texto é `undefined` calado.
 */
function asErrorModel(error: unknown): ErrorModel | null {
  return typeof error === "object" && error !== null ? (error as ErrorModel) : null;
}

/** Mensagem legível a partir do corpo do erro — detail primeiro, que é onde o
    BFF escreve a razão; depois os errors[] do Huma. */
function humaMessage(body: ErrorModel | null): string {
  if (!body) return "";
  if (body.detail) return body.detail;
  const msgs = (body.errors ?? []).map((e) => e?.message).filter(Boolean);
  if (msgs.length > 0) return msgs.join(" · ");
  return body.title ?? "";
}

/**
 * Lê as contagens que o BFF manda como `errors[].message` no formato
 * `chave=numero` (blockerDetails em franchise_delete.go). Existem exatamente
 * para o painel não ter que interpretar a frase em inglês.
 */
function parseBlockerCounts(body: ErrorModel | null): BlockerCounts | undefined {
  const counts: BlockerCounts = { bookingsOnVenue: 0, bookingsOnCourts: 0, quickMatches: 0 };
  let found = false;
  for (const e of body?.errors ?? []) {
    const m = /^([a-z_]+)=(\d+)$/.exec((e?.message ?? "").trim());
    if (!m) continue;
    const n = Number(m[2]);
    if (m[1] === "bookings_on_venue") counts.bookingsOnVenue = n;
    else if (m[1] === "bookings_on_courts") counts.bookingsOnCourts = n;
    else if (m[1] === "quick_matches") counts.quickMatches = n;
    else continue;
    found = true;
  }
  return found ? counts : undefined;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** O 409 em português, com os números do servidor — não com os da prévia, que
    já podem estar velhos. Não é exportada de propósito: num arquivo
    `"use server"` todo export vira um endpoint de server action. */
function blockedMessage(c: BlockerCounts): string {
  const parts: string[] = [];
  if (c.bookingsOnVenue > 0)
    parts.push(plural(c.bookingsOnVenue, "reserva na academia", "reservas na academia"));
  if (c.bookingsOnCourts > 0)
    parts.push(plural(c.bookingsOnCourts, "reserva nas quadras dela", "reservas nas quadras dela"));
  if (c.quickMatches > 0)
    parts.push(plural(c.quickMatches, "partida aberta nas quadras", "partidas abertas nas quadras"));
  const total = c.bookingsOnVenue + c.bookingsOnCourts + c.quickMatches;
  return (
    `Nada foi apagado. ${parts.join(", ")} ${total === 1 ? "impede" : "impedem"} a exclusão — ` +
    "reserva é registro de dinheiro e de jogo, e nunca é apagada em cascata."
  );
}

/* ══ a chamada ═════════════════════════════════════════════════════════════ */

/**
 * DELETE /v1/ops/franchises/{id}, os dois passos.
 *
 * Sem `body` (ou com confirm_slug vazio) o servidor roda a PRÉVIA: conta tudo
 * sob os mesmos locks da exclusão, não escreve nada e volta com `deleted:false`.
 * Com confirm_slug + reason ele apaga de verdade. O `requestBody` é opcional no
 * contrato, então os dois passos cabem na mesma chamada tipada.
 */
async function callFranchiseDelete(
  id: string,
  body?: { confirm_slug: string; reason: string }
): Promise<FranchiseDeleteState> {
  const api = await getApi();

  let data: FranchiseDeleteReport | undefined;
  let error: unknown;
  let response: Response;
  try {
    ({ data, error, response } = await api.DELETE("/v1/ops/franchises/{id}", {
      params: { path: { id } },
      body,
    }));
  } catch {
    // A rede caiu, ou o 200 veio com um corpo que não é JSON — o openapi-fetch
    // dá `JSON.parse` no corpo de sucesso e deixa a exceção subir.
    return {
      ok: false,
      error:
        "Não foi possível falar com o backend, ou ele respondeu algo que não dá para ler. " +
        "Recarregue a página e confira se a academia ainda existe.",
    };
  }

  if (response.ok) {
    // 200 sem relatório não prova nada: a prévia e a exclusão respondem com o
    // mesmo status, e só o corpo diz qual das duas aconteceu.
    if (!data || typeof data.deleted !== "boolean") {
      return {
        ok: false,
        error:
          "O servidor respondeu 200 sem o relatório de exclusão — não dá para afirmar o que " +
          "aconteceu. Recarregue a página e confira se a academia ainda existe.",
      };
    }
    return { ok: true, report: data };
  }

  const errBody = asErrorModel(error);
  const detail = humaMessage(errBody);

  if (response.status === 409) {
    const counts = parseBlockerCounts(errBody);
    return {
      ok: false,
      blocked: true,
      blockers: counts,
      error: counts
        ? blockedMessage(counts)
        : "Nada foi apagado: ainda há registros ligados a esta academia" +
          (detail ? ` (${detail})` : "") +
          ".",
    };
  }

  if (response.status === 422) {
    if (/confirm_slug does not match/i.test(detail)) {
      return {
        ok: false,
        mismatch: true,
        error:
          "O identificador digitado não é o desta academia. Nada foi apagado — confira se você " +
          "está na academia que pretendia apagar.",
      };
    }
    if (/reason is required/i.test(detail)) {
      return { ok: false, error: "O motivo é obrigatório — ele vai para a auditoria." };
    }
    return { ok: false, error: detail || "O servidor recusou os dados enviados (HTTP 422)." };
  }

  // 405 = a rota existe mas não o verbo (foi exatamente o que o Arthur viu no
  // BFF publicado, que só tem PATCH neste path). 404 SEM detail = o router não
  // conhece o path; 404 COM detail é o handler dizendo que a franquia não
  // existe — são coisas diferentes, e a heurística é o corpo, não o status.
  if (response.status === 405 || (response.status === 404 && !detail)) {
    return {
      ok: false,
      unavailable: true,
      error:
        `O backend publicado ainda não aceita apagar academia (HTTP ${response.status} em ` +
        "DELETE /v1/ops/franchises/{id}). O painel já está pronto — falta publicar o " +
        "bff-backoffice com o endpoint. Enquanto isso, use “Transformar em Diretório”.",
    };
  }

  return { ok: false, error: detail || `Falha ao apagar a academia (HTTP ${response.status}).` };
}

/**
 * Passo 1: a prévia. Não escreve nada e devolve as contagens reais — é a única
 * forma de o operador ver o que vai embora ANTES de confirmar.
 */
export async function previewFranchiseDeleteAction(id: string): Promise<FranchiseDeleteState> {
  return callFranchiseDelete(id);
}

/**
 * Passo 2: a exclusão de verdade.
 *
 * `confirmSlug` é o que o OPERADOR digitou — nunca o slug que a tela já tinha.
 * Quem compara é o servidor, contra a linha por trás de {id}: mandar o valor
 * conhecido de volta transformaria o guard num carimbo que nunca reprova.
 */
export async function deleteFranchiseAction(
  id: string,
  params: { confirmSlug: string; reason: string }
): Promise<FranchiseDeleteState> {
  const confirmSlug = params.confirmSlug.trim();
  const reason = params.reason.trim();
  if (!confirmSlug) {
    return {
      ok: false,
      mismatch: true,
      error: "Digite o identificador (slug) da academia para confirmar.",
    };
  }
  if (!reason) {
    return { ok: false, error: "O motivo é obrigatório — ele vai para a auditoria." };
  }

  const res = await callFranchiseDelete(id, { confirm_slug: confirmSlug, reason });
  if (!res.ok) return res;

  // O CAMPO QUE IMPORTA. Prévia e exclusão respondem 200 com o mesmo corpo;
  // `deleted` é o único sinal de que houve escrita. Sem esta checagem o painel
  // comemora uma prévia, navega para a lista, e a academia reaparece lá.
  if (!res.report.deleted) {
    return {
      ok: false,
      error:
        "O servidor devolveu apenas uma prévia (deleted=false) e NADA foi apagado. A academia " +
        "continua existindo — recarregue a página e tente de novo.",
    };
  }

  // A lista de academias é derivada de GET /v1/ops/courts e as duas telas são
  // force-dynamic; ainda assim invalidamos os paths para limpar o Router Cache
  // do cliente — sem isso o card da academia apagada reaparece no voltar do
  // navegador.
  revalidatePath("/academias");
  revalidatePath(`/academias/${id}`);
  revalidatePath("/quadras");
  return res;
}

/* ══ publicação do diretório na landing ════════════════════════════════════ */

/**
 * Manda o diretório de academias para lits.social, que o usa no dropdown
 * "onde você dá aula" do cadastro de professores (ver lib/landing-academias).
 *
 * É EXPLÍCITO, com botão, e não um efeito colateral de criar/editar academia.
 * Sincronizar sozinho no salvamento pareceria melhor até o dia em que a landing
 * estivesse fora do ar: a academia seria salva, o push falharia calado e o
 * dropdown ficaria velho sem ninguém saber. Com botão, a tela mostra de quando
 * é a lista publicada e quantas academias ela tem — a defasagem fica VISÍVEL, e
 * republicar é um clique.
 */
export async function publishAcademiasToLandingAction(
  force = false
): Promise<PublishResult & { source?: number }> {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/franchises");
  if (error) {
    return {
      ok: false,
      error: error.detail || error.title || "Falha ao listar as academias para publicar.",
    };
  }

  const academias = academiasParaPublicar((data.franchises ?? []) as FranchiseLike[]);
  const res = await publishAcademias(academias, force);
  if (res.ok) revalidatePath("/academias");
  return { ...res, source: academias.length };
}
