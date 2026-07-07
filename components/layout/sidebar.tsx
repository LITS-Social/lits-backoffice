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
import { ThemeToggle } from "./theme-toggle";

const nav = [
  { id: "01", label: "Aguardando Jogo",      href: "/partidas-aguardando",    icon: Clock,          alert: 2 },
  { id: "02", label: "Finalizadas",           href: "/partidas-finalizadas",   icon: CheckCircle2,   alert: 3 },
  { id: "03", label: "Convites",              href: "/convites",               icon: Mail,           alert: 1 },
  { id: "04", label: "Sem Recomendação",      href: "/sem-recomendacao",       icon: UserX,          alert: 4 },
  { id: "05", label: "Cancelamentos",         href: "/cancelamentos",          icon: XCircle,        alert: 1 },
  { id: "06", label: "Pagamentos",            href: "/pagamentos",             icon: CreditCard,     alert: 2 },
  { id: "07", label: "Quadras",              href: "/quadras-indisponiveis",  icon: AlertTriangle,  alert: 1 },
  { id: "08", label: "Avaliações",            href: "/avaliacoes",             icon: Star,           alert: 0 },
  { id: "09", label: "Denúncias",             href: "/denuncias",              icon: Flag,           alert: 2 },
];

const totalAlerts = nav.reduce((s, i) => s + i.alert, 0);

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 left-0 h-screen w-60 flex flex-col border-r border-[var(--border)] bg-[var(--surface)] z-30">

      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center shrink-0">
            <span className="font-display text-white text-[15px] italic font-normal leading-none">L</span>
          </div>
          <div>
            <p className="font-display italic text-[15px] text-[var(--text-primary)] leading-none">LITS</p>
            <p className="text-[9px] font-sans font-600 tracking-[0.18em] uppercase text-[var(--text-tertiary)] mt-0.5">
              Operações
            </p>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="live-dot inline-flex h-2 w-2 rounded-full bg-[var(--color-warning)]" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
            </span>
            <span className="text-[10px] font-sans font-600 tracking-[0.15em] uppercase text-[var(--text-tertiary)]">
              Beta Closed
            </span>
          </div>
          {totalAlerts > 0 && (
            <span className="text-[10px] font-sans font-700 text-[var(--color-error)]">
              {totalAlerts} alertas
            </span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-[var(--border)]" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <p className="px-2 mb-3 text-[9px] font-sans font-700 text-[var(--text-tertiary)] tracking-[0.2em] uppercase">
          Monitoramento
        </p>

        {nav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-0.5 transition-colors duration-150",
                active
                  ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              )}
            >
              {/* Active left indicator */}
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r-full bg-[var(--primary)]" />
              )}

              {/* ID */}
              <span className={cn(
                "text-[10px] font-sans font-600 tabular-nums w-5 shrink-0 leading-none",
                active ? "text-[var(--primary)]" : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]"
              )}>
                {item.id}
              </span>

              {/* Icon */}
              <Icon
                size={13}
                className={cn(
                  "shrink-0 transition-colors",
                  active ? "text-[var(--primary)]" : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]"
                )}
              />

              {/* Label */}
              <span className={cn(
                "flex-1 text-[12px] font-sans font-500 leading-none truncate transition-colors",
                active ? "text-[var(--primary)] font-600" : ""
              )}>
                {item.label}
              </span>

              {/* Alert count */}
              {item.alert > 0 && (
                <span className={cn(
                  "inline-flex items-center justify-center min-w-[16px] h-4 rounded-full px-1 text-[9px] font-sans font-700 tabular-nums",
                  active
                    ? "bg-[var(--primary)]/20 text-[var(--primary)]"
                    : "bg-[var(--color-error-bg)] text-[var(--color-error)]"
                )}>
                  {item.alert}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mx-5 h-px bg-[var(--border)]" />
      <div className="px-5 py-4 flex items-center justify-between">
        <p className="text-[10px] font-sans text-[var(--text-tertiary)] tracking-wide">
          Live The Standard
        </p>
        <ThemeToggle />
      </div>
    </aside>
  );
}
