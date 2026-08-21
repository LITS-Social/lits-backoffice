"use server";

import { revalidatePath } from "next/cache";
import { getApi } from "@/lib/api";
import { getStaffEmail } from "@/lib/staff";
import {
  buildProfessorSnapshot,
  pushProfessorSnapshot,
  type MatchLike,
  type ReferralLike,
  type UserLike,
} from "@/lib/professor-snapshot";

/**
 * Publica no painel da landing o que um professor embaixador tem a receber.
 *
 * POR QUE ISTO É UM BOTÃO, E NÃO UM CRON
 *
 * Duas paredes, as mesmas de `ri-sync.ts` e da publicação de academias: o BFF
 * exige o JWT humano do Cloudflare Access em toda leitura, então sem uma
 * requisição de gente não há como ler o produto; e o OpenNext não expõe
 * handler `scheduled`. Um efeito-de-render como o do RI também não serve
 * aqui — isto move PII e dinheiro, e publicar calado toda vez que alguém abre
 * a tela é o tipo de coisa que ninguém percebe quando começa a publicar
 * errado. Fica explícito: um operador clica, e o resultado aparece.
 *
 * A ORDEM IMPORTA
 *
 * 1. o professor vira usuário do app (por `mgm_user_id` gravado, ou por
 *    e-mail na primeira vez);
 * 2. o usuário vira convidador em `/v1/ops/mgm-referrals` — daí saem os
 *    alunos indicados;
 * 3. as partidas encerradas dizem quanto cada aluno movimentou;
 * 4. a landing recebe tudo e calcula a comissão (5%) na hora de exibir.
 *
 * Cada passo tem um jeito próprio de não existir, e nenhum deles é erro de
 * sistema: professor que ainda não baixou o app, professor sem nenhum aluno,
 * aluno que ainda não jogou. Todos viram mensagem em português, porque quem
 * lê isto está tentando responder "por que o painel do fulano está vazio?".
 */

export type SyncProfessorResult =
  | { ok: true; alunos: number; partidas: number; aviso?: string }
  | { ok: false; error: string };

/**
 * `/v1/ops/users` devolve no máximo 200 por página e pagina por cursor
 * (`maximum:"200"` no handler do BFF). Pedir mais não trunca: a requisição é
 * REJEITADA inteira — foi o que derrubou a primeira versão disto, que pedia
 * 2000 e via a lista chegar vazia.
 */
const USERS_PAGE = 200;
/** Teto de páginas, como em `lib/metrics.ts`: 2000 usuários cobrem o beta. */
const USERS_MAX_PAGES = 10;
/** O painel mostra os últimos meses; o teto é o mesmo do painel #02. */
const MATCHES_LIMIT = 1000;
/** Também limitado a 200 no handler. */
const REFERRALS_LIMIT = 200;

/** Varre a lista de usuários pelo cursor. Erro aqui é erro, não lista vazia. */
async function lerUsuarios(
  api: Awaited<ReturnType<typeof getApi>>
): Promise<{ ok: true; rows: UserLike[] } | { ok: false; error: string }> {
  const rows: UserLike[] = [];
  let cursor: string | undefined;
  for (let pagina = 0; pagina < USERS_MAX_PAGES; pagina++) {
    const { data, error } = await api.GET("/v1/ops/users", {
      params: { query: { limit: USERS_PAGE, ...(cursor ? { cursor } : {}) } },
    });
    if (error || !data?.users) {
      return { ok: false, error: "não deu para ler os usuários do produto agora." };
    }
    rows.push(...(data.users as UserLike[]));
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return { ok: true, rows };
}

export async function syncProfessorAction(
  professorEmail: string,
  mgmUserIdConhecido?: string | null
): Promise<SyncProfessorResult> {
  const email = String(professorEmail ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "professor sem e-mail." };

  const api = await getApi();

  // A leitura de usuários serve a três coisas: achar o professor, enriquecer
  // os alunos (categoria, foto, contato) e nomear o adversário de cada
  // partida. Vem paginada porque o BFF corta em 200 por página.
  const [usuariosRes, referralsRes, matchesRes] = await Promise.all([
    lerUsuarios(api),
    api
      .GET("/v1/ops/mgm-referrals", { params: { query: { limit: REFERRALS_LIMIT, offset: 0 } } })
      .catch(() => null),
    api
      .GET("/v1/ops/finished-matches", { params: { query: { limit: MATCHES_LIMIT, offset: 0 } } })
      .catch(() => null),
  ]);

  if (!usuariosRes.ok) return usuariosRes;
  const usuariosLista = usuariosRes.rows;

  const usuarios = new Map<string, UserLike>();
  for (const u of usuariosLista) if (u.id) usuarios.set(u.id, u);

  // O vínculo: `mgm_user_id` gravado manda; e-mail é só o primeiro encontro.
  let mgmUserId = String(mgmUserIdConhecido ?? "").trim().toLowerCase();
  if (!mgmUserId) {
    let achado = usuariosLista.find((u) => String(u.email ?? "").trim().toLowerCase() === email);
    // Fora das páginas varridas ainda resta a busca direta — `q` é ILIKE em
    // nome/username/e-mail/telefone no próprio banco, então acha quem estiver
    // além do teto de páginas.
    if (!achado) {
      const busca = await api
        .GET("/v1/ops/users", { params: { query: { q: email, limit: 20 } } })
        .catch(() => null);
      achado = ((busca?.data?.users ?? []) as UserLike[]).find(
        (u) => String(u.email ?? "").trim().toLowerCase() === email
      );
      if (achado?.id) usuarios.set(achado.id, achado);
    }
    if (!achado?.id) {
      return {
        ok: false,
        error: `nenhum usuário do app tem o e-mail ${email}. O professor precisa se cadastrar no app com o mesmo e-mail da landing (ou informar o UUID dele).`,
      };
    }
    mgmUserId = achado.id;
  }

  const referrals = (referralsRes?.data?.referrals ?? []) as ReferralLike[];
  const referral = referrals.find((r) => r.inviter_id === mgmUserId) ?? null;
  const partidas = (matchesRes?.data?.matches ?? []) as MatchLike[];

  const agora = new Date();
  const mesVigente = `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;

  const snapshot = buildProfessorSnapshot({
    professor: { email },
    mgmUserId,
    referral,
    usuarios,
    partidas,
    mesVigente,
  });

  const staffEmail = await getStaffEmail();
  const res = await pushProfessorSnapshot(snapshot, staffEmail);
  if (!res.ok) return res;

  revalidatePath("/professores");

  const totalPartidas = snapshot.alunos.reduce((t, a) => t + a.partidas.length, 0);
  // O caminho feliz vazio merece explicação: sem isto o operador vê "ok" e um
  // painel em branco, e conclui que o sync está quebrado.
  const aviso = !referral
    ? "esse professor ainda não indicou ninguém pelo código dele — o painel vai abrir vazio."
    : !totalPartidas
      ? "os alunos indicados ainda não jogaram nenhuma partida encerrada."
      : undefined;

  return { ok: true, alunos: snapshot.alunos.length, partidas: totalPartidas, aviso };
}
