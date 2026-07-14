"use server";

import { revalidatePath } from "next/cache";
import { getApi } from "@/lib/api";
import type { BlockCourtSlotState } from "./types";

/**
 * Server action backing the #07 "block a court slot" form. Calls getApi()
 * inside the action (server-side only — it reads request headers to relay
 * the staff's Cloudflare Access JWT) and revalidates the list on success so
 * the new hold shows up without a manual refresh.
 */
export async function blockCourtSlotAction(
  _prevState: BlockCourtSlotState,
  formData: FormData
): Promise<BlockCourtSlotState> {
  const courtId = String(formData.get("court_id") ?? "").trim();
  const startsAtLocal = String(formData.get("starts_at") ?? "").trim();
  const endsAtLocal = String(formData.get("ends_at") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!courtId || !startsAtLocal || !endsAtLocal || !reason) {
    return { ok: false, error: "Preencha todos os campos." };
  }

  // datetime-local inputs carry no timezone; `new Date(...)` interprets them
  // in the browser's local time, which is what the staff member sees on
  // screen — then we serialize to RFC3339 for the API.
  const startsAt = new Date(startsAtLocal);
  const endsAt = new Date(endsAtLocal);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { ok: false, error: "Datas inválidas." };
  }
  if (startsAt >= endsAt) {
    return { ok: false, error: "O início deve ser antes do fim." };
  }

  const api = await getApi();
  const { error } = await api.POST("/v1/ops/court-holds", {
    body: {
      court_id: courtId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reason,
    },
  });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao bloquear a quadra." };
  }

  revalidatePath("/quadras-indisponiveis");
  return { ok: true };
}
