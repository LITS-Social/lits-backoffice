import { cache } from "react";
import { getApi } from "@/lib/api";

/**
 * One panel's headline number, plus whether we could read it at all.
 *
 * `count: undefined` is not the same as `count: 0`. Zero means "we asked and
 * there is nothing there"; undefined means "we could not ask" — either the panel
 * has no backend (#02, #04) or the call failed. The UI must not render the two
 * the same way: a phantom "0 pendências" on a broken panel reads as calm when it
 * should read as broken.
 */
export type PanelStat = {
  id: string;
  count?: number;
  failed?: boolean;
};

export type OpsSummary = Record<string, PanelStat>;

/**
 * The seven live panels' counts, fetched once per request.
 *
 * Wrapped in React's `cache()`: the sidebar (in the layout) and the dashboard
 * both need these numbers, and without deduping, one page render would fan out
 * to fourteen BFF calls instead of seven. The BFF rate-limits per staff member,
 * so this is not merely wasteful — it is the difference between a working session
 * and a 429.
 *
 * Panels #02 and #04 are absent by construction: neither has a backend to count.
 */
export const getOpsSummary = cache(async (): Promise<OpsSummary> => {
  const api = await getApi();

  const [invites, payments, evaluations, upcoming, cancellations, courtIssues, reports] =
    await Promise.all([
      api.GET("/v1/ops/open-invites"),
      api.GET("/v1/ops/payment-issues"),
      api.GET("/v1/ops/player-evaluations"),
      api.GET("/v1/ops/upcoming-matches", { params: { query: { limit: 50, offset: 0 } } }),
      api.GET("/v1/ops/cancellations", { params: { query: { limit: 50, offset: 0 } } }),
      api.GET("/v1/ops/court-issues"),
      api.GET("/v1/ops/reports", { params: { query: { limit: 50, offset: 0 } } }),
    ]);

  // Prefer the server's `total` over the length of the page we happened to fetch.
  // They differ: with limit=50 and 54 upcoming matches, the list is 50 long, and
  // showing "50" would quietly under-report — the badge would sit at the page cap
  // no matter how bad things got. Endpoints that return no `total` are unpaginated,
  // so there the length IS the total.
  //
  // The generated types allow null for every list (the BFF omits the field when it
  // has nothing). A null means the same as an error here: no number to show.
  const stat = (
    id: string,
    list: unknown[] | null | undefined,
    errored: boolean,
    total?: number | null,
  ): PanelStat =>
    errored || list == null
      ? { id, failed: true }
      : { id, count: total ?? list.length };

  // Every endpoint now returns a real server-side count, so every panel reports the
  // size of the problem rather than the size of the page it fetched. #06 was the
  // one that showed this off: 80 stuck payments, page capped at 50, badge said "50"
  // — and would have kept saying "50" at 500.
  return {
    "01": stat("01", upcoming.data?.matches, !!upcoming.error, upcoming.data?.total),
    "03": stat("03", invites.data?.invites, !!invites.error, invites.data?.total),
    "05": stat("05", cancellations.data?.cancellations, !!cancellations.error, cancellations.data?.total),
    "06": stat("06", payments.data?.issues, !!payments.error, payments.data?.total),
    "07": stat("07", courtIssues.data?.issues, !!courtIssues.error, courtIssues.data?.total),
    "08": stat("08", evaluations.data?.players, !!evaluations.error, evaluations.data?.total),
    "09": stat("09", reports.data?.reports, !!reports.error, reports.data?.total),
  };
});
