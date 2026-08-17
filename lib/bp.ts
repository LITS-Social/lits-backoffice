/**
 * Business Plan 2026–27 — a régua que o dashboard compara contra.
 *
 * FONTE DE VERDADE: ri.lits.social (portal de RI, atrás de código de acesso —
 * por isso o painel carrega uma cópia tipada). Quando o BP mudar lá, atualize
 * AQUI; cada card mostra "BP <mês>: <alvo> · acima/abaixo" a partir destes
 * números. Valores monetários em CENTAVOS.
 */

export const BP_PREMISSAS = {
  /** Jogos pagos por usuário ativo / mês — a premissa central do modelo. */
  jogosPagosPorAtivoMes: 0.5,
  /** Jogos (pagos + normais) por usuário ativo / mês. */
  jogosPorAtivoMes: 2.0,
  /** Ticket médio da quadra (premissa de mercado SP). */
  ticketMedioCents: 25_000,
  /** Comissão da academia sobre o valor da quadra. */
  comissao: 0.075,
  /** Markup cobrado do usuário sobre o valor da quadra. */
  markup: 0.075,
  /** Taxa de marcação fixa por partida (R$3 de cada jogador). */
  taxaMarcacaoCents: 600,
  /** Receita LITS por partida na premissa: 250 × (7,5% + 7,5%) + R$6. */
  receitaPorPartidaCents: 4_350,
  /** GMV por partida na premissa: o ticket mais o markup do usuário. */
  gmvPorPartidaCents: 26_875,
  churnGratuitos: 0.15,
  churnMembros: 0.05,
} as const;

/** Uma coluna mensal da aba "Aquisição e Base Ativa". Campos ausentes = "–"
    no BP (pré-lançamento daquela linha). */
export type BpMonth = {
  ativacao?: number;
  novosAtivados?: number;
  totalAtivos?: number;
  /** Assinantes (estoque, fim do mês) — linha "Membros" da aba de escala. */
  membros?: number;
  ativosSobreBase?: number;
  churnBlended?: number;
  partidasPagasMes?: number;
  partidasTotaisMes?: number;
  gmvCents?: number;
  novosCadastros?: number;
  baseAcumulada?: number;
};

export const BP_MENSAL: Record<string, BpMonth> = {
  "2026-07": { baseAcumulada: 130 },
  "2026-08": {
    membros: 13, ativacao: 0.12, novosAtivados: 112, totalAtivos: 112,
    ativosSobreBase: 0.1053, churnBlended: 0.15, partidasPagasMes: 28,
    partidasTotaisMes: 112, gmvCents: 749_812, novosCadastros: 930, baseAcumulada: 1060,
  },
  "2026-09": {
    membros: 51, ativacao: 0.16, novosAtivados: 296, totalAtivos: 392,
    ativosSobreBase: 0.1348, churnBlended: 0.138, partidasPagasMes: 110,
    partidasTotaisMes: 392, gmvCents: 2_951_518, novosCadastros: 1850, baseAcumulada: 2910,
  },
  "2026-10": {
    membros: 133, ativacao: 0.2, novosAtivados: 610, totalAtivos: 949,
    ativosSobreBase: 0.1591, churnBlended: 0.137, partidasPagasMes: 304,
    partidasTotaisMes: 949, gmvCents: 8_158_916, novosCadastros: 3051, baseAcumulada: 5961,
  },
  "2026-11": {
    membros: 305, ativacao: 0.24, novosAtivados: 1215, totalAtivos: 2035,
    ativosSobreBase: 0.1846, churnBlended: 0.136, partidasPagasMes: 712,
    partidasTotaisMes: 2035, gmvCents: 19_138_561, novosCadastros: 5062,
    baseAcumulada: 11_024,
  },
  "2026-12": {
    membros: 652, ativacao: 0.28, novosAtivados: 2077, totalAtivos: 3837,
    ativosSobreBase: 0.2081, churnBlended: 0.135, partidasPagasMes: 1420,
    partidasTotaisMes: 3837, gmvCents: 38_157_173, novosCadastros: 7419,
    baseAcumulada: 18_443,
  },
  "2027-01": {
    membros: 1179, ativacao: 0.32, novosAtivados: 3223, totalAtivos: 6550,
    ativosSobreBase: 0.2297, churnBlended: 0.133, partidasPagasMes: 2555,
    partidasTotaisMes: 6550, gmvCents: 68_656_242, novosCadastros: 10_073,
    baseAcumulada: 28_516,
  },
  "2027-02": {
    membros: 1946, ativacao: 0.36, novosAtivados: 4557, totalAtivos: 10_242,
    ativosSobreBase: 0.2488, churnBlended: 0.132, partidasPagasMes: 4097,
    partidasTotaisMes: 10_242, gmvCents: 110_104_112, novosCadastros: 12_657,
    baseAcumulada: 41_173,
  },
  "2027-03": {
    membros: 2870, ativacao: 0.37, novosAtivados: 5449, totalAtivos: 14_350,
    ativosSobreBase: 0.2567, churnBlended: 0.131, partidasPagasMes: 5740,
    partidasTotaisMes: 14_350, gmvCents: 154_258_430, novosCadastros: 14_727,
    baseAcumulada: 55_900,
  },
};

const MONTH_LABEL: Record<string, string> = {
  "01": "jan", "02": "fev", "03": "mar", "04": "abr", "05": "mai", "06": "jun",
  "07": "jul", "08": "ago", "09": "set", "10": "out", "11": "nov", "12": "dez",
};

function spYm(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

/**
 * O alvo do BP para uma métrica no mês corrente (SP). Se o BP não define a
 * linha neste mês (pré-lançamento, "–"), cai para o PRIMEIRO mês futuro que
 * define — o rótulo diz de qual mês o alvo é (ex.: "BP ago/26").
 */
export function bpTarget(
  mensal: Record<string, BpMonth>,
  metric: keyof BpMonth
): { value: number; monthLabel: string } | null {
  const keys = Object.keys(mensal).sort();
  const cur = spYm();
  for (const k of keys) {
    if (k < cur) continue;
    const v = mensal[k][metric];
    if (v !== undefined) {
      const [y, m] = k.split("-");
      return { value: v, monthLabel: `${MONTH_LABEL[m]}/${y.slice(2)}` };
    }
  }
  return null;
}

/** "Jul/26" (formato do RI) → "2026-07". */
const RI_MONTH: Record<string, string> = {
  Jan: "01", Fev: "02", Mar: "03", Abr: "04", Mai: "05", Jun: "06",
  Jul: "07", Ago: "08", Set: "09", Out: "10", Nov: "11", Dez: "12",
};

type RiBpPayload = {
  v: number;
  months: string[];
  q: {
    usuariosAtivos?: (number | null)[];
    partidas?: (number | null)[];
    gmv?: (number | null)[];
    baseCadastrada?: (number | null)[];
    membros?: (number | null)[];
  };
  operacional?: {
    ativacao?: (number | null)[];
    novosAtivados?: (number | null)[];
    ativosSobreBase?: (number | null)[];
    churnBlended?: (number | null)[];
  };
};

/**
 * O BP vivo: busca do portal de RI (fonte única, lib/bp-data.ts de lá) e cai
 * para a cópia versionada acima quando o RI está fora do ar ou o sync não
 * está configurado. Cache de 1h por instância.
 */
export async function getBp(): Promise<Record<string, BpMonth>> {
  const token = process.env.RI_SYNC_TOKEN;
  const base = process.env.RI_SYNC_URL || "https://ri.lits.social";
  if (!token) return BP_MENSAL;
  try {
    const res = await fetch(`${base}/api/bp`, {
      headers: { authorization: `Bearer ${token}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return BP_MENSAL;
    const bp = (await res.json()) as RiBpPayload;
    if (bp.v !== 1 || !Array.isArray(bp.months)) return BP_MENSAL;
    const out: Record<string, BpMonth> = {};
    bp.months.forEach((label, i) => {
      const [mon, yy] = label.split("/");
      const mm = RI_MONTH[mon];
      if (!mm || !yy) return;
      const key = `20${yy}-${mm}`;
      const pick = (arr?: (number | null)[]) => {
        const v = arr?.[i];
        return v == null || v === 0 ? undefined : v;
      };
      const gmvReais = pick(bp.q.gmv);
      const remote: BpMonth = {
        ativacao: pick(bp.operacional?.ativacao),
        novosAtivados: pick(bp.operacional?.novosAtivados),
        ativosSobreBase: pick(bp.operacional?.ativosSobreBase),
        churnBlended: pick(bp.operacional?.churnBlended),
        totalAtivos: pick(bp.q.usuariosAtivos),
        membros: pick(bp.q.membros),
        partidasPagasMes: pick(bp.q.partidas),
        gmvCents: gmvReais !== undefined ? Math.round(gmvReais * 100) : undefined,
        baseAcumulada: pick(bp.q.baseCadastrada),
      };
      // Campo a campo: o remoto manda quando define; o que o /api/bp não
      // carrega (partidasTotaisMes, novosCadastros) cai na cópia local — sem
      // isto, "Partidas totais" ficava sem meta em produção.
      const defined = Object.fromEntries(
        Object.entries(remote).filter(([, v]) => v !== undefined)
      );
      out[key] = { ...(BP_MENSAL[key] ?? {}), ...defined };
    });
    // Meses que só a cópia local conhece continuam valendo.
    for (const k of Object.keys(BP_MENSAL)) {
      if (!out[k]) out[k] = BP_MENSAL[k];
    }
    return Object.keys(out).length > 0 ? out : BP_MENSAL;
  } catch {
    return BP_MENSAL;
  }
}

/**
 * Meta de PERNAS pagas por ativo no mês — o multiplicador que transforma
 * ativo em receita.
 *
 * Não é a premissa de 0,5: essa é só o ponto de partida. O plano sobe a fatia
 * de partidas pagas dentro do app de 25% para 40% ao longo do ano, e a razão
 * acompanha — 0,50 em ago, 0,64 em out, 0,80 em fev. Comparar o real de
 * dezembro com 0,5 diria "acima da meta" quando o plano pede 0,74.
 *
 * Em PERNAS porque é assim que o real é contado (cada partida consome dois
 * jogadores) e é assim que a premissa do BP fala: 2,0 jogos por ativo/mês com
 * uma partida por ativo é exatamente duas pernas.
 */
export function metaPernasPagasPorAtivo(m: BpMonth): number | null {
  if (m.partidasPagasMes === undefined || !m.totalAtivos) return null;
  return (2 * m.partidasPagasMes) / m.totalAtivos;
}

/** Receita LITS de uma partida paga pela fórmula do BP:
    comissão 7,5% + markup 7,5% sobre o valor da quadra + R$6 de marcação. */
export function receitaPorPartidaCents(priceCents: number): number {
  return Math.round(
    priceCents * (BP_PREMISSAS.comissao + BP_PREMISSAS.markup) + BP_PREMISSAS.taxaMarcacaoCents
  );
}
