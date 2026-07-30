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
    ativacao: 0.25, novosAtivados: 151, totalAtivos: 151, ativosSobreBase: 0.206,
    churnBlended: 0.15, partidasPagasMes: 76, partidasTotaisMes: 151,
    gmvCents: 2_080_800, novosCadastros: 605, baseAcumulada: 735,
  },
  "2026-09": {
    ativacao: 0.30, novosAtivados: 389, totalAtivos: 520, ativosSobreBase: 0.256,
    churnBlended: 0.14, partidasPagasMes: 260, partidasTotaisMes: 520,
    gmvCents: 7_144_300, novosCadastros: 1_298, baseAcumulada: 2_033,
  },
  "2026-10": {
    ativacao: 0.35, novosAtivados: 771, totalAtivos: 1_219, ativosSobreBase: 0.288,
    churnBlended: 0.139, partidasPagasMes: 609, partidasTotaisMes: 1_219,
    gmvCents: 16_754_600, novosCadastros: 2_203, baseAcumulada: 4_237,
  },
  "2026-11": {
    ativacao: 0.42, novosAtivados: 1_571, totalAtivos: 2_621, ativosSobreBase: 0.329,
    churnBlended: 0.138, partidasPagasMes: 1_311, partidasTotaisMes: 2_621,
    gmvCents: 36_043_600, novosCadastros: 3_740, baseAcumulada: 7_977,
  },
  "2026-12": {
    ativacao: 0.50, novosAtivados: 2_753, totalAtivos: 5_017, ativosSobreBase: 0.372,
    churnBlended: 0.137, partidasPagasMes: 2_508, partidasTotaisMes: 5_017,
    gmvCents: 68_983_500, novosCadastros: 5_507, baseAcumulada: 13_484,
  },
  "2027-01": {
    ativacao: 0.50, novosAtivados: 3_772, totalAtivos: 8_112, ativosSobreBase: 0.386,
    churnBlended: 0.135, partidasPagasMes: 4_056, partidasTotaisMes: 8_112,
    gmvCents: 111_541_100, novosCadastros: 7_545, baseAcumulada: 21_029,
  },
  "2027-02": {
    ativacao: 0.50, novosAtivados: 4_674, totalAtivos: 11_691, ativosSobreBase: 0.385,
    churnBlended: 0.135, partidasPagasMes: 5_846, partidasTotaisMes: 11_691,
    gmvCents: 160_753_900, novosCadastros: 9_348, baseAcumulada: 30_377,
  },
  "2027-03": {
    ativacao: 0.50, novosAtivados: 5_458, totalAtivos: 15_571, ativosSobreBase: 0.377,
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
export function bpTarget(metric: keyof BpMonth): { value: number; monthLabel: string } | null {
  const keys = Object.keys(BP_MENSAL).sort();
  const cur = spYm();
  for (const k of keys) {
    if (k < cur) continue;
    const v = BP_MENSAL[k][metric];
    if (v !== undefined) {
      const [y, m] = k.split("-");
      return { value: v, monthLabel: `${MONTH_LABEL[m]}/${y.slice(2)}` };
    }
  }
  return null;
}

/** Receita LITS de uma partida paga pela fórmula do BP:
    comissão 7,5% + markup 10% sobre o valor da quadra + R$6 de marcação. */
export function receitaPorPartidaCents(priceCents: number): number {
  return Math.round(
    priceCents * (BP_PREMISSAS.comissao + BP_PREMISSAS.markup) + BP_PREMISSAS.taxaMarcacaoCents
  );
}
