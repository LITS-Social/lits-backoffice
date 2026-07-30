import "server-only";
import type { ProductMetrics } from "@/lib/metrics";

/**
 * Sincronização com o portal de RI (ri.lits.social).
 *
 * O BFF exige o JWT humano em toda leitura, então nem o RI nem um cron
 * conseguem puxar métricas direto. A ponte é um PUSH: sempre que o Norte do
 * Produto renderiza (staff logado, JWT válido), o worker empurra um snapshot
 * AGREGADO — contagens, taxas, GMV; nunca PII — para o RI, que guarda no
 * Supabase e monta "Real vs Plano" para o investidor. Frescor = última vez
 * que alguém do time abriu o dashboard; para investidor, é o suficiente.
 *
 * Envs no worker: RI_SYNC_URL (default https://ri.lits.social) e
 * RI_SYNC_TOKEN (o mesmo BACKOFFICE_SYNC_TOKEN configurado na Vercel do RI).
 * Sem token configurado, o push é um no-op silencioso.
 */

export function buildRiSnapshot(m: ProductMetrics) {
  const { users, matches, scorePosts, north, activationMonth, monthly, playerStats } = m;
  return {
    v: 1 as const,
    geradoEm: new Date().toISOString(),
    usuarios: users.failed
      ? undefined
      : {
          total: users.total,
          novos7d: users.newLast7,
          abriramApp7d: users.activity.hoje + users.activity.semana,
          abriramApp30d: users.activity.hoje + users.activity.semana + users.activity.mes,
        },
    partidas: matches.failed
      ? undefined
      : {
          reservasJogadasTotal: matches.total,
          pagasTotal: matches.paid?.total ?? 0,
          pagasMes: matches.paid?.month ?? 0,
          registradasFeedTotal: scorePosts.failed ? 0 : scorePosts.total,
        },
    dinheiro: matches.gmv
      ? {
          gmvTotalCents: matches.gmv.totalCents,
          gmvMesCents: matches.gmv.monthCents,
          receitaEstTotalCents: matches.gmv.receitaTotalCents,
          receitaEstMesCents: matches.gmv.receitaMonthCents,
        }
      : undefined,
    funil: north.matchFunnel
      ? {
          convitesEnviados: north.matchFunnel.invites_sent ?? 0,
          convitesAceitos: north.matchFunnel.invites_accepted ?? null,
          quickMatchesAbertas: north.matchFunnel.quick_matches_opened ?? 0,
          quickMatchesPreenchidas: north.matchFunnel.quick_matches_filled ?? null,
          realizadas: north.matchFunnel.played,
          conversao: north.matchFunnel.rate,
        }
      : null,
    engajamento: {
      ativosJogaram30d: playerStats?.ativosJogaram30 ?? 0,
      participacoes30d: playerStats?.participacoes30 ?? 0,
      participacoesPagas30d: playerStats?.participacoesPagas30 ?? 0,
      ativacaoMes: activationMonth,
      repeticao: playerStats
        ? {
            repetiram: playerStats.repetition.everRepeated,
            estrearam: playerStats.repetition.everPlayers,
          }
        : null,
      ativosMes: monthly?.currentMonthActives ?? null,
      churnMesFechado: monthly?.churn
        ? { rate: monthly.churn.rate, base: monthly.churn.base }
        : null,
    },
  };
}

/** Fire-and-forget: nunca atrasa nem derruba o render do dashboard. */
export function pushRiSnapshot(m: ProductMetrics): void {
  const token = process.env.RI_SYNC_TOKEN;
  if (!token) return;
  const base = process.env.RI_SYNC_URL || "https://ri.lits.social";
  void fetch(`${base}/api/metrics-snapshot`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(buildRiSnapshot(m)),
  }).catch(() => {
    /* melhor perder um snapshot do que poluir o log do painel */
  });
}
