"use client";

import { useState, useTransition } from "react";
import { DataTable, type DataTableColumn, type DataTableFilterGroup } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid } from "@/components/ui/detail-grid";
import type { CourtListItem } from "./actions";
import { deleteCourtAction } from "./actions";

const SURFACE_LABEL: Record<string, string> = {
  clay:   "Saibro",
  hard:   "Duro",
  grass:  "Grama",
  beach:  "Areia",
  carpet: "Carpete",
};

const filters: DataTableFilterGroup<CourtListItem>[] = [
  {
    id: "surface",
    label: "Superfície",
    options: [
      { value: "clay",   label: "Saibro",   predicate: (c) => c.surface === "clay"   },
      { value: "hard",   label: "Duro",     predicate: (c) => c.surface === "hard"   },
      { value: "grass",  label: "Grama",    predicate: (c) => c.surface === "grass"  },
      { value: "beach",  label: "Areia",    predicate: (c) => c.surface === "beach"  },
      { value: "carpet", label: "Carpete",  predicate: (c) => c.surface === "carpet" },
    ],
  },
  {
    id: "cover",
    label: "Cobertura",
    options: [
      { value: "indoor",  label: "Coberta",    predicate: (c) => c.indoor  },
      { value: "outdoor", label: "Descoberta", predicate: (c) => !c.indoor },
    ],
  },
  {
    id: "status",
    label: "Status",
    options: [
      { value: "active",   label: "Ativa",   predicate: (c) => c.is_active  },
      { value: "inactive", label: "Inativa", predicate: (c) => !c.is_active },
    ],
  },
];

const columns: DataTableColumn<CourtListItem>[] = [
  {
    id: "name",
    header: "Quadra",
    sortAccessor: (c) => c.name,
    render: (c) => (
      <div className="min-w-0">
        <p className="truncate font-600 text-[var(--text-primary)]">{c.name}</p>
        <p className="truncate text-[11px] text-[var(--text-tertiary)]">{c.franchise_name}</p>
      </div>
    ),
  },
  {
    id: "surface",
    header: "Superfície",
    width: "110px",
    sortAccessor: (c) => c.surface,
    render: (c) => <Badge variant="muted">{SURFACE_LABEL[c.surface] ?? c.surface}</Badge>,
  },
  {
    id: "cover",
    header: "Cobertura",
    width: "110px",
    sortAccessor: (c) => (c.indoor ? 0 : 1),
    render: (c) => (
      <Badge variant={c.indoor ? "info" : "muted"}>
        {c.indoor ? "Coberta" : "Descoberta"}
      </Badge>
    ),
  },
  {
    id: "slots",
    header: "Slots",
    width: "80px",
    sortAccessor: (c) => -c.slots_total,
    render: (c) => (
      <span className="tabular-nums text-[12px] text-[var(--text-secondary)]">
        {c.slots_total.toLocaleString("pt-BR")}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    width: "80px",
    sortAccessor: (c) => (c.is_active ? 0 : 1),
    render: (c) => (
      <Badge variant={c.is_active ? "success" : "warning"}>
        {c.is_active ? "Ativa" : "Inativa"}
      </Badge>
    ),
  },
];

function DeleteButton({ court }: { court: CourtListItem }) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (error) {
    return <p className="text-[11.5px] text-[var(--color-error)]">{error}</p>;
  }

  if (!confirmed) {
    return (
      <button
        onClick={() => setConfirmed(true)}
        className="rounded-md border border-[var(--color-error)]/40 px-3 py-1.5 text-[11.5px] font-500 text-[var(--color-error)] transition-colors hover:bg-[var(--color-error-bg)]"
      >
        Excluir quadra
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11.5px] text-[var(--text-secondary)]">
        Tem certeza? Isso apaga {court.slots_total.toLocaleString("pt-BR")} slots.
      </span>
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await deleteCourtAction(court.id);
            if (!res.ok) setError(res.error ?? "Erro ao excluir.");
          })
        }
        className="rounded-md bg-[var(--color-error)] px-3 py-1.5 text-[11.5px] font-600 text-white transition-opacity disabled:opacity-50"
      >
        {pending ? "Excluindo…" : "Confirmar"}
      </button>
      <button
        onClick={() => setConfirmed(false)}
        className="text-[11.5px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
      >
        Cancelar
      </button>
    </div>
  );
}

export function CourtsTable({ courts }: { courts: CourtListItem[] }) {
  return (
    <DataTable
      rows={courts}
      columns={columns}
      filters={filters}
      initialSort={{ columnId: "name", direction: "asc" }}
      rowKey={(c) => c.id}
      searchText={(c) => `${c.name} ${c.franchise_name} ${c.surface}`}
      searchPlaceholder="Buscar por nome, franquia ou superfície…"
      emptyMessage="Nenhuma quadra cadastrada."
      noResultsMessage="Nenhuma quadra encontrada para esse filtro."
      renderDetail={(c) => (
        <div className="space-y-5">
          <DetailGrid
            fields={[
              { label: "Court ID",     value: c.id,             mono: true, span: true },
              { label: "Franquia",     value: c.franchise_name },
              { label: "Franchise ID", value: c.franchise_id,   mono: true, span: true },
              { label: "Superfície",   value: SURFACE_LABEL[c.surface] ?? c.surface },
              { label: "Cobertura",    value: c.indoor ? "Coberta" : "Descoberta" },
              { label: "Status",       value: c.is_active ? "Ativa" : "Inativa" },
              { label: "Slots totais", value: String(c.slots_total) },
            ]}
          />
          <div>
            <p className="eyebrow mb-3">Ações</p>
            <DeleteButton court={c} />
          </div>
        </div>
      )}
    />
  );
}
