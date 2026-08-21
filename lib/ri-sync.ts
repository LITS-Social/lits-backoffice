import "server-only";
import type { ProductMetrics } from "@/lib/metrics";

/**
 * Campo que o BFF ainda NÃO declara no contrato, lido defensivamente — mesma
 * convenção do `genderOf`/`birthdateOf` da tabela de usuários: o painel acende
 * sozinho no dia em que o campo chegar, sem precisar de deploy do backoffice.
 *
 * `invites_accepted` e `quick_matches_filled` estavam no `openapi.d.ts`
 * commitado mas NÃO existem no `openapi.json` do bff-backoffice — o arquivo
 * gerado tinha derivado do contrato real, então `npm run generate:api` (o
 * próprio script do repo) quebrava o typecheck. Ler por aqui tira a dependência
 * do arquivo gerado estar adiantado, e o `?? null` que já existia continua
 * valendo: o funil mostra "sem dado", não zero.
 */
function pendingNum(o: object, key: string): number | null {
  const v = (o as Record<string, unknown>)[key];
  return typeof v === "number" ? v : null;
}

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

/** Academia como o RI precisa dela: cadastro, não agregado. */
export type AcademiaParaRi = {
  id: string;
  nome: string;
  /** endereço como o diretório o tem — o RI usa como região quando não há bairro */
  endereco?: string | null;
  quadras?: number | null;
  ativa?: boolean | null;
  /** partner | public | listing — o RI filtra por parceiras; sem o tipo, as
      centenas de venues do crawler afogariam a lista de importação */
  tipo?: string | null;
  /** preço padrão do slot em centavos (da franquia; senão o menor das quadras) */
  precoPadraoCents?: number | null;
  /** horário de funcionamento: [abre, último slot] por período; null = não definido */
  horarios?: {
    semana?: [number, number] | null;
    sabado?: [number, number] | null;
    domingo?: [number, number] | null;
  } | null;
  /** pisos distintos das quadras ("clay", "hard"…) */
  pisos?: string[] | null;
  /** quantas quadras são cobertas */
  cobertas?: number | null;
};

/**
 * Quadras → academias, no formato que a aba Parceiros do RI importa.
 * Uma academia é o conjunto de quadras da mesma franquia; ativa = tem ao
 * menos uma quadra ativa. Sem isto, alguém teria que redigitar no RI o
 * cadastro que já existe aqui — e divergir na primeira correção feita de um
 * lado só.
 */
export function academiasDasQuadras(
  courts: {
    franchise_id: string;
    franchise_name: string;
    franchise_kind?: string | null;
    franchise_street_address?: string | null;
    is_active?: boolean | null;
    price_cents?: number | null;
    franchise_default_price_cents?: number | null;
    franchise_hours_week_start?: number | null;
    franchise_hours_week_end?: number | null;
    franchise_hours_sat_start?: number | null;
    franchise_hours_sat_end?: number | null;
    franchise_hours_sun_start?: number | null;
    franchise_hours_sun_end?: number | null;
    surface?: string | null;
    indoor?: boolean | null;
  }[]
): AcademiaParaRi[] {
  /* Mesma regra da tela de academia (academia.tsx): sem horário definido na
     franquia, a grade é montada com 6h–22h, e sábado/domingo herdam a
     semana. O RI espelha o que o produto MOSTRA, não o campo cru — um null
     aqui virava "—" no perfil enquanto o backoffice exibia 6h–22h. */
  const faixa = (
    a?: number | null, b?: number | null, fallback: [number, number] = [6, 22]
  ): [number, number] => (a != null && b != null ? [a, b] : fallback);
  const porFranquia = new Map<string, AcademiaParaRi & { _pisos: Set<string> }>();
  for (const c of courts) {
    if (!c.franchise_id) continue;
    let atual = porFranquia.get(c.franchise_id);
    if (!atual) {
      atual = {
        id: c.franchise_id,
        nome: c.franchise_name,
        endereco: c.franchise_street_address ?? null,
        quadras: 0,
        ativa: false,
        tipo: c.franchise_kind ?? null,
        precoPadraoCents: c.franchise_default_price_cents ?? null,
        horarios: (() => {
          const semana = faixa(c.franchise_hours_week_start, c.franchise_hours_week_end);
          return {
            semana,
            sabado: faixa(c.franchise_hours_sat_start, c.franchise_hours_sat_end, semana),
            domingo: faixa(c.franchise_hours_sun_start, c.franchise_hours_sun_end, semana),
          };
        })(),
        cobertas: 0,
        _pisos: new Set<string>(),
      };
      porFranquia.set(c.franchise_id, atual);
    }
    atual.quadras = (atual.quadras ?? 0) + 1;
    atual.ativa = atual.ativa || c.is_active === true;
    if (c.indoor) atual.cobertas = (atual.cobertas ?? 0) + 1;
    if (c.surface) atual._pisos.add(c.surface);
    // sem preço da franquia, o menor preço de quadra representa a casa
    if (atual.precoPadraoCents == null && c.price_cents != null) atual.precoPadraoCents = c.price_cents;
    else if (c.price_cents != null && atual.precoPadraoCents != null && c.franchise_default_price_cents == null)
      atual.precoPadraoCents = Math.min(atual.precoPadraoCents, c.price_cents);
  }
  return [...porFranquia.values()]
    .map(({ _pisos, ...a }) => ({ ...a, pisos: _pisos.size ? [..._pisos].sort() : null }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function buildRiSnapshot(m: ProductMetrics, academias?: AcademiaParaRi[]) {
  const { users, matches, scorePosts, north, activationMonth, monthly, playerStats } = m;
  /* MGM: quem entrou por indicação. O RI mostrava "% por MGM" derivado do
     funil de PARTIDA (convites de jogo), que não é a mesma coisa — aqui vai o
     número certo, que este painel já cruza em `mgmCreatedAtMs`. */
  const agora = new Date();
  const mgm = m.mgmCreatedAtMs
    ? {
        total: m.mgmCreatedAtMs.length,
        mes: m.mgmCreatedAtMs.filter((ms) => {
          const d = new Date(ms);
          return d.getUTCFullYear() === agora.getUTCFullYear() && d.getUTCMonth() === agora.getUTCMonth();
        }).length,
      }
    : null;
  return {
    v: 1 as const,
    geradoEm: new Date().toISOString(),
    academias,
    mgm,
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
          convitesAceitos: pendingNum(north.matchFunnel, "invites_accepted"),
          quickMatchesAbertas: north.matchFunnel.quick_matches_opened ?? 0,
          quickMatchesPreenchidas: pendingNum(north.matchFunnel, "quick_matches_filled"),
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
export function pushRiSnapshot(m: ProductMetrics, academias?: AcademiaParaRi[]): void {
  const token = process.env.RI_SYNC_TOKEN;
  if (!token) return;
  const base = process.env.RI_SYNC_URL || "https://ri.lits.social";
  void fetch(`${base}/api/metrics-snapshot`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(buildRiSnapshot(m, academias)),
  }).catch(() => {
    /* melhor perder um snapshot do que poluir o log do painel */
  });
}
