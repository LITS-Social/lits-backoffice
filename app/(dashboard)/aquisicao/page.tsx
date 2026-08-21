import { PageHeader } from "@/components/ui/page-header";
import { StatRail } from "../_components/stat-rail";
import { PanelNote } from "../_components/notes";
import { fetchMetaAds, loadAcademiasFechadas, spMonthKey } from "@/lib/meta-ads";
import { getProductMetrics } from "@/lib/metrics";
import { fetchProfessores } from "@/lib/professores";
import { formatCurrency } from "@/lib/utils";
import { SEGMENT_LABEL, type Segment } from "./segments";
import { AdsetTable } from "./adset-table";
import { AcademiasDenominador } from "./academias-denominador";

export const dynamic = "force-dynamic";

/**
 * #17 Aquisição — CAC do Facebook Ads, Fase 1.
 *
 * O que esta fase É: gasto por adset (a Meta), categorizado à mão pelo
 * operador em usuários/professores/academias, dividido pelos novos do mês que
 * o painel já sabe contar. O que ela NÃO é: atribuição — o denominador inclui
 * quem veio orgânico e via MGM (o MGM é descontado quando dá). Os números
 * dizem isso na cara em vez de fingir precisão.
 *
 * Denominadores por segmento, e a honestidade de cada um:
 *   usuários     novos cadastros no mês MENOS aceites de MGM no mês — CAC
 *                pago aproximado; sem atribuição, orgânico ainda infla.
 *   professores  cadastros do formulário da landing no mês (D1).
 *   academias    denominador MANUAL, por mês — contrato B2B não nasce de
 *                formulário, e a única fonte honesta é quem fechou. Sem o
 *                número, a célula mostra só o gasto; nunca inventa.
 */

const MES = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", month: "long" });

function spMonthStartMs(): number {
  const ym = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  return new Date(`${ym}-01T00:00:00-03:00`).getTime();
}

export default async function AquisicaoPage() {
  const [ads, metrics, profRes, academiasFechadas] = await Promise.all([
    fetchMetaAds(),
    getProductMetrics(),
    fetchProfessores().catch(() => null),
    // O denominador de academias é MANUAL e por mês: contrato B2B não nasce
    // de formulário, e a única fonte honesta é quem fechou.
    loadAcademiasFechadas(spMonthKey()),
  ]);

  const monthStart = spMonthStartMs();

  // ── Denominadores ────────────────────────────────────────────────────────
  const novosMes = metrics.activationMonth?.novos ?? null;
  const mgmMes = metrics.mgmCreatedAtMs
    ? metrics.mgmCreatedAtMs.filter((t) => t >= monthStart).length
    : 0;
  const usuariosPagaveis = novosMes != null ? Math.max(novosMes - mgmMes, 0) : null;

  const professoresMes =
    profRes && profRes.ok
      ? profRes.rows.filter((r) => r.created_at * 1000 >= monthStart).length
      : null;

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

  const cacUsuarios = cac(gasto.usuarios, usuariosPagaveis);
  const cacProfessores = cac(gasto.professores, professoresMes);
  const cacAcademias = cac(gasto.academias, academiasFechadas);
  const mesNome = MES.format(new Date());

  // O consolidado: TODO o investimento do mês (inclusive o sem categoria — o
  // dinheiro saiu, o que não se sabe é para quem) ÷ todos os novos usuários
  // pagáveis do mês. É o "quanto custou cada pessoa nova" que o board pergunta,
  // sem a quebra por segmento. Desde 1º do mês, SP.
  const investidoMes = gasto.usuarios + gasto.professores + gasto.academias + gasto.sem;
  const cacConsolidado = cac(investidoMes, usuariosPagaveis);

  return (
    <div>
      <PageHeader
        eyebrow="#17"
        title="Aquisição"
        description={`CAC do Facebook Ads em ${mesNome}: gasto por segmento ÷ novos do mês. Categorize cada adset abaixo — sem categoria, o gasto fica no balde visível e fora de todo CAC.`}
      />

      <StatRail
        stats={[
          {
            label: "Investido no mês",
            value: ads.ok ? formatCurrency(investidoMes) : "—",
            hint: ads.ok ? `desde 1º de ${mesNome} · todos os adsets` : "Meta não configurada",
          },
          {
            label: "CAC consolidado",
            value: cacConsolidado ?? "—",
            tone: "calm",
            hint:
              ads.ok && usuariosPagaveis != null
                ? `${formatCurrency(investidoMes)} ÷ ${usuariosPagaveis} novos — tudo que saiu, inclusive sem categoria, por cada pessoa nova`
                : "precisa do gasto e dos novos do mês",
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
                : "sem a contagem de novos do mês",
          },
          {
            label: "CAC professores",
            value: cacProfessores ?? "—",
            tone: "calm",
            hint:
              professoresMes != null
                ? `${formatCurrency(gasto.professores)} ÷ ${professoresMes} cadastros no mês`
                : "cadastros da landing indisponíveis",
          },
          {
            label: cacAcademias ? "CAC academias" : `${SEGMENT_LABEL.academias} (gasto)`,
            value: ads.ok ? (cacAcademias ?? formatCurrency(gasto.academias)) : "—",
            tone: cacAcademias ? "calm" : "neutral",
            // O denominador é digitado aqui mesmo, na célula: o número só existe
            // na cabeça de quem fechou o contrato, e a fricção para mantê-lo em
            // dia tem que ser zero.
            hint: ads.ok ? (
              <span>
                {cacAcademias ? `${formatCurrency(gasto.academias)} ÷ ` : ""}
                <AcademiasDenominador atual={academiasFechadas} mesNome={mesNome} />
              </span>
            ) : undefined,
          },
        ]}
      />

      <div className="space-y-4 px-4 py-6 sm:px-8">
        {!ads.ok ? (
          <PanelNote>{ads.error}</PanelNote>
        ) : ads.adsets.length === 0 ? (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-8 text-center text-[12.5px] font-300 text-[var(--text-tertiary)]">
            Nenhum adset com gasto no mês ou nos últimos 28 dias — conta conectada, sem tráfego
            pago rodando.
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
