"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock,
  CheckCircle2,
  Gauge,
  LayoutDashboard,
  Mail,
  UserX,
  XCircle,
  CreditCard,
  Star,
  Flag,
  CalendarCheck,
  LayoutGrid,
  PlusCircle,
  Users,
  Users2,
  Images,
  Megaphone,
  ShieldAlert,
  ScrollText,
  ClipboardList,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OpsSummary } from "@/lib/ops";
import { ThemeToggle } from "./theme-toggle";

// The two home screens: the product's north-star metrics, and the operational
// overview it displaced from "/". No folio numbers — these are not panels.
const home = [
  { label: "Dashboard",   href: "/",            icon: Gauge },
  { label: "Visão Geral", href: "/visao-geral", icon: LayoutDashboard },
];

const nav = [
  { id: "01", label: "Aguardando Jogo",      href: "/partidas-aguardando",    icon: Clock },
  { id: "02", label: "Finalizadas",           href: "/partidas-finalizadas",   icon: CheckCircle2 },
  { id: "03", label: "Convites",              href: "/convites",               icon: Mail },
  { id: "04", label: "Sem Recomendação",      href: "/sem-recomendacao",       icon: UserX },
  { id: "05", label: "Cancelamentos",         href: "/cancelamentos",          icon: XCircle },
  { id: "06", label: "Pagamentos",            href: "/pagamentos",             icon: CreditCard },
  { id: "08", label: "Avaliações",            href: "/avaliacoes",             icon: Star },
  { id: "09", label: "Denúncias",             href: "/denuncias",              icon: Flag },
  { id: "10", label: "Reservas Pagas",        href: "/reservas-pagas",         icon: CalendarCheck },
  { id: "11", label: "Usuários",              href: "/usuarios",               icon: Users },
  { id: "12", label: "Posts",                 href: "/posts",                  icon: Images },
  { id: "13", label: "Enviar Anúncio",        href: "/anuncios",               icon: Megaphone },
  { id: "14", label: "Públicos",              href: "/publicos",               icon: Users2 },
  { id: "15", label: "Lista de Espera",       href: "/lista-espera",           icon: ClipboardList },
  { id: "16", label: "Professores",           href: "/professores",            icon: GraduationCap },
];

// Red is the money-and-moderation colour. Only these panels get to use it:
// #06 payments, #07 courts pulled by clubs, #09 reports awaiting moderation.
// #01 and #05 are ledgers — healthy upcoming matches and cancellations that
// already happened are things to LOOK at, not things to FIX.
const ALERTING_PANELS = ["06", "07", "09"];

export function Sidebar({
  summary = {},
  mobileOpen = false,
}: {
  summary?: OpsSummary;
  /** Below lg the sidebar is a drawer; AppShell owns this state. */
  mobileOpen?: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 z-40 flex h-screen w-60 flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-transform duration-200 lg:z-30 lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      {/* ── Lockup ─────────────────────────────────────────────────────────
          The search trigger used to live below this, in the space now freed
          for the wordmark to breathe (⌘K still works — see AppShell). Vertical
          stack, centered — the mark carries the weight, "Operações" just
          names the house underneath it. */}
      <div className="flex flex-col items-center gap-2.5 px-5 pt-9 pb-7">
        <Link href="/" aria-label="LITS — Operações" className="group">
          {/* The real wordmark, painted with currentColor via CSS mask. */}
          <span
            aria-hidden
            className="block h-[42px] w-[78px] bg-[var(--text-primary)] transition-colors group-hover:bg-[var(--primary)]"
            style={{
              WebkitMask: "url('/assets/lits.svg') center/contain no-repeat",
              mask: "url('/assets/lits.svg') center/contain no-repeat",
            }}
          />
        </Link>
        <span className="label-colus text-center text-[9.5px] leading-none tracking-[0.16em] text-[var(--text-tertiary)]">
          Operações
        </span>
      </div>

      <div className="mx-5 h-px bg-[var(--border)]" />

      {/* ── Panels ─────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="label-colus mb-3 px-2 text-[9px] text-[var(--text-tertiary)]">
          Painel
        </p>

        {home.map((item) => {
          const Icon = item.icon;
          // "/" would prefix-match every route; the home links match exactly.
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
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

              <Icon
                size={13}
                strokeWidth={1.75}
                className={cn(
                  "ml-[26px] shrink-0 transition-colors",
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
            </Link>
          );
        })}

        <p className="label-colus mt-5 mb-3 px-2 text-[9px] text-[var(--text-tertiary)]">
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

              {/* Panel number — tracked Nikkei, the editorial folio mark. */}
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
          { href: "/academias",    label: "Academias",     Icon: LayoutGrid, exact: false },
          { href: "/quadras/nova", label: "Nova Academia", Icon: PlusCircle, exact: false },
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
