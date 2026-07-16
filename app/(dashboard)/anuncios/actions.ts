"use server";

import type { Client } from "openapi-fetch";
import { getApi } from "@/lib/api";
import type { AnnouncementsPaths, SendAnnouncementState } from "./types";

/**
 * Server action backing the "Enviar anúncio" form. Broadcasts a push + inbox
 * notification to every PlayTennis member via the BFF.
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

  if (!title || !body) {
    return { ok: false, error: "Preencha título e mensagem." };
  }

  const api = await getApi();

  // The endpoint is not in the generated `paths` yet (built in parallel — see the
  // note on AnnouncementsPaths in ./types). We reuse the exact authed client from
  // getApi() — CF Access service token + relayed staff JWT, base URL, everything —
  // and only narrow its compile-time type to the contracted shape. Nothing about
  // the request is hand-rolled. Swap to api.POST(...) once the spec catches up.
  const client = api as unknown as Client<AnnouncementsPaths>;
  const { data, error } = await client.POST("/v1/ops/announcements", {
    body: {
      title,
      body,
      ...(deepLink ? { deep_link: deepLink } : {}),
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
