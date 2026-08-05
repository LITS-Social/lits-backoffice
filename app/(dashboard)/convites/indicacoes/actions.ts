"use server";

import { revalidatePath } from "next/cache";
import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

/**
 * Os status que o painel pode ESCREVER. Vem do contrato gerado, não de uma
 * lista retipada aqui: se o BFF parar de aceitar um deles, isto quebra no
 * `tsc` em vez de virar 422 na cara do operador.
 *
 * São dois, e a ausência de 'played' é a decisão, não um esquecimento: 'played'
 * é DERIVADO (a janela da reserva do convidado terminou) e quem o escreve é a
 * varredura do user-service. Um botão que o escrevesse aqui seria um botão de
 * fabricar prêmio.
 */
export type MgmWritableStatus = components["schemas"]["SetMgmInviteStatusRequestBody"]["status"];

export type SetMgmInviteStatusResult =
  | { ok: true; status: string; previousStatus: string; changed: boolean; phoneHashCleared: boolean }
  | { ok: false; error: string };

/**
 * Revisão humana antes do prêmio — o controle anti-fraude do MGM (ADR-0064 §8).
 *
 * `reason` é obrigatório na rede: o BFF grava a justificativa literal em
 * lits.ops_audit_log junto com o e-mail do operador e a transição de → para,
 * DENTRO da mesma transação da escrita. Falha de registro aborta a marcação —
 * é o motivo de este endpoint existir em vez de um UPDATE no psql.
 *
 * Marcar 'fraudulent' uma vaga ainda 'declared' apaga o HMAC do telefone
 * declarado e NÃO volta: `phoneHashCleared` na resposta é o que a UI usa para
 * dizer isso ao operador depois do fato.
 */
export async function setMgmInviteStatusAction(
  inviteId: string,
  status: MgmWritableStatus,
  reason: string
): Promise<SetMgmInviteStatusResult> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Motivo é obrigatório." };

  const api = await getApi();
  const { data, error } = await api.POST("/v1/ops/mgm-referrals/{id}/status", {
    params: { path: { id: inviteId } },
    body: { status, reason: trimmed },
  });
  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao marcar a indicação." };
  }

  revalidatePath("/convites/indicacoes");
  return {
    ok: true,
    status: data.status,
    previousStatus: data.previous_status,
    changed: data.changed,
    phoneHashCleared: data.phone_hash_cleared,
  };
}
