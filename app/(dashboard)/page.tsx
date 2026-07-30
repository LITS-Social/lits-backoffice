import Link from "next/link";
import { AlertTriangle, ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getProductMetrics } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import {
  ChartCard,
  ChartUnavailable,
  ChartsGrid,
  PaidSplitChart,
  EngagementDonut,
} from "./_components/metric-charts";

export const dynamic = "force-dynamic";

/**
 * Metas da fase (beta fechado). Quando a fase virar, os alvos mudam AQUI e em
 * lugar nenhum mais — barras, percentuais e status recalculam sozinhos.
 */
const META_FASE = {
  usuarios: 200,
  partidas: 300,
};
const META_CONCLUSAO = 0.7;

const pct = (x: number) => `${Math.round(x * 100)}%`;

/* ── KPI tile: one number, its weekly delta, nothing else ──────────────────── */

/* ── Funil de partidas — barras segmentadas, tentativa → jogo ────────────── */

type FunnelData = {
  played: number;
  invites_sent?: number;
  invites_accepted?: number;
  quick_matches_opened?: number;
  quick_matches_filled?: number;
  rate: number;
} | null;

function FunnelBar({
  label,
  total,
  max,
  segments,
}: {
  label: string;
  total: number;
  max: number;
  /** Segmentos em ordem fixa; cores do par categórico validado (cat-a/cat-b). */
  segments: { name: string; value: number; color: string }[];
}) {
  const width = max > 0 ? Math.max((total / max) * 100, total > 0 ? 3 : 0) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[11.5px] font-500 text-[var(--text-secondary)]">{label}</span>
        <span className="numeral text-[15px] text-[var(--text-primary)]">{total}</span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-[4px] bg-[var(--surface-raised)]">
        <div className="flex h-full gap-[2px]" style={{ width: `${width}%` }}>
          {segments
            .filter((seg) => seg.value > 0)
            .map((seg) => (
              <div
                key={seg.name}
                title={`${seg.name}: ${seg.value}`}
                className="h-full min-w-[3px] rounded-[3px]"
                style={{ flex: seg.value, background: seg.color }}
              />
            ))}
        </div>
      </div>
      {segments.length > 1 && (
        <p className="mt-1 flex flex-wrap gap-x-3 text-[10.5px] font-300 text-[var(--text-tertiary)]">
          {segments.map((seg) => (
            <span key={seg.name} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2 w-2 rounded-[2px]"
                style={{ background: seg.color }}
              />
              {seg.value} {seg.name}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/**
 * As métricas interligadas do funil numa visualização só: tentativas abertas
 * (convites × quick matches) → quantas viraram jogo marcado → realizadas
 * (pagas × normais), com a conversão como número-herói ao lado. Barras
 * segmentadas com o par categórico do mesmo matiz (validado p/ CVD); rótulos
 * diretos por segmento cobrem o relief de contraste exigido pela paleta.
 */
function FunnelSection({
  funnel,
  paid,
  inviteAcceptance7d,
}: {
  funnel: FunnelData;
  paid: { total: number; last7: number; prev7: number; last30: number } | null;
  inviteAcceptance7d: { sent: number; accepted: number } | null;
}) {
  if (!funnel) {
    return (
      <div className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
        <h2 className="eyebrow">Funil de partidas</h2>
        <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Tentativas → jogos marcados → realizadas. Chega com o deploy do bff-backoffice
          (bloco match_funnel).
        </p>
      </div>
    );
  }

  const invites = funnel.invites_sent ?? 0;
  const qms = funnel.quick_matches_opened ?? 0;
  const tentativas = invites + qms;
  const accepted = funnel.invites_accepted ?? null;
  const filled = funnel.quick_matches_filled ?? null;
  const confirmed = accepted != null && filled != null ? accepted + filled : null;
  const pagas = paid?.total ?? null;
  const catA = "var(--chart-cat-a)";
  const catB = "var(--chart-cat-b)";

  return (
    <div className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="eyebrow">Funil de partidas</h2>
        <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Cada tentativa aberta no produto até virar jogo — convites e quick matches lado a
          lado, do primeiro clique à partida realizada.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_200px]">
        <div className="space-y-5">
          <FunnelBar
            label="Tentativas criadas"
            total={tentativas}
            max={tentativas}
            segments={[
              { name: "convites", value: invites, color: catA },
              { name: "quick matches", value: qms, color: catB },
            ]}
          />
          {confirmed != null ? (
            <FunnelBar
              label="Viraram jogo marcado"
              total={confirmed}
              max={tentativas}
              segments={[
                { name: "convites aceitos", value: accepted!, color: catA },
                { name: "quick matches preenchidas", value: filled!, color: catB },
              ]}
            />
          ) : (
            <p className="text-[10.5px] font-300 text-[var(--text-tertiary)]">
              Aceitação e preenchimento por etapa chegam no próximo deploy do bff
              {inviteAcceptance7d && inviteAcceptance7d.sent > 0
                ? ` — na janela de 7 dias, ${inviteAcceptance7d.accepted} de ${inviteAcceptance7d.sent} convites aceitos (${pct(
                    inviteAcceptance7d.accepted / inviteAcceptance7d.sent
                  )}).`
                : "."}
            </p>
          )}
          <FunnelBar
            label="Partidas realizadas"
            total={funnel.played}
            max={tentativas}
            segments={
              pagas != null
                ? [
                    { name: "pagas", value: Math.min(pagas, funnel.played), color: catA },
                    { name: "normais", value: Math.max(0, funnel.played - pagas), color: catB },
                  ]
                : [{ name: "realizadas", value: funnel.played, color: catA }]
            }
          />
        </div>
        <div className="flex flex-col items-start justify-center gap-1 border-t border-[var(--border)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <span className="label-colus text-[8.5px] text-[var(--text-tertiary)]">
            Taxa de conversão
          </span>
          <span className="numeral text-[40px] leading-none text-[var(--primary)]">
            {pct(funnel.rate)}
          </span>
          <span className="text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
            {funnel.played} realizadas ÷ {tentativas} tentativas
          </span>
          {confirmed != null && tentativas > 0 && (
            <span className="mt-2 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
              {pct(confirmed / tentativas)} viraram jogo marcado
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  deltaGood,
  context,
}: {
  label: string;
  value: string;
  /** WoW movement, already formatted ("+19", "-3pp"). Omit when unknowable. */
  delta?: string;
  deltaGood?: boolean;
  context: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="label-colus text-[8.5px] text-[var(--text-tertiary)]">{label}</p>
      <div className="mt-2.5 flex items-baseline justify-between gap-2">
        <span className="numeral text-[32px] text-[var(--text-primary)]">{value}</span>
        {delta && (
          <span
            className={cn(
              "flex items-center gap-1 text-[11px] font-600 tabular-nums",
              deltaGood ? "text-[var(--color-success)]" : "text-[var(--color-clay)]",
            )}
          >
            {deltaGood ? <TrendingUp size={12} strokeWidth={2} /> : <TrendingDown size={12} strokeWidth={2} />}
            {delta}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
        {context}
      </p>
    </div>
  );
}

/* ── Progress tracker: where we are against the phase goal ─────────────────── */

function ProgressCard({
  eyebrow,
  value,
  target,
  footer,
  failed,
  truncated,
}: {
  eyebrow: string;
  value: number;
  target: number;
  footer: React.ReactNode;
  failed: boolean;
  truncated?: boolean;
}) {
  const ratio = Math.min(value / target, 1);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="eyebrow">{eyebrow}</p>

      {failed ? (
        <p className="mt-4 text-[13px] text-[var(--color-warning)]">
          Não foi possível carregar este número.
        </p>
      ) : (
        <>
          <p className="mt-3 flex items-baseline gap-2.5">
            <span className="numeral text-[40px] text-[var(--text-primary)]">
              {truncated ? `${value}+` : value}
            </span>
            <span className="text-[12px] font-300 text-[var(--text-tertiary)]">
              de {target} · meta da fase
            </span>
            <span className="ml-auto numeral text-[15px] text-[var(--primary)]">{pct(ratio)}</span>
          </p>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-raised)]">
            <div
              className="h-full rounded-full bg-[var(--primary)]"
              style={{ width: pct(ratio) }}
            />
          </div>

          <p className="mt-3 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
            {footer}
          </p>
        </>
      )}
    </div>
  );
}

/** A linha da planilha de métricas. `value === undefined` significa "o backend
    ainda não instrumenta isso" — a linha fica na página mesmo assim, porque a
    meta e a ação continuam sendo o checklist diário do fundador. */
type MetricRow = {
  metric: string;
  meta: string;
  value?: string;
  ok?: boolean;
  note?: string;
  action: string;
};

function StatusDot({ ok }: { ok?: boolean }) {
  if (ok === undefined) {
    return (
      <span
        aria-hidden
        className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full border border-[var(--border-strong)]"
        title="Sem instrumentação ainda"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full",
        ok ? "bg-[var(--color-success)]" : "bg-[var(--color-clay)]",
      )}
    />
  );
}

function MetricsTable({ title, rows }: { title: string; rows: MetricRow[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <p className="label-colus border-b border-[var(--border)] bg-[var(--surface-raised)] px-5 py-3 text-[9.5px] text-[var(--text-secondary)]">
        {title}
      </p>

      <ul className="divide-y divide-[var(--border)]">
        {rows.map((row) => {
          const semDado = row.value === undefined;
          return (
            <li
              key={row.metric}
              className="grid grid-cols-1 gap-x-6 gap-y-1.5 px-5 py-3.5 sm:grid-cols-[minmax(0,1.2fr)_150px_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.2fr)_150px_170px_minmax(0,1.3fr)]"
            >
              <span className="flex items-start gap-2.5">
                <StatusDot ok={row.ok} />
                <span
                  className={cn(
                    "text-[13px] font-500 leading-snug",
                    semDado ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]",
                  )}
                >
                  {row.metric}
                </span>
              </span>

              {/* A meta só veste verde quando está sendo batida; abaixo dela é
                  vermelho. Sem medição, nem uma coisa nem outra — cinza. */}
              <span
                className={cn(
                  "pl-[16px] text-[12px] font-600 leading-snug sm:pl-0",
                  row.ok === undefined
                    ? "text-[var(--text-tertiary)]"
                    : row.ok
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-error)]",
                )}
              >
                {row.meta}
              </span>

              <span className="pl-[16px] sm:pl-0">
                {semDado ? (
                  <span className="label-colus text-[8.5px] text-[var(--text-tertiary)]">
                    sem dado
                  </span>
                ) : (
                  <>
                    <span
                      className={cn(
                        "numeral text-[15px]",
                        row.ok ? "text-[var(--text-primary)]" : "text-[var(--color-clay)]",
                      )}
                    >
                      {row.value}
                    </span>
                    {row.note && (
                      <span className="mt-0.5 block text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
                        {row.note}
                      </span>
                    )}
                  </>
                )}
              </span>

              <span className="hidden pl-[16px] text-[12px] font-300 italic leading-snug text-[var(--text-secondary)] sm:col-span-2 sm:block sm:pl-0 lg:col-span-1">
                {row.action}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function MetricsPage() {
  const { users, matches, scorePosts, north, completion, partnerRating, activation, monthly } =
    await getProductMetrics();

  const broken = [
    users.failed && "Usuários",
    matches.failed && "Partidas concluídas",
    scorePosts.failed && "Posts do feed",
    north.failed && "Métricas de produto",
  ].filter(Boolean) as string[];

  const wow = !matches.failed
    ? { ok: matches.last7 >= matches.prev7, delta: matches.last7 - matches.prev7 }
    : null;
  // Base viva do mês (last_seen ≤ 30d) — denominador de jogos/usuário/mês.
  const mau = users.activity.hoje + users.activity.semana + users.activity.mes;
  // Jogos (todos, não só pagos) nos últimos 30 dias — feed primeiro; fallback
  // para reservas jogadas quando o feed falhou e a página cobre o total.
  const jogos30 = !scorePosts.failed ? scorePosts.last30 : matches.last30;
  const jogosPorUsuarioMes =
    jogos30 != null && mau > 0
      ? (jogos30 / mau).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
      : null;

  // One breakdown string for every completion surface. expiredNeverConfirmed
  // null = legacy fallback (old BFF): its "canceladas" still counts every
  // cancellation, so the confirmed-only wording would be a lie there.
  const completionNote = completion
    ? completion.expiredNeverConfirmed != null
      ? `${completion.finished} concluídas · ${completion.cancelled} canceladas (confirmadas) · ${completion.expiredNeverConfirmed} convites expirados`
      : `${completion.finished} concluídas · ${completion.cancelled} canceladas`
    : null;

  // Funnel rates from the backend roll-up. A pair with an empty denominator
  // stays null — 0/0 dressed up as a percentage is still "sem dado".
  const acceptance =
    north.inviteAcceptance && north.inviteAcceptance.sent > 0
      ? { rate: north.inviteAcceptance.accepted / north.inviteAcceptance.sent, ...north.inviteAcceptance }
      : null;
  const onboarding =
    north.onboarding && north.onboarding.cohort > 0
      ? { rate: north.onboarding.converted / north.onboarding.cohort, ...north.onboarding }
      : null;
  const week2 =
    north.retentionWeek2 && north.retentionWeek2.cohort > 0
      ? { rate: north.retentionWeek2.returned / north.retentionWeek2.cohort, ...north.retentionWeek2 }
      : null;
  const appOpen =
    north.appOpenNoAction && north.appOpenNoAction.dau > 0
      ? { rate: north.appOpenNoAction.no_action / north.appOpenNoAction.dau, ...north.appOpenNoAction }
      : null;
  const density = north.validMatchesPerUser;
  // Categories come largest-first from the backend; the thinnest one is where
  // a Quick Match broadcast shouts into the void.
  const thinnest = density?.categories?.length
    ? density.categories.reduce((a, b) => (b.users < a.users ? b : a))
    : null;

  // ── Ação imediata — a metade diária da planilha ──────────────────────────────
  const daily: MetricRow[] = [
    {
      metric: "Partidas concluídas",
      meta: "Cresce semana a semana",
      ...(wow
        ? {
            value: `${matches.last7} × ${matches.prev7}`,
            ok: wow.ok,
            note: "últimos 7 dias × 7 anteriores",
          }
        : {}),
      action: "Investiga qualquer queda sem motivo óbvio",
    },
    {
      metric: "Taxa de conclusão",
      meta: "≥ 70%",
      ...(completion && completionNote
        ? {
            value: pct(completion.rate),
            ok: completion.rate >= META_CONCLUSAO,
            note: completionNote,
          }
        : {}),
      action: "Liga para quem deu W.O. e entende por quê",
    },
    {
      metric: "W.O. no dia",
      meta: "0–1 por dia",
      ...(north.woToday != null
        ? {
            value: String(north.woToday),
            ok: north.woToday <= 1,
            note: "proxy — partidas encerradas hoje sem placar, relógio ou avaliação",
          }
        : {}),
      action: "Se ≥ 3: investiga padrão — horário, clube, categoria",
    },
    {
      metric: "Convites enviados",
      meta: "Cresce com a base",
      ...(north.invitesSent7d != null
        ? {
            value: String(north.invitesSent7d),
            ok: north.invitesSent7d > 0,
            note: "últimos 7 dias · piso — convite grátis recusado não deixa rastro",
          }
        : {}),
      action: "Queda brusca = algo mudou no matchmaking",
    },
    {
      metric: "Taxa de aceitação de convite",
      meta: "≥ 50%",
      ...(acceptance
        ? {
            value: pct(acceptance.rate),
            ok: acceptance.rate >= 0.5,
            note: `${acceptance.accepted} aceitos de ${acceptance.sent} enviados`,
          }
        : {}),
      action: "Se < 30%: revisa qualidade dos matches gerados",
    },
    {
      metric: "Novos usuários ativos",
      meta: "Conforme fase",
      ...(north.newActive7d != null
        ? {
            value: `+${north.newActive7d}`,
            ok: north.newActive7d > 0,
            note:
              north.newActive7d > 0
                ? "contas da semana que voltaram ao app"
                : "nenhuma conta nova ativa em 7 dias",
          }
        : !users.failed
          ? {
              value: `+${users.newLast7}`,
              ok: users.newLast2 > 0,
              note:
                users.newLast2 > 0
                  ? `em 7 dias · ${users.newPrev7} nos 7 anteriores`
                  : "zero novas contas há 2 dias",
            }
          : {}),
      action: "Zero por 2 dias seguidos = ação de aquisição necessária",
    },
    {
      metric: "App aberto sem ação",
      meta: "< 30% dos DAU",
      ...(appOpen
        ? {
            value: pct(appOpen.rate),
            ok: appOpen.rate < 0.3,
            note: `${appOpen.no_action} de ${appOpen.dau} DAU hoje`,
          }
        : {}),
      action: "Se > 50%: push notification ou problema de UX",
    },
  ];

  // ── Saúde do produto — a metade semanal ──────────────────────────────────────
  const weeklyRows: MetricRow[] = [
    {
      metric: "Onboarding → 1ª partida",
      meta: "≥ 50% em 7 dias",
      ...(onboarding
        ? {
            value: pct(onboarding.rate),
            ok: onboarding.rate >= 0.5,
            note: `${onboarding.converted} de ${onboarding.cohort} · coorte dos últimos 14 dias`,
          }
        : {}),
      action: "Mapeia onde o fluxo é abandonado",
    },
    {
      metric: "Matches válidos por usuário",
      meta: "≥ 8 por semana",
      ...(density
        ? {
            value: density.avg_candidates.toFixed(1),
            ok: density.avg_candidates >= 8,
            note: thinnest
              ? `mínimo ${density.min_candidates} — categoria mais rasa: ${thinnest.category} com ${thinnest.users} ${thinnest.users === 1 ? "usuário" : "usuários"}`
              : `mínimo ${density.min_candidates} — densidade por categoria`,
          }
        : {}),
      action: "Se < 4 para algum perfil: densidade insuficiente",
    },
    {
      metric: "Nota de equilíbrio média",
      meta: "≥ 3.5",
      action: "Se < 2.5: recalibra ELO seed por categoria",
    },
    {
      metric: "Nota de parceiro média",
      meta: "≥ 3.5",
      ...(partnerRating
        ? {
            value: partnerRating.avg.toFixed(1),
            ok: partnerRating.avg >= 3.5,
            note: `${partnerRating.count} avaliações recebidas`,
          }
        : {}),
      action: "Se < 3.0 com equilíbrio ok: sobe peso perfil social",
    },
    {
      metric: "Retenção semana 2",
      meta: "≥ 50%",
      ...(week2
        ? {
            value: pct(week2.rate),
            ok: week2.rate >= 0.5,
            note: `${week2.returned} de ${week2.cohort} criados há 14–21 dias vistos na semana`,
          }
        : users.retention
          ? {
              value: pct(users.retention.rate),
              ok: users.retention.rate >= 0.5,
              note: `aproximação via last_seen · coorte de ${users.retention.cohort}`,
            }
          : {}),
      action: "Entrevista quem não voltou — busca padrão",
    },
    {
      metric: "Códigos de indicação usados",
      meta: "≥ 1 por dia",
      ...(north.referralCodesUsed7d != null
        ? {
            value: String(north.referralCodesUsed7d),
            ok: north.referralCodesUsed7d >= 7,
            note: "últimos 7 dias",
          }
        : {}),
      action: "Zero por 3 dias: MGM não está rodando",
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Métricas"
        title="Norte do Produto"
        description="As metas do beta e onde estamos agora. O que o backend ainda não mede fica marcado como sem dado — nunca como zero."
      />

      <div className="space-y-6 px-4 sm:px-8 py-6">
        {broken.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] px-4 py-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[var(--color-clay)]" />
            <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
              Não foi possível carregar{" "}
              <span className="font-600 text-[var(--text-primary)]">{broken.join(" e ")}</span>. Os
              números abaixo estão incompletos — não os leia como zero.
            </p>
          </div>
        )}

        {/* ── Os gráficos: crescimento, engajamento, ritmo, conclusão — com filtro
            de período compartilhado entre crescimento e ritmo ─────────────────── */}
        <ChartsGrid
          userCreatedAtMs={users.createdAtMs}
          userDateless={users.dateless}
          usersTarget={META_FASE.usuarios}
          growthFallback={
            users.failed
              ? "Não foi possível carregar os usuários."
              : "Curva omitida: a varredura não cobriu a base inteira, e uma curva de crescimento sobre parte dela teria a forma errada."
          }
          matchStartsAtMs={matches.startsAtMs}
          paceFallback={
            matches.failed
              ? "Não foi possível carregar as partidas."
              : "Série omitida: a página carregada não cobre o total, e um histograma parcial mostraria semanas que não existem."
          }
          engagementSlot={
            <ChartCard eyebrow="Engajamento da base" hint="Toda a base, por último acesso.">
              {!users.failed ? (
                <EngagementDonut slices={users.activity} />
              ) : (
                <ChartUnavailable>Não foi possível carregar os usuários.</ChartUnavailable>
              )}
            </ChartCard>
          }
          completionSlot={
            <ChartCard
              eyebrow="Partidas por semana — pagas × normais"
              hint="Reservas jogadas por semana, empilhadas por cobrança. Jogos registrados só no feed não têm preço rastreável e ficam fora desta série."
            >
              {matches.startsAtMs && matches.paidStartsAtMs ? (
                <PaidSplitChart allMs={matches.startsAtMs} paidMs={matches.paidStartsAtMs} />
              ) : (
                <ChartUnavailable>
                  Série omitida: a página de reservas não cobre o total.
                </ChartUnavailable>
              )}
            </ChartCard>
          }
        />

        {/* ── Onde estamos contra a meta da fase ───────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ProgressCard
            eyebrow="Usuários · meta da fase"
            value={users.total}
            target={META_FASE.usuarios}
            failed={users.failed}
            truncated={users.truncated}
            footer={
              <>
                <span className="font-600 text-[var(--text-secondary)]">+{users.newLast7}</span>{" "}
                nos últimos 7 dias ·{" "}
                <span className="font-600 text-[var(--text-secondary)]">{users.active7}</span>{" "}
                ativos na semana
              </>
            }
          />

          <ProgressCard
            eyebrow="Partidas · meta da fase"
            value={matches.total}
            target={META_FASE.partidas}
            failed={matches.failed}
            footer={
              <>
                <span className="font-600 text-[var(--text-secondary)]">+{matches.last7}</span>{" "}
                nos últimos 7 dias ·{" "}
                <span className="font-600 text-[var(--text-secondary)]">{matches.prev7}</span>{" "}
                na semana anterior
              </>
            }
          />
        </div>

        {/* ── Funil de partidas — as métricas interligadas numa visualização só ── */}
        <FunnelSection
          funnel={north.matchFunnel}
          paid={matches.paid}
          inviteAcceptance7d={north.inviteAcceptance}
        />

        {/* ── Engajamento & retenção — os cinco números do modelo ─────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
          <Kpi
            label="Jogos / usuário / mês"
            value={jogosPorUsuarioMes ?? "—"}
            context={
              jogos30 != null && mau > 0
                ? `${jogos30} jogo${jogos30 === 1 ? "" : "s"} em 30 dias ÷ ${mau} que abriram o app no mês`
                : "sem dado de partidas ou de usuários"
            }
          />
          <Kpi
            label="Taxa de ativação (30d)"
            value={
              activation && activation.d30.cohort > 0 ? pct(activation.d30.rate) : "—"
            }
            context={
              activation
                ? activation.d30.cohort > 0
                  ? `${activation.d30.activated} de ${activation.d30.cohort} na coorte jogaram em 30d${
                      activation.d14.cohort > 0 ? ` · 14d: ${pct(activation.d14.rate)}` : ""
                    }${activation.d30.cohort < 10 ? " · amostra pequena" : ""}`
                  : "ninguém completou 30 dias de conta ainda"
                : "sem dado de usuários ou de reservas jogadas"
            }
          />
          <Kpi
            label="Só olharam o feed"
            value={
              north.appOpenNoAction && north.appOpenNoAction.dau > 0
                ? pct(north.appOpenNoAction.no_action / north.appOpenNoAction.dau)
                : "—"
            }
            context={
              north.appOpenNoAction && north.appOpenNoAction.dau > 0
                ? `${north.appOpenNoAction.no_action} de ${north.appOpenNoAction.dau} que abriram hoje não fizeram nenhuma ação`
                : "sem dado de sessões de hoje"
            }
          />
          <Kpi
            label="Ativos no mês"
            value={monthly ? String(monthly.currentMonthActives) : "—"}
            context={
              monthly
                ? `jogaram ≥1 partida no mês corrente · mês fechado: ${monthly.prevMonthActives}`
                : "sem dado de reservas jogadas"
            }
          />
          <Kpi
            label="Churn mensal"
            value={monthly?.churn ? pct(monthly.churn.rate) : "—"}
            {...(monthly?.churn
              ? { delta: monthly.churn.month, deltaGood: monthly.churn.rate <= 0.3 }
              : {})}
            context={
              monthly?.churn
                ? `${monthly.churn.left} de ${monthly.churn.base} ativos de ${monthly.churn.baseMonth} não jogaram em ${monthly.churn.month}${
                    monthly.churn.base < 10 ? " · amostra pequena" : ""
                  }`
                : "sem meses fechados suficientes para medir"
            }
          />
        </div>

        {/* ── A planilha, viva ─────────────────────────────────────────────────── */}
        <MetricsTable title="Ação imediata — verificar todo dia" rows={daily} />
        <MetricsTable title="Saúde do produto — verificar toda semana" rows={weeklyRows} />

        <p className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-4 text-[11px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          <span>
            Linhas <span className="font-600 text-[var(--text-secondary)]">sem dado</span> ainda não
            têm instrumentação no backend — a meta e a ação ficam aqui porque o checklist vale
            mesmo medido à mão.
          </span>
          <Link
            href="/visao-geral"
            className="inline-flex shrink-0 items-center gap-1 font-700 text-[9px] uppercase tracking-[0.16em] text-[var(--primary)] transition-opacity hover:opacity-70"
          >
            Visão operacional <ArrowUpRight size={11} />
          </Link>
        </p>
      </div>
    </div>
  );
}
