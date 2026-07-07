import { XCircle, CheckCircle2, AlertTriangle, MapPin, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { cancellations } from "@/lib/mock";
import { formatDate, formatRelative } from "@/lib/utils";

export default function CancelamentosPage() {
  const outOfPolicy = cancellations.filter((c) => !c.withinPolicy);

  return (
    <div>
      <PageHeader
        eyebrow="#05"
        title="Cancelamentos e Desistências"
        description="Cancelamentos em tempo real. Desistências fora do prazo de 48h devem acionar Jogo Rápido imediatamente."
        action={
          outOfPolicy.length > 0 ? (
            <Badge variant="error">
              <AlertTriangle size={10} /> {outOfPolicy.length} fora do prazo
            </Badge>
          ) : null
        }
      />

      <div className="px-8 py-6 space-y-3">
        {cancellations.map((c) => (
          <div
            key={c.id}
            className={`rounded-xl border p-5 ${
              !c.withinPolicy
                ? "bg-[var(--color-error-bg)] border-[var(--color-error)]/25"
                : "bg-[var(--surface)] border-[var(--border)]"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge
                    variant={c.type === "withdrawal" ? "error" : "warning"}
                  >
                    {c.type === "withdrawal" ? (
                      <><XCircle size={10} /> Desistência</>
                    ) : (
                      <><XCircle size={10} /> Cancelamento</>
                    )}
                  </Badge>
                  <span className="text-[14px] font-sans font-600 text-[var(--text-primary)]">
                    {c.player}
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">vs</span>
                  <span className="text-[14px] font-sans text-[var(--text-primary)]">
                    {c.opponent}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[12px] font-sans text-[var(--text-secondary)] mb-2">
                  <span className="flex items-center gap-1">
                    <MapPin size={11} /> {c.club}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> Partida: {formatDate(c.matchDatetime)}
                  </span>
                  <span>Cancelado {formatRelative(c.cancelledAt)}</span>
                </div>
                {c.reason && (
                  <p className="text-[12px] font-sans text-[var(--text-secondary)] italic">
                    &ldquo;{c.reason}&rdquo;
                  </p>
                )}
                {c.quickMatchTriggered && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-success-bg)] border border-[var(--color-success)]/20 text-[11px] font-sans font-600 text-[var(--color-success)]">
                    <CheckCircle2 size={10} /> Jogo Rápido acionado
                  </div>
                )}
              </div>
              <div className="shrink-0">
                <Badge variant={c.withinPolicy ? "success" : "error"}>
                  {c.withinPolicy ? "Dentro do prazo" : "Fora do prazo"}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
