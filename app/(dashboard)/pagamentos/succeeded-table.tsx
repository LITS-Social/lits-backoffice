"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid } from "@/components/ui/detail-grid";
import { formatCurrency } from "@/lib/utils";
import type { components } from "@/lib/api/openapi";
import { Player, When } from "../_components/cells";
import { CancelBookingButton } from "../_components/cancel-booking";

type SuccessfulPaymentItem = components["schemas"]["SuccessfulPaymentItem"];

/**
 * Reserva que ja acabou ou ja morreu nao tem o que cancelar — o servidor
 * recusaria estado terminal, e oferecer o que vai falhar e pior que nao
 * oferecer. 'refunded' entra aqui: o dinheiro ja voltou.
 */
const TERMINAIS = new Set(["cancelled", "played", "no_show", "refunded", "expired"]);

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
  {
    id: "acoes",
    header: "Ações",
    width: "168px",
    // Mesmo botao dos paineis #10 e da tabela de problemas: pagamento que
    // entrou numa reserva ainda viva se resolve cancelando com estorno, e
    // mandar a ops trocar de tela pra isso era o que mantinha o cancelamento
    // manual.
    render: (p) => (
      <CancelBookingButton
        bookingId={p.booking_id}
        priceLabel={formatCurrency(p.amount_cents, p.currency)}
        disabled={TERMINAIS.has(p.booking_status)}
        disabledHint="A reserva já terminou ou foi cancelada — não há o que cancelar."
      />
    ),
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
