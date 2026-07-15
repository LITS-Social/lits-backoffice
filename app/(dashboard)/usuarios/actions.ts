"use server";

import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

type OpsUserRow = components["schemas"]["OpsUserRow"];

/** One page of users, in the shape the client table accumulates. */
export type UsersPage = {
  rows: OpsUserRow[];
  nextCursor?: string;
  hasMore: boolean;
};

export type UsersResult = ({ ok: true } & UsersPage) | { ok: false; error: string };

/**
 * Same page size the server component uses for the first page, so a "carregar
 * mais" click and the initial render pull identical-sized slices.
 */
const PAGE_SIZE = 30;

/**
 * Server action backing #11 search + pagination.
 *
 * `q` is a SERVER-SIDE filter (user-service ILIKE over name/username/email/phone),
 * not a client filter over an already-loaded page — that is why this is a real
 * round-trip on every debounced keystroke rather than a `.filter()`. Runs through
 * the per-request `getApi()`, so the caller's Cloudflare Access identity rides
 * along exactly as it does on the initial render.
 */
export async function listUsersAction({
  q,
  cursor,
}: {
  q?: string;
  cursor?: string;
}): Promise<UsersResult> {
  const api = await getApi();
  const trimmed = q?.trim();

  const { data, error } = await api.GET("/v1/ops/users", {
    params: {
      query: {
        limit: PAGE_SIZE,
        ...(trimmed ? { q: trimmed } : {}),
        ...(cursor ? { cursor } : {}),
      },
    },
  });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao carregar usuários." };
  }

  return {
    ok: true,
    rows: data.users ?? [],
    nextCursor: data.next_cursor,
    hasMore: data.has_more,
  };
}
