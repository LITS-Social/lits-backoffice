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

/** Uma página de usuários cobre o beta inteiro com folga. */
const USERS_LIMIT = 2000;
/** O painel mostra os últimos meses; o teto é o mesmo do painel #02. */
const MATCHES_LIMIT = 1000;
const REFERRALS_LIMIT = 200;

export async function syncProfessorAction(
  professorEmail: string,
  mgmUserIdConhecido?: string | null
): Promise<SyncProfessorResult> {
  const email = String(professorEmail ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "professor sem e-mail." };

  const api = await getApi();

  // Uma leitura só de usuários serve a três coisas: achar o professor,
  // enriquecer os alunos (categoria, foto, contato) e nomear o adversário de
  // cada partida.
  const [usersRes, referralsRes, matchesRes] = await Promise.all([
    api.GET("/v1/ops/users", { params: { query: { limit: USERS_LIMIT } } }).catch(() => null),
    api
      .GET("/v1/ops/mgm-referrals", { params: { query: { limit: REFERRALS_LIMIT, offset: 0 } } })
      .catch(() => null),
    api
      .GET("/v1/ops/finished-matches", { params: { query: { limit: MATCHES_LIMIT, offset: 0 } } })
      .catch(() => null),
  ]);

  const usuariosLista = (usersRes?.data?.users ?? []) as UserLike[];
  if (!usuariosLista.length) {
    return { ok: false, error: "não deu para ler os usuários do produto agora." };
  }

  const usuarios = new Map<string, UserLike>();
  for (const u of usuariosLista) if (u.id) usuarios.set(u.id, u);

  // O vínculo: `mgm_user_id` gravado manda; e-mail é só o primeiro encontro.
  let mgmUserId = String(mgmUserIdConhecido ?? "").trim().toLowerCase();
  if (!mgmUserId) {
    const achado = usuariosLista.find(
      (u) => String(u.email ?? "").trim().toLowerCase() === email
    );
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
