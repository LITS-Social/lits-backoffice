"use server";

import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

export type ClubAnalytics = components["schemas"]["ClubAnalyticsBody"];

export type ClubAnalyticsResult =
  | { ok: true; data: ClubAnalytics }
  | { ok: false; error: string };

/** As métricas de liquidez de UMA academia — ver o handler no BFF. */
export async function fetchClubAnalyticsAction(
  franchiseId: string
): Promise<ClubAnalyticsResult> {
  try {
    const api = await getApi();
    const { data, error, response } = await api.GET("/v1/ops/club-analytics", {
      params: { query: { franchise_id: franchiseId } },
    });
    if (error || !data) {
      // 404 da rota inteira = BFF ainda sem o deploy desta feature; dizer isso
      // é mais útil que "erro 404".
      if (response.status === 404) {
        return {
          ok: false,
          error:
            "O servidor ainda não conhece esta análise — falta o deploy do bff-backoffice com a rota club-analytics.",
        };
      }
      return {
        ok: false,
        error: error?.detail || error?.title || `O servidor respondeu ${response.status}.`,
      };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "O servidor não respondeu." };
  }
}
