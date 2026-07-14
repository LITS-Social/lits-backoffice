"use server";

import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

export type SearchHit = components["schemas"]["OpsSearchResult"];

/**
 * Why this file exists at all: `getApi()` reads the incoming request's headers
 * to relay the staff member's Cloudflare Access JWT, so it can only run on the
 * server. The command palette is necessarily a client component (it owns a
 * keyboard listener and an input). This server action is the bridge — the
 * browser never talks to the BFF directly, and never sees the service-token
 * credentials that authenticate this app to it.
 */
export type SearchActionResult =
  | { ok: true; query: string; results: SearchHit[]; hasMore: boolean }
  | { ok: false; error: string };

/**
 * GET /v1/ops/search — the staff omnibox.
 *
 * The BFF runs two disjoint strategies and tells us which one fired via
 * `matched_by`: a UUID is resolved as a user id AND a booking id in parallel;
 * anything else goes to user-service's pg_trgm index over display_name +
 * username. We do not reimplement that choice here — we just pass the string.
 *
 * `has_more` is the server's real answer (user-service fetches limit+1 and
 * reports whether the extra row existed), NOT a guess derived from
 * `results.length === limit`. There is deliberately no total anywhere in this
 * response: the search is keyset-paginated and no COUNT is ever run, so a
 * "N resultados" headline could only ever be the page size wearing a total's
 * clothes. The palette says "há mais" and stops.
 */
export async function searchAction(query: string): Promise<SearchActionResult> {
  const q = query.trim();

  // An empty query is not an error and not a request — the BFF would 422 it.
  if (!q) return { ok: true, query: "", results: [], hasMore: false };

  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/search", {
    params: { query: { q, limit: 20 } },
  });

  if (error) {
    // Surfaced, never swallowed into an empty list: "user-service is down" and
    // "no such player" look identical as an empty array, and staff would read
    // the outage as an answer.
    return { ok: false, error: error.detail || error.title || "Falha na busca." };
  }

  // `results` is nullable on the wire (Go marshals an empty slice as null).
  return { ok: true, query: data.query, results: data.results ?? [], hasMore: data.has_more };
}
