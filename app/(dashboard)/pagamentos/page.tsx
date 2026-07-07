import { CreditCard, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { paymentIssues, type PaymentStatus } from "@/lib/mock";
import { formatDate, formatRelative } from "@/lib/utils";

function StatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { variant: "error" | "warning" | "success" | "muted"; label: string }> = {
    pending: { variant: "error", label: "Pendente" },
    manual_check: { variant: "warning", label: "Verificação manual" },
    resolved: { variant: "success", label: "Resolvido" },
    failed: { variant: "error", label: "Falhou" },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export default function PagamentosPage() {
  const pending = paymentIssues.filter((p) => p.status === "pending" || p.status === "manual_check");

  return (
    <div>
      <PageHeader
        eyebrow="#06"
        title="Problemas de Pagamento"
        description="Usuários com falha na confirmação do Pix. Reserva não confirmada enquanto não resolvido."
        action={
          pending.length > 0 ? (
            <Badge variant="error">
              <AlertCircle size={10} /> {pending.length} aguardando resolução
            </Badge>
          ) : null
        }
      />

      <div className="px-8 py-6 space-y-3">
        {paymentIssues.map((issue) => (
          <div
            key={issue.id}
            className={`rounded-xl border p-5 ${
              issue.status === "resolved"
                ? "bg-[var(--surface)] border-[var(--border)] opacity-60"
                : "bg-[var(--surface)] border-[var(--border)]"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-[11px] text-white font-700 shrink-0">
                    {issue.user[0]}
                  </div>
                  <div>
                    <p className="text-[14px] font-sans font-600 text-[var(--text-primary)]">
                      {issue.user}
                    </p>
                    <p className="text-[11px] font-sans text-[var(--text-secondary)]">
                      Chave Pix: {issue.pixKey}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[12px] font-sans text-[var(--text-secondary)] mb-2">
                  <span className="flex items-center gap-1">
                    <CreditCard size={11} />
                    <span className="font-700 text-[var(--text-primary)]">R$ {issue.amount.toFixed(2)}</span>
                    {" "}via Pix
                  </span>
                  <span>{issue.club}</span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> Partida: {formatDate(issue.matchDatetime)}
                  </span>
                  <span className="text-[var(--text-tertiary)]">Reportado {formatRelative(issue.reportedAt)}</span>
                </div>
                {issue.notes && (
                  <div className="mt-2 p-2.5 rounded-lg bg-[var(--color-info-bg)] border border-[var(--color-info)]/20 text-[12px] font-sans text-[var(--color-info)]">
                    {issue.notes}
                  </div>
                )}
              </div>
              <div className="shrink-0">
                <StatusBadge status={issue.status} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
