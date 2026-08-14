"use server";

import { revalidatePath } from "next/cache";
import { getStaffEmail } from "@/lib/staff";
import { markProfessorCalled } from "@/lib/professores";

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
