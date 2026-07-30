import Link from "next/link";
import { AlertTriangle, ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getProductMetrics } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import {
  ChartCard,
  ChartUnavailable,
  ChartsGrid,
  CompletionGauge,
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
  const wau = users.activity.hoje + users.activity.semana;
  // Base viva do mês (last_seen ≤ 30d) — denominador de jogos pagos/usuário/mês.
  const mau = users.activity.hoje + users.activity.semana + users.activity.mes;
  const paid = matches.paid;
  // Partidas "normais": a verdade do feed menos as reservas pagas — jogo que
  // aconteceu sem cobrança pelo app. Fallback para reservas grátis quando o
  // feed falhou.
  const normaisTotal = !scorePosts.failed
    ? Math.max(0, scorePosts.total - (paid?.total ?? 0))
    : paid
      ? matches.total - paid.total
      : null;
  const normaisLast7 = !scorePosts.failed
    ? Math.max(0, scorePosts.last7 - (paid?.last7 ?? 0))
    : null;
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

        {/* ── A linha de cima: os quatro números da semana ─────────────────────── */}
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
            label="Partidas normais"
            value={normaisTotal != null ? String(normaisTotal) : "—"}
            {...(normaisLast7 != null ? { delta: `+${normaisLast7}`, deltaGood: true } : {})}
            context={
              normaisTotal != null
                ? !scorePosts.failed
                  ? "no feed sem cobrança pelo app, desde o início"
                  : "reservas jogadas grátis, desde o início"
                : "falha ao carregar"
            }
          />
          <Kpi
            label="Partidas pagas"
            value={paid ? String(paid.total) : "—"}
            {...(paid ? { delta: `+${paid.last7}`, deltaGood: paid.last7 >= paid.prev7 } : {})}
            context={
              paid
                ? `reservas jogadas com cobrança · ${paid.prev7} na semana anterior`
                : "falha ao carregar pagamentos"
            }
          />
          <Kpi
            label="Ativos na semana"
            value={users.failed ? "—" : String(wau)}
            context={
              users.failed || users.total === 0
                ? "falha ao carregar"
                : `${pct(wau / users.total)} da base abriu o app nos últimos 7 dias`
            }
          />
          <Kpi
            label="Taxa de ativação (30d)"
            value={activation ? pct(activation.d30.rate) : "—"}
            context={
              activation
                ? `${activation.d30.activated} de ${activation.d30.cohort} na coorte jogaram em 30d · 14d: ${pct(activation.d14.rate)}${
                    activation.d30.cohort < 10 ? " · amostra pequena" : ""
                  }`
                : "sem dado de usuários ou de reservas jogadas"
            }
          />
          <Kpi
            label="Tentativas criadas"
            value={
              north.matchFunnel
                ? String(
                    (north.matchFunnel.invites_sent ?? 0) +
                      (north.matchFunnel.quick_matches_opened ?? 0)
                  )
                : "—"
            }
            context={
              north.matchFunnel
                ? `${north.matchFunnel.invites_sent} convite${north.matchFunnel.invites_sent === 1 ? "" : "s"} + ${north.matchFunnel.quick_matches_opened} quick match${north.matchFunnel.quick_matches_opened === 1 ? "" : "es"}, desde o início`
                : "chega com o deploy do bff-backoffice (match_funnel)"
            }
          />
          <Kpi
            label="Taxa de conversão"
            value={north.matchFunnel ? pct(north.matchFunnel.rate) : "—"}
            context={
              north.matchFunnel
                ? `${north.matchFunnel.played} realizadas ÷ ${(north.matchFunnel.invites_sent ?? 0) + (north.matchFunnel.quick_matches_opened ?? 0)} tentativas`
                : "chega com o deploy do bff-backoffice (match_funnel)"
            }
          />
          <Kpi
            label="Preenchimento do quick match"
            value={
              north.matchFunnel && (north.matchFunnel.quick_matches_opened ?? 0) > 0
                ? pct(
                    (north.matchFunnel.quick_matches_filled ?? 0) /
                      north.matchFunnel.quick_matches_opened
                  )
                : "—"
            }
            context={
              north.matchFunnel && (north.matchFunnel.quick_matches_opened ?? 0) > 0
                ? `${north.matchFunnel.quick_matches_filled} confirmadas de ${north.matchFunnel.quick_matches_opened} abertas`
                : "chega com o deploy do bff-backoffice (match_funnel)"
            }
          />
          <Kpi
            label="Aceitação do convite direto"
            value={
              north.matchFunnel && (north.matchFunnel.invites_sent ?? 0) > 0
                ? pct((north.matchFunnel.invites_accepted ?? 0) / north.matchFunnel.invites_sent)
                : north.inviteAcceptance && north.inviteAcceptance.sent > 0
                  ? pct(north.inviteAcceptance.accepted / north.inviteAcceptance.sent)
                  : "—"
            }
            context={
              north.matchFunnel && (north.matchFunnel.invites_sent ?? 0) > 0
                ? `${north.matchFunnel.invites_accepted} aceitos de ${north.matchFunnel.invites_sent} enviados, desde o início`
                : north.inviteAcceptance && north.inviteAcceptance.sent > 0
                  ? `${north.inviteAcceptance.accepted} aceitos de ${north.inviteAcceptance.sent} enviados nos últimos 7 dias`
                  : "sem convites para medir"
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
              eyebrow="Taxa de conclusão"
              hint={
                completion?.expiredNeverConfirmed != null
                  ? "Concluídas sobre concluídas + canceladas de jogos confirmados. Convites que expiram sem confirmação não contam."
                  : "Concluídas sobre concluídas + canceladas."
              }
            >
              {completion && completionNote ? (
                <CompletionGauge
                  rate={completion.rate}
                  target={META_CONCLUSAO}
                  caption={completionNote}
                />
              ) : (
                <ChartUnavailable>Sem dado de cancelamentos para compor a taxa.</ChartUnavailable>
              )}
            </ChartCard>
          }
        />

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
