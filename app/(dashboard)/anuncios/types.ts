import type { components } from "@/lib/api/openapi";

/** One saved audience, as offered in the #13 targeting select. */
export type Audience = components["schemas"]["AudienceBody"];

/** What the BFF reports back after a broadcast: how many pushes/inbox rows landed. */
export type AnnouncementResult = {
  sent: number;
  failed: number;
  total: number;
};

/**
 * Result of one send attempt, surfaced back to the form.
 *
 * `ok: false` with no `error` is the resting state (nothing sent yet). `ok: true`
 * always carries `result`; `ok: false` with an `error` is a failed attempt.
 */
export type SendAnnouncementState = {
  ok: boolean;
  error?: string;
  result?: AnnouncementResult;
};
