import { AppShell } from "@/components/layout/app-shell";
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

  // AppShell mounts the command palette itself (headless — ⌘K works from
  // every panel, no visible box anywhere) and adds the mobile drawer.
  return <AppShell summary={summary}>{children}</AppShell>;
}
