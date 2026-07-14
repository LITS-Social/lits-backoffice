import { Sidebar } from "@/components/layout/sidebar";
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
    <div className="flex min-h-screen">
      {/* The palette is a client component handed to the (also client) Sidebar as
          a prop — it renders into the #global-search-slot the design agent left.
          Mounting it in the layout is what makes ⌘K reachable from every panel:
          the layout is the only thing that persists across route changes. */}
      <Sidebar summary={summary} searchSlot={<CommandPalette />} />
      <main className="ml-60 flex-1 min-h-screen bg-[var(--bg)]">
        <div className="animate-fade-in-up">
          {children}
        </div>
      </main>
    </div>
  );
}
