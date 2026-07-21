import { cache } from "react";
import { getApi } from "@/lib/api";

/**
 * The product-metrics roll-up behind the home dashboard.
 *
 * Everything here is computed from rows that came off the wire, and every block
 * carries its own `failed` flag — one broken endpoint dims one card, not the
 * page. Metrics the backend does not capture yet (W.O., invite acceptance,
 * referral codes…) are NOT in this file on purpose: the dashboard renders them
 * as "sem dado", because a derived-looking zero is the one lie this console
 * does not tell.
 */

const DAY_MS = 24 * 3600_000;
const WEEK_MS = 7 * DAY_MS;

/** How deep the users crawl goes: 10 pages × 200 = 2 000 accounts. The closed
    beta is two orders of magnitude below this; if the cap ever bites,
    `truncated` says so and the UI degrades to "pelo menos N". */
const USERS_PAGE_SIZE = 200;
const USERS_MAX_PAGES = 10;

/** Matches fetch cap — same contract: past it, the weekly series admits it is
    partial instead of drawing a week that does not exist. */
const MATCHES_LIMIT = 1000;

/** Rolling-window series depth for the charts. */
const SERIES_WEEKS = 12;

export type WeekPoint = {
  /** End of the 7-day window, dd/MM. */
  label: string;
  count: number;
};

export type UsersMetrics = {
  failed: boolean;
  /** Exact count unless `truncated`, then a lower bound. */
  total: number;
  truncated: boolean;
  newLast7: number;
  newPrev7: number;
  /** Accounts created in the last 2 days — the sheet's acquisition alarm. */
  newLast2: number;
  /** last_seen_at within 7 days. */
  active7: number;
  /**
   * Cumulative base at the end of each of the last SERIES_WEEKS windows, plus
   * signups inside each window. Null when the crawl was truncated — a growth
   * curve over part of the base has the wrong shape, not a rough one.
   */
  series: { label: string; total: number; novos: number }[] | null;
  /**
   * Mutually exclusive engagement buckets over the whole base, by last_seen_at:
   * hoje ≤ 24h · semana 1–7d · mês 7–30d · inativos 30d+ or never seen.
   */
  activity: { hoje: number; semana: number; mes: number; inativos: number };
  /**
   * Week-2 retention, approximated: of the accounts old enough to have had a
   * second week (created ≥ 14 days ago), how many were seen again 7+ days
   * after signup. `last_seen_at` is a single timestamp, so this is "came back
   * after week 1", not a true cohort curve — the UI labels it as such.
   */
  retention: { rate: number; cohort: number } | null;
};

export type MatchesMetrics = {
  failed: boolean;
  total: number;
  last7: number;
  prev7: number;
  /** Matches per rolling week, oldest→newest, ending today. Null when the
      page we hold is smaller than the server's total. */
  weekly: WeekPoint[] | null;
};

export type ProductMetrics = {
  users: UsersMetrics;
  matches: MatchesMetrics;
  /** finished / (finished + cancelled). Null when either side failed. */
  completion: { rate: number; finished: number; cancelled: number } | null;
  /** Weighted mean of all partner ratings received. Null on failure or no ratings. */
  partnerRating: { avg: number; count: number } | null;
};

async function crawlUsers(): Promise<UsersMetrics> {
  const api = await getApi();
  const now = Date.now();

  type Row = { created_at?: string; last_seen_at?: string };
  const rows: Row[] = [];
  let cursor: string | undefined;
  let truncated = false;

  try {
    for (let page = 0; ; page++) {
      if (page >= USERS_MAX_PAGES) {
        truncated = true;
        break;
      }
      const { data, error } = await api.GET("/v1/ops/users", {
        params: { query: { limit: USERS_PAGE_SIZE, ...(cursor ? { cursor } : {}) } },
      });
      if (error || data.users == null) throw new Error("users page failed");
      rows.push(...data.users);
      if (!data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
  } catch {
    return {
      failed: true, total: 0, truncated: false,
      newLast7: 0, newPrev7: 0, newLast2: 0, active7: 0,
      series: null, activity: { hoje: 0, semana: 0, mes: 0, inativos: 0 },
      retention: null,
    };
  }

  const createdWithin = (ms: number) => (r: Row) =>
    !!r.created_at && now - new Date(r.created_at).getTime() <= ms;

  const cohort = rows.filter(
    (r) => r.created_at && now - new Date(r.created_at).getTime() >= 2 * WEEK_MS,
  );
  const retained = cohort.filter(
    (r) =>
      r.last_seen_at &&
      new Date(r.last_seen_at).getTime() - new Date(r.created_at!).getTime() >= WEEK_MS,
  );

  // Growth curve: cumulative base at the end of each rolling week. Accounts
  // with no created_at (shouldn't happen, but the field is optional) are folded
  // into every point — they exist now and did not appear this quarter.
  const dateless = rows.filter((r) => !r.created_at).length;
  const series = truncated
    ? null
    : Array.from({ length: SERIES_WEEKS }, (_, i) => {
        const end = now - (SERIES_WEEKS - 1 - i) * WEEK_MS;
        const upTo = rows.filter(
          (r) => r.created_at && new Date(r.created_at).getTime() <= end,
        ).length;
        const inWindow = rows.filter((r) => {
          const t = r.created_at ? new Date(r.created_at).getTime() : NaN;
          return t > end - WEEK_MS && t <= end;
        }).length;
        return {
          label: new Date(end).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          total: upTo + dateless,
          novos: inWindow,
        };
      });

  const seen = (r: Row) => (r.last_seen_at ? now - new Date(r.last_seen_at).getTime() : Infinity);
  const activity = {
    hoje: rows.filter((r) => seen(r) <= DAY_MS).length,
    semana: rows.filter((r) => seen(r) > DAY_MS && seen(r) <= WEEK_MS).length,
    mes: rows.filter((r) => seen(r) > WEEK_MS && seen(r) <= 30 * DAY_MS).length,
    inativos: rows.filter((r) => seen(r) > 30 * DAY_MS).length,
  };

  return {
    failed: false,
    total: rows.length,
    truncated,
    newLast7: rows.filter(createdWithin(WEEK_MS)).length,
    newPrev7:
      rows.filter(createdWithin(2 * WEEK_MS)).length -
      rows.filter(createdWithin(WEEK_MS)).length,
    newLast2: rows.filter(createdWithin(2 * DAY_MS)).length,
    active7: rows.filter(
      (r) => r.last_seen_at && now - new Date(r.last_seen_at).getTime() <= WEEK_MS,
    ).length,
    series,
    activity,
    // Below ~10 accounts a percentage is theatre; the UI treats null as "ainda cedo".
    retention:
      cohort.length >= 10
        ? { rate: retained.length / cohort.length, cohort: cohort.length }
        : null,
  };
}

async function fetchMatches(): Promise<MatchesMetrics> {
  const api = await getApi();
  const now = Date.now();

  const { data, error } = await api.GET("/v1/ops/finished-matches", {
    params: { query: { limit: MATCHES_LIMIT, offset: 0 } },
  });
  if (error || data.matches == null) {
    return { failed: true, total: 0, last7: 0, prev7: 0, weekly: null };
  }

  const matches = data.matches;
  const total = data.total ?? matches.length;
  const complete = matches.length >= total;

  const inWindow = (from: number, to: number) =>
    matches.filter((m) => {
      const t = new Date(m.starts_at).getTime();
      return t > from && t <= to;
    }).length;

  const weekly = complete
    ? Array.from({ length: SERIES_WEEKS }, (_, i) => {
        const end = now - (SERIES_WEEKS - 1 - i) * WEEK_MS;
        return {
          label: new Date(end).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          count: inWindow(end - WEEK_MS, end),
        };
      })
    : null;

  return {
    failed: false,
    total,
    last7: inWindow(now - WEEK_MS, now),
    prev7: inWindow(now - 2 * WEEK_MS, now - WEEK_MS),
    weekly,
  };
}

export const getProductMetrics = cache(async (): Promise<ProductMetrics> => {
  const api = await getApi();

  const [users, matches, cancellations, evaluations] = await Promise.all([
    crawlUsers(),
    fetchMatches(),
    // Only the server-side `total` is read; one row is the cheapest way to get it.
    api.GET("/v1/ops/cancellations", { params: { query: { limit: 1, offset: 0 } } }),
    api.GET("/v1/ops/player-evaluations"),
  ]);

  const cancelled =
    !cancellations.error && cancellations.data?.cancellations != null
      ? cancellations.data.total ?? 0
      : null;

  const completion =
    !matches.failed && cancelled != null && matches.total + cancelled > 0
      ? {
          rate: matches.total / (matches.total + cancelled),
          finished: matches.total,
          cancelled,
        }
      : null;

  let partnerRating: ProductMetrics["partnerRating"] = null;
  if (!evaluations.error && evaluations.data?.players != null) {
    const players = evaluations.data.players;
    const count = players.reduce((s, p) => s + p.count, 0);
    if (count > 0) {
      partnerRating = {
        avg: players.reduce((s, p) => s + p.avg_rating * p.count, 0) / count,
        count,
      };
    }
  }

  return { users, matches, completion, partnerRating };
});
