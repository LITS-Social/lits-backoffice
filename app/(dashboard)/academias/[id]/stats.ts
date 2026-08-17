import "server-only";
import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

export type FranchiseStats = components["schemas"]["FranchiseStatsBody"];

/**
 * As duas métricas do topo da página da academia: quantos usuários a
 * declararam como preferida, e quantas reservas reais ela já teve.
 *
 * Mesma regra do getAcademiaMatches (matches.ts): um endpoint quebrado apaga
 * o bloco de estatísticas, não a página inteira — `null` faz o StatRail
 * desenhar "—" em vez de arriscar um zero falso.
 */
export async function getFranchiseStats(franchiseId: string): Promise<FranchiseStats | null> {
  const api = await getApi();
  try {
    const { data, error } = await api.GET("/v1/ops/franchises/{id}/stats", {
      params: { path: { id: franchiseId } },
    });
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}
