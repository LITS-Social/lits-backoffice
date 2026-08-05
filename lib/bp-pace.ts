import "server-only";
import type { BpMonth } from "@/lib/bp";
import { BP_PREMISSAS } from "@/lib/bp";
import type { ProductMetrics } from "@/lib/metrics";

/**
 * Trajetória vs BP — a série que responde "estamos no ritmo?" por dia e por
 * semana, para os seis cards do topo (usuários, partidas totais, pagas, GMV,
 * receita e ticket médio).
 *
 * O BP é MENSAL. A meta diária é a interpolação linear entre os fechamentos de
 * mês — uma régua de ritmo, não uma promessa dia a dia — e o rótulo da seção
 * diz isso. O real é o acumulado dos eventos que o painel já carrega (cadastros,
 * reservas jogadas, pagas com valor). A meta é null antes do primeiro mês que o
 * BP define: inventar rampa para julho seria mentir com régua.
 */

const DAY_MS = 24 * 3600_000;
const SP_OFFSET = "-03:00";

export type PacePoint = { label: string; real: number | null; meta: number | null };

export type PaceItem = {
  key: string;
  label: string;
  /** "count" | "brl" — como formatar valores (brl = reais). */
  kind: "count" | "brl";
  daily: PacePoint[];
  weekly: PacePoint[];
  /** Acumulado real hoje e a meta interpolada de hoje (null = BP não define). */
  realNow: number;
  metaNow: number | null;
};

/** "2026-08" → ms do primeiro instante do mês em SP. */
function monthStartMs(ym: string): number {
  return new Date(`${ym}-01T00:00:00${SP_OFFSET}`).getTime();
}

/** ms do primeiro instante do mês SEGUINTE (= fechamento deste). */
function monthEndMs(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return monthStartMs(next);
}

/** Dia SP de hoje, truncado (primeiro instante do dia). */
function todayStartMs(now: number): number {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(now));
  return new Date(`${ymd}T00:00:00${SP_OFFSET}`).getTime();
}

const dayLabel = (ms: number) =>
  new Date(ms).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

type Checkpoint = { atMs: number; cum: number };

/** Fechamentos cumulativos: cada mês do BP vira (fim do mês, acumulado). O
    âncora inicial é o começo do primeiro mês definido, com o acumulado que já
    existia (0 para fluxos; para estoque — usuários — o próprio primeiro valor
    fica só no fechamento, sem âncora inventada). */
function checkpoints(
  mensal: Record<string, BpMonth>,
  pick: (m: BpMonth) => number | undefined,
  flow: boolean
): Checkpoint[] {
  const keys = Object.keys(mensal).sort();
  const out: Checkpoint[] = [];
  let cum = 0;
  let anchored = false;
  for (const k of keys) {
    const v = pick(mensal[k]);
    if (v === undefined) continue;
    if (!anchored) {
      // Fluxo (partidas, GMV): antes do primeiro mês definido o plano é 0.
      // Estoque (base acumulada): não há como saber a rampa anterior — a meta
      // começa a existir no primeiro fechamento.
      if (flow) out.push({ atMs: monthStartMs(k), cum: 0 });
      anchored = true;
    }
    cum = flow ? cum + v : v;
    out.push({ atMs: monthEndMs(k), cum });
  }
  return out;
}

/** Meta interpolada no instante t; null fora do trecho que o BP define. */
function metaAt(cps: Checkpoint[], t: number): number | null {
  if (cps.length === 0 || t < cps[0].atMs) return null;
  for (let i = 1; i < cps.length; i++) {
    if (t <= cps[i].atMs) {
      const a = cps[i - 1];
      const b = cps[i];
      const f = (t - a.atMs) / (b.atMs - a.atMs);
      return a.cum + (b.cum - a.cum) * f;
    }
  }
  return cps[cps.length - 1].cum;
}

type Ev = { t: number; v: number };

function series(
  events: Ev[],
  baseOffset: number,
  cps: Checkpoint[],
  startMs: number,
  endMs: number,
  todayMs: number,
  stepMs: number,
  ratioDen?: Ev[]
): PacePoint[] {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const den = ratioDen ? [...ratioDen].sort((a, b) => a.t - b.t) : null;
  const out: PacePoint[] = [];
  for (let t = startMs; ; t += stepMs) {
    const clamped = Math.min(t, endMs);
    let real: number | null = null;
    if (clamped <= todayMs + DAY_MS - 1) {
      let cum = baseOffset;
      for (const e of sorted) {
        if (e.t <= clamped) cum += e.v;
        else break;
      }
      if (den) {
        let d = 0;
        for (const e of den) {
          if (e.t <= clamped) d += e.v;
          else break;
        }
        real = d > 0 ? cum / d : null;
      } else {
        real = cum;
      }
    }
    out.push({ label: dayLabel(clamped), real, meta: metaAt(cps, clamped) });
    if (t >= endMs) break;
  }
  return out;
}

/** Os seis itens da trajetória, prontos para o cliente desenhar. */
export function buildBpPace(m: ProductMetrics, mensal: Record<string, BpMonth>): PaceItem[] {
  const now = Date.now();
  const today = todayStartMs(now);
  const { users, matches } = m;

  // Janela: do primeiro mês do BP até o fim do mês corrente.
  const keys = Object.keys(mensal).sort();
  if (keys.length === 0) return [];
  const startMs = monthStartMs(keys[0]);
  const curYm = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(now));
  const endMs = monthEndMs(curYm) - DAY_MS; // último dia do mês corrente

  const items: PaceItem[] = [];
  const push = (
    key: string,
    label: string,
    kind: "count" | "brl",
    events: Ev[] | null,
    baseOffset: number,
    cps: Checkpoint[],
    ratioDen?: Ev[] | null
  ) => {
    if (!events) return; // série parcial: melhor ausente que com a forma errada
    const daily = series(events, baseOffset, cps, startMs, endMs, today, DAY_MS, ratioDen ?? undefined);
    const weekly = series(events, baseOffset, cps, startMs, endMs, today, 7 * DAY_MS, ratioDen ?? undefined);
    const last = daily.filter((p) => p.real != null).at(-1);
    const todayPoint = daily.find((p) => p.label === dayLabel(today));
    items.push({
      key,
      label,
      kind,
      daily,
      weekly,
      realNow: last?.real ?? 0,
      metaNow: todayPoint?.meta ?? metaAt(cps, today),
    });
  };

  push(
    "usuarios",
    "Usuários (base)",
    "count",
    users.createdAtMs?.map((t) => ({ t, v: 1 })) ?? null,
    users.dateless,
    checkpoints(mensal, (x) => x.baseAcumulada, false)
  );
  push(
    "partidas",
    "Partidas totais",
    "count",
    matches.startsAtMs?.map((t) => ({ t, v: 1 })) ?? null,
    0,
    checkpoints(mensal, (x) => x.partidasTotaisMes, true)
  );
  push(
    "pagas",
    "Partidas pagas",
    "count",
    matches.paidStartsAtMs?.map((t) => ({ t, v: 1 })) ?? null,
    0,
    checkpoints(mensal, (x) => x.partidasPagasMes, true)
  );
  push(
    "gmv",
    "GMV",
    "brl",
    matches.paidEvents?.map((e) => ({ t: e.t, v: e.cents / 100 })) ?? null,
    0,
    checkpoints(mensal, (x) => (x.gmvCents === undefined ? undefined : x.gmvCents / 100), true)
  );
  push(
    "receita",
    "Receita LITS (est.)",
    "brl",
    matches.paidEvents?.map((e) => ({
      t: e.t,
      v: (e.cents * (BP_PREMISSAS.comissao + BP_PREMISSAS.markup) + BP_PREMISSAS.taxaMarcacaoCents) / 100,
    })) ?? null,
    0,
    checkpoints(
      mensal,
      (x) =>
        x.gmvCents === undefined || x.partidasPagasMes === undefined
          ? undefined
          : (x.gmvCents * (BP_PREMISSAS.comissao + BP_PREMISSAS.markup) +
              x.partidasPagasMes * BP_PREMISSAS.taxaMarcacaoCents) /
            100,
      true
    )
  );
  // Ticket médio: razão de acumulados (GMV ÷ pagas) contra a premissa chapada.
  push(
    "ticket",
    "Ticket médio (pago)",
    "brl",
    matches.paidEvents?.map((e) => ({ t: e.t, v: e.cents / 100 })) ?? null,
    0,
    [
      { atMs: startMs, cum: BP_PREMISSAS.ticketMedioCents / 100 },
      { atMs: endMs, cum: BP_PREMISSAS.ticketMedioCents / 100 },
    ],
    matches.paidStartsAtMs?.map((t) => ({ t, v: 1 })) ?? null
  );

  return items;
}
