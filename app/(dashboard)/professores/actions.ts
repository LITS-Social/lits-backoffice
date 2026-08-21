"use server";

import { revalidatePath } from "next/cache";
import { getStaffEmail } from "@/lib/staff";
import { liberarPrimeiroAcesso, markProfessorCalled } from "@/lib/professores";

export type MarkProfessorCalledResult =
  | { ok: true; calledAt: number | null; calledBy: string | null }
  | { ok: false; error: string };

/**
 * Marca ou desmarca "já chamei" para um professor cadastrado.
 *
 * O autor NÃO vem do cliente: é lido aqui do JWT do Cloudflare Access da
 * própria requisição (mesma fonte de `applied_by` das sanções e do #15). O
 * componente de tela não tem como escolher em nome de quem marca.
 */
export async function markProfessorCalledAction(
  id: number,
  called: boolean
): Promise<MarkProfessorCalledResult> {
  const staffEmail = await getStaffEmail();
  const res = await markProfessorCalled(id, called, staffEmail);
  if (!res.ok) return res;
  revalidatePath("/professores");
  return res;
}

export type LiberarAcessoResult = { ok: true; ate: number } | { ok: false; error: string };

/**
 * Libera o primeiro acesso de um professor: ele entra com o e-mail e cria a
 * senha dentro do painel.
 *
 * Use depois de falar com ele — a janela é curta (48h) de propósito, e é o
 * que separa "o time liberou" de "qualquer um que saiba o e-mail entra".
 */
export async function liberarPrimeiroAcessoAction(id: number): Promise<LiberarAcessoResult> {
  const staffEmail = await getStaffEmail();
  const res = await liberarPrimeiroAcesso(id, staffEmail);
  if (!res.ok) return res;
  revalidatePath("/professores");
  return res;
}
