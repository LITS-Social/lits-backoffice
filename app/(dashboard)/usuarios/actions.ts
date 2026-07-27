"use server";

import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

type OpsUserRow = components["schemas"]["OpsUserRow"];

/** The whole user base, crawled server-side for the client-side console. */
export type UsersAll = {
  rows: OpsUserRow[];
  /** True when the crawl hit its page cap — the console says "pelo menos N". */
  truncated: boolean;
};

export type UsersAllResult = ({ ok: true } & UsersAll) | { ok: false; error: string };

/**
 * Crawls every page of GET /v1/ops/users (keyset cursor). The beta base is a
 * couple hundred accounts — filtering (entrada, último acesso, nível, sexo,
 * idade) and the CSV export only tell the truth over the FULL set, so the
 * console loads everything once and slices client-side. The cap (20 × 200)
 * is two orders of magnitude above the base; if it ever bites, `truncated`
 * says so instead of silently filtering part of the truth.
 */
export async function listAllUsersAction(): Promise<UsersAllResult> {
  const api = await getApi();
  const rows: OpsUserRow[] = [];
  let cursor: string | undefined;

  for (let page = 0; ; page++) {
    if (page >= 20) return { ok: true, rows, truncated: true };
    const { data, error } = await api.GET("/v1/ops/users", {
      params: { query: { limit: 200, ...(cursor ? { cursor } : {}) } },
    });
    if (error) {
      return { ok: false, error: error.detail || error.title || "Falha ao carregar usuários." };
    }
    rows.push(...(data.users ?? []));
    if (!data.has_more || !data.next_cursor) return { ok: true, rows, truncated: false };
    cursor = data.next_cursor;
  }
}
