import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Timestamp } from "@/components/ui/timestamp";
import { getApi } from "@/lib/api";
import { PanelError, PanelNote } from "../_components/notes";
import { StatRail, type Stat } from "../_components/stat-rail";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "warning" | "info" | "success" | "muted"> = {
  pending: "warning",
  reviewing: "info",
  resolved: "success",
  dismissed: "muted",
};

const MOD_STATUS_LABEL: Record<string, string> = {
  hard_blocked_reported: "Bloqueada + denunciada",
  pending_review: "Aguardando revisão",
};

function shortId(id: string): string {
  return id.slice(0, 8);
}

export default async function ModeracaoPage() {
  const api = await getApi();

  const [reportsRes, chatRes, blocksRes] = await Promise.all([
    api.GET("/v1/ops/user-reports", { params: { query: { limit: 50 } } }),
    api.GET("/v1/ops/chat-flagged", { params: { query: { limit: 50 } } }),
    api.GET("/v1/ops/block-graph", { params: { query: { limit: 30 } } }),
  ]);

  if (reportsRes.error) {
    return (
      <PanelError eyebrow="Moderação" title="Moderação" detail={reportsRes.error.detail || reportsRes.error.title} />
    );
  }

  const reports = reportsRes.data.items ?? [];
  const flagged = chatRes.data?.items ?? [];
  const blockItems = blocksRes.data?.items ?? [];
  const topTargets = blocksRes.data?.top_targets ?? [];

  const pendingReports = reports.filter((r) => r.status === "pending").length;
  const repeatOffenders = reports.filter((r) => r.repeat_count > 1).length;

  const stats: Stat[] = [
    { label: "Denúncias pendentes", value: pendingReports, tone: pendingReports > 0 ? "attention" : "calm" },
    { label: "Reincidentes", value: repeatOffenders, tone: repeatOffenders > 0 ? "money" : "calm" },
    { label: "Mensagens sinalizadas", value: flagged.length, tone: flagged.length > 0 ? "attention" : "calm" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Moderação"
        title="Fila de moderação"
        description="Denúncias de pessoas, mensagens sinalizadas no chat, e o grafo de bloqueios."
      />

      <StatRail stats={stats} />

      <div className="space-y-10 px-8 py-6">
        <section>
          <p className="eyebrow mb-3">Denúncias de pessoas</p>
          <PanelNote>
            Fila de leitura — ainda não existe endpoint para mudar o status daqui.
            Reincidência (repeat_count) conta quantos denunciantes distintos
            reportaram o mesmo usuário.
          </PanelNote>
          {reports.length === 0 ? (
            <EmptyState message="Nenhuma denúncia de pessoa registrada." />
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--text-tertiary)]">
                    <th className="px-4 py-2.5 font-500">Denunciado</th>
                    <th className="px-4 py-2.5 font-500">Denunciante</th>
                    <th className="px-4 py-2.5 font-500">Motivo</th>
                    <th className="px-4 py-2.5 font-500">Status</th>
                    <th className="px-4 py-2.5 font-500">Reincidência</th>
                    <th className="px-4 py-2.5 font-500">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/usuarios/${r.reported_user_id}`}
                          className="font-mono text-[11.5px] text-[var(--primary)] hover:underline"
                        >
                          {shortId(r.reported_user_id)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/usuarios/${r.reporter_user_id}`}
                          className="font-mono text-[11.5px] text-[var(--text-secondary)] hover:underline"
                        >
                          {shortId(r.reporter_user_id)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                        <p className="font-500">{r.reason}</p>
                        {r.details ? (
                          <p className="mt-0.5 max-w-xs truncate text-[11px] text-[var(--text-tertiary)]">
                            {r.details}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={STATUS_VARIANT[r.status] ?? "muted"}>{r.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {r.repeat_count > 1 ? (
                          <Badge variant="error">{r.repeat_count}× denunciantes</Badge>
                        ) : (
                          <span className="text-[var(--text-tertiary)]">1×</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Timestamp iso={r.created_at} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <p className="eyebrow mb-3">Mensagens sinalizadas (chat)</p>
          <PanelNote>Fila de leitura — sem ação de redação daqui ainda.</PanelNote>
          {flagged.length === 0 ? (
            <EmptyState message="Nenhuma mensagem aguardando revisão." />
          ) : (
            <div className="mt-3 space-y-2">
              {flagged.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-lg border border-[var(--border)] px-4 py-3 text-[12.5px]"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="warning">{MOD_STATUS_LABEL[msg.moderation_status] ?? msg.moderation_status}</Badge>
                      <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                        de {shortId(msg.sender_id)}
                      </span>
                    </div>
                    <Timestamp iso={msg.created_at} className="text-[11px] text-[var(--text-tertiary)]" />
                  </div>
                  <p className="text-[var(--text-secondary)]">
                    {msg.content ?? <span className="italic text-[var(--text-tertiary)]">(sem texto — {msg.message_type})</span>}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <p className="eyebrow mb-3">Grafo de bloqueios</p>
          {topTargets.length > 0 ? (
            <div className="mb-4">
              <p className="mb-2 text-[11.5px] font-500 text-[var(--text-tertiary)]">Mais bloqueados</p>
              <div className="flex flex-wrap gap-2">
                {topTargets.slice(0, 10).map((t) => (
                  <Link
                    key={t.target_user_id}
                    href={`/usuarios/${t.target_user_id}`}
                    className="flex items-center gap-1.5 rounded-full border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-1 text-[11.5px] text-[var(--color-error)] hover:opacity-80"
                  >
                    <span className="font-mono">{shortId(t.target_user_id)}</span>
                    <span className="font-600">{t.block_count}×</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          {blockItems.length === 0 ? (
            <EmptyState message="Nenhum bloqueio registrado." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--text-tertiary)]">
                    <th className="px-4 py-2.5 font-500">Quem bloqueou</th>
                    <th className="px-4 py-2.5 font-500">Bloqueado</th>
                    <th className="px-4 py-2.5 font-500">Motivo</th>
                    <th className="px-4 py-2.5 font-500">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {blockItems.map((b) => (
                    <tr key={b.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2.5 font-mono text-[11.5px] text-[var(--text-secondary)]">
                        {shortId(b.user_id)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px] text-[var(--text-secondary)]">
                        {shortId(b.target_user_id)}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-tertiary)]">{b.reason ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <Timestamp iso={b.created_at} />
                      </td>
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
