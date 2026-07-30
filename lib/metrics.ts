import { cache } from "react";
import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

/**
 * The product-metrics roll-up behind the home dashboard.
 *
 * Everything here is computed from rows that came off the wire, and every block
 * carries its own `failed` flag — one broken endpoint dims one card, not the
 * page. The funnel numbers the crawls cannot see (invites, onboarding,
 * referral codes) come pre-aggregated from `/v1/ops/product-metrics`; what the
 * schema still cannot measure (W.O., nota de equilíbrio) that endpoint returns
 * as null and the dashboard keeps as "sem dado", because a derived-looking
 * zero is the one lie this console does not tell.
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
   * Raw signup instants (ms epoch) for the client-side growth re-bucket —
   * timestamps only, nothing identifying crosses to the client. Null when the
   * crawl was truncated: a growth curve over part of the base has the wrong
   * shape, not a rough one.
   */
  createdAtMs: number[] | null;
  /** Accounts with no created_at (the field is optional) — folded into every
      cumulative total: they exist now and did not appear this quarter. */
  dateless: number;
  /**
   * Mutually exclusive engagement buckets over the whole base, by last_seen_at:
   * hoje ≤ 24h · semana 1–7d · mês 7–30d · inativos 30d+ or never seen.
   */
  activity: { hoje: number; semana: number; mes: number; inativos: number };
  /**
   * Índice mínimo por usuário (id + instante do cadastro) para o cruzamento
   * da taxa de ativação. Null quando a varredura foi truncada — uma coorte
   * parcial daria uma taxa com a forma errada.
   */
  index: { id: string; createdAtMs: number }[] | null;
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
  /** Reservas jogadas nos últimos 30 dias — fallback do numerador de
      jogos/usuário/mês quando o feed falha. Null quando a página é parcial. */
  last30: number | null;
  /**
   * Split das reservas jogadas por cobrança (price_cents > 0). Null quando a
   * página carregada não cobre o total — um split parcial mentiria.
   */
  paid: { total: number; last7: number; prev7: number; last30: number } | null;
  /** Raw starts_at instants (ms epoch) for the client-side pace re-bucket.
      Null when the page we hold is smaller than the server's total — a partial
      histogram would show weeks that do not exist. */
  startsAtMs: number[] | null;
  /** Instantes das reservas jogadas COM cobrança — série pagas × normais.
      Null quando a página é parcial. */
  paidStartsAtMs: number[] | null;
  /** (userId, instante) de cada perna jogada — host e convidado — para a taxa
      de ativação. Null quando a página é parcial. */
  legs: { userId: string; startsAtMs: number }[] | null;
};

/**
 * The backend's own Norte-do-Produto roll-up (`GET /v1/ops/product-metrics`).
 * Scalars are null when the backend cannot honestly compute them; everything
 * is null when the endpoint itself was unreachable (`failed`).
 */
export type NorthMetrics = {
  failed: boolean;
  /** LOWER BOUND: a declined/expired free invite clears guest_id and leaves no trace. */
  invitesSent7d: number | null;
  /** Invite funnel over bookings created in the last 7 days. */
  inviteAcceptance: { sent: number; accepted: number } | null;
  /** Accounts created in the last 7 days that came back with ≥1 authenticated request. */
  newActive7d: number | null;
  /** Onboarding→first-match conversion over the 14-day completion cohort. */
  onboarding: { cohort: number; converted: number } | null;
  /** Users created 14–21 days ago vs those seen in the last 7 days. */
  retentionWeek2: { cohort: number; returned: number } | null;
  /** Signup code redemptions in the last 7 days — 0 here is a real, measured 0. */
  referralCodesUsed7d: number | null;
  /** PROXY: guest matches that ended today (SP day) still 'confirmed' — no
      placar post, no live clock, no feedback. Nobody recorded anything. */
  woToday: number | null;
  /** Today's DAU (last_seen_at inside the SP day) vs those with no product action. */
  appOpenNoAction: { dau: number; no_action: number } | null;
  /** Quick Match audience density: candidate pool per active+onboarded user. */
  validMatchesPerUser: {
    avg_candidates: number;
    min_candidates: number;
    categories: { category: string; users: number }[] | null;
  } | null;
  /**
   * Server-side completion funnel (test users already excluded): played over
   * played + cancellations of CONFIRMED games; invites that expired without
   * ever being confirmed are counted separately and stay out of the rate.
   * The schema says the block always comes, but an old running BFF omits it —
   * hence nullable (deploy window).
   */
  completion: components["schemas"]["Completion"] | null;
  /** Intent→game conversion: played over invites + quick matches (all time).
      Null on the old-BFF deploy window. */
  matchFunnel: components["schemas"]["MatchFunnel"] | null;
};

/**
 * Score posts straight from the feed — the source of truth for "partidas com
 * placar". The booking-side `played` status undercounts it: feed-service only
 * flips a booking when the score post carries that booking's match_id, so
 * placares posted without a booking link (jogo combinado fora do app) and
 * best-effort MarkPlayed failures never reach /finished-matches.
 */
export type ScorePostsMetrics = {
  failed: boolean;
  /** score + match posts — as duas formas de registrar que o jogo aconteceu
      (o MarkPlayed do feed-service dispara para ambas). */
  total: number;
  /** Posts com placar formal (post_type=score). */
  scoreOnly: number;
  /** Registros de partida sem placar (post_type=match). */
  matchOnly: number;
  truncated: boolean;
  last7: number;
  prev7: number;
  /** Partidas registradas nos últimos 30 dias — numerador de jogos/usuário/mês. */
  last30: number;
};

async function crawlScorePosts(): Promise<ScorePostsMetrics> {
  const api = await getApi();
  const now = Date.now();
  type Row = { post_type: string; created_at?: string; deleted_at?: string };
  const rows: Row[] = [];
  let cursor: string | undefined;
  let truncated = false;
  try {
    for (let page = 0; ; page++) {
      if (page >= 20) {
        truncated = true;
        break;
      }
      // O endpoint valida limit ≤ 100 (huma 422 acima disso — foi exatamente
      // o que derrubou este crawl em produção com limit: 200).
      const { data, error } = await api.GET("/v1/ops/posts", {
        params: { query: { limit: 100, ...(cursor ? { cursor } : {}) } },
      });
      if (error || data.posts == null) throw new Error("posts page failed");
      rows.push(...data.posts);
      if (!data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
  } catch {
    return { failed: true, total: 0, scoreOnly: 0, matchOnly: 0, truncated: false, last7: 0, prev7: 0, last30: 0 };
  }
  const games = rows.filter(
    (r) => (r.post_type === "score" || r.post_type === "match") && !r.deleted_at
  );
  const within = (from: number, to: number) =>
    games.filter((r) => {
      if (!r.created_at) return false;
      const t = new Date(r.created_at).getTime();
      return t > from && t <= to;
    }).length;
  return {
    failed: false,
    total: games.length,
    scoreOnly: games.filter((r) => r.post_type === "score").length,
    matchOnly: games.filter((r) => r.post_type === "match").length,
    truncated,
    last7: within(now - WEEK_MS, now),
    prev7: within(now - 2 * WEEK_MS, now - WEEK_MS),
    last30: within(now - 30 * DAY_MS, now),
  };
}

export type ProductMetrics = {
  users: UsersMetrics;
  matches: MatchesMetrics;
  /** Placares publicados no feed (post_type=score, não deletados). */
  scorePosts: ScorePostsMetrics;
  north: NorthMetrics;
  /**
   * Preferred source is the server's completion block: finished = played,
   * cancelled = cancellations of CONFIRMED games only, and
   * `expiredNeverConfirmed` counts the invites that expired unconfirmed and are
   * excluded from the rate. On the old-BFF fallback the legacy math applies
   * (finished-total ÷ every cancellation) and `expiredNeverConfirmed` is null —
   * that null is how the UI knows to keep the legacy wording. Null when
   * neither source could be computed.
   */
  completion: {
    rate: number;
    finished: number;
    cancelled: number;
    expiredNeverConfirmed: number | null;
  } | null;
  /** Weighted mean of all partner ratings received. Null on failure or no ratings. */
  partnerRating: { avg: number; count: number } | null;
  /**
   * Ativação do modelo: coorte que jogou ≥1 partida (reserva jogada, host ou
   * convidado) em até N dias do cadastro ÷ coorte (contas cuja janela de N
   * dias já fechou). 30d é a premissa do modelo; 14d acompanha. Jogos
   * registrados apenas no feed sem reserva não contam (limite da fonte).
   * Null quando usuários ou reservas falharam.
   */
  activation: {
    d30: { rate: number; activated: number; cohort: number };
    d14: { rate: number; activated: number; cohort: number };
  } | null;
  /**
   * Ativo (mês M) = usuários distintos com ≥1 partida concluída dentro do mês
   * M (calendário de São Paulo). `current` é o mês corrente (parcial);
   * `prevClosed` o último mês fechado. Churn (mês M) = ativos em M-1 que não
   * jogaram em M ÷ ativos em M-1 — computado só sobre meses FECHADOS (churn de
   * mês parcial encolheria dia a dia). Null quando as reservas falharam.
   */
  monthly: {
    currentMonthActives: number;
    prevMonthActives: number;
    churn: { rate: number; left: number; base: number; month: string; baseMonth: string } | null;
  } | null;
};

async function crawlUsers(): Promise<UsersMetrics> {
  const api = await getApi();
  const now = Date.now();

  type Row = { id: string; created_at?: string; last_seen_at?: string };
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
      createdAtMs: null, dateless: 0, index: null,
      activity: { hoje: 0, semana: 0, mes: 0, inativos: 0 },
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

  // Raw instants for the client-side growth re-bucket (daily/weekly/range).
  // Same honesty contract the old server series had: truncated crawl → null.
  const dateless = rows.filter((r) => !r.created_at).length;
  const createdAtMs = truncated
    ? null
    : rows.filter((r) => r.created_at).map((r) => new Date(r.created_at!).getTime());

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
    createdAtMs,
    dateless,
    index: truncated
      ? null
      : rows
          .filter((r) => r.created_at)
          .map((r) => ({ id: r.id, createdAtMs: new Date(r.created_at!).getTime() })),
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
    return { failed: true, total: 0, last7: 0, prev7: 0, last30: null, paid: null, startsAtMs: null, paidStartsAtMs: null, legs: null };
  }

  const matches = data.matches;
  const total = data.total ?? matches.length;
  const complete = matches.length >= total;

  const inWindow = (from: number, to: number) =>
    matches.filter((m) => {
      const t = new Date(m.starts_at).getTime();
      return t > from && t <= to;
    }).length;

  // Raw instants for the client-side pace re-bucket — same honesty contract
  // the old server series had: partial page → null.
  const startsAtMs = complete ? matches.map((m) => new Date(m.starts_at).getTime()) : null;

  const paidRows = matches.filter((m) => (m.price_cents ?? 0) > 0);
  const paidWithin = (from: number, to: number) =>
    paidRows.filter((m) => {
      const t = new Date(m.starts_at).getTime();
      return t > from && t <= to;
    }).length;

  return {
    failed: false,
    total,
    last7: inWindow(now - WEEK_MS, now),
    prev7: inWindow(now - 2 * WEEK_MS, now - WEEK_MS),
    last30: complete ? inWindow(now - 30 * DAY_MS, now) : null,
    paid: complete
      ? {
          total: paidRows.length,
          last7: paidWithin(now - WEEK_MS, now),
          prev7: paidWithin(now - 2 * WEEK_MS, now - WEEK_MS),
          last30: paidWithin(now - 30 * DAY_MS, now),
        }
      : null,
    startsAtMs,
    paidStartsAtMs: complete
      ? paidRows.map((m) => new Date(m.starts_at).getTime())
      : null,
    legs: complete
      ? matches.flatMap((m) => {
          const t = new Date(m.starts_at).getTime();
          const out = [{ userId: m.host.user_id, startsAtMs: t }];
          if (m.guest?.user_id) out.push({ userId: m.guest.user_id, startsAtMs: t });
          return out;
        })
      : null,
  };
}

async function fetchNorth(): Promise<NorthMetrics> {
  const failed: NorthMetrics = {
    failed: true,
    invitesSent7d: null, inviteAcceptance: null, newActive7d: null,
    onboarding: null, retentionWeek2: null, referralCodesUsed7d: null,
    woToday: null, appOpenNoAction: null, validMatchesPerUser: null,
    completion: null, matchFunnel: null,
  };

  try {
    const api = await getApi();
    const { data, error } = await api.GET("/v1/ops/product-metrics");
    if (error || data == null) return failed;
    return {
      failed: false,
      invitesSent7d: data.invites_sent_7d,
      inviteAcceptance: data.invite_acceptance_7d,
      newActive7d: data.new_active_users_7d,
      onboarding: data.onboarding_to_first_match,
      retentionWeek2: data.retention_week2,
      referralCodesUsed7d: data.referral_codes_used_7d,
      woToday: data.wo_today,
      appOpenNoAction: data.app_open_no_action ?? null,
      validMatchesPerUser: data.valid_matches_per_user ?? null,
      // ?? null is the deploy-window guard: the schema says required, but an
      // old running BFF still omits the block.
      completion: data.completion ?? null,
      matchFunnel: data.match_funnel ?? null,
    };
  } catch {
    return failed;
  }
}

export const getProductMetrics = cache(async (): Promise<ProductMetrics> => {
  const api = await getApi();

  const [users, matches, scorePosts, north, cancellations, evaluations] = await Promise.all([
    crawlUsers(),
    fetchMatches(),
    crawlScorePosts(),
    fetchNorth(),
    // Only the server-side `total` is read; one row is the cheapest way to get it.
    api.GET("/v1/ops/cancellations", { params: { query: { limit: 1, offset: 0 } } }),
    api.GET("/v1/ops/player-evaluations"),
  ]);

  const cancelled =
    !cancellations.error && cancellations.data?.cancellations != null
      ? cancellations.data.total ?? 0
      : null;

  // Preferred: the server's completion block (confirmed-only cancellations,
  // expired invites excluded, test users already filtered). Old BFF in the
  // deploy window → fall back to the legacy client-side math, flagged by
  // expiredNeverConfirmed: null.
  const completion: ProductMetrics["completion"] = north.completion
    ? {
        rate: north.completion.rate,
        finished: north.completion.played,
        cancelled: north.completion.cancelled_confirmed,
        expiredNeverConfirmed: north.completion.expired_never_confirmed,
      }
    : !matches.failed && cancelled != null && matches.total + cancelled > 0
      ? {
          rate: matches.total / (matches.total + cancelled),
          finished: matches.total,
          cancelled,
          expiredNeverConfirmed: null,
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

  // Ativação: primeiro jogo de cada usuário (menor starts_at das suas pernas)
  // contra o instante do cadastro; coorte = contas cuja janela já fechou.
  let activation: ProductMetrics["activation"] = null;
  if (users.index && matches.legs) {
    const firstPlayed = new Map<string, number>();
    for (const leg of matches.legs) {
      const cur = firstPlayed.get(leg.userId);
      if (cur === undefined || leg.startsAtMs < cur) firstPlayed.set(leg.userId, leg.startsAtMs);
    }
    const now = Date.now();
    const windowRate = (days: number) => {
      const cohort = users.index!.filter((u) => now - u.createdAtMs >= days * DAY_MS);
      const activated = cohort.filter((u) => {
        const t = firstPlayed.get(u.id);
        return t !== undefined && t - u.createdAtMs <= days * DAY_MS;
      });
      return {
        rate: cohort.length > 0 ? activated.length / cohort.length : 0,
        activated: activated.length,
        cohort: cohort.length,
      };
    };
    activation = { d30: windowRate(30), d14: windowRate(14) };
  }

  // Ativo (mês) e churn — meses-calendário de São Paulo sobre as pernas.
  let monthly: ProductMetrics["monthly"] = null;
  if (matches.legs) {
    const monthKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
    });
    const monthName = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      month: "short",
    });
    const byMonth = new Map<string, Set<string>>();
    for (const leg of matches.legs) {
      const k = monthKey.format(new Date(leg.startsAtMs));
      const set = byMonth.get(k) ?? new Set<string>();
      set.add(leg.userId);
      byMonth.set(k, set);
    }
    const now = new Date();
    const shift = (monthsBack: number) =>
      new Date(now.getFullYear(), now.getMonth() - monthsBack, 15);
    const kCur = monthKey.format(shift(0));
    const kClosed = monthKey.format(shift(1));
    const kBase = monthKey.format(shift(2));
    const cur = byMonth.get(kCur) ?? new Set();
    const closed = byMonth.get(kClosed) ?? new Set();
    const base = byMonth.get(kBase) ?? new Set();
    // Churn do último mês FECHADO: quem jogou no mês-base e sumiu no seguinte.
    let churn: NonNullable<ProductMetrics["monthly"]>["churn"] = null;
    if (base.size > 0) {
      const left = [...base].filter((id) => !closed.has(id)).length;
      churn = {
        rate: left / base.size,
        left,
        base: base.size,
        month: monthName.format(shift(1)),
        baseMonth: monthName.format(shift(2)),
      };
    }
    monthly = { currentMonthActives: cur.size, prevMonthActives: closed.size, churn };
  }

  return { users, matches, scorePosts, north, completion, partnerRating, activation, monthly };
});
