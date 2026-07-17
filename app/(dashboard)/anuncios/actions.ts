"use server";

import { getApi } from "@/lib/api";
import type { SendAnnouncementState } from "./types";

/**
 * Server action backing the "Enviar anúncio" form. Broadcasts a push + inbox
 * notification to the selected audience via the BFF (an empty audience_id keeps
 * the legacy "all PlayTennis members" behaviour).
 *
 * Calls getApi() inside the action (server-side only — it reads request headers
 * to relay the staff's Cloudflare Access JWT, so the broadcast is attributable to
 * whoever sent it). No revalidate: there is no list to refresh, a send is a
 * one-shot fan-out, not a mutation of anything this console renders.
 */
export async function sendAnnouncementAction(
  _prevState: SendAnnouncementState,
  formData: FormData
): Promise<SendAnnouncementState> {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const deepLink = String(formData.get("deep_link") ?? "").trim();
  const audienceId = String(formData.get("audience_id") ?? "").trim();

  if (!title || !body) {
    return { ok: false, error: "Preencha título e mensagem." };
  }

  const api = await getApi();
  const { data, error } = await api.POST("/v1/ops/announcements", {
    body: {
      title,
      body,
      ...(deepLink ? { deep_link: deepLink } : {}),
      ...(audienceId ? { audience_id: audienceId } : {}),
    },
  });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao enviar o anúncio." };
  }

  return {
    ok: true,
    result: { sent: data.sent, failed: data.failed, total: data.total },
  };
}

export type AudienceCountResult =
  | { ok: true; matched: number; missingCategory: number }
  | { ok: false; error: string };

/**
 * Live reach of the selected audience, shown before the confirm so the operator
 * knows how many people the send will actually reach. Counts by saved audience_id
 * (the picker only ever offers saved audiences); an empty id counts nobody and is
 * treated by the caller as the legacy "all members" default, which has no
 * per-audience number to preview.
 */
export async function countAnnouncementAudienceAction(
  audienceId: string
): Promise<AudienceCountResult> {
  if (!audienceId.trim()) {
    return { ok: false, error: "Nenhum público selecionado." };
  }

  const api = await getApi();
  const { data, error } = await api.POST("/v1/ops/audiences/count", {
    body: { audience_id: audienceId.trim() },
  });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao contar membros." };
  }

  return { ok: true, matched: data.matched, missingCategory: data.missing_category };
}
