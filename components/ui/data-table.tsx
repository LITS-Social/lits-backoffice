"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { SearchInput } from "./search-input";
import { FilterChips } from "./filter-chips";

export type SortDirection = "asc" | "desc";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  /** CSS grid track size, e.g. "1fr" or "140px". Defaults to "1fr". */
  width?: string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
  /** Presence of this makes the column header clickable/sortable. */
  sortAccessor?: (row: T) => number | string | null | undefined;
  className?: string;
}

export interface DataTableFilterOption<T> {
  value: string;
  label: string;
  predicate: (row: T) => boolean;
}

export interface DataTableFilterGroup<T> {
  id: string;
  label: string;
  options: DataTableFilterOption<T>[];
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  /** Lowercased haystack the free-text search matches against. */
  searchText: (row: T) => string;
  searchPlaceholder?: string;
  filters?: DataTableFilterGroup<T>[];
  initialSort?: { columnId: string; direction: SortDirection };
  /** Renders the full record when a row is expanded. Omit to disable expansion. */
  renderDetail?: (row: T) => ReactNode;
  rowClassName?: (row: T) => string | undefined;
  /** Shown when there is no data at all (rows.length === 0). */
  emptyMessage: string;
  /** Shown when search/filters narrow the (non-empty) data to zero rows. */
  noResultsMessage?: string;
  /** Rows per page. The table paginates client-side over the full fetched set,
   *  so search/sort/filter still span everything — only the display is paged. */
  pageSize?: number;
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR");
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchText,
  searchPlaceholder,
  filters = [],
  initialSort,
  renderDetail,
  rowClassName,
  emptyMessage,
  noResultsMessage = "Nada encontrado para os filtros ou busca aplicados.",
  pageSize = 25,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ columnId: string; direction: SortDirection } | null>(
    initialSort ?? null
  );
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>(() =>
    Object.fromEntries(filters.map((f) => [f.id, "all"]))
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let result = rows;

    for (const group of filters) {
      const value = activeFilters[group.id] ?? "all";
      if (value === "all") continue;
      const option = group.options.find((o) => o.value === value);
      if (option) result = result.filter(option.predicate);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((row) => searchText(row).toLowerCase().includes(q));
    }

    return result;
  }, [rows, filters, activeFilters, search, searchText]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns.find((c) => c.id === sort.columnId);
    const accessor = column?.sortAccessor;
    if (!accessor) return filtered;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return compareValues(av, bv) * dir;
    });
  }, [filtered, sort, columns]);

  const narrowed = sorted.length !== rows.length;

  // Paginate the FULLY filtered+sorted set, so a search covers every row and only
  // the rendered slice is a page. Clamp rather than store a page that a shrinking
  // result set has put out of range — narrowing to 3 rows must not strand you on
  // page 5 staring at an empty table.
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  // A new search/filter/sort resets to the first page — page 4 of the old result
  // set is meaningless against the new one.
  const resetKey = `${search}|${sort?.columnId ?? ""}|${sort?.direction ?? ""}|${Object.values(activeFilters).join(",")}`;
  useEffect(() => {
    setPage(0);
  }, [resetKey]);

  const gridTemplate = [renderDetail ? "20px" : null, ...columns.map((c) => c.width ?? "1fr")]
    .filter((v): v is string => v !== null)
    .join(" ");

  function toggleSort(column: DataTableColumn<T>) {
    if (!column.sortAccessor) return;
    setSort((current) => {
      if (!current || current.columnId !== column.id) {
        return { columnId: column.id, direction: "asc" };
      }
      if (current.direction === "asc") return { columnId: column.id, direction: "desc" };
      return null;
    });
  }

  function toggleExpanded(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (rows.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {filters.map((group) => (
            <FilterChips
              key={group.id}
              label={group.label}
              value={activeFilters[group.id] ?? "all"}
              onChange={(v) => setActiveFilters((cur) => ({ ...cur, [group.id]: v }))}
              options={[
                { value: "all", label: "Todos", count: rows.length },
                ...group.options.map((o) => ({
                  value: o.value,
                  label: o.label,
                  count: rows.filter(o.predicate).length,
                })),
              ]}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 sm:w-72 sm:shrink-0">
          {/* "43 de 66" — the denominator is the whole set the panel loaded, so a
              narrowed view can never be mistaken for the full picture. */}
          {narrowed && (
            <span className="whitespace-nowrap text-[11px] tabular-nums text-[var(--text-tertiary)]">
              <span className="font-600 text-[var(--text-secondary)]">{sorted.length}</span> de{" "}
              {rows.length}
            </span>
          )}
          <div className="flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder={searchPlaceholder} />
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState message={noResultsMessage} tone="neutral" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {/* Column heads: Colus, wide-tracked, on a recessed band — the masthead
              rule of a newspaper table, and unmistakably not a data row. */}
          <div
            className="grid items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-2.5"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {renderDetail && <span aria-hidden />}
            {columns.map((column) => {
              const isSorted = sort?.columnId === column.id;
              const sortable = !!column.sortAccessor;
              return (
                <button
                  key={column.id}
                  type="button"
                  onClick={() => toggleSort(column)}
                  disabled={!sortable}
                  className={cn(
                    "label-colus flex items-center gap-1 text-left text-[8.5px] transition-colors",
                    isSorted ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
                    sortable ? "cursor-pointer hover:text-[var(--text-primary)]" : "cursor-default",
                    column.align === "right" && "justify-end text-right",
                    column.align === "center" && "justify-center text-center"
                  )}
                >
                  {column.header}
                  {sortable &&
                    (!isSorted ? (
                      <ChevronsUpDown size={10} className="opacity-30" />
                    ) : sort?.direction === "asc" ? (
                      <ChevronUp size={10} className="text-[var(--primary)]" />
                    ) : (
                      <ChevronDown size={10} className="text-[var(--primary)]" />
                    ))}
                </button>
              );
            })}
          </div>

          <div>
            {paged.map((row) => {
              const key = rowKey(row);
              const isExpanded = expanded.has(key);
              const extraClass = rowClassName?.(row);
              return (
                <div
                  key={key}
                  className={cn(
                    "border-b border-[var(--border)] last:border-b-0",
                    isExpanded && "bg-[var(--surface-raised)]"
                  )}
                >
                  <div
                    role={renderDetail ? "button" : undefined}
                    tabIndex={renderDetail ? 0 : undefined}
                    aria-expanded={renderDetail ? isExpanded : undefined}
                    onClick={renderDetail ? () => toggleExpanded(key) : undefined}
                    onKeyDown={
                      renderDetail
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleExpanded(key);
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      "grid items-center gap-3 px-4 py-[11px] transition-colors",
                      renderDetail &&
                        "cursor-pointer hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--primary)]",
                      extraClass
                    )}
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    {renderDetail && (
                      <ChevronRight
                        size={12}
                        strokeWidth={2}
                        className={cn(
                          "shrink-0 text-[var(--text-tertiary)] transition-transform duration-150",
                          isExpanded && "rotate-90 text-[var(--primary)]"
                        )}
                      />
                    )}
                    {columns.map((column) => (
                      <div
                        key={column.id}
                        className={cn(
                          "min-w-0 text-[12.5px] leading-snug text-[var(--text-primary)]",
                          column.align === "right" && "text-right",
                          column.align === "center" && "text-center",
                          column.className
                        )}
                      >
                        {column.render(row)}
                      </div>
                    ))}
                  </div>
                  {renderDetail && isExpanded && (
                    <div className="animate-fade-in-up border-t border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-5">
                      {renderDetail(row)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pager. Only earns its space once there is more than one page. */}
          {sorted.length > pageSize && (
            <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-2.5">
              <span className="label-colus text-[8.5px] text-[var(--text-tertiary)]">
                {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} de{" "}
                {sorted.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage === 0}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="label-colus min-w-[3.5rem] text-center text-[8.5px] text-[var(--text-secondary)] tabular-nums">
                  {safePage + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage >= pageCount - 1}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="Próxima página"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
