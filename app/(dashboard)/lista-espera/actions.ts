"use server";

import { revalidatePath } from "next/cache";
import { getStaffEmail } from "@/lib/staff";
import { markWaitlistCalled } from "@/lib/waitlist";

export type MarkCalledResult =
  | { ok: true; calledAt: number | null; calledBy: string | null }
  | { ok: false; error: string };

/**
 * Marca ou desmarca "já chamei" para um inscrito da lista de espera.
 *
 * O autor NÃO vem do cliente: é lido aqui do JWT do Cloudflare Access da
 * própria requisição (mesma fonte que `applied_by` das sanções). O componente
 * de tela não tem como escolher em nome de quem marca.
 */
export async function markCalledAction(id: number, called: boolean): Promise<MarkCalledResult> {
  const staffEmail = await getStaffEmail();
  const res = await markWaitlistCalled(id, called, staffEmail);
  if (!res.ok) return res;
  revalidatePath("/lista-espera");
  return res;
}
