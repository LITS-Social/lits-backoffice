"use client";

import { MapPin } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailGrid } from "@/components/ui/detail-grid";
import { formatCurrency } from "@/lib/utils";
import type { components } from "@/lib/api/openapi";
import { Absent, Contact, Player, When } from "../_components/cells";

type ManualReservationItem = components["schemas"]["ManualReservationItem"];

/**
 * The court's playing surface, in the word the club uses on the phone. The BFF
 * sends the five slugs enumerated in the contract; anything outside the map is
 * shown verbatim rather than mistranslated, and an absent surface renders nothing.
 */
const SURFACE_LABELS: Record<string, string> = {
  clay: "Saibro",
  hard: "Piso rápido",
  grass: "Grama",
  beach: "Areia",
  carpet: "Carpete",
};

function surfaceLabel(value?: string): string | undefined {
  if (!value) return undefined;
  return SURFACE_LABELS[value] ?? value;
}

const columns: DataTableColumn<ManualReservationItem>[] = [
  {
    // Money leads, serif — the panel's spine is "quanto foi pago, para qual quadra".
    id: "price",
    header: "Valor",
    width: "116px",
    sortAccessor: (r) => r.price_cents,
    render: (r) => (
      <span className="numeral text-[16px] text-[var(--text-primary)]">
        {formatCurrency(r.price_cents, r.currency)}
      </span>
    ),
  },
  {
    id: "court",
    header: "Quadra",
    sortAccessor: (r) => r.court_label,
    // The address is the whole reason this panel exists: it is the number Flavio
    // dials to physically reserve the court. Shown under the label, never buried.
    render: (r) => (
      <span className="flex flex-col gap-0.5">
        <span className="font-600 text-[var(--text-primary)]">{r.court_label}</span>
        {r.street_address && (
          <span className="flex items-center gap-1 text-[10.5px] text-[var(--text-tertiary)]">
            <MapPin size={10} strokeWidth={2} className="shrink-0" />
            {r.street_address}
          </span>
        )}
      </span>
    ),
  },
  {
    id: "starts_at",
    header: "Partida",
    width: "104px",
    // Soonest first (see initialSort): the match happening next is the court that
    // most urgently needs booking. `soonMs` turns the relative half clay inside 24h.
    sortAccessor: (r) => new Date(r.starts_at).getTime(),
    render: (r) => <When iso={r.starts_at} soonMs={24 * 3600 * 1000} />,
  },
  {
    id: "host",
    header: "Jogador",
    sortAccessor: (r) => r.host.name,
    render: (r) => (
      <span className="flex flex-col gap-0.5">
        <Player name={r.host.name} id={r.host.user_id} strong />
        <Contact user={r.host} />
      </span>
    ),
  },
  {
    id: "guest",
    header: "Adversário",
    sortAccessor: (r) => r.guest?.name ?? "",
    render: (r) =>
      r.guest ? (
        <span className="flex flex-col gap-0.5">
          <Player name={r.guest.name} id={r.guest.user_id} />
          <Contact user={r.guest} />
        </span>
      ) : (
        <Absent />
      ),
  },
];

export function ManualReservationsTable({ reservations }: { reservations: ManualReservationItem[] }) {
  return (
    <DataTable
      rows={reservations}
      columns={columns}
      // Soonest match first: the top of this list is the court that needs reserving
      // before the others. A worklist is read by urgency, not recency.
      initialSort={{ columnId: "starts_at", direction: "asc" }}
      rowKey={(r) => r.booking_id}
      searchText={(r) =>
        `${r.host.name} ${r.guest?.name ?? ""} ${r.court_label} ${r.street_address ?? ""} ${r.booking_id}`
      }
      searchPlaceholder="Buscar por jogador, quadra ou endereço..."
      emptyMessage="Nenhuma reserva paga aguardando confirmação de quadra."
      noResultsMessage="Nenhuma reserva paga encontrada para essa busca."
      renderDetail={(r) => (
        <DetailGrid
          fields={[
            { label: "Booking ID", value: r.booking_id, mono: true, span: true },
            { label: "Quadra", value: r.court_label },
            { label: "Endereço", value: r.street_address ?? "—" },
            { label: "Piso", value: surfaceLabel(r.surface) ?? "—" },
            { label: "Court ID", value: r.court_id ?? "—", mono: true },
            { label: "Valor pago", value: formatCurrency(r.price_cents, r.currency) },
            { label: "Moeda", value: r.currency ?? "BRL" },
            { label: "Pagamento", value: r.payment_status },
            { label: "Horário da partida", value: new Date(r.starts_at).toLocaleString("pt-BR") },
            { label: "Jogador", value: r.host.name },
            { label: "Jogador ID", value: r.host.user_id, mono: true },
            { label: "Contato do jogador", value: <Contact user={r.host} /> },
            { label: "Adversário", value: r.guest?.name ?? "—" },
            { label: "Adversário ID", value: r.guest?.user_id ?? "—", mono: true },
            {
              label: "Contato do adversário",
              value: r.guest ? <Contact user={r.guest} /> : <Absent />,
            },
          ]}
        />
      )}
    />
  );
}
