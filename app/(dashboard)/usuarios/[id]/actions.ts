"use server";

import { revalidatePath } from "next/cache";
import { getApi } from "@/lib/api";
import { getStaffEmail } from "@/lib/staff";
import type { components } from "@/lib/api/openapi";

export type Badge =
  | "selfie_match"
  | "celebrity"
  | "club_official"
  | "federation_athlete"
  | "beta_tester";

export type SanctionType = "ranked_suspension" | "platform_ban" | "shadowban";

export type SanctionItem = components["schemas"]["SanctionItem"];

type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** LGPD-style soft delete with a 30-day grace window. Staff-initiated. */
export async function deactivateUserAction(
  userId: string,
  reason: string
): Promise<ActionResult<{ hardDeleteAt?: string }>> {
  const api = await getApi();
  const { data, error } = await api.POST("/v1/ops/users/{id}/deactivate", {
    params: { path: { id: userId } },
    body: { reason },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao desativar." };
  revalidatePath(`/usuarios/${userId}`);
  return { ok: true, data: { hardDeleteAt: data.hard_delete_at } };
}

export async function reactivateUserAction(userId: string): Promise<ActionResult> {
  const api = await getApi();
  const { error } = await api.POST("/v1/ops/users/{id}/reactivate", {
    params: { path: { id: userId } },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao reativar." };
  revalidatePath(`/usuarios/${userId}`);
  return { ok: true, data: undefined };
}

export async function grantBadgeAction(
  userId: string,
  badge: Badge
): Promise<ActionResult<{ badges: string[] }>> {
  const api = await getApi();
  const { data, error } = await api.POST("/v1/ops/users/{id}/badges", {
    params: { path: { id: userId } },
    body: { badge },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao conceder o selo." };
  revalidatePath(`/usuarios/${userId}`);
  return { ok: true, data: { badges: data.verified_badges ?? [] } };
}

export async function revokeBadgeAction(
  userId: string,
  badge: Badge
): Promise<ActionResult<{ badges: string[] }>> {
  const api = await getApi();
  const { data, error } = await api.DELETE("/v1/ops/users/{id}/badges/{badge}", {
    params: { path: { id: userId, badge } },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao remover o selo." };
  revalidatePath(`/usuarios/${userId}`);
  return { ok: true, data: { badges: data.verified_badges ?? [] } };
}

export async function applySanctionAction(
  userId: string,
  params: { sanctionType: SanctionType; reason: string; expiresAt?: string }
): Promise<ActionResult<SanctionItem>> {
  const api = await getApi();
  const appliedBy = (await getStaffEmail()) ?? "desconhecido";
  const { data, error } = await api.POST("/v1/ops/users/{id}/sanctions", {
    params: { path: { id: userId } },
    body: {
      sanction_type: params.sanctionType,
      reason: params.reason,
      applied_by: appliedBy,
      ...(params.expiresAt ? { expires_at: params.expiresAt } : {}),
    },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao aplicar sanção." };
  revalidatePath(`/usuarios/${userId}`);
  return { ok: true, data };
}

export async function liftSanctionAction(
  sanctionId: string,
  userId: string
): Promise<ActionResult<SanctionItem>> {
  const api = await getApi();
  const liftedBy = (await getStaffEmail()) ?? "desconhecido";
  const { data, error } = await api.POST("/v1/ops/sanctions/{id}/lift", {
    params: { path: { id: sanctionId } },
    body: { lifted_by: liftedBy },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao levantar a sanção." };
  revalidatePath(`/usuarios/${userId}`);
  return { ok: true, data };
}

export type UserSanctionsResult = {
  sanctions: SanctionItem[];
  /**
   * true when the lookup could not be completed (network/BFF error, or the
   * page cap below was hit before exhausting every active sanction) — the
   * caller must render this as "couldn't check", never silently as "clean".
   * A trust-and-safety screen showing zero for a sanctioned user because a
   * fetch failed is worse than showing nothing at all.
   */
  incomplete: boolean;
};

/**
 * Sanctions currently active against this user. `GET /v1/ops/sanctions` has no
 * user_id filter server-side, so this walks every page (cursor-paginated,
 * capped at 20 pages = up to 2000 sanctions scanned — sane even well past
 * beta scale) and filters client-side.
 */
export async function listUserSanctionsAction(userId: string): Promise<UserSanctionsResult> {
  const api = await getApi();
  const matched: SanctionItem[] = [];
  let cursor: string | undefined;
  const MAX_PAGES = 20;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await api.GET("/v1/ops/sanctions", {
      params: { query: { active: "true", limit: 100, ...(cursor ? { cursor } : {}) } },
    });
    if (error) return { sanctions: matched, incomplete: true };

    matched.push(...(data.items ?? []).filter((s) => s.user_id === userId));

    if (!data.next_cursor) return { sanctions: matched, incomplete: false };
    cursor = data.next_cursor;
  }
  // Hit MAX_PAGES without exhausting the cursor — genuinely incomplete.
  return { sanctions: matched, incomplete: true };
}
