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

export type RedactResult = { ok: true } | { ok: false; error: string };

/**
 * Softer than deletePostAction: marks the post redacted (content-level
 * moderation) without a hard soft-delete. feed-service's RedactPostRequest
 * requires `staff_user_id` as a UUID FK into users — a real LITS account id,
 * not the operator's Cloudflare Access email. There is no mapping from CF
 * Access identity to a users.id yet, so the caller supplies their own LITS
 * user_id explicitly (surfaced in the UI as a one-time-per-session input).
 */
export async function redactPostAction({
  id,
  staffUserId,
  reason,
}: {
  id: string;
  staffUserId: string;
  reason: string;
}): Promise<RedactResult> {
  const api = await getApi();
  const { error } = await api.POST("/v1/ops/posts/{id}/redact", {
    params: { path: { id } },
    body: { staff_user_id: staffUserId, reason },
  });
  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao redigir o post." };
  }
  return { ok: true };
}

type OpsComment = components["schemas"]["OpsComment"];

export type CommentsResult =
  | { ok: true; comments: OpsComment[]; hasMore: boolean; nextCursor?: string }
  | { ok: false; error: string };

export async function listPostCommentsAction(postId: string, cursor?: string): Promise<CommentsResult> {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/posts/{id}/comments", {
    params: { path: { id: postId }, query: { limit: 50, ...(cursor ? { cursor } : {}) } },
  });
  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao carregar comentários." };
  }
  return { ok: true, comments: data.comments ?? [], hasMore: data.has_more, nextCursor: data.next_cursor };
}

export type DeleteCommentResult = { ok: true } | { ok: false; error: string };

/** Same staff-identity caveat as redactPostAction — see its doc comment. */
export async function deletePostCommentAction({
  postId,
  commentId,
  deleterUserId,
}: {
  postId: string;
  commentId: number;
  deleterUserId: string;
}): Promise<DeleteCommentResult> {
  const api = await getApi();
  const { error } = await api.DELETE("/v1/ops/posts/{id}/comments/{comment_id}", {
    params: { path: { id: postId, comment_id: commentId } },
    body: { deleter_user_id: deleterUserId },
  });
  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao apagar o comentário." };
  }
  return { ok: true };
}
