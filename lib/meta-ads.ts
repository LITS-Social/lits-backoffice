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

/** O que o painel considera "hoje" — mês-calendário de São Paulo, como o BP. */
function spMonthRange(): { since: string; until: string } {
  const ym = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return { since: `${ym}-01`, until: today };
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

function daysAgoSP(days: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - days * 86_400_000));
}

export async function fetchMetaAds(): Promise<MetaAdsResult> {
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
    const [month, last28, map] = await Promise.all([
      fetchWindow(account, token, spMonthRange()),
      fetchWindow(account, token, { since: daysAgoSP(28), until: daysAgoSP(0) }),
      loadSegmentMap(),
    ]);

    const ids = new Set([...month.keys(), ...last28.keys()]);
    const adsets: AdsetSpend[] = [...ids].map((id) => {
      const m = month.get(id);
      const l = last28.get(id);
      const name = m?.name ?? l?.name ?? id;
      return {
        adsetId: id,
        adsetName: name,
        campaignName: m?.campaign ?? l?.campaign ?? "",
        monthCents: m?.cents ?? 0,
        last28Cents: l?.cents ?? 0,
        segment: map[id] ?? null,
        suggested: suggestSegment(`${m?.campaign ?? ""} ${name}`),
      };
    });
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
