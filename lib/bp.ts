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
  jogosPagosPorAtivoMes: 1.0,
  /** Jogos (pagos + normais) por usuário ativo / mês. */
  jogosPorAtivoMes: 2.0,
  /** Ticket médio da quadra (premissa de mercado SP). */
  ticketMedioCents: 25_000,
  /** Comissão da academia sobre o valor da quadra. */
  comissao: 0.075,
  /** Markup cobrado do usuário sobre o valor da quadra. */
  markup: 0.10,
  /** Taxa de marcação fixa por partida (R$3 de cada jogador). */
  taxaMarcacaoCents: 600,
  /** Receita LITS por partida na premissa (comissão + markup + marcação). */
  receitaPorPartidaCents: 5_000,
  /** GMV por partida na premissa (valor que passa pelo gateway). */
  gmvPorPartidaCents: 27_500,
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
    membros: 15, ativacao: 0.25, novosAtivados: 151, totalAtivos: 151, ativosSobreBase: 0.206,
    churnBlended: 0.15, partidasPagasMes: 76, partidasTotaisMes: 151,
    gmvCents: 2_080_800, novosCadastros: 605, baseAcumulada: 735,
  },
  "2026-09": {
    membros: 57, ativacao: 0.30, novosAtivados: 389, totalAtivos: 520, ativosSobreBase: 0.256,
    churnBlended: 0.14, partidasPagasMes: 260, partidasTotaisMes: 520,
    gmvCents: 7_144_300, novosCadastros: 1_298, baseAcumulada: 2_033,
  },
  "2026-10": {
    membros: 146, ativacao: 0.35, novosAtivados: 771, totalAtivos: 1_219, ativosSobreBase: 0.288,
    churnBlended: 0.139, partidasPagasMes: 609, partidasTotaisMes: 1_219,
    gmvCents: 16_754_600, novosCadastros: 2_203, baseAcumulada: 4_237,
  },
  "2026-11": {
    membros: 354, ativacao: 0.42, novosAtivados: 1_571, totalAtivos: 2_621, ativosSobreBase: 0.329,
    churnBlended: 0.138, partidasPagasMes: 1_311, partidasTotaisMes: 2_621,
    gmvCents: 36_043_600, novosCadastros: 3_740, baseAcumulada: 7_977,
  },
  "2026-12": {
    membros: 753, ativacao: 0.50, novosAtivados: 2_753, totalAtivos: 5_017, ativosSobreBase: 0.372,
    churnBlended: 0.137, partidasPagasMes: 2_508, partidasTotaisMes: 5_017,
    gmvCents: 68_983_500, novosCadastros: 5_507, baseAcumulada: 13_484,
  },
  "2027-01": {
    membros: 1_217, ativacao: 0.50, novosAtivados: 3_772, totalAtivos: 8_112, ativosSobreBase: 0.386,
    churnBlended: 0.135, partidasPagasMes: 4_056, partidasTotaisMes: 8_112,
    gmvCents: 111_541_100, novosCadastros: 7_545, baseAcumulada: 21_029,
  },
  "2027-02": {
    membros: 1_754, ativacao: 0.50, novosAtivados: 4_674, totalAtivos: 11_691, ativosSobreBase: 0.385,
    churnBlended: 0.135, partidasPagasMes: 5_846, partidasTotaisMes: 11_691,
    gmvCents: 160_753_900, novosCadastros: 9_348, baseAcumulada: 30_377,
  },
  "2027-03": {
    membros: 2_336, ativacao: 0.50, novosAtivados: 5_458, totalAtivos: 15_571, ativosSobreBase: 0.377,
    churnBlended: 0.135, partidasPagasMes: 7_785, partidasTotaisMes: 15_571,
    gmvCents: 214_097_800, novosCadastros: 10_916, baseAcumulada: 41_293,
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

/** Receita LITS de uma partida paga pela fórmula do BP:
    comissão 7,5% + markup 10% sobre o valor da quadra + R$6 de marcação. */
export function receitaPorPartidaCents(priceCents: number): number {
  return Math.round(
    priceCents * (BP_PREMISSAS.comissao + BP_PREMISSAS.markup) + BP_PREMISSAS.taxaMarcacaoCents
  );
}
