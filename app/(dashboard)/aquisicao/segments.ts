/**
 * O vocabulário do CAC, num módulo SEM "server-only": o dropdown (cliente) e o
 * leitor da Meta (servidor) precisam concordar sobre o que é um segmento, e um
 * import de lib/meta-ads.ts no cliente explodiria o build.
 */
export type Segment = "usuarios" | "professores" | "academias";

export const SEGMENT_LABEL: Record<Segment, string> = {
  usuarios: "Usuários",
  professores: "Professores",
  academias: "Academias",
};

export type AdsetSpend = {
  adsetId: string;
  adsetName: string;
  campaignName: string;
  /** Gasto no mês-calendário de São Paulo selecionado, em centavos de BRL. */
  monthCents: number;
  /** Segmento confirmado no painel; null = ainda sem categoria. */
  segment: Segment | null;
  /** Sugestão derivada do nome, só para pré-selecionar o dropdown. */
  suggested: Segment | null;
};
