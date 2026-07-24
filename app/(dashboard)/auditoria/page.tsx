import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Timestamp } from "@/components/ui/timestamp";
import { getApi } from "@/lib/api";
import { PanelError } from "../_components/notes";
import { StatRail, type Stat } from "../_components/stat-rail";

export const dynamic = "force-dynamic";

const HEALTH_VARIANT: Record<string, "success" | "warning" | "error"> = {
  healthy: "success",
  degraded: "warning",
  unhealthy: "error",
};

const HEALTH_DOT: Record<string, string> = {
  healthy: "bg-[var(--color-success)]",
  degraded: "bg-[var(--color-clay)]",
  unhealthy: "bg-[var(--color-error)]",
};

export default async function AuditoriaPage() {
  const api = await getApi();

  const [connectorsRes, auditRes] = await Promise.all([
    api.GET("/v1/ops/connectors", {}),
    api.GET("/v1/ops/audit-log", { params: { query: { limit: 50 } } }),
  ]);

  if (connectorsRes.error) {
    return (
      <PanelError
        eyebrow="Auditoria"
        title="Auditoria"
        detail={connectorsRes.error.detail || connectorsRes.error.title}
      />
    );
  }

  const connectors = connectorsRes.data.items ?? [];
  const auditLog = auditRes.data?.items ?? [];
  const unhealthy = connectors.filter((c) => c.health_status !== "healthy").length;

  const stats: Stat[] = [
    { label: "Conectores", value: connectors.length, tone: "neutral" },
    { label: "Com problema", value: unhealthy, tone: unhealthy > 0 ? "money" : "calm" },
    { label: "Ações no log", value: auditLog.length, tone: "neutral", hint: "últimas 50" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Auditoria"
        title="Saúde dos conectores + log de ações"
        description="Board vermelho/verde dos crawlers de dados, e o registro de toda ação destrutiva feita pela equipe."
      />

      <StatRail stats={stats} />

      <div className="space-y-10 px-4 sm:px-8 py-6">
        <section>
          <p className="eyebrow mb-3">Saúde dos conectores</p>
          {connectors.length === 0 ? (
            <EmptyState message="Nenhum conector cadastrado." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {connectors.map((c) => (
                <div
                  key={c.id}
                  className={
                    c.health_status === "unhealthy"
                      ? "rounded-xl border-2 border-[var(--color-error)]/50 bg-[var(--color-error-bg)] px-4 py-3.5"
                      : "rounded-xl border border-[var(--border)] px-4 py-3.5"
                  }
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${HEALTH_DOT[c.health_status] ?? "bg-[var(--text-tertiary)]"}`} />
                    <p className="truncate font-600 text-[13px] text-[var(--text-primary)]">{c.franchise_name}</p>
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant={HEALTH_VARIANT[c.health_status] ?? "muted"}>{c.health_status}</Badge>
                    <span className="text-[11px] text-[var(--text-tertiary)]">{c.type}</span>
                    {c.error_count > 0 ? (
                      <span className="text-[11px] font-600 text-[var(--color-error)]">{c.error_count} erros</span>
                    ) : null}
                  </div>
                  {c.last_error ? (
                    <p className="mb-1.5 truncate text-[11px] text-[var(--color-error)]" title={c.last_error}>
                      {c.last_error}
                    </p>
                  ) : null}
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    {c.last_sync_at ? (
                      <>
                        Última sinc: <Timestamp iso={c.last_sync_at} relativeOnly />
                      </>
                    ) : (
                      "Nunca sincronizou"
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <p className="eyebrow mb-3">Log de auditoria</p>
          {auditLog.length === 0 ? (
            <EmptyState message="Nenhuma ação registrada ainda." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--text-tertiary)]">
                    <th className="px-4 py-2.5 font-500">Quando</th>
                    <th className="px-4 py-2.5 font-500">Quem</th>
                    <th className="px-4 py-2.5 font-500">Ação</th>
                    <th className="px-4 py-2.5 font-500">Alvo</th>
                    <th className="px-4 py-2.5 font-500">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry) => (
                    <tr key={entry.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2.5">
                        <Timestamp iso={entry.created_at} />
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)]">{entry.actor}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="muted">{entry.action}</Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px] text-[var(--text-tertiary)]">
                        {entry.target_type}/{entry.target_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-tertiary)]">{entry.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
