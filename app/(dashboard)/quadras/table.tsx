"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Building2, MapPin, Pencil, Plus } from "lucide-react";
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

/**
 * Venue kind as staff read it: partner club, public park, or a directory
 * listing — with PlayTennis (brand) split out of the generic listings because
 * its 14 units behave as a semi-integrated network. `rank` drives the default
 * sort: partners first, then parks, then the listing long tail alphabetical.
 */
function venueKind(c: CourtListItem): { label: string; variant: "success" | "info" | "default" | "muted"; rank: number } {
  if (c.franchise_kind === "partner") return { label: "Parceiro",   variant: "success", rank: 0 };
  if (c.franchise_kind === "public")  return { label: "Pública",    variant: "info",    rank: 1 };
  if (c.franchise_brand === "playtennis") return { label: "PlayTennis", variant: "default", rank: 2 };
  return { label: "Diretório", variant: "muted", rank: 2 };
}

/**
 * Franchise geolocation, three-state: `missing` (null — the backlog the staff
 * works through), `set`, and `unknown` for the deploy window where the running
 * BFF predates the geo fields. The generated type says the fields always exist,
 * so absence is probed with `in` (absent key ≠ "no location", so no false alarm).
 * The exact (0,0) pair is legacy "no coords" sentinel data (unranked in the
 * app's proximity sort, rejected by the PATCH) — reads as missing.
 */
function geoState(c: CourtListItem): "set" | "missing" | "unknown" {
  if (
    typeof c.franchise_lat === "number" &&
    typeof c.franchise_lng === "number" &&
    !(c.franchise_lat === 0 && c.franchise_lng === 0)
  ) {
    return "set";
  }
  if (!("franchise_lat" in c) || !("franchise_lng" in c)) return "unknown";
  return "missing";
}

const filters: DataTableFilterGroup<CourtListItem>[] = [
  {
    id: "kind",
    label: "Tipo",
    options: [
      { value: "partner",    label: "Parceiro",   predicate: (c) => c.franchise_kind === "partner" },
      { value: "public",     label: "Pública",    predicate: (c) => c.franchise_kind === "public"  },
      { value: "playtennis", label: "PlayTennis", predicate: (c) => c.franchise_brand === "playtennis" },
      // Mirrors venueKind()'s fallback branch (anything not partner/public/
      // PlayTennis reads as Diretório) so badge and chip can never disagree —
      // including the old-BFF window where franchise_kind is undefined.
      { value: "listing",    label: "Diretório",  predicate: (c) => c.franchise_kind !== "partner" && c.franchise_kind !== "public" && c.franchise_brand !== "playtennis" },
    ],
  },
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
  {
    id: "geo",
    label: "Localização",
    options: [
      { value: "missing", label: "Sem localização", predicate: (c) => geoState(c) === "missing" },
      { value: "set",     label: "Com localização", predicate: (c) => geoState(c) === "set"     },
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
    id: "kind",
    header: "Tipo",
    width: "110px",
    // Rank prefix keeps the localeCompare order partner → public → listings,
    // alphabetical by franchise inside each band.
    sortAccessor: (c) => `${venueKind(c).rank} ${c.franchise_name} ${c.name}`,
    render: (c) => {
      const k = venueKind(c);
      return <Badge variant={k.variant}>{k.label}</Badge>;
    },
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
  {
    id: "geo",
    header: "Geo",
    width: "90px",
    // Missing first: sorting this column surfaces the no-location backlog.
    sortAccessor: (c) => ({ missing: 0, unknown: 1, set: 2 })[geoState(c)],
    render: (c) => {
      const g = geoState(c);
      if (g === "missing") return <Badge variant="warning">Sem geo</Badge>;
      if (g === "set")     return <Badge variant="muted">OK</Badge>;
      return <span className="text-[11px] text-[var(--text-tertiary)]">—</span>;
    },
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
      initialSort={{ columnId: "kind", direction: "asc" }}
      rowKey={(c) => c.id}
      searchText={(c) => `${c.name} ${c.franchise_name} ${c.surface} ${venueKind(c).label}`}
      searchPlaceholder="Buscar por nome, franquia, tipo ou superfície…"
      emptyMessage="Nenhuma quadra cadastrada."
      noResultsMessage="Nenhuma quadra encontrada para esse filtro."
      renderDetail={(c) => (
        <div className="space-y-5">
          <DetailGrid
            fields={[
              { label: "Court ID",     value: c.id,             mono: true, span: true },
              { label: "Franquia",     value: c.franchise_name },
              { label: "Tipo",         value: venueKind(c).label },
              { label: "Franchise ID", value: c.franchise_id,   mono: true, span: true },
              { label: "Superfície",   value: SURFACE_LABEL[c.surface] ?? c.surface },
              { label: "Cobertura",    value: c.indoor ? "Coberta" : "Descoberta" },
              { label: "Status",       value: c.is_active ? "Ativa" : "Inativa" },
              { label: "Slots totais", value: String(c.slots_total) },
              {
                label: "Localização",
                span: true,
                value:
                  geoState(c) === "set" ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${c.franchise_lat},${c.franchise_lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                    >
                      <MapPin size={12} strokeWidth={2} />
                      {c.franchise_lat}, {c.franchise_lng}
                    </a>
                  ) : geoState(c) === "missing" ? (
                    "Sem localização — edite a quadra para definir."
                  ) : (
                    "—"
                  ),
              },
            ]}
          />
          {c.franchise_kind === "listing" && (
            <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
              Local do diretório: o app exibe a grade sintetizada gratuita (06h–22h, R$ 0),
              independente dos slots cadastrados aqui — por isso o total de slots pode ser 0.
            </p>
          )}
          <div>
            <p className="eyebrow mb-3">Ações</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/quadras/${c.id}/editar`}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--text-tertiary)]/30 px-3 py-1.5 text-[11.5px] font-500 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar quadra
              </Link>
              {/* Academia-level actions ride on the court row — the franchise has
                  no page of its own; its editor (nome, endereço, localização,
                  preço padrão) lives anchored inside the court edit page. */}
              <Link
                href={`/quadras/${c.id}/editar#academia`}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--text-tertiary)]/30 px-3 py-1.5 text-[11.5px] font-500 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                <Building2 className="h-3.5 w-3.5" />
                Editar academia
              </Link>
              <Link
                href={`/quadras/nova?franquia=${c.franchise_id}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--text-tertiary)]/30 px-3 py-1.5 text-[11.5px] font-500 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Nova quadra nesta academia
              </Link>
              <DeleteButton court={c} />
            </div>
          </div>
        </div>
      )}
    />
  );
}
