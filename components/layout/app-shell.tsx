"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import type { OpsSummary } from "@/lib/ops";
import { Sidebar } from "./sidebar";

/**
 * The responsive frame around every panel. Desktop (lg+) keeps the permanent
 * 240px sidebar; below that the sidebar becomes a slide-in drawer behind a
 * sticky topbar, so the whole backoffice — importar prints, bloquear e liberar
 * horários — works one-handed on a phone.
 */
export function AppShell({
  summary,
  searchSlot,
  children,
}: {
  summary: OpsSummary;
  searchSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer when navigation lands — state adjusted during render
  // (the sanctioned pattern; an effect would set state after a paint of the
  // still-open drawer over the new page).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar summary={summary} searchSlot={searchSlot} mobileOpen={open} />

      {/* Backdrop — tap anywhere off the drawer to dismiss it. */}
      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}

      <main className="min-h-screen w-full flex-1 bg-[var(--bg)] lg:ml-60">
        {/* Mobile topbar: hamburger + wordmark. Sticky so the menu is always a
            thumb away in the long gestão pages. */}
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setOpen(true)}
            className="-ml-1 rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <Menu size={18} strokeWidth={2} />
          </button>
          <Link href="/" aria-label="LITS — Operações" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="h-[18px] w-[34px] shrink-0 bg-[var(--text-primary)]"
              style={{
                WebkitMask: "url('/assets/lits.svg') center/contain no-repeat",
                mask: "url('/assets/lits.svg') center/contain no-repeat",
              }}
            />
            <span className="label-colus text-[8.5px] leading-none text-[var(--text-tertiary)]">
              Operações
            </span>
          </Link>
        </div>

        <div className="animate-fade-in-up">{children}</div>
      </main>
    </div>
  );
}
