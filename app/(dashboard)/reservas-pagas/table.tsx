"use client";

import { MapPin, Phone } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailGrid } from "@/components/ui/detail-grid";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import type { components } from "@/lib/api/openapi";
import { Absent, Contact, Player, When } from "../_components/cells";
import { CancelBookingButton } from "../_components/cancel-booking";

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

/**
 * Estados em que a partida ainda vai acontecer — os unicos em que faz sentido
 * ligar pro clube. Espelha `precisaReservaNoClube` no BFF, que e quem conta o
 * numero de pendentes; se os dois divergirem, o contador do topo passa a
 * discordar dos selos da tabela.
 *
 * Lista de PERMISSAO: estado novo entra como "nao e tarefa" ate alguem decidir.
 */
const VIVOS = new Set(["confirmed", "awaiting_guest_accept", "awaiting_guest_payment", "checked_in"]);

/** Como cada estado terminal se chama pra quem le o painel. */
const STATUS_LABEL: Record<string, string> = {
  cancelled: "Cancelada",
  played: "Jogada",
  no_show: "Nao compareceu",
  refunded: "Estornada",
  pending: "Aguardando pagamento",
  checked_in: "Check-in feito",
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
        {/* O "quem ligar". Sem telefone cadastrado a linha some — melhor
            ausência honesta que um botão que não disca. */}
        {r.club_phone && (
          <a
            href={`https://wa.me/${r.club_phone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-fit items-center gap-1 text-[10.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <Phone size={10} strokeWidth={2} className="shrink-0" />
            {r.club_name ? `${r.club_name} · ` : ""}
            {r.club_phone}
          </a>
        )}
      </span>
    ),
  },
  {
    id: "situacao",
    header: "Situação",
    width: "150px",
    // Ordena por urgência de ATENÇÃO, não alfabética: o que ninguém carimbou e
    // está com pagamento pela metade vem primeiro.
    sortAccessor: (r) => (r.club_ack_at ? 2 : 0) + (r.host_has_paid && r.guest_has_paid ? 1 : 0),
    render: (r) => (
      <span className="flex flex-col items-start gap-1">
        {/* Quem pagou. Numa partida dividida são DUAS cobranças; "pago" sem
            dizer de quem esconde exatamente o caso que este painel passou a
            cobrir — dinheiro parado de um lado só.
            AUSENTE ≠ FALSO: um BFF anterior a cbade74 não manda estes campos,
            e tratar `undefined` como "não pagou" faria toda linha afirmar "só
            o adversário pagou". Sem o dado, o painel cala em vez de mentir. */}
        {r.host_has_paid === undefined && r.guest_has_paid === undefined ? (
          <Badge variant="muted">Pagamento não informado</Badge>
        ) : r.host_has_paid && r.guest_has_paid ? (
          <Badge variant="success">Os dois pagaram</Badge>
        ) : r.host_has_paid ? (
          <Badge variant="warning">Só o jogador pagou</Badge>
        ) : (
          <Badge variant="warning">Só o adversário pagou</Badge>
        )}
        {/* Mesmo cuidado: "falta reservar" só pode ser dito quando o campo
            existe e veio vazio. Se o servidor nem manda `status`, ele é antigo
            demais pra saber do carimbo, e afirmar que falta seria chute. */}
        {r.club_ack_at ? (
          <Badge variant="info">
            {r.club_ack_action === "release" ? "Liberada no clube" : "Reservada no clube"}
          </Badge>
        ) : r.status !== undefined && VIVOS.has(r.status) ? (
          <Badge variant="error">Falta reservar</Badge>
        ) : r.status && STATUS_LABEL[r.status] ? (
          // Terminal: nao e tarefa, e dizer "falta reservar" numa partida
          // cancelada seria mandar a ops ligar pro clube a toa.
          <Badge variant="muted">{STATUS_LABEL[r.status]}</Badge>
        ) : null}
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
  {
    id: "acoes",
    header: "Ações",
    width: "168px",
    render: (r) => (
      <CancelBookingButton
        bookingId={r.booking_id}
        priceLabel={formatCurrency(r.price_cents, r.currency)}
        disabled={r.status !== undefined && !VIVOS.has(r.status)}
        disabledHint="A reserva já terminou ou foi cancelada — não há o que cancelar."
      />
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
            { label: "Estado", value: r.status },
            { label: "Jogador pagou", value: r.host_has_paid ? "sim" : "não" },
            { label: "Adversário pagou", value: r.guest_has_paid ? "sim" : "não" },
            { label: "Clube", value: r.club_name ?? "—" },
            { label: "Telefone do clube", value: r.club_phone ?? "—" },
            {
              label: "Reserva no clube",
              value: r.club_ack_at
                ? `${r.club_ack_action === "release" ? "liberada" : "reservada"} em ${new Date(r.club_ack_at).toLocaleString("pt-BR")}`
                : "ainda não feita",
            },
            { label: "Quem carimbou", value: r.club_ack_by ?? "—" },
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
