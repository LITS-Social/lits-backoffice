"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock,
  CheckCircle2,
  Mail,
  UserX,
  XCircle,
  CreditCard,
  AlertTriangle,
  Star,
  Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  {
    id: "01",
    label: "Aguardando Jogo",
    href: "/partidas-aguardando",
    icon: Clock,
    alert: 2,
  },
  {
    id: "02",
    label: "Finalizadas",
    href: "/partidas-finalizadas",
    icon: CheckCircle2,
    alert: 3,
  },
  {
    id: "03",
    label: "Convites em Aberto",
    href: "/convites",
    icon: Mail,
    alert: 1,
  },
  {
    id: "04",
    label: "Sem Recomendação",
    href: "/sem-recomendacao",
    icon: UserX,
    alert: 4,
  },
  {
    id: "05",
    label: "Cancelamentos",
    href: "/cancelamentos",
    icon: XCircle,
    alert: 1,
  },
  {
    id: "06",
    label: "Pagamentos",
    href: "/pagamentos",
    icon: CreditCard,
    alert: 2,
  },
  {
    id: "07",
    label: "Quadras Indisponíveis",
    href: "/quadras-indisponiveis",
    icon: AlertTriangle,
    alert: 1,
  },
  {
    id: "08",
    label: "Avaliações",
    href: "/avaliacoes",
    icon: Star,
    alert: 0,
  },
  {
    id: "09",
    label: "Denúncias",
    href: "/denuncias",
    icon: Flag,
    alert: 2,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 left-0 h-screen w-60 flex flex-col border-r border-[var(--border)] bg-[var(--surface)] z-30">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[var(--primary)] flex items-center justify-center">
            <span className="font-display text-white text-[11px] italic font-normal">
              L
            </span>
          </div>
          <div>
            <p className="font-sans text-[13px] font-700 tracking-tight text-[var(--text-primary)] leading-none">
              LITS
            </p>
            <p className="font-sans text-[10px] text-[var(--text-tertiary)] leading-none mt-0.5">
              Painel Operacional
            </p>
          </div>
        </div>
      </div>

      {/* Beta badge */}
      <div className="px-5 py-3 border-b border-[var(--border)]">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--border)] text-[10px] font-sans font-500 text-[var(--text-secondary)] tracking-wide uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] inline-block" />
          Beta Closed
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <p className="px-3 mb-2 text-[9.5px] font-sans font-600 text-[var(--text-tertiary)] tracking-widest uppercase">
          Operações
        </p>
        {nav.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5 group transition-colors",
                active
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              )}
            >
              <Icon
                size={15}
                className={cn(
                  "shrink-0",
                  active ? "text-white" : "text-[var(--text-tertiary)]"
                )}
              />
              <span className="flex-1 text-[12.5px] font-sans font-500 tracking-tight leading-none">
                {item.label}
              </span>
              {item.alert > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-sans font-700",
                    active
                      ? "bg-white/20 text-white"
                      : "bg-[var(--color-error-bg)] text-[var(--color-error)]"
                  )}
                >
                  {item.alert}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-[var(--border)]">
        <p className="text-[10px] font-sans text-[var(--text-tertiary)]">
          LITS — Live The Standard
        </p>
      </div>
    </aside>
  );
}
