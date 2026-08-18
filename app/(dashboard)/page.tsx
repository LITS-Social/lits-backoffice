import Link from "next/link";
import { AlertTriangle, ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getProductMetrics, type NorthMetrics, type PlatformSplit } from "@/lib/metrics";
import {
  BP_MENSAL,
  BP_PREMISSAS,
  bpTarget,
  getBp,
  metaPernasPagasPorAtivo,
} from "@/lib/bp";
import { pushRiSnapshot } from "@/lib/ri-sync";
import { buildBpPace } from "@/lib/bp-pace";
import { cn } from "@/lib/utils";
import {
  BpPaceGrid,
  ChartCard,
  ChartUnavailable,
  ChartsGrid,
  PaidShareMeter,
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
  playedByMode: { invite: number; quick: number; quickScored: number } | null;
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

/* ── Placar do modelo — bullet chart real × alvo do BP ────────────────────
   Todas as linhas na MESMA régua: 100% = alvo do BP, marcador fixo na mesma
   posição em todas — barra que alcança o marcador está no plano. Verde
   quando bate, terracota quando não (churn compara invertido: barra curta
   é bom). O "% do alvo" ao lado do valor diz o tamanho do gap. */

type BpRow = {
  label: string;
  real: number | null;
  fmt: (v: number) => string;
  target: number | null;
  targetMonth: string;
  higherIsBetter?: boolean;
  context: string;
};

/** Posição fixa do alvo na régua: 100% do alvo fica a 70% da trilha, então a
    trilha inteira representa ~143% do alvo e sobra espaço para "passou". */
const BP_TICK_PCT = 70;
const BP_TRACK_MAX = 100 / (BP_TICK_PCT / 100);

function BpScoreboard({ rows }: { rows: BpRow[] }) {
  const gridCols = "grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[190px_minmax(0,1fr)_190px]";
  return (
    <div className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="eyebrow">Modelo vs BP</h2>
        <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Todas as barras na mesma régua: o marcador é o alvo do BP (100%). Barra que alcança o
          marcador está no plano — verde bate, terracota não. No churn vale o inverso: barra
          aquém do marcador é bom. Sem alvo no mês corrente, vale o do primeiro mês planejado.
        </p>
      </div>
      {/* Cabeçalho da régua: ancora o marcador uma vez, para todas as linhas. */}
      <div className={cn(gridCols, "mb-2 hidden sm:grid")} aria-hidden>
        <span />
        <div className="relative h-[14px]">
          <span
            className="absolute bottom-0 h-[6px] w-[2px] rounded-full bg-[var(--text-secondary)]"
            style={{ left: `${BP_TICK_PCT}%` }}
          />
          <span
            className="label-colus absolute bottom-0 pr-2 text-[8px] leading-[8px] text-[var(--text-tertiary)]"
            style={{ left: `${BP_TICK_PCT}%`, transform: "translateX(-100%)" }}
          >
            alvo do BP
          </span>
        </div>
        <span />
      </div>
      <div className="space-y-4">
        {rows.map((r) => {
          const hib = r.higherIsBetter ?? true;
          const ok =
            r.real != null && r.target != null ? (hib ? r.real >= r.target : r.real <= r.target) : null;
          const pctOfTarget =
            r.real != null && r.target != null && r.target !== 0 ? (r.real / r.target) * 100 : null;
          const barW =
            pctOfTarget != null
              ? Math.max(Math.min(pctOfTarget, BP_TRACK_MAX) * (BP_TICK_PCT / 100), r.real! > 0 ? 1.5 : 0)
              : 0;
          const statusColor = ok == null ? undefined : ok ? "var(--color-success)" : "var(--color-clay)";
          return (
            <div key={r.label} className={cn(gridCols, "items-center")}>
              <div>
                <p className="text-[11.5px] font-600 text-[var(--text-primary)]">{r.label}</p>
                <p className="text-[10px] font-300 leading-snug text-[var(--text-tertiary)]">
                  {r.context}
                </p>
              </div>
              <div className="relative h-4 w-full overflow-visible rounded-[4px] bg-[var(--surface-raised)]">
                {pctOfTarget != null && (
                  <div
                    className="h-full rounded-[3px]"
                    style={{ width: `${barW}%`, background: statusColor ?? "var(--border-strong)" }}
                  />
                )}
                {r.target != null && (
                  <span
                    aria-hidden
                    title={`alvo BP ${r.targetMonth}: ${r.fmt(r.target)}`}
                    className="absolute -top-1 bottom-[-4px] w-[2px] rounded-full bg-[var(--text-secondary)]"
                    style={{ left: `${BP_TICK_PCT}%` }}
                  />
                )}
              </div>
              <div className="flex items-center gap-3 sm:justify-end">
                <div className="sm:text-right">
                  <p className="numeral text-[17px] leading-tight text-[var(--text-primary)]">
                    {r.real != null ? r.fmt(r.real) : "—"}
                  </p>
                  <p className="text-[10px] font-300 tabular-nums leading-snug text-[var(--text-tertiary)]">
                    {r.target != null
                      ? `${hib ? "alvo" : "teto"} ${r.targetMonth}: ${r.fmt(r.target)}`
                      : "sem alvo no BP"}
                  </p>
                </div>
                {/* Pizza de progresso: fatia = % do alvo (cheia quando passa). */}
                {pctOfTarget != null && (
                  <span
                    role="img"
                    aria-label={`${Math.round(pctOfTarget)}% do alvo`}
                    title={`${Math.round(pctOfTarget)}% do alvo`}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                    style={{
                      background: `conic-gradient(${statusColor ?? "var(--border-strong)"} ${
                        Math.min(pctOfTarget, 100) * 3.6
                      }deg, var(--surface-raised) 0)`,
                    }}
                  >
                    <span className="numeral grid h-[30px] w-[30px] place-items-center rounded-full bg-[var(--surface)] text-[8.5px] leading-none text-[var(--text-primary)]">
                      {Math.round(pctOfTarget)}%
                    </span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
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
          <span className="highlight text-[8px]">
            {bp.ok === null ? "na linha" : bp.ok ? "acima" : "abaixo"}
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
  targetLabel,
  footer,
  failed,
  truncated,
}: {
  eyebrow: string;
  value: number;
  target: number;
  targetLabel: string;
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
              de {target.toLocaleString("pt-BR")} · {targetLabel}
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

/* ── Usuários por sistema — iOS × Android sobre a base inteira ──────────────
   Decomposição do número de cima ("Usuários"), com a mesma fonte e a mesma
   ressalva da coluna Aparelho da lista: o registro de push. Só existe linha
   para quem concedeu permissão de notificação, então a base se parte em QUATRO
   caixas, não duas.

   Duas armadilhas moram aqui, e o desenho existe para desarmar as duas:

   1. `unknown` não pode ser escondido. "62% iOS / 38% Android" calculado só
      sobre quem tem registro, apresentado como se fosse a base, afirma algo
      falso sobre todo mundo que recusou o push. Por isso a barra é sobre a base
      INTEIRA — sem registro é uma faixa como as outras — e o par iOS × Android
      carrega o próprio denominador escrito ao lado.
   2. `both` não pode sumir. Quem registrou nas duas plataformas é a exceção que
      muda o que se faz com a informação (testar um bug nos dois), e na lista de
      usuários ela já ganha crachá preenchido. Aqui ela ganha faixa própria na
      cor `info` — a mesma do crachá — e entra nos DOIS percentuais, que por
      isso somam mais de 100%. A linha embaixo diz isso em vez de deixar a conta
      parecer errada. */

function PlatformCard({ split }: { split: PlatformSplit | null }) {
  const shell = "grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6";

  // Campo ainda não publicado pelo bff: sem dado, nunca zero — quatro zeros aqui
  // leriam como "ninguém tem celular".
  if (!split) {
    return (
      <div className={shell}>
        <h2 className="eyebrow">Usuários por sistema</h2>
        <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          iOS × Android na base, pelo registro de push. Chega com o deploy do bff-backoffice
          (bloco platforms) — até lá fica sem dado, não em zero.
        </p>
      </div>
    );
  }

  const { iosOnly, androidOnly, both, unknown, reportedTotal } = split;
  // Denominador = o que está desenhado. O `total` do contrato deveria bater com
  // a soma; quando não bate, o card diz, em vez de tirar percentual sobre uma
  // base que não fecha.
  const base = iosOnly + androidOnly + both + unknown;
  const known = iosOnly + androidOnly + both;
  const mismatch = reportedTotal != null && reportedTotal !== base;

  if (base === 0) {
    return (
      <div className={shell}>
        <h2 className="eyebrow">Usuários por sistema</h2>
        <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Nenhuma conta na base ainda.
        </p>
      </div>
    );
  }

  // Quem usa iOS inclui quem usa os dois — é verdade sobre a pessoa, e é o que
  // responde "quantos abrem o app num iPhone".
  const iosUsers = iosOnly + both;
  const androidUsers = androidOnly + both;

  const segments = [
    { name: "Só iOS", value: iosOnly, color: "var(--chart-cat-a)", muted: false },
    { name: "Só Android", value: androidOnly, color: "var(--chart-cat-b)", muted: false },
    { name: "iOS e Android", value: both, color: "var(--color-info)", muted: false },
    // Ausência de dado não é uma categoria de produto: fica neutra, sem cor de
    // série, para não parecer uma terceira plataforma.
    { name: "Sem registro", value: unknown, color: "var(--surface-raised)", muted: true },
  ];

  const par = [
    { name: "iOS", users: iosUsers },
    { name: "Android", users: androidUsers },
  ];

  return (
    <div className={shell}>
      <div className="mb-5">
        <h2 className="eyebrow">Usuários por sistema</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,230px)_minmax(0,1fr)]">
        {/* ── iOS × Android, com o denominador escrito ──────────────────────── */}
        <div className="flex flex-col justify-center lg:border-r lg:border-[var(--border)] lg:pr-6">
          {known === 0 ? (
            <p className="text-center text-[12px] font-300 leading-relaxed text-[var(--text-tertiary)]">
              Nenhuma das {base} contas registrou push — não sabemos o sistema de nenhuma delas.
            </p>
          ) : (
            <>
              <div className="flex items-start justify-center gap-10">
                {par.map((p) => (
                  <div key={p.name} className="text-center">
                    <p className="text-[11.5px] font-600 text-[var(--text-secondary)]">{p.name}</p>
                    <p className="numeral mt-1.5 text-[30px] leading-none text-[var(--text-primary)]">
                      {pct(p.users / known)}
                    </p>
                    <p className="mt-1.5 text-[11px] font-300 text-[var(--text-tertiary)]">
                      {p.users} contas
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── A base inteira repartida ──────────────────────────────────────── */}
        <div className="flex flex-col justify-center gap-4">
          {/* aria-hidden: a barra é a versão VISUAL da lista logo abaixo, que
              carrega os mesmos quatro números em texto. Sem isto o leitor de
              tela anuncia tudo duas vezes — as faixas têm `title`, então elas
              TÊM nome acessível. O `title` fica pro tooltip do mouse. */}
          <div
            aria-hidden="true"
            className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[4px]"
          >
            {segments.map(
              (s) =>
                s.value > 0 && (
                  <div
                    key={s.name}
                    title={`${s.name}: ${s.value} de ${base}`}
                    className={cn(
                      "h-full rounded-[3px]",
                      s.muted && "border border-[var(--border)]"
                    )}
                    style={{ width: `${(s.value / base) * 100}%`, background: s.color }}
                  />
                )
            )}
          </div>

          <ul className="mx-auto grid w-full max-w-[560px] grid-cols-1 gap-x-10 gap-y-2 sm:grid-cols-2">
            {segments.map((s) => (
              <li key={s.name} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-[2px] border border-[var(--border)]"
                  style={{ background: s.color }}
                />
                <span
                  className={cn(
                    "text-[10.5px] font-300",
                    s.muted ? "text-[var(--text-tertiary)]" : "text-[var(--text-secondary)]"
                  )}
                >
                  {s.name}
                </span>
                <span className="numeral ml-auto text-[12px] text-[var(--text-primary)]">
                  {s.value}
                </span>
                <span className="w-[34px] shrink-0 text-right text-[10.5px] font-300 tabular-nums text-[var(--text-tertiary)]">
                  {pct(s.value / base)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {mismatch && (
        <p className="mt-4 text-[10.5px] font-300 leading-relaxed text-[var(--color-warning)]">
          O bff declara {reportedTotal} contas no total, mas as quatro caixas somam {base} — os
          percentuais acima são sobre as {base} repartidas, não sobre a base declarada.
        </p>
      )}

      <p className="mt-5 border-t border-[var(--border)] pt-3 text-center text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
        Só aparece quem permitiu notificação — quem recusou fica em “sem registro”. Quem usa os
        dois sistemas entra nos dois percentuais.
      </p>
    </div>
  );
}

/* ── Convites entre jogadores (MGM) — a indicação, não o convite de jogo ─────
   TRÊS mecânicas de "convite" convivem nesta tela e este card é só UMA delas:
   convite de RESERVA (funil acima, painel 03), código de SIGNUP do beta
   (planilha abaixo) e ESTE card: indicação jogador→jogador com prêmio VIP a 3
   indicados que JOGARAM (ADR-0064 §3-bis, desde 05/08 cadastro não basta).

   O redesenho tirou as seis caixas iguais. Isto É um funil — gerar código →
   aceitar → jogar — e caixas de mesmo peso escondiam exatamente isso: o
   founder somava vizinhos que são estágios um do outro. Agora os três estágios
   são a linha de cima com a conversão escrita entre eles, e o resto (7 dias,
   convidadores, vaga reservada) vira uma linha de rodapé em prosa.

   O que o card NÃO mostra, de propósito: "enviados". O share é client-side e
   o servidor só vê o aceite — ver MGM_SENT_NOTE (citada por extenso no
   detalhe; aqui só a essência, o card não é o lugar do parágrafo). */

function cnJoin(...parts: string[]) {
  return parts.join(" ");
}

/**
 * O funil vertical compartilhado pelos cards de MGM e de Jogo Rápido: barras
 * centradas que afunilam, conversão entre os degraus, e só o estágio final em
 * cor cheia. Mesma forma nos dois cards — quem aprendeu um leu o outro.
 */
function FunnelStages({ stages }: { stages: { label: string; value: number; hint?: string }[] }) {
  const max = Math.max(...stages.map((st) => st.value), 1);
  return (
    <div className="space-y-1">
      {stages.map((st, i) => {
        const width = Math.max((st.value / max) * 100, 30);
        const conv =
          i > 0 && stages[i - 1].value > 0
            ? Math.round((st.value / stages[i - 1].value) * 100)
            : null;
        const last = i === stages.length - 1;
        return (
          <div key={st.label}>
            {conv !== null && (
              <p className="py-1.5 text-center text-[10px] font-300 text-[var(--text-tertiary)]">
                ↓ <span className="numeral">{conv}%</span>
              </p>
            )}
            <div className="flex justify-center">
              <div
                className={cnJoin(
                  "flex h-[56px] items-center justify-between gap-3 rounded-lg px-4",
                  last ? "bg-[var(--primary)]" : "bg-[var(--primary)]/30"
                )}
                style={{ width: `${width}%`, minWidth: "190px" }}
              >
                <span
                  className={cnJoin(
                    "label-colus whitespace-nowrap text-[8px]",
                    last ? "text-[var(--primary-fg)]" : "text-[var(--text-secondary)]"
                  )}
                >
                  {st.label}
                </span>
                <span
                  className={cnJoin(
                    "numeral text-[26px] leading-none",
                    last ? "text-[var(--primary-fg)]" : "text-[var(--text-primary)]"
                  )}
                >
                  {st.value}
                </span>
              </div>
            </div>
            {st.hint && (
              <p className="mt-1 text-center text-[9.5px] font-300 text-[var(--text-tertiary)]">
                {st.hint}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Foto do convidador, com iniciais como reserva — o avatar_url chega com o
    deploy do bff; até lá (e para quem não tem foto) as iniciais seguram. */
function InviterAvatar({ name, url }: { name: string; url?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-raised)]">
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-600 text-[var(--text-tertiary)]">
        {initials || "?"}
      </span>
      {url && (
        /* foto externa do bucket de perfis; next/image exigiria alistar o
           host para um thumb de 28px */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  );
}

function MgmCard({
  mgm,
  inviteIntent,
  avatars,
}: {
  mgm: NorthMetrics["mgm"];
  /** Cliques em compartilhar (Amplitude Invite Sent) — o topo do funil. */
  inviteIntent: { uniques: number; totals: number } | null;
  /** user_id → avatar_url, resolvido pelo dossiê dos nossos usuários. */
  avatars: Record<string, string>;
}) {
  const shell =
    "grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6";

  // Bloco ainda não publicado pelo bff (ou ilegível do lado de lá): sem dado,
  // nunca zero — zeros aqui leriam como "ninguém indica ninguém".
  if (!mgm) {
    return (
      <div className={shell}>
        <h2 className="eyebrow">Convites entre jogadores (MGM)</h2>
        <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Indicação jogador→jogador pelo código de convite do app. Chega com o deploy do
          bff-backoffice (bloco mgm) — até lá fica sem dado, não em zero.
        </p>
      </div>
    );
  }

  // "Geraram código" saiu de vez (media abrir o próprio perfil). O topo do
  // funil é quem CLICOU em compartilhar — Amplitude `Invite Sent`, a única
  // superfície que enxerga o share client-side. Sem credencial ou com a API
  // fora, o estágio não aparece: indisponível não é zero.
  const stages = [
    ...(inviteIntent
      ? [{
          label: "Compartilharam",
          value: inviteIntent.uniques,
          hint: `${inviteIntent.totals} cliques em compartilhar (Amplitude)`,
        }]
      : []),
    { label: "Aceitaram", value: mgm.accepted_total, hint: "cadastro, não jogo" },
    { label: "Jogaram", value: mgm.played, hint: "a única conta que vale prêmio" },
  ];
  const top = mgm.top_inviters ?? [];

  return (
    <div className={cnJoin(shell, "flex flex-col")}>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="eyebrow">Convites entre jogadores (MGM)</h2>
        <Link
          href="/convites/indicacoes"
          className="inline-flex items-center gap-1 font-700 text-[9px] uppercase tracking-[0.16em] text-[var(--primary)] transition-opacity hover:opacity-70"
        >
          Detalhe <ArrowUpRight size={11} />
        </Link>
      </div>

      <FunnelStages stages={stages} />

      <p className="mt-5 text-center text-[10.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
        <span className="numeral text-[12px] text-[var(--text-secondary)]">{mgm.accepted_7d}</span>{" "}
        aceite{mgm.accepted_7d === 1 ? "" : "s"} em 7 dias ·{" "}
        <span className="numeral text-[12px] text-[var(--text-secondary)]">{mgm.inviters}</span>{" "}
        convidador{mgm.inviters === 1 ? "" : "es"} ·{" "}
        <span className="numeral text-[12px] text-[var(--text-secondary)]">{mgm.declared}</span>{" "}
        vaga{mgm.declared === 1 ? "" : "s"} reservada{mgm.declared === 1 ? "" : "s"}
        {mgm.reward_reached > 0 && (
          <>
            {" "}· <span className="numeral text-[12px] text-[var(--text-secondary)]">{mgm.reward_reached}</span>{" "}
            prêmio{mgm.reward_reached === 1 ? "" : "s"} VIP
          </>
        )}
      </p>

      {/* ── Top convidadores, embaixo do funil — o card fica alto, não largo ── */}
      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <p className="label-colus text-[8.5px] text-[var(--text-tertiary)]">Top convidadores</p>
        {top.length > 0 ? (
          <ol className="mt-3 space-y-2.5">
            {top.map((t, i) => (
              <li key={t.user_id} className="flex items-center gap-2.5">
                <span className="label-colus w-4 shrink-0 text-[9px] text-[var(--text-tertiary)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <InviterAvatar name={t.name} url={t.avatar_url || avatars[t.user_id]} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-500 text-[var(--text-primary)]">
                  {t.name}
                </span>
                <span className="numeral shrink-0 text-[14px] text-[var(--text-primary)]">
                  {t.accepted}
                </span>
                <span className="label-colus shrink-0 text-[7px] text-[var(--text-tertiary)]">
                  {t.accepted === 1 ? "aceite" : "aceites"}
                </span>
              </li>
            ))}
          </ol>
        ) : mgm.accepted_total > 0 ? (
          <p className="mt-3 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
            Ranking indisponível agora — os totais acima continuam válidos.
          </p>
        ) : (
          <p className="mt-3 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
            Nenhum aceite ainda — sem ranking para mostrar.
          </p>
        )}
      </div>
    </div>
  );
}

/** O funil do Jogo Rápido, no MESMO formato do MGM ao lado: abriu → um
    adversário preencheu → o placar foi publicado. */
function QuickMatchFunnelCard({
  funnel,
  quickScored,
}: {
  funnel: NorthMetrics["matchFunnel"];
  quickScored: number | null;
}) {
  const shell =
    "grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6";
  if (!funnel) {
    return (
      <div className={shell}>
        <h2 className="eyebrow">Jogo Rápido — do aberto ao placar</h2>
        <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          O funil chega com o bloco match_funnel do bff — até lá fica sem dado, não em zero.
        </p>
      </div>
    );
  }
  const stages = [
    { label: "Jogos abertos", value: funnel.quick_matches_opened, hint: "quick matches criados, desde o início" },
    { label: "Confirmados", value: funnel.quick_matches_filled, hint: "um adversário preencheu" },
    // Sem a lista completa de partidas não dá para contar placar por modo —
    // o degrau some em vez de fingir um zero.
    ...(quickScored !== null
      ? [{ label: "Placar marcado", value: quickScored, hint: "placar publicado no feed" }]
      : []),
  ];
  return (
    <div className={cnJoin(shell, "flex flex-col")}>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="eyebrow">Jogo Rápido — do aberto ao placar</h2>
        <Link
          href="/partidas-aguardando"
          className="inline-flex items-center gap-1 font-700 text-[9px] uppercase tracking-[0.16em] text-[var(--primary)] transition-opacity hover:opacity-70"
        >
          Aguardando <ArrowUpRight size={11} />
        </Link>
      </div>

      <FunnelStages stages={stages} />

      {funnel.quick_match_median_fill_hours != null && (
        <p className="mt-5 text-center text-[10.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          mediana de{" "}
          <span className="numeral text-[12px] text-[var(--text-secondary)]">
            {funnel.quick_match_median_fill_hours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h
          </span>{" "}
          entre abrir e confirmar
        </p>
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
    activationMonth, monthly, playerStats, cohorts, mgmCreatedAtMs, inviteIntent,
  } = await getProductMetrics();
  // BP vivo (portal de RI, fallback local) + push do snapshot real para o RI
  // — fire-and-forget: o investidor vê "Real vs Plano" com o mesmo agregado
  // deste render, sem PII.
  const bpMensal = await getBp();
  // Avatares do top de convidadores, direto do índice que o crawl de usuários
  // já montou — zero requisições extras. O bloco mgm passa a carregar
  // avatar_url no próximo deploy do bff; até lá (e para quem não tem foto) as
  // iniciais seguram.
  const mgmAvatars: Record<string, string> = {};
  if (north.mgm?.top_inviters?.length && users.index) {
    const byId = new Map(users.index.map((u) => [u.id, u.avatarUrl]));
    for (const t of north.mgm.top_inviters) {
      const url = byId.get(t.user_id);
      if (url) mgmAvatars[t.user_id] = url;
    }
  }
  // A trajetória "Rumo ao BP" só precisa de users/matches, mas o builder lê o
  // agregado inteiro — o mesmo objeto que o snapshot do RI já monta abaixo.
  const bpPace = buildBpPace(
    { users, matches, scorePosts, north, completion, partnerRating,
      activationMonth, monthly, playerStats, cohorts, mgmCreatedAtMs, inviteIntent },
    bpMensal
  );
  // Réguas do topo: agosto/26 do BP (julho é pré-lançamento no plano). O /api/bp
  // do RI não carrega partidas totais, então essas caem na cópia local.
  // O mês CORRENTE do plano — as razões por ativo têm meta que muda de mês a
  // mês, e comparar dezembro com a régua de agosto seria comparar errado.
  const curYm = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const bpMetaMes = bpMensal[curYm] ?? null;
  const bpMetaMesLabel = bpMetaMes
    ? new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
        .format(new Date(`${curYm}-15T12:00:00Z`))
        .replace(".", "")
    : "premissa";

  const bpAgo = bpMensal["2026-08"] ?? {};
  const bpAgoLocal = BP_MENSAL["2026-08"] ?? {};
  const metaUsuarios = bpAgo.baseAcumulada ?? bpAgoLocal.baseAcumulada ?? META_FASE.usuarios;
  const metaPartidasTotais =
    bpAgo.partidasTotaisMes ?? bpAgoLocal.partidasTotaisMes ?? META_FASE.partidas;
  const metaPartidasPagas = bpAgo.partidasPagasMes ?? bpAgoLocal.partidasPagasMes ?? null;
  pushRiSnapshot({
    users, matches, scorePosts, north, completion, partnerRating,
    activationMonth, monthly, playerStats, cohorts, mgmCreatedAtMs, inviteIntent,
  });

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
            // invitation_code_uses = o código de ENTRADA do beta (auth-bridge),
            // não a indicação MGM — o action antigo mandava ler este número
            // como saúde do MGM e os dois nunca vão bater.
            note: "últimos 7 dias · códigos de signup do beta — não é o MGM",
          }
        : {}),
      action: "Zero por 3 dias: aquisição parada. MGM tem card próprio acima",
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Métricas"
        title="Norte do Produto"
        description="Onde estamos contra o BP. O que o backend ainda não mede fica marcado como sem dado — nunca como zero."
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

        {/* ── Onde estamos contra o BP de agosto ───────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ProgressCard
            eyebrow="Usuários"
            value={users.total}
            target={metaUsuarios}
            targetLabel="BP ago/26"
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
            eyebrow="Partidas totais"
            value={matches.total}
            target={metaPartidasTotais}
            targetLabel="BP ago/26"
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

          <ProgressCard
            eyebrow="Partidas pagas"
            value={matches.paid?.total ?? 0}
            target={metaPartidasPagas ?? 1}
            targetLabel="BP ago/26"
            failed={matches.failed || !matches.paid || metaPartidasPagas == null}
            footer={
              matches.paid ? (
                <>
                  no mês:{" "}
                  <span className="font-600 text-[var(--text-secondary)]">{matches.paid.month}</span>{" "}
                  · 30 dias:{" "}
                  <span className="font-600 text-[var(--text-secondary)]">{matches.paid.last30}</span>
                  {matches.gmv && <> · GMV mês: {fmtBRL(matches.gmv.monthCents)}</>}
                </>
              ) : null
            }
          />
        </div>

        {/* ── Indicação entre jogadores — a mecânica MGM, não o convite de jogo ── */}
        {/* MGM e Jogo Rápido lado a lado, no mesmo formato de funil: cada
            card meio-largo e alto, não uma faixa retangular com vazio. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MgmCard mgm={north.mgm} inviteIntent={inviteIntent} avatars={mgmAvatars} />
          <QuickMatchFunnelCard
            funnel={north.matchFunnel}
            quickScored={matches.playedByMode?.quickScored ?? null}
          />
        </div>


        {/* ── Dinheiro ─────────────────────────────────────────────────────────── */}
        <div>
          <p className="eyebrow mb-3">Dinheiro</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Kpi
              label="GMV"
              value={matches.gmv ? fmtBRL(matches.gmv.totalCents) : "—"}
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
                  ? `fórmula do BP (comissão 7,5% + markup 10% + R$6/partida) · mês: ${fmtBRL(matches.gmv.receitaMonthCents)}`
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
          </div>
        </div>

        {/* ── Rumo ao BP — real × meta interpolada, dia a dia ou semana a semana ── */}
        <BpPaceGrid items={bpPace} />

        {/* ── Os gráficos: crescimento, engajamento, ritmo, conclusão — com filtro
            de período compartilhado entre crescimento e ritmo ─────────────────── */}
        <ChartsGrid
          userCreatedAtMs={users.createdAtMs}
          mgmCreatedAtMs={mgmCreatedAtMs}
          userDateless={users.dateless}
          growthFallback={
            users.failed
              ? "Não foi possível carregar os usuários."
              : "Curva omitida: a varredura não cobriu a base inteira, e uma curva de crescimento sobre parte dela teria a forma errada."
          }
          matchStartsAtMs={matches.startsAtMs}
          matchPaidStartsAtMs={matches.paidStartsAtMs}
          placarMs={scorePosts.createdAtMs}
          paceFallback={
            matches.failed
              ? "Não foi possível carregar as partidas."
              : "Série omitida: a página carregada não cobre o total, e um histograma parcial mostraria semanas que não existem."
          }
          engagementSlot={
            <ChartCard
              eyebrow="Pagas × grátis"
            >
              {!matches.failed && matches.paid ? (
                <PaidShareMeter
                  pagas={matches.paid.total}
                  gratis={Math.max(matches.total - matches.paid.total, 0)}
                />
              ) : (
                <ChartUnavailable>Não foi possível carregar as partidas.</ChartUnavailable>
              )}
            </ChartCard>
          }
        />

        {/* ── Funil de partidas — as métricas interligadas numa visualização só ── */}
        <FunnelSection
          funnel={north.matchFunnel}
          paid={matches.paid}
          playedByMode={matches.playedByMode}
          inviteAcceptance7d={north.inviteAcceptance}
        />

        {/* ── Placar do modelo — real × BP em bullet chart ─────────────────────── */}
        <BpScoreboard
          rows={[
            {
              // A métrica-mãe do modelo: o BP calcula partidas, assinaturas e
              // receita a partir de ATIVOS, não da base cadastrada. Faltava.
              label: "Ativos no mês",
              real: monthly?.currentMonthActives ?? null,
              fmt: (v) => v.toLocaleString("pt-BR"),
              target: bpTarget(bpMensal, "totalAtivos")?.value ?? null,
              targetMonth: bpTarget(bpMensal, "totalAtivos")?.monthLabel ?? "—",
              context: monthly
                ? `${monthly.currentMonthLegs} participações em ${monthly.currentMonthMatches} partidas já jogadas${
                    monthly.prevMonthActives > 0
                      ? ` · mês passado: ${monthly.prevMonthActives}`
                      : ""
                  }`
                : "sem dado",
            },
            {
              // No MÊS-CALENDÁRIO, não em 30 dias rolantes: a meta é mensal, e
              // comparar uma janela móvel com ela é comparar coisas diferentes.
              label: "Partidas pagas / ativo / mês",
              real:
                monthly && monthly.currentMonthActives > 0
                  ? monthly.currentMonthPaidLegs / monthly.currentMonthActives
                  : null,
              fmt: (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
              // A meta do MÊS, não a premissa fixa: o plano sobe a fatia de
              // partidas pagas de 25% para 40% ao longo do ano.
              target: bpMetaMes ? metaPernasPagasPorAtivo(bpMetaMes) : BP_PREMISSAS.jogosPagosPorAtivoMes,
              targetMonth: bpMetaMesLabel,
              context: monthly
                ? `${monthly.currentMonthPaidLegs} participações pagas ÷ ${monthly.currentMonthActives} ativos no mês`
                : "sem dado",
            },
            {
              label: "Partidas / ativo / mês",
              real:
                monthly && monthly.currentMonthActives > 0
                  ? monthly.currentMonthLegs / monthly.currentMonthActives
                  : null,
              fmt: (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
              target: BP_PREMISSAS.jogosPorAtivoMes,
              targetMonth: "premissa",
              context: monthly
                ? `${monthly.currentMonthLegs} participações ÷ ${monthly.currentMonthActives} ativos no mês`
                : "sem dado",
            },
            {
              label: "Taxa de ativação (mês)",
              real:
                activationMonth && activationMonth.novos > 0
                  ? activationMonth.jogaram / activationMonth.novos
                  : null,
              fmt: (v) => pct(v),
              target: bpTarget(bpMensal, "ativacao")?.value ?? null,
              targetMonth: bpTarget(bpMensal, "ativacao")?.monthLabel ?? "—",
              context: activationMonth
                ? `${activationMonth.jogaram} de ${activationMonth.novos} cadastrados no mês jogaram`
                : "sem dado",
            },
            {
              label: "Novos ativados no mês",
              real: activationMonth?.jogaram ?? null,
              fmt: (v) => v.toLocaleString("pt-BR"),
              target: bpTarget(bpMensal, "novosAtivados")?.value ?? null,
              targetMonth: bpTarget(bpMensal, "novosAtivados")?.monthLabel ?? "—",
              context: activationMonth
                ? `base nova do mês: ${activationMonth.novos}`
                : "sem dado",
            },
            {
              label: "Ativos / base cadastrada",
              real:
                monthly && !users.failed && users.total > 0
                  ? monthly.currentMonthActives / users.total
                  : null,
              fmt: (v) => pct(v),
              target: bpTarget(bpMensal, "ativosSobreBase")?.value ?? null,
              targetMonth: bpTarget(bpMensal, "ativosSobreBase")?.monthLabel ?? "—",
              context:
                monthly && !users.failed
                  ? `${monthly.currentMonthActives} jogaram no mês ÷ ${users.total} cadastrados`
                  : "sem dado",
            },
            {
              label: "GMV do mês",
              real: matches.gmv ? matches.gmv.monthCents / 100 : null,
              fmt: (v) =>
                v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
              target: (bpTarget(bpMensal, "gmvCents")?.value ?? null) != null ? bpTarget(bpMensal, "gmvCents")!.value / 100 : null,
              targetMonth: bpTarget(bpMensal, "gmvCents")?.monthLabel ?? "—",
              context: matches.gmv ? "partidas pagas no mês-calendário corrente" : "sem dado",
            },
            {
              label: "Churn mensal",
              real: monthly?.churn?.rate ?? null,
              fmt: (v) => pct(v),
              target: bpTarget(bpMensal, "churnBlended")?.value ?? null,
              targetMonth: bpTarget(bpMensal, "churnBlended")?.monthLabel ?? "—",
              higherIsBetter: false,
              context: monthly?.churn
                ? `${monthly.churn.left} de ${monthly.churn.base} ativos de ${monthly.churn.baseMonth} não voltaram`
                : "sem meses fechados suficientes",
            },
          ]}
        />

        {/* ── Engajamento da base ──────────────────────────────────────────────── */}
        <div>
          <p className="eyebrow mb-3">Engajamento</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
                          ? ` · em ≤30d: ${pct(playerStats.repetition.repeated / playerStats.repetition.cohort)}`
                          : ""
                      }`
                    : "ninguém estreou ainda"
                  : "sem dado de reservas jogadas"
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
        </div>

        {/* ── De onde a base abre o app — leitura de apoio, por isso no fim ───── */}
        <PlatformCard split={north.platforms} />

        {/* ── A planilha, viva ─────────────────────────────────────────────────── */}
        <MetricsTable title="Ação imediata — verificar todo dia" rows={daily} />
        <MetricsTable title="Saúde do produto — verificar toda semana" rows={weeklyRows} />

        <p className="border-t border-[var(--border)] pt-4 text-[11px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Linhas <span className="font-600 text-[var(--text-secondary)]">sem dado</span> ainda não
          têm instrumentação no backend — a meta e a ação ficam aqui porque o checklist vale
          mesmo medido à mão.
        </p>
      </div>
    </div>
  );
}
