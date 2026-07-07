"use client";

import { Mail, Clock, MapPin } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { openInvites } from "@/lib/mock";
import { formatDate, formatCountdown } from "@/lib/utils";
import { useEffect, useState } from "react";

function CountdownTimer({ expiresAt }: { expiresAt: Date }) {
  const [countdown, setCountdown] = useState(formatCountdown(expiresAt));
  const isUrgent = expiresAt.getTime() - Date.now() < 20 * 60000;

  useEffect(() => {
    const id = setInterval(() => setCountdown(formatCountdown(expiresAt)), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return (
    <span
      className={`text-[13px] font-sans font-700 tabular-nums ${
        isUrgent ? "text-[var(--color-error)]" : "text-[var(--color-clay)]"
      }`}
    >
      {countdown}
    </span>
  );
}

export default function ConvitesPage() {
  const urgent = openInvites.filter(
    (i) => i.expiresAt.getTime() - Date.now() < 20 * 60000
  );

  return (
    <div>
      <PageHeader
        eyebrow="#03"
        title="Convites em Aberto"
        description="Convites enviados aguardando resposta. Janela de 1 hora — entrar em contato via WhatsApp se prestes a expirar."
        action={
          urgent.length > 0 ? (
            <Badge variant="error">
              <Clock size={10} /> {urgent.length} expirando em breve
            </Badge>
          ) : null
        }
      />

      <div className="px-8 py-6 space-y-3">
        {openInvites.map((invite) => {
          const isUrgent = invite.expiresAt.getTime() - Date.now() < 20 * 60000;
          return (
            <div
              key={invite.id}
              className={`rounded-xl border p-5 ${
                isUrgent
                  ? "bg-[var(--color-error-bg)] border-[var(--color-error)]/25"
                  : "bg-[var(--surface)] border-[var(--border)]"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[14px] font-sans font-600 text-[var(--text-primary)]">
                      {invite.sender}
                    </span>
                    <Mail size={13} className="text-[var(--text-tertiary)]" />
                    <span className="text-[14px] font-sans text-[var(--text-primary)]">
                      {invite.receiver}
                    </span>
                    <Badge variant="muted">{invite.category}</Badge>
                    <Badge variant={invite.type === "ranked" ? "info" : "muted"}>
                      {invite.type === "ranked" ? "Rankeada" : "Casual"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-[12px] font-sans text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1">
                      <MapPin size={11} /> {invite.club}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} /> Partida: {formatDate(invite.matchDatetime)}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-sans font-600 uppercase tracking-widest text-[var(--text-tertiary)] mb-1">
                    Expira em
                  </p>
                  <CountdownTimer expiresAt={invite.expiresAt} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
