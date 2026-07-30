import Link from "next/link";
import { AlertTriangle, ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getProductMetrics } from "@/lib/metrics";
import { BP_PREMISSAS, bpTarget } from "@/lib/bp";
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

/* ── Funil de partidas — convite × quick match lado a lado ───────────────── */

type FunnelData = {
  played: number;
  invites_sent?: number;
  invites_accepted?: number;
  quick_matches_opened?: number;
  quick_matches_filled?: number;
  quick_match_median_fill_hours?: number | null;
  rate: number;
} | null;

function FunnelBar({
  label,
  value,
  base,
  color,
  muted,
}: {
  label: string;
  value: number;
  /** Base do funil DESTA mecânica (as próprias tentativas = 100%) — a forma
      da queda entre etapas é a história; a magnitude vive no número. */
  base: number;
  color: string;
  muted?: boolean;
}) {
  const width = base > 0 ? Math.max((value / base) * 100, value > 0 ? 2.5 : 0) : 0;
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)_40px] items-center gap-3">
      <span className="text-[10.5px] font-500 leading-tight text-[var(--text-secondary)]">
        {label}
      </span>
      <div className="h-3 w-full overflow-hidden rounded-[4px] bg-[var(--surface-raised)]">
        <div
          className="h-full rounded-[3px] transition-[width]"
          style={{ width: `${width}%`, background: color, opacity: muted ? 0.45 : 1 }}
        />
      </div>
      <span className="numeral whitespace-nowrap text-right text-[14px] text-[var(--text-primary)]">
        {value}
      </span>
    </div>
  );
}

/**
 * Convite e quick match são mecânicas com desempenho radicalmente diferente —
 * somá-las num número só esconde a resposta. Cada coluna carrega seu próprio
 * funil (tentativas → viraram jogo → conversão), e o rail à direita traz o
 * agregado + attach rate. Barras na cor da mecânica (par categórico validado).
 */
function FunnelSection({
  funnel,
  paid,
  playedByMode,
  inviteAcceptance7d,
}: {
  funnel: FunnelData;
  paid: { total: number; last7: number; prev7: number; last30: number } | null;
  playedByMode: { invite: number; quick: number } | null;
  inviteAcceptance7d: { sent: number; accepted: number } | null;
}) {
  if (!funnel) {
    return (
      <div className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
        <h2 className="eyebrow">Funil de partidas</h2>
        <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Tentativas → jogos marcados → realizadas, por mecânica. Chega com o deploy do
          bff-backoffice (bloco match_funnel).
        </p>
      </div>
    );
  }

  const invites = funnel.invites_sent ?? 0;
  const qms = funnel.quick_matches_opened ?? 0;
  const tentativas = invites + qms;
  const accepted = funnel.invites_accepted ?? null;
  const filled = funnel.quick_matches_filled ?? null;
  const fillHours = funnel.quick_match_median_fill_hours ?? null;
  const pagas = paid?.total ?? null;
  const attach = pagas != null && funnel.played > 0 ? pagas / funnel.played : null;
  const catA = "var(--chart-cat-a)";
  const catB = "var(--chart-cat-b)";
  const col = (
    title: string,
    color: string,
    opened: number,
    confirmed: number | null,
    played: number | null,
    extra?: string
  ) => (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/40 p-4">
      <p className="mb-3.5 flex items-center gap-2">
        <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
        <span className="label-colus text-[9px] text-[var(--text-secondary)]">{title}</span>
        <span className="ml-auto flex items-baseline gap-1.5">
          <span className="numeral text-[20px] leading-none text-[var(--text-primary)]">
            {played != null && opened > 0 ? pct(played / opened) : "—"}
          </span>
          <span className="label-colus text-[7px] text-[var(--text-tertiary)]">conversão</span>
        </span>
      </p>
      <div className="space-y-2.5">
        <FunnelBar label="Tentativas" value={opened} base={opened} color={color} />
        {confirmed != null && (
          <FunnelBar label="Viraram jogo" value={confirmed} base={opened} color={color} />
        )}
        {played != null && (
          <FunnelBar label="Realizadas" value={played} base={opened} color={color} muted={false} />
        )}
      </div>
      {(confirmed == null || extra) && (
        <p className="mt-3 border-t border-[var(--border)] pt-2.5 text-[10px] font-300 leading-snug text-[var(--text-tertiary)]">
          {confirmed == null && "Etapa “viraram jogo” chega no próximo deploy do bff. "}
          {extra}
        </p>
      )}
    </div>
  );

  return (
    <div className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="eyebrow">Funil de partidas · desde o início</h2>
        <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Convite direto e quick match lado a lado — cada mecânica com sua própria conversão
          (o % no topo de cada coluna é realizadas ÷ tentativas daquela mecânica).
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_190px]">
        {col(
          "Convite direto",
          catA,
          invites,
          accepted,
          playedByMode?.invite ?? null,
          accepted == null && inviteAcceptance7d && inviteAcceptance7d.sent > 0
            ? `7 dias: ${inviteAcceptance7d.accepted} de ${inviteAcceptance7d.sent} aceitos (${pct(inviteAcceptance7d.accepted / inviteAcceptance7d.sent)})`
            : undefined
        )}
        {col(
          "Quick match",
          catB,
          qms,
          filled,
          playedByMode?.quick ?? null,
          fillHours != null
            ? `mediana de ${fillHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h até preencher`
            : undefined
        )}
        <div className="flex flex-col items-start justify-center gap-1 border-t border-[var(--border)] pt-4 sm:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <span className="label-colus text-[8.5px] text-[var(--text-tertiary)]">
            Conversão agregada
          </span>
          <span className="numeral text-[36px] leading-none text-[var(--primary)]">
            {pct(funnel.rate)}
          </span>
          <span className="text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
            {funnel.played} realizadas ÷ {tentativas} tentativas
          </span>
          {attach != null && (
            <>
              <span className="label-colus mt-3 text-[8.5px] text-[var(--text-tertiary)]">
                Attach rate
              </span>
              <span className="numeral text-[22px] leading-none text-[var(--text-primary)]">
                {pct(attach)}
              </span>
              <span className="text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
                {pagas} pagas de {funnel.played} realizadas
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Chip "vs BP": alvo do plano + acima/abaixo/na linha, colorido. `ok:null`
    = na linha (empate dentro do arredondamento). */
type BpChip = { target: string; monthLabel: string; ok: boolean | null };

function Kpi({
  label,
  value,
  delta,
  deltaGood,
  context,
  bp,
}: {
  label: string;
  value: string;
  /** WoW movement, already formatted ("+19", "-3pp"). Omit when unknowable. */
  delta?: string;
  deltaGood?: boolean;
  context: string;
  bp?: BpChip | null;
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
      {bp && (
        <p
          className={cn(
            "mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[10.5px] font-600 tabular-nums",
            bp.ok === null
              ? "text-[var(--text-secondary)]"
              : bp.ok
                ? "text-[var(--color-success)]"
                : "text-[var(--color-clay)]"
          )}
        >
          <span className="label-colus text-[7.5px] opacity-80">BP {bp.monthLabel}</span>
          {bp.target}
          <span className="font-500">
            {bp.ok === null ? "· na linha" : bp.ok ? "· acima" : "· abaixo"}
          </span>
        </p>
      )}
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
  const {
    users, matches, scorePosts, north, completion, partnerRating,
    activationMonth, monthly, playerStats, cohorts,
  } = await getProductMetrics();

  const broken = [
    users.failed && "Usuários",
    matches.failed && "Partidas concluídas",
    scorePosts.failed && "Posts do feed",
    north.failed && "Métricas de produto",
  ].filter(Boolean) as string[];

  const wow = !matches.failed
    ? { ok: matches.last7 >= matches.prev7, delta: matches.last7 - matches.prev7 }
    : null;
  const fmtBRL = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  // Chip "vs BP": compara o real com o alvo do plano no mês corrente (ou no
  // primeiro mês que o BP define a linha). `higherIsBetter=false` para churn.
  const bpChip = (
    metric: Parameters<typeof bpTarget>[0],
    actual: number | null,
    fmt: (v: number) => string,
    higherIsBetter = true
  ) => {
    const t = bpTarget(metric);
    if (!t || actual == null) return null;
    const ok =
      Math.abs(actual - t.value) / Math.max(Math.abs(t.value), 1e-9) < 0.005
        ? null
        : higherIsBetter
          ? actual > t.value
          : actual < t.value;
    return { target: fmt(t.value), monthLabel: t.monthLabel, ok };
  };

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
              eyebrow="Partidas por dia — pagas × normais"
              hint="Reservas jogadas por dia — últimos 12 dias — empilhadas por cobrança. Jogos registrados só no feed não têm preço rastreável e ficam fora desta série."
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
                abriram o app na semana
                {playerStats && (
                  <>
                    {" "}
                    · <span className="font-600 text-[var(--text-secondary)]">{playerStats.players7}</span>{" "}
                    jogaram
                  </>
                )}
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
                ritmo atual:{" "}
                <span className="font-600 text-[var(--text-secondary)]">
                  {(matches.last7 / 7).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                </span>{" "}
                partidas/dia (média 7d) ·{" "}
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
          playedByMode={matches.playedByMode}
          inviteAcceptance7d={north.inviteAcceptance}
        />

        {/* ── Modelo & dinheiro — janela explícita em cada card ───────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
          <Kpi
            label="Jogos pagos / ativo / mês"
            value={
              playerStats && playerStats.ativosJogaram30 > 0
                ? (
                    playerStats.participacoesPagas30 / playerStats.ativosJogaram30
                  ).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
                : "—"
            }
            {...(playerStats && playerStats.ativosJogaram30 > 0
              ? {
                  delta:
                    playerStats.participacoesPagas30 / playerStats.ativosJogaram30 >=
                    BP_PREMISSAS.jogosPagosPorAtivoMes
                      ? "na premissa"
                      : "abaixo",
                  deltaGood:
                    playerStats.participacoesPagas30 / playerStats.ativosJogaram30 >=
                    BP_PREMISSAS.jogosPagosPorAtivoMes,
                }
              : {})}
            bp={
              playerStats && playerStats.ativosJogaram30 > 0
                ? {
                    target: BP_PREMISSAS.jogosPagosPorAtivoMes.toLocaleString("pt-BR", {
                      minimumFractionDigits: 1,
                    }),
                    monthLabel: "premissa",
                    ok:
                      playerStats.participacoesPagas30 / playerStats.ativosJogaram30 >=
                      BP_PREMISSAS.jogosPagosPorAtivoMes,
                  }
                : null
            }
            context={
              playerStats && playerStats.ativosJogaram30 > 0
                ? `30 dias: ${playerStats.participacoesPagas30} participações pagas ÷ ${playerStats.ativosJogaram30} que jogaram · total (pagas+normais): ${playerStats.participacoes30}`
                : "ninguém jogou nos últimos 30 dias"
            }
          />
          <Kpi
            label="Taxa de ativação (mês)"
            value={
              activationMonth && activationMonth.novos > 0
                ? pct(activationMonth.jogaram / activationMonth.novos)
                : "—"
            }
            bp={bpChip(
              "ativacao",
              activationMonth && activationMonth.novos > 0
                ? activationMonth.jogaram / activationMonth.novos
                : null,
              (v) => pct(v)
            )}
            context={
              activationMonth
                ? activationMonth.novos > 0
                  ? `${activationMonth.jogaram} de ${activationMonth.novos} cadastrados no mês jogaram ≥1 partida${
                      activationMonth.novos < 10 ? " · amostra pequena" : ""
                    } · por janela de dias nas coortes abaixo`
                  : "ninguém se cadastrou neste mês ainda"
                : "sem dado de usuários ou de reservas jogadas"
            }
          />
          <Kpi
            label="Novos ativados no mês"
            value={activationMonth ? String(activationMonth.jogaram) : "—"}
            bp={bpChip("novosAtivados", activationMonth?.jogaram ?? null, (v) =>
              v.toLocaleString("pt-BR")
            )}
            context={
              activationMonth
                ? `cadastrados no mês que jogaram a 1ª partida · base nova do mês: ${activationMonth.novos}`
                : "sem dado de usuários ou de reservas jogadas"
            }
          />
          <Kpi
            label="Repetição (2ª partida)"
            value={
              playerStats && playerStats.repetition.everPlayers > 0
                ? pct(playerStats.repetition.everRepeated / playerStats.repetition.everPlayers)
                : "—"
            }
            context={
              playerStats
                ? playerStats.repetition.everPlayers > 0
                  ? `${playerStats.repetition.everRepeated} de ${playerStats.repetition.everPlayers} que estrearam jogaram de novo (consolidado)${
                      playerStats.repetition.cohort > 0
                        ? ` · em ≤30d da estreia: ${pct(playerStats.repetition.repeated / playerStats.repetition.cohort)} (${playerStats.repetition.repeated} de ${playerStats.repetition.cohort} com janela fechada)`
                        : " · janela de 30d ainda sem coorte fechada"
                    }`
                  : "ninguém estreou ainda"
                : "sem dado de reservas jogadas"
            }
          />
          <Kpi
            label="Ativos no mês"
            value={monthly ? String(monthly.currentMonthActives) : "—"}
            bp={bpChip("totalAtivos", monthly?.currentMonthActives ?? null, (v) =>
              v.toLocaleString("pt-BR")
            )}
            context={
              monthly
                ? `jogaram ≥1 partida no mês corrente · mês fechado: ${monthly.prevMonthActives}`
                : "sem dado de reservas jogadas"
            }
          />
          <Kpi
            label="Ativos / base cadastrada"
            value={
              monthly && !users.failed && users.total > 0
                ? pct(monthly.currentMonthActives / users.total)
                : "—"
            }
            bp={bpChip(
              "ativosSobreBase",
              monthly && !users.failed && users.total > 0
                ? monthly.currentMonthActives / users.total
                : null,
              (v) => pct(v)
            )}
            context={
              monthly && !users.failed && users.total > 0
                ? `${monthly.currentMonthActives} que jogaram no mês ÷ ${users.total} cadastrados`
                : "sem dado de usuários ou de reservas jogadas"
            }
          />
          <Kpi
            label="Churn mensal"
            value={monthly?.churn ? pct(monthly.churn.rate) : "—"}
            {...(monthly?.churn
              ? { delta: monthly.churn.month, deltaGood: monthly.churn.rate <= 0.3 }
              : {})}
            bp={bpChip("churnBlended", monthly?.churn?.rate ?? null, (v) => pct(v), false)}
            context={
              monthly?.churn
                ? `${monthly.churn.left} de ${monthly.churn.base} ativos de ${monthly.churn.baseMonth} não jogaram em ${monthly.churn.month}${
                    monthly.churn.base < 10 ? " · amostra pequena" : ""
                  }`
                : "sem meses fechados suficientes para medir"
            }
          />
          <Kpi
            label="GMV"
            value={matches.gmv ? fmtBRL(matches.gmv.totalCents) : "—"}
            bp={bpChip("gmvCents", matches.gmv?.monthCents ?? null, (v) => fmtBRL(v))}
            context={
              matches.gmv
                ? `desde o início · mês corrente: ${fmtBRL(matches.gmv.monthCents)} · 30 dias: ${fmtBRL(matches.gmv.last30Cents)}`
                : "página de reservas parcial"
            }
          />
          <Kpi
            label="Receita LITS (est.)"
            value={matches.gmv ? fmtBRL(matches.gmv.receitaTotalCents) : "—"}
            context={
              matches.gmv
                ? `fórmula do BP (comissão 7,5% + markup 10% + R$6/partida) · mês: ${fmtBRL(matches.gmv.receitaMonthCents)} · 30d: ${fmtBRL(matches.gmv.receita30Cents)}`
                : "página de reservas parcial"
            }
          />
          <Kpi
            label="Ticket médio (pago)"
            value={
              matches.gmv && matches.paid && matches.paid.total > 0
                ? fmtBRL(Math.round(matches.gmv.totalCents / matches.paid.total))
                : "—"
            }
            bp={
              matches.gmv && matches.paid && matches.paid.total > 0
                ? {
                    target: fmtBRL(BP_PREMISSAS.ticketMedioCents),
                    monthLabel: "premissa",
                    ok:
                      Math.round(matches.gmv.totalCents / matches.paid.total) >=
                      BP_PREMISSAS.ticketMedioCents,
                  }
                : null
            }
            context={
              matches.gmv && matches.paid && matches.paid.total > 0
                ? `GMV ÷ ${matches.paid.total} partidas pagas, desde o início`
                : "sem partidas pagas ainda"
            }
          />
          <Kpi
            label="Densidade (aprox.)"
            value={
              north.validMatchesPerUser
                ? north.validMatchesPerUser.avg_candidates.toLocaleString("pt-BR", {
                    maximumFractionDigits: 1,
                  })
                : "—"
            }
            context={
              north.validMatchesPerUser
                ? `parceiros da MESMA categoria por usuário ativo (mín. ${north.validMatchesPerUser.min_candidates}) — clube e horário ainda não entram na conta`
                : "sem usuários ativos nivelados"
            }
          />
          <Kpi
            label="Só olharam o feed"
            value={
              north.appOpenNoAction7d && north.appOpenNoAction7d.dau > 0
                ? pct(north.appOpenNoAction7d.no_action / north.appOpenNoAction7d.dau)
                : north.appOpenNoAction && north.appOpenNoAction.dau > 0
                  ? pct(north.appOpenNoAction.no_action / north.appOpenNoAction.dau)
                  : "—"
            }
            context={
              north.appOpenNoAction7d && north.appOpenNoAction7d.dau > 0
                ? `7 dias: ${north.appOpenNoAction7d.no_action} de ${north.appOpenNoAction7d.dau} sem nenhuma ação`
                : north.appOpenNoAction && north.appOpenNoAction.dau > 0
                  ? `hoje: ${north.appOpenNoAction.no_action} de ${north.appOpenNoAction.dau} · amostra de 1 dia — janela de 7d chega no deploy do bff`
                  : "sem dado de sessões"
            }
          />
          <Kpi
            label="Abriram o app na semana"
            value={users.failed ? "—" : String(users.activity.hoje + users.activity.semana)}
            context={
              users.failed
                ? "falha ao carregar"
                : `abrir ≠ jogar: ${playerStats ? playerStats.players7 : "—"} jogaram nos últimos 7 dias`
            }
          />
        </div>

        {/* ── Coortes semanais de ativação — sinal semanas antes do card de 30d ── */}
        {cohorts && cohorts.length > 0 && (
          <div className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
            <div className="mb-4">
              <h2 className="eyebrow">Ativação por coorte de cadastro</h2>
              <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
                Cada linha é uma semana de cadastro; as colunas mostram quantos jogaram a 1ª
                partida em até 7, 14 e 30 dias. Célula “aguarda” = a janela ainda não fechou.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {["Semana de cadastro", "Contas", "≤7d", "≤14d", "≤30d"].map((h) => (
                      <th
                        key={h}
                        className="label-colus px-2 py-2 text-left text-[8.5px] text-[var(--text-tertiary)] first:pl-0"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => {
                    const cell = (v: number | null) =>
                      v === null ? (
                        <span className="text-[var(--text-tertiary)]">aguarda</span>
                      ) : c.size === 0 ? (
                        <span className="text-[var(--text-tertiary)]">—</span>
                      ) : (
                        <>
                          <span className="font-600">{pct(v / c.size)}</span>{" "}
                          <span className="text-[var(--text-tertiary)]">({v})</span>
                        </>
                      );
                    return (
                      <tr key={c.label} className="border-b border-[var(--border)] last:border-b-0">
                        <td className="py-2 pr-2 tabular-nums text-[var(--text-secondary)]">
                          {c.label}
                        </td>
                        <td className="numeral px-2 py-2 text-[13px]">{c.size}</td>
                        <td className="px-2 py-2">{cell(c.d7)}</td>
                        <td className="px-2 py-2">{cell(c.d14)}</td>
                        <td className="px-2 py-2">{cell(c.d30)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
