"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid } from "@/components/ui/detail-grid";
import { formatCurrency } from "@/lib/utils";
import type { components } from "@/lib/api/openapi";
import { Player, When } from "../_components/cells";

type SuccessfulPaymentItem = components["schemas"]["SuccessfulPaymentItem"];

const columns: DataTableColumn<SuccessfulPaymentItem>[] = [
  {
    id: "amount",
    header: "Valor",
    width: "116px",
    sortAccessor: (p) => p.amount_cents,
    render: (p) => (
      <span className="numeral text-[16px] text-[var(--text-primary)]">
        {formatCurrency(p.amount_cents, p.currency)}
      </span>
    ),
  },
  {
    id: "user",
    header: "Pagador",
    sortAccessor: (p) => p.user.name,
    render: (p) => <Player name={p.user.name} id={p.user.user_id} strong />,
  },
  {
    id: "age",
    header: "Pago há",
    width: "104px",
    sortAccessor: (p) => new Date(p.created_at).getTime(),
    render: (p) => <When iso={p.created_at} />,
  },
  {
    id: "booking_status",
    header: "Reserva",
    width: "168px",
    sortAccessor: (p) => p.booking_status,
    render: (p) => <Badge variant="success">{p.booking_status}</Badge>,
  },
];

export function SuccessfulPaymentsTable({ payments }: { payments: SuccessfulPaymentItem[] }) {
  return (
    <DataTable
      rows={payments}
      columns={columns}
      // Newest first: this is a "did it work" ledger, not a chase queue — the
      // most recent charges are what staff actually wants to glance at.
      initialSort={{ columnId: "age", direction: "desc" }}
      rowKey={(p) => p.booking_id}
      searchText={(p) => `${p.user.name} ${p.booking_id} ${p.booking_status}`}
      searchPlaceholder="Buscar por pagador ou booking id..."
      emptyMessage="Nenhum pagamento concluído ainda."
      noResultsMessage="Nenhum pagamento concluído encontrado para essa busca."
      renderDetail={(p) => (
        <DetailGrid
          fields={[
            { label: "Booking ID", value: p.booking_id, mono: true, span: true },
            { label: "Pagador", value: p.user.name },
            { label: "Pagador ID", value: p.user.user_id, mono: true },
            { label: "Valor", value: formatCurrency(p.amount_cents, p.currency) },
            { label: "Moeda", value: p.currency },
            { label: "Status da reserva", value: p.booking_status },
            { label: "Criada em", value: new Date(p.created_at).toLocaleString("pt-BR") },
          ]}
        />
      )}
    />
  );
}
