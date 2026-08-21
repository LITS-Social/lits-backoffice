import { PageHeader } from "@/components/ui/page-header";
import { StatRail } from "../_components/stat-rail";
import { PanelNote } from "../_components/notes";
import {
  fetchMetaAds,
  loadAcademiasFechadas,
  periodBoundsMs,
  resolvePeriod,
  spMonthKey,
} from "@/lib/meta-ads";
import { getProductMetrics } from "@/lib/metrics";
import { fetchProfessores } from "@/lib/professores";
import { formatCurrency } from "@/lib/utils";
import { SEGMENT_LABEL, type Segment } from "./segments";
import { AdsetTable } from "./adset-table";
import { AcademiasDenominador } from "./academias-denominador";
import { PeriodPicker } from "./period-picker";

export const dynamic = "force-dynamic";

/**
 * #17 Aquisição — CAC do Facebook Ads, Fase 1.
 *
 * Um PERÍODO por vez — mês-calendário (?mes), últimos N dias (?dias) ou
 * intervalo (?de&ate), todos de São Paulo; sem nada, o mês corrente. TUDO é
 * recalculado para a janela: o gasto da Meta, os cadastros, os aceites de
 * MGM, os professores. O denominador de academias é mensal por natureza e só
 * entra no modo mês.
 *
 * O que esta fase É: gasto por adset categorizado à mão, dividido pelos novos
 * do período. O que ela NÃO é: atribuição — o denominador inclui quem veio
 * orgânico (o MGM é descontado). Os números dizem isso na cara.
 *
 * Denominadores por segmento, e a honestidade de cada um:
 *   usuários     cadastros no período MENOS aceites de MGM no período.
 *   professores  cadastros do formulário da landing no período (D1).
 *   academias    MANUAL, por mês — contrato B2B não nasce de formulário.
 *                Sem o número (ou fora do modo mês), só o gasto; nunca inventa.
 */

export default async function AquisicaoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; dias?: string; de?: string; ate?: string }>;
}) {
  const params = await searchParams;
  const current = spMonthKey();
  const period = resolvePeriod(params);
  const { start, end } = periodBoundsMs(period);
  const noMes = (ms: number) => ms >= start && ms < end;
  // O denominador de academias só faz sentido no mês: fora dele, null.
  const month = period.mode === "month" ? (period.month ?? current) : null;

  const [ads, metrics, profRes, academiasFechadas] = await Promise.all([
    fetchMetaAds(period),
    getProductMetrics(),
    fetchProfessores().catch(() => null),
    month ? loadAcademiasFechadas(month) : Promise.resolve(null),
  ]);

  // ── Denominadores, todos recortados no mês escolhido ────────────────────
  // Cadastros: do índice completo de usuários; null quando a varredura não
  // cobriu a base (uma contagem sobre parte dela seria o número errado).
  const novosMes = metrics.users.index
    ? metrics.users.index.filter((u) => noMes(u.createdAtMs)).length
    : null;
  const mgmMes = metrics.mgmCreatedAtMs ? metrics.mgmCreatedAtMs.filter(noMes).length : 0;
  const usuariosPagaveis = novosMes != null ? Math.max(novosMes - mgmMes, 0) : null;

  const professoresMes =
    profRes && profRes.ok ? profRes.rows.filter((r) => noMes(r.created_at * 1000)).length : null;

  // ── Numeradores: gasto do mês por segmento + o balde sem categoria ──────
  const gasto: Record<Segment | "sem", number> = {
    usuarios: 0,
    professores: 0,
    academias: 0,
    sem: 0,
  };
  if (ads.ok) {
    for (const a of ads.adsets) gasto[a.segment ?? "sem"] += a.monthCents;
  }

  const cac = (spendCents: number, novos: number | null) =>
    novos != null && novos > 0 ? formatCurrency(Math.round(spendCents / novos)) : null;

  const investidoMes = gasto.usuarios + gasto.professores + gasto.academias + gasto.sem;
  const cacConsolidado = cac(investidoMes, usuariosPagaveis);
  const cacUsuarios = cac(gasto.usuarios, usuariosPagaveis);
  const cacProfessores = cac(gasto.professores, professoresMes);
  const cacAcademias = cac(gasto.academias, academiasFechadas);

  return (
    <div>
      <PageHeader
        eyebrow="#17"
        title="Aquisição"
        description="CAC do Facebook Ads no período selecionado: gasto por segmento ÷ novos do período. Categorize cada adset abaixo — sem categoria, o gasto fica no balde visível e fora de todo CAC."
        action={<PeriodPicker p={{ ...period, current }} />}
      />

      <StatRail
        stats={[
          {
            label: "Investido",
            value: ads.ok ? formatCurrency(investidoMes) : "—",
            hint: ads.ok ? "período inteiro · todos os adsets" : "Meta não configurada",
          },
          {
            label: "CAC consolidado",
            value: cacConsolidado ?? "—",
            tone: "calm",
            hint:
              ads.ok && usuariosPagaveis != null
                ? `${formatCurrency(investidoMes)} ÷ ${usuariosPagaveis} novos — tudo que saiu, inclusive sem categoria, por cada pessoa nova`
                : "precisa do gasto e dos novos do período",
          },
          {
            label: "Sem categoria",
            value: ads.ok ? formatCurrency(gasto.sem) : "—",
            tone: gasto.sem > 0 ? "attention" : "neutral",
            hint:
              gasto.sem > 0
                ? "gasto fora de todo CAC até você categorizar — nunca rateado"
                : "todo o gasto está categorizado",
          },
          {
            label: "CAC usuários",
            value: cacUsuarios ?? "—",
            tone: "calm",
            hint:
              usuariosPagaveis != null
                ? `${formatCurrency(gasto.usuarios)} ÷ ${usuariosPagaveis} novos (${novosMes} cadastros − ${mgmMes} via MGM)`
                : "sem a contagem de novos do período",
          },
          {
            label: "CAC professores",
            value: cacProfessores ?? "—",
            tone: "calm",
            hint:
              professoresMes != null
                ? `${formatCurrency(gasto.professores)} ÷ ${professoresMes} cadastros no período`
                : "cadastros da landing indisponíveis",
          },
          {
            label: cacAcademias ? "CAC academias" : `${SEGMENT_LABEL.academias} (gasto)`,
            value: ads.ok ? (cacAcademias ?? formatCurrency(gasto.academias)) : "—",
            tone: cacAcademias ? "calm" : "neutral",
            hint: !ads.ok ? undefined : month ? (
              <span>
                {cacAcademias ? `${formatCurrency(gasto.academias)} ÷ ` : ""}
                <AcademiasDenominador atual={academiasFechadas} month={month} />
              </span>
            ) : (
              "contrato fechado é contado por mês — escolha um mês para ver o CAC"
            ),
          },
        ]}
      />

      <div className="space-y-4 px-4 py-6 sm:px-8">
        {!ads.ok ? (
          <PanelNote>{ads.error}</PanelNote>
        ) : ads.adsets.length === 0 ? (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-8 text-center text-[12.5px] font-300 text-[var(--text-tertiary)]">
            Nenhum adset com gasto neste período — conta conectada, sem tráfego pago rodando.
          </p>
        ) : (
          <>
            <PanelNote>
              Este CAC ainda <span className="font-600">não é atribuição</span>: o denominador de
              usuários inclui quem chegou orgânico (o MGM já é descontado). A Fase 2 — UTM e
              deferred deep link no app — é o que separa pago de orgânico de verdade.
            </PanelNote>
            <AdsetTable adsets={ads.adsets} />
          </>
        )}
      </div>
    </div>
  );
}
