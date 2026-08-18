"use client";

import { DataTable, type DataTableColumn, type DataTableFilterGroup } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid } from "@/components/ui/detail-grid";
import { formatCurrency } from "@/lib/utils";
import type { components } from "@/lib/api/openapi";
import { Player, When, rail } from "../_components/cells";
import { CancelBookingButton } from "../_components/cancel-booking";

type PaymentIssueItem = components["schemas"]["PaymentIssueItem"];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "error" | "warning" | "success" | "muted"; label: string }> = {
    pending: { variant: "warning", label: "Pendente" },
    rejected: { variant: "error", label: "Rejeitado" },
  };
  // An unrecognised status falls through with its raw value rather than being
  // mapped to something friendlier-sounding that we cannot vouch for.
  const config = map[status] || { variant: "muted" as const, label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/**
 * The state of the BOOKING under the payment, which decides what you actually do:
 *
 *   cancelled            → the match is gone. This is a refund/reconciliation job.
 *   pending / awaiting…  → the match is still alive and the money is missing.
 *                          THIS is the row worth a phone call.
 *
 * Mapping only what the seed and the contract actually produce; anything else is
 * shown verbatim instead of being guessed at.
 */
const BOOKING_STATUS: Record<string, { label: string; dead: boolean }> = {
  cancelled: { label: "Cancelada", dead: true },
  pending: { label: "Aguardando pagamento", dead: false },
  awaiting_guest_accept: { label: "Aguardando convidado", dead: false },
};

function isDead(status: string): boolean {
  return BOOKING_STATUS[status]?.dead ?? false;
}

const filters: DataTableFilterGroup<PaymentIssueItem>[] = [
  {
    id: "status",
    label: "Pix",
    options: [
      { value: "pending", label: "Pendente", predicate: (p) => p.payment_status === "pending" },
      { value: "rejected", label: "Rejeitado", predicate: (p) => p.payment_status === "rejected" },
    ],
  },
  {
    id: "booking",
    label: "Reserva",
    // Abre em "Ainda de pé": é a fila de trabalho. As presas em reserva já
    // cancelada são pergunta de estorno, não de cobrança — e quando são 79 de
    // 80, o muro de linhas mortas idênticas enterrava a única que importava.
    // O chip "Já cancelada · 79" fica a um clique, com a contagem à vista.
    initialValue: "live",
    options: [
      { value: "live", label: "Ainda de pé", predicate: (p) => !isDead(p.booking_status) },
      { value: "dead", label: "Já cancelada", predicate: (p) => isDead(p.booking_status) },
    ],
  },
];

const columns: DataTableColumn<PaymentIssueItem>[] = [
  {
    // Money leads, and it is set as a serif numeral — the panel's question is
    // "quanto está preso, com quem", and the amount is the half of that answer
    // you can scan a column of without reading a single name.
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
    header: "Parado há",
    width: "104px",
    // Oldest first by default (see initialSort). A Pix pending for four minutes is
    // simply in flight; one pending since yesterday is dead and nobody noticed.
    // Age is what separates the two, and it is the only thing that does.
    sortAccessor: (p) => new Date(p.created_at).getTime(),
    render: (p) => <When iso={p.created_at} />,
  },
  {
    id: "status",
    header: "Pix",
    width: "108px",
    sortAccessor: (p) => p.payment_status,
    render: (p) => <StatusBadge status={p.payment_status} />,
  },
  {
    id: "booking_status",
    header: "Reserva",
    width: "168px",
    sortAccessor: (p) => p.booking_status,
    // Was buried in the expand-row. A quarter of these rows are stuck payments on
    // ALREADY-CANCELLED bookings — a completely different job from the rest (a
    // refund, not a chase), and the column that says so was one click away from
    // every row.
    render: (p) => {
      const known = BOOKING_STATUS[p.booking_status];
      return (
        <Badge variant={known?.dead ? "muted" : "default"}>
          {known?.label ?? p.booking_status}
        </Badge>
      );
    },
  },
  {
    id: "acoes",
    header: "Ações",
    width: "168px",
    // Mesmo botão do painel #10, de propósito: um pagamento preso numa reserva
    // viva muitas vezes se resolve cancelando com estorno, e mandar a ops
    // trocar de tela pra isso era o que tornava o cancelamento manual.
    //
    // Reserva já morta (cancelada) não oferece o botão: o servidor recusaria
    // estado terminal, e oferecer o que vai falhar é pior que não oferecer.
    render: (p) => (
      <CancelBookingButton
        bookingId={p.booking_id}
        priceLabel={formatCurrency(p.amount_cents, p.currency)}
        disabled={isDead(p.booking_status)}
        disabledHint="A reserva já está cancelada — não há o que cancelar."
      />
    ),
  },
];

export function PaymentIssuesTable({ issues }: { issues: PaymentIssueItem[] }) {
  return (
    <DataTable
      rows={issues}
      columns={columns}
      filters={filters}
      // Mais recente primeiro (pedido do founder): a fila é lida como um
      // extrato — o que acabou de travar no topo. A coluna "Parado há"
      // continua ordenável para quem quiser caçar o mais antigo.
      initialSort={{ columnId: "age", direction: "desc" }}
      rowKey={(p) => p.booking_id}
      searchText={(p) => `${p.user.name} ${p.booking_id} ${p.payment_status} ${p.booking_status}`}
      searchPlaceholder="Buscar por pagador ou booking id..."
      emptyMessage="Nenhum problema de pagamento encontrado."
      noResultsMessage="Nenhum problema de pagamento encontrado para esse filtro ou busca."
      /**
       * Red, because this panel is money — that is precisely what the colour is
       * reserved for, and here it is spent correctly.
       *
       * But only on the LIVE bookings. A stuck Pix on a booking that was already
       * cancelled is not money to chase; it is bookkeeping. Painting those red too
       * would put a fifth of the table on fire for a job nobody is going to do
       * today, and the rows that DO need a phone call would stop standing out.
       */
      rowClassName={(p) => (isDead(p.booking_status) ? undefined : rail("money"))}
      renderDetail={(p) => (
        <DetailGrid
          fields={[
            { label: "Booking ID", value: p.booking_id, mono: true, span: true },
            { label: "Pagador", value: p.user.name },
            { label: "Pagador ID", value: p.user.user_id, mono: true },
            { label: "Valor", value: formatCurrency(p.amount_cents, p.currency) },
            { label: "Moeda", value: p.currency },
            { label: "Status do Pix", value: <StatusBadge status={p.payment_status} /> },
            {
              label: "Status da reserva",
              value: BOOKING_STATUS[p.booking_status]?.label ?? p.booking_status,
            },
            { label: "Criada em", value: new Date(p.created_at).toLocaleString("pt-BR") },
          ]}
        />
      )}
    />
  );
}
