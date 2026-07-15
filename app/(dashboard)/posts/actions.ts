"use server";

import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

type OpsPostRow = components["schemas"]["OpsPostRow"];

/** One page of posts, in the shape the client table accumulates. */
export type PostsPage = {
  rows: OpsPostRow[];
  nextCursor?: string;
  hasMore: boolean;
};

export type PostsResult = ({ ok: true } & PostsPage) | { ok: false; error: string };

/**
 * Same page size the server component renders the first page with, so the
 * initial slice and a "carregar mais" click pull identical-sized pages.
 */
const PAGE_SIZE = 30;

/**
 * #12 content console list — server-side `q` (feed-service caption ILIKE),
 * cursor pagination, and the `include_deleted` toggle. Runs through the
 * per-request `getApi()` so the caller's Cloudflare Access staff identity rides
 * along exactly as on the server-rendered first page.
 */
export async function listPostsAction({
  q,
  cursor,
  includeDeleted,
}: {
  q?: string;
  cursor?: string;
  includeDeleted?: boolean;
}): Promise<PostsResult> {
  const api = await getApi();
  const trimmed = q?.trim();

  const { data, error } = await api.GET("/v1/ops/posts", {
    params: {
      query: {
        limit: PAGE_SIZE,
        ...(trimmed ? { q: trimmed } : {}),
        ...(cursor ? { cursor } : {}),
        ...(includeDeleted ? { include_deleted: true } : {}),
      },
    },
  });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao carregar posts." };
  }

  return {
    ok: true,
    rows: data.posts ?? [],
    nextCursor: data.next_cursor,
    hasMore: data.has_more,
  };
}

export type DeleteResult =
  | { ok: true; deletedAt?: string }
  | { ok: false; error: string };

/**
 * #12 destructive action — soft-delete a post. feed-service sets `deleted_at`
 * and writes an append-only `ops_audit_log` row (actor = the staff email the
 * BFF relays, plus the optional reason) in one transaction. Never a hard delete.
 */
export async function deletePostAction({
  id,
  reason,
}: {
  id: string;
  reason?: string;
}): Promise<DeleteResult> {
  const api = await getApi();
  const trimmed = reason?.trim();

  const { data, error } = await api.DELETE("/v1/ops/posts/{id}", {
    params: { path: { id } },
    ...(trimmed ? { body: { reason: trimmed } } : {}),
  });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao remover o post." };
  }

  return { ok: true, deletedAt: data.deleted_at };
}
