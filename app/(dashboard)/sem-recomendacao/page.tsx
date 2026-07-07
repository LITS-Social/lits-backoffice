import { UserX, MapPin, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { noMatchPlayers } from "@/lib/mock";
import { formatRelative } from "@/lib/utils";

export default function SemRecomendacaoPage() {
  return (
    <div>
      <PageHeader
        eyebrow="#04"
        title="Jogadores Sem Recomendação Compatível"
        description="Jogadores para quem o app não encontrou adversário compatível. Indica gaps de densidade no beta — níveis, bairros ou horários sem massa crítica."
      />

      <div className="px-8 py-6">
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          <table className="w-full text-[13px] font-sans">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-raised)]">
                <th className="text-left px-5 py-3 text-[10px] font-600 uppercase tracking-widest text-[var(--text-tertiary)]">
                  Jogador
                </th>
                <th className="text-left px-5 py-3 text-[10px] font-600 uppercase tracking-widest text-[var(--text-tertiary)]">
                  Nível
                </th>
                <th className="text-left px-5 py-3 text-[10px] font-600 uppercase tracking-widest text-[var(--text-tertiary)]">
                  Bairro
                </th>
                <th className="text-left px-5 py-3 text-[10px] font-600 uppercase tracking-widest text-[var(--text-tertiary)]">
                  Horário preferido
                </th>
                <th className="text-left px-5 py-3 text-[10px] font-600 uppercase tracking-widest text-[var(--text-tertiary)]">
                  Fallback
                </th>
                <th className="text-left px-5 py-3 text-[10px] font-600 uppercase tracking-widest text-[var(--text-tertiary)]">
                  Desde
                </th>
              </tr>
            </thead>
            <tbody>
              {noMatchPlayers.map((player, i) => (
                <tr
                  key={player.id}
                  className={`border-b border-[var(--border)] last:border-0 ${
                    i % 2 === 0 ? "bg-[var(--surface)]" : "bg-[var(--surface-raised)]/40"
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[var(--primary)] flex items-center justify-center text-[10px] text-white font-700">
                        {player.name[0]}
                      </div>
                      <span className="font-500 text-[var(--text-primary)]">{player.name}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant="muted">{player.category}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-1 text-[var(--text-secondary)]">
                      <MapPin size={11} /> {player.neighborhood}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-1 text-[var(--text-secondary)]">
                      <Clock size={11} /> {player.preferredTime}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge
                      variant={player.fallback === "founder" ? "warning" : "info"}
                    >
                      {player.fallback === "founder" ? "Founder" : "Parceiro"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--text-secondary)]">
                    {formatRelative(player.since)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Density gap summary */}
        <div className="mt-6 p-4 rounded-xl bg-[var(--color-warning-bg)] border border-[var(--color-warning)]/30">
          <p className="text-[12px] font-sans font-600 text-[var(--color-clay)] mb-1 flex items-center gap-1.5">
            <UserX size={13} /> Gaps identificados
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {["Moema — A1", "Santo André — C2 noturno", "Santana — B2 tarde", "Perdizes — B1 manhã"].map(
              (gap) => (
                <span
                  key={gap}
                  className="px-2.5 py-1 rounded-full bg-white border border-[var(--color-warning)]/30 text-[11px] font-sans font-500 text-[var(--color-clay)]"
                >
                  {gap}
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
