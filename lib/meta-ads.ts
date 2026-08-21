import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** O subconjunto do KV que usamos — o projeto não carrega @cloudflare/workers-types. */
type KVStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

/**
 * CAC · Fase 1 — leitura das campanhas do Facebook Ads e o mapa de segmentos.
 *
 * Grão de ADSET, não de campanha, de propósito: uma campanha com CBO pode ter
 * um adset mirando professor e outro mirando jogador. Adset sempre rola para
 * cima; o contrário não existe. Custa zero a mais agora e salva a
 * categorização depois.
 *
 * O mapeamento adset → segmento é decisão do OPERADOR, guardada no KV — nunca
 * convenção de nome como verdade. O nome entra só como SUGESTÃO na primeira
 * vez que o adset aparece: renomear campanha às 23h não pode mudar o CAC do
 * trimestre em silêncio. Adset sem categoria vira um balde próprio e visível,
 * com o valor gasto — nunca é excluído nem rateado.
 *
 * Sem `META_ADS_TOKEN`/`META_AD_ACCOUNT_ID` o painel mostra o passo a passo de
 * configuração em vez de quebrar — mesma postura do Amplitude no MGM.
 */

import type { AdsetSpend, Segment } from "@/app/(dashboard)/aquisicao/segments";

export type { AdsetSpend, Segment };

export type MetaAdsResult =
  | { ok: true; adsets: AdsetSpend[]; account: string }
  | { ok: false; error: string; setup: boolean };

/* ── O período ─────────────────────────────────────────────────────────────
   Três jeitos de dizer "quando", todos resolvidos para UMA janela de dias de
   São Paulo [since, until] inclusiva, fechada em hoje (a Meta não aceita
   futuro):
     mês       ?mes=YYYY-MM          o mês-calendário inteiro
     dias      ?dias=N               os últimos N dias, hoje incluso
     intervalo ?de=YYYY-MM-DD&ate=…  o que o operador marcou
   Prioridade: intervalo > dias > mês; nada válido = mês corrente. */

export type Period = {
  since: string;
  until: string;
  mode: "month" | "days" | "custom";
  /** Só no modo mês — é a chave do denominador de academias. */
  month?: string;
  days?: number;
};

const SP_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function spToday(): string {
  return SP_DATE.format(new Date());
}

function spDaysAgo(n: number): string {
  return SP_DATE.format(new Date(Date.now() - n * 86_400_000));
}

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "YYYY-MM" válido e não no futuro; senão, o mês corrente. */
export function normalizeMonth(raw: string | undefined): string {
  const cur = spMonthKey();
  if (!raw || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw) || raw > cur) return cur;
  return raw;
}

export function resolvePeriod(params: {
  mes?: string;
  dias?: string;
  de?: string;
  ate?: string;
}): Period {
  const today = spToday();

  if (params.de && DATE_RE.test(params.de)) {
    const since = params.de > today ? today : params.de;
    let until = params.ate && DATE_RE.test(params.ate) ? params.ate : today;
    if (until > today) until = today;
    if (until < since) until = since;
    return { since, until, mode: "custom" };
  }

  const n = Number(params.dias);
  if (Number.isInteger(n) && n >= 1 && n <= 366) {
    return { since: spDaysAgo(n - 1), until: today, mode: "days", days: n };
  }

  const month = normalizeMonth(params.mes);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // dia 0 do mês seguinte
  const until = `${month}-${String(last).padStart(2, "0")}`;
  return {
    since: `${month}-01`,
    until: until < today ? until : today,
    mode: "month",
    month,
  };
}

/** [início, fim) do período em ms — dias de São Paulo, fim exclusivo. */
export function periodBoundsMs(p: Period): { start: number; end: number } {
  const start = new Date(`${p.since}T00:00:00-03:00`).getTime();
  const end = new Date(`${p.until}T00:00:00-03:00`).getTime() + 86_400_000;
  return { start, end };
}

/** Sugestão pelo nome — SUGESTÃO, nunca verdade. Vocabulário PT dos anúncios. */
export function suggestSegment(name: string): Segment | null {
  const n = name.toLowerCase();
  if (/\bprof|coach|aula|professor/.test(n)) return "professores";
  if (/\bacademia|clube|club\b|quadra|parceir/.test(n)) return "academias";
  if (/\bjogador|player|usuario|usuário|install|cadastro|app\b/.test(n)) return "usuarios";
  return null;
}

async function kv(): Promise<KVStore | null> {
  try {
    const ctx = await getCloudflareContext({ async: true });
    return (ctx.env as { CAC_KV?: KVStore }).CAC_KV ?? null;
  } catch {
    // Dev local sem binding: o painel funciona só-leitura, com sugestões.
    return null;
  }
}

const MAP_KEY = "adset-segments:v1";

export async function loadSegmentMap(): Promise<Record<string, Segment>> {
  const store = await kv();
  if (!store) return {};
  try {
    const raw = await store.get(MAP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Segment>) : {};
  } catch {
    return {};
  }
}

export async function saveSegment(adsetId: string, segment: Segment | null): Promise<boolean> {
  const store = await kv();
  if (!store) return false;
  const map = await loadSegmentMap();
  if (segment === null) delete map[adsetId];
  else map[adsetId] = segment;
  await store.put(MAP_KEY, JSON.stringify(map));
  return true;
}

/* ── O denominador de academias ─────────────────────────────────────────
   Contrato B2B não nasce de formulário, e o diretório de franquias não expõe
   data de criação — a única fonte honesta do "quantas academias fechamos este
   mês" é quem fechou. Guardado por mês-calendário de SP ("2026-08" → 3), para
   o histórico não se perder quando o mês vira. */
const ACADEMIAS_KEY = "academias-fechadas:v1";

export function spMonthKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export async function loadAcademiasFechadas(month: string): Promise<number | null> {
  const store = await kv();
  if (!store) return null;
  try {
    const raw = await store.get(ACADEMIAS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    return typeof map[month] === "number" ? map[month] : null;
  } catch {
    return null;
  }
}

export async function saveAcademiasFechadas(month: string, n: number | null): Promise<boolean> {
  const store = await kv();
  if (!store) return false;
  let map: Record<string, number> = {};
  try {
    const raw = await store.get(ACADEMIAS_KEY);
    map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    map = {};
  }
  if (n === null) delete map[month];
  else map[month] = n;
  await store.put(ACADEMIAS_KEY, JSON.stringify(map));
  return true;
}

type InsightRow = {
  adset_id?: string;
  adset_name?: string;
  campaign_name?: string;
  spend?: string;
};

/**
 * Uma janela de insights, nível adset. A Meta devolve `spend` como string
 * decimal na moeda da conta; convertido para centavos com arredondamento —
 * nunca float adiante.
 */
async function fetchWindow(
  account: string,
  token: string,
  range: { since: string; until: string }
): Promise<Map<string, { name: string; campaign: string; cents: number }>> {
  const url = new URL(`https://graph.facebook.com/v21.0/act_${account}/insights`);
  url.searchParams.set("level", "adset");
  url.searchParams.set("fields", "adset_id,adset_name,campaign_name,spend");
  url.searchParams.set("time_range", JSON.stringify(range));
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", token);

  const out = new Map<string, { name: string; campaign: string; cents: number }>();
  let next: string | null = url.toString();
  // Paginação com teto: 5 páginas × 200 = 1000 adsets, muito acima do real.
  for (let page = 0; next && page < 5; page++) {
    const res: Response = await fetch(next, { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(body?.error?.message || `Meta respondeu ${res.status}`);
    }
    const data = (await res.json()) as { data?: InsightRow[]; paging?: { next?: string } };
    for (const r of data.data ?? []) {
      if (!r.adset_id) continue;
      out.set(r.adset_id, {
        name: r.adset_name ?? r.adset_id,
        campaign: r.campaign_name ?? "",
        cents: Math.round(parseFloat(r.spend ?? "0") * 100),
      });
    }
    next = data.paging?.next ?? null;
  }
  return out;
}

export async function fetchMetaAds(period: Period): Promise<MetaAdsResult> {
  const token = process.env.META_ADS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) {
    return {
      ok: false,
      setup: true,
      error:
        "Meta Ads não configurado. Crie um System User com ads_read no Business Manager e rode: npx wrangler secret put META_ADS_TOKEN e npx wrangler secret put META_AD_ACCOUNT_ID (o número da conta, sem o act_).",
    };
  }

  try {
    const [rows, map] = await Promise.all([
      fetchWindow(account, token, { since: period.since, until: period.until }),
      loadSegmentMap(),
    ]);

    const adsets: AdsetSpend[] = [...rows.entries()].map(([id, m]) => ({
      adsetId: id,
      adsetName: m.name,
      campaignName: m.campaign,
      monthCents: m.cents,
      segment: map[id] ?? null,
      suggested: suggestSegment(`${m.campaign} ${m.name}`),
    }));
    adsets.sort((a, b) => b.monthCents - a.monthCents);
    return { ok: true, adsets, account };
  } catch (e) {
    return {
      ok: false,
      setup: false,
      error: e instanceof Error ? e.message : "Falha ao falar com a Meta.",
    };
  }
}
