import { AppShell } from "@/components/layout/app-shell";
import { CommandPalette } from "@/components/command-palette";
import { getOpsSummary } from "@/lib/ops";

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Deduped with the dashboard's own call via React cache() — one render, one
  // fan-out to the BFF, not two.
  const summary = await getOpsSummary();

  return (
    // The palette is a client component handed down as a prop — it renders into
    // the #global-search-slot the design agent left. Mounting it in the layout
    // is what makes ⌘K reachable from every panel: the layout is the only thing
    // that persists across route changes. AppShell adds the mobile drawer.
    <AppShell summary={summary} searchSlot={<CommandPalette />}>
      {children}
    </AppShell>
  );
}
