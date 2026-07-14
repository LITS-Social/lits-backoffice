/**
 * The panel skeleton: masthead, stat rail, table. It mirrors the real layout so
 * the page settles into place instead of jumping when the data lands.
 *
 * Deliberately shows no numbers and no rows — not even greyed-out placeholder
 * ones. A skeleton row that looks like a record is a record until proven
 * otherwise, and this console has just had every fake value cut out of it.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Carregando painel">
      {/* Masthead */}
      <div className="border-b border-[var(--border)] px-8 pt-9 pb-7">
        <div className="h-2 w-20 rounded-full bg-[var(--surface-raised)]" />
        <div className="mt-4 h-7 w-72 rounded bg-[var(--surface-raised)]" />
        <div className="mt-3 h-3 w-96 max-w-full rounded bg-[var(--surface-raised)]" />
      </div>

      {/* Stat rail */}
      <div className="flex gap-6 border-b border-[var(--border)] bg-[var(--surface)]/60 px-8 py-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="min-w-[132px]">
            <div className="h-2 w-16 rounded-full bg-[var(--surface-raised)]" />
            <div className="mt-3 h-6 w-12 rounded bg-[var(--surface-raised)]" />
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="px-8 py-6">
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <div className="h-9 border-b border-[var(--border)] bg-[var(--surface-sunken)]" />
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-11 border-b border-[var(--border)] last:border-b-0" />
          ))}
        </div>
      </div>
    </div>
  );
}
