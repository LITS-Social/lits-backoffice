import type { components } from "@/lib/api/openapi";

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

/**
 * Local, temporary typing for POST /v1/ops/announcements.
 *
 * The endpoint is being added to the bff-backoffice OpenAPI spec in parallel, so
 * it is not in the generated `paths` (lib/api/openapi.d.ts) yet. This mirrors the
 * exact structural shape openapi-typescript emits for a POST with a JSON body, an
 * OK response, and Huma's `application/problem+json` error — so the same
 * openapi-fetch client from getApi() can be narrowed to it and call the endpoint
 * with full typing.
 *
 * DELETE THIS once `pnpm generate:api` picks up the endpoint: the path will land
 * in `paths` and actions.ts can call api.POST("/v1/ops/announcements") directly.
 */
export interface AnnouncementsPaths {
  "/v1/ops/announcements": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get?: never;
    put?: never;
    post: {
      parameters: { query?: never; header?: never; path?: never; cookie?: never };
      requestBody: {
        content: {
          "application/json": {
            title: string;
            body: string;
            deep_link?: string;
          };
        };
      };
      responses: {
        /** @description OK */
        200: {
          headers: { [name: string]: unknown };
          content: {
            "application/json": AnnouncementResult;
          };
        };
        /** @description Error */
        default: {
          headers: { [name: string]: unknown };
          content: {
            "application/problem+json": components["schemas"]["ErrorModel"];
          };
        };
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
