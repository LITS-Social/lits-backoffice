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
  CalendarCheck,
  LayoutGrid,
  PlusCircle,
  Users,
  Users2,
  Images,
  Megaphone,
  LayoutDashboard,
  ShieldAlert,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OpsSummary } from "@/lib/ops";
import { ThemeToggle } from "./theme-toggle";

const nav = [
  { id: "01", label: "Aguardando Jogo",      href: "/partidas-aguardando",    icon: Clock },
  { id: "02", label: "Finalizadas",           href: "/partidas-finalizadas",   icon: CheckCircle2 },
  { id: "03", label: "Convites",              href: "/convites",               icon: Mail },
  { id: "04", label: "Sem Recomendação",      href: "/sem-recomendacao",       icon: UserX },
  { id: "05", label: "Cancelamentos",         href: "/cancelamentos",          icon: XCircle },
  { id: "06", label: "Pagamentos",            href: "/pagamentos",             icon: CreditCard },
  { id: "07", label: "Bloqueios",             href: "/quadras-indisponiveis",  icon: AlertTriangle },
  { id: "08", label: "Avaliações",            href: "/avaliacoes",             icon: Star },
  { id: "09", label: "Denúncias",             href: "/denuncias",              icon: Flag },
  { id: "10", label: "Reservas Pagas",        href: "/reservas-pagas",         icon: CalendarCheck },
  { id: "11", label: "Usuários",              href: "/usuarios",               icon: Users },
  { id: "12", label: "Posts",                 href: "/posts",                  icon: Images },
  { id: "13", label: "Enviar Anúncio",        href: "/anuncios",               icon: Megaphone },
  { id: "14", label: "Públicos",              href: "/publicos",               icon: Users2 },
];

// Red is the money-and-moderation colour. Only these panels get to use it, and
// only they roll up into the headline alert count: #06 payments, #07 courts
// pulled by clubs, #09 reports awaiting moderation. #01 and #05 are ledgers —
// 66 healthy upcoming matches and 21 cancellations that already happened are
// things to LOOK at, not things to FIX. Summing every panel produced a red
// "138 alertas" that was mostly just the beta working, and an alert that fires
// on success is one people learn to ignore.
const ALERTING_PANELS = ["06", "07", "09"];

export function Sidebar({
  summary = {},
  searchSlot,
}: {
  summary?: OpsSummary;
  /** Global-search trigger. Owned by another agent; mounts at #global-search-slot. */
  searchSlot?: React.ReactNode;
}) {
  const pathname = usePathname();

  const totalAlerts = ALERTING_PANELS.reduce((sum, id) => sum + (summary[id]?.count ?? 0), 0);

  return (
    <aside className="fixed top-0 left-0 z-30 flex h-screen w-60 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      {/* ── Lockup ─────────────────────────────────────────────────────── */}
      <div className="px-5 pt-6 pb-4">
        <Link href="/" className="group flex items-center gap-2.5" aria-label="LITS — Operações">
          {/* The real wordmark, painted with currentColor via CSS mask. */}
          <span
            aria-hidden
            className="h-[22px] w-[41px] shrink-0 bg-[var(--text-primary)] transition-colors group-hover:bg-[var(--primary)]"
            style={{
              WebkitMask: "url('/assets/lits.svg') center/contain no-repeat",
              mask: "url('/assets/lits.svg') center/contain no-repeat",
            }}
          />
          <span className="mt-px h-3.5 w-px bg-[var(--border-strong)]" />
          <span className="label-colus text-[9px] leading-none text-[var(--text-tertiary)]">
            Operações
          </span>
        </Link>
      </div>

      {/* ── Status line ────────────────────────────────────────────────── */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span
                className="live-dot inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]"
                style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
              />
            </span>
            <span className="label-colus text-[9px] leading-none text-[var(--text-tertiary)]">
              Beta Closed
            </span>
          </span>

          {/* Serif numeral, red, no noun until it earns one. */}
          {totalAlerts > 0 && (
            <span
              title={`${totalAlerts} em pagamentos, quadras e denúncias`}
              className="flex items-baseline gap-1 text-[var(--color-error)]"
            >
              <span className="numeral text-[15px]">{totalAlerts}</span>
              <span className="label-colus text-[8px] leading-none opacity-70">alertas</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Global search mount point ──────────────────────────────────────
          Left empty on purpose. Another agent owns the search itself; pass it
          in as `searchSlot` and it lands here. The wrapper does not render at
          all when the slot is empty — an empty box would read as a broken input. */}
      {searchSlot && (
        <div id="global-search-slot" className="px-4 pb-4">
          {searchSlot}
        </div>
      )}

      <div className="mx-5 h-px bg-[var(--border)]" />

      {/* ── Panels ─────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="label-colus mb-3 px-2 text-[9px] text-[var(--text-tertiary)]">
          Monitoramento
        </p>

        {nav.map((item) => {
          const Icon = item.icon;
          const stat = summary[item.id];
          const count = stat?.count;
          const failed = stat?.failed === true;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const alarming = ALERTING_PANELS.includes(item.id);

          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-[7px] transition-colors duration-150",
                active
                  ? "bg-[var(--primary)]/12 text-[var(--primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r-full bg-[var(--primary)]" />
              )}

              {/* Panel number — Colus, the editorial folio mark. */}
              <span
                className={cn(
                  "label-colus w-4 shrink-0 text-[9px] leading-none tracking-normal",
                  active
                    ? "text-[var(--primary)]"
                    : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]"
                )}
              >
                {item.id}
              </span>

              <Icon
                size={13}
                strokeWidth={1.75}
                className={cn(
                  "shrink-0 transition-colors",
                  active
                    ? "text-[var(--primary)]"
                    : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]"
                )}
              />

              <span
                className={cn(
                  "flex-1 truncate text-[12.5px] leading-none transition-colors",
                  active ? "font-600" : "font-500"
                )}
              >
                {item.label}
              </span>

              {/* A panel whose fetch failed shows "!", never a number. Rendering
                  nothing would be indistinguishable from "all clear" — the one
                  lie this sidebar must not tell. */}
              {failed ? (
                <span
                  title="Falha ao carregar este painel"
                  className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--color-warning-bg)] px-1 text-[9px] font-700 text-[var(--color-warning)]"
                >
                  !
                </span>
              ) : count !== undefined && count > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9.5px] font-600 tabular-nums",
                    active
                      ? "bg-[var(--primary)]/20 text-[var(--primary)]"
                      : alarming
                        ? "bg-[var(--color-error-bg)] text-[var(--color-error)]"
                        : // A ledger's count is information, not an alarm. Neutral.
                          "bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                  )}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* ── Gestão ─────────────────────────────────────────────────────── */}
      <div className="mx-5 h-px bg-[var(--border)]" />
      <nav className="px-3 py-4">
        <p className="label-colus mb-3 px-2 text-[9px] text-[var(--text-tertiary)]">
          Gestão
        </p>

        {[
          { href: "/quadras",      label: "Quadras",      Icon: LayoutGrid, exact: true },
          { href: "/quadras/nova", label: "Nova Quadra",  Icon: PlusCircle, exact: false },
        ].map((item) => (
          <SecondaryNavItem key={item.href} {...item} pathname={pathname} />
        ))}
      </nav>

      {/* ── Análise ────────────────────────────────────────────────────── */}
      <div className="mx-5 h-px bg-[var(--border)]" />
      <nav className="px-3 py-4">
        <p className="label-colus mb-3 px-2 text-[9px] text-[var(--text-tertiary)]">
          Análise
        </p>

        {[
          { href: "/dashboard",  label: "Dashboard",  Icon: LayoutDashboard, exact: false },
          { href: "/moderacao",  label: "Moderação",   Icon: ShieldAlert,     exact: false },
          { href: "/auditoria",  label: "Auditoria",   Icon: ScrollText,      exact: false },
        ].map((item) => (
          <SecondaryNavItem key={item.href} {...item} pathname={pathname} />
        ))}
      </nav>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="mx-5 h-px bg-[var(--border)]" />
      <div className="flex items-center justify-between px-5 py-3.5">
        <p className="text-[11px] italic leading-none text-[var(--text-tertiary)]">
          Live the standard
        </p>
        <ThemeToggle />
      </div>
    </aside>
  );
}

/**
 * A nav row without a numbered folio — for panels outside the alerting
 * "Monitoramento" queue (Gestão, Análise). Same visual language, no count
 * badge: these panels are actioned/browsed, not triaged by volume.
 *
 * `exact: true` means the href must not light up on a deeper route (e.g.
 * "/quadras" should stay dim while on "/quadras/nova").
 */
function SecondaryNavItem({
  href,
  label,
  Icon,
  exact,
  pathname,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  exact: boolean;
  pathname: string;
}) {
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-[7px] transition-colors duration-150",
        active
          ? "bg-[var(--primary)]/12 text-[var(--primary)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r-full bg-[var(--primary)]" />
      )}
      <span className="label-colus w-4 shrink-0 text-[9px] leading-none tracking-normal text-transparent" />
      <Icon
        size={13}
        strokeWidth={1.75}
        className={cn(
          "shrink-0 transition-colors",
          active
            ? "text-[var(--primary)]"
            : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]"
        )}
      />
      <span
        className={cn(
          "flex-1 truncate text-[12.5px] leading-none transition-colors",
          active ? "font-600" : "font-500"
        )}
      >
        {label}
      </span>
    </Link>
  );
}
