import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Timestamp } from "@/components/ui/timestamp";
import { getApi } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { PanelError, PanelNote } from "../_components/notes";
import { StatRail, type Stat } from "../_components/stat-rail";
import { DailyBars } from "./daily-bars";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const api = await getApi();

  const [metricsRes, liveRes] = await Promise.all([
    api.GET("/v1/ops/metrics", {}),
    api.GET("/v1/ops/live-matches", {}),
  ]);

  if (metricsRes.error) {
    return (
      <PanelError
        eyebrow="Dashboard"
        title="Métricas"
        detail={metricsRes.error.detail || metricsRes.error.title}
      />
    );
  }

  const m = metricsRes.data;
  const liveMatches = liveRes.data?.items ?? [];
  const takePct = m.gmv_cents > 0 ? (m.lits_take_cents / m.gmv_cents) * 100 : 0;

  const stats: Stat[] = [
    { label: "Usuários", value: m.total_users, tone: "neutral", hint: `+${m.new_users_7d} nos últimos 7d` },
    { label: "Novos (30d)", value: m.new_users_30d, tone: "calm" },
    { label: "Reservas", value: m.total_bookings, tone: "neutral", hint: `+${m.bookings_7d} nos últimos 7d` },
    { label: "GMV", value: formatCurrency(m.gmv_cents), tone: "money" },
    {
      label: "Receita LITS",
      value: formatCurrency(m.lits_take_cents),
      tone: "calm",
      hint: m.gmv_cents > 0 ? `${takePct.toFixed(1)}% do GMV` : undefined,
    },
    { label: "Posts", value: m.total_posts, tone: "neutral" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title="Visão geral"
        description="Contagens e somas direto do Postgres — a fonte da verdade para dinheiro e volume."
      />

      <StatRail stats={stats} />

      <div className="space-y-8 px-8 py-6">
        <PanelNote>
          Sem avaliação média (não existe tabela de rating) nem usuários ativos/7d
          (last_seen_at só é confiável desde 15/07/2026) — nenhum dos dois aparece
          aqui de propósito, em vez de um número inventado. Para funil e retenção
          comportamental, ver o Amplitude.
        </PanelNote>

        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className="eyebrow mb-3">Cadastros por dia · 14d</p>
            <DailyBars data={m.signups_daily ?? []} tone="calm" />
          </div>
          <div>
            <p className="eyebrow mb-3">Reservas por dia · 14d</p>
            <DailyBars data={m.bookings_daily ?? []} tone="money" />
          </div>
        </div>

        <div>
          <p className="eyebrow mb-3">Partidas ao vivo agora</p>
          {liveMatches.length === 0 ? (
            <EmptyState message="Nenhuma partida ao vivo neste momento." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--text-tertiary)]">
                    <th className="px-4 py-2.5 font-500">Quadra</th>
                    <th className="px-4 py-2.5 font-500">Host</th>
                    <th className="px-4 py-2.5 font-500">Convidado</th>
                    <th className="px-4 py-2.5 font-500">Início</th>
                  </tr>
                </thead>
                <tbody>
                  {liveMatches.map((match) => (
                    <tr key={match.booking_id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2.5 font-mono text-[11.5px] text-[var(--text-secondary)]">
                        {match.court_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px] text-[var(--text-secondary)]">
                        {match.host_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px] text-[var(--text-secondary)]">
                        {match.guest_id ? match.guest_id.slice(0, 8) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Timestamp iso={match.starts_at} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
