"use client";

import { Mail, MapPin, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn, type DataTableFilterGroup } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid } from "@/components/ui/detail-grid";
import { PaymentLegs, Price } from "@/components/ui/payment-legs";
import type { components } from "@/lib/api/openapi";
import { Contact, Player, When, matchTypeLabel, rail } from "../_components/cells";
import { CountdownTimer, URGENT_MS } from "./countdown-timer";

type OpenInviteItem = components["schemas"]["OpenInviteItem"];

const filters: DataTableFilterGroup<OpenInviteItem>[] = [
  {
    // Duas coisas diferentes na mesma lista, com ações opostas: no convite você
    // cobra a resposta de UMA pessoa; no jogo rápido você precisa ACHAR alguém,
    // porque não há convidado nenhum. Separável logo de cara.
    id: "kind",
    label: "Tipo",
    options: [
      { value: "invite", label: "Convite", predicate: (i) => i.kind !== "quick_match" },
      { value: "quick", label: "Jogo rápido", predicate: (i) => i.kind === "quick_match" },
      {
        value: "quick_public",
        label: "Rápido · aberto",
        predicate: (i) => i.kind === "quick_match" && i.visibility === "public",
      },
      {
        value: "quick_connections",
        label: "Rápido · só conexões",
        predicate: (i) => i.kind === "quick_match" && i.visibility === "connections",
      },
    ],
  },
  {
    id: "urgency",
    label: "Prazo",
    options: [
      {
        value: "soon",
        label: "Expirando (< 30min)",
        predicate: (i) => {
          const left = new Date(i.expires_at).getTime() - Date.now();
          return left > 0 && left < URGENT_MS;
        },
      },
      {
        // The window has closed and the guest never answered. Was hidden inside
        // the "expiring" bucket before, which lumped "call him NOW" together with
        // "too late, this one is dead" — opposite actions, same chip.
        value: "expired",
        label: "Expirado",
        predicate: (i) => new Date(i.expires_at).getTime() <= Date.now(),
      },
      {
        value: "stale",
        label: "Partida já passou",
        predicate: (i) => new Date(i.starts_at).getTime() < Date.now(),
      },
    ],
  },
];

/**
 * A mecânica da linha, dita UMA vez e com nome.
 *
 * Antes ela estava espalhada em três vocabulários e em nenhuma coluna chamada
 * "Tipo": um selo laranja "Mural aberto" dentro da coluna do CONVIDADO (que a
 * cor fazia ler como alerta, quando não há nada de errado), um chip
 * "Rápida/Casual" embaixo do nome da quadra (onde se lê como atributo da
 * QUADRA, não da partida), e os filtros no topo dizendo "Convite / Jogo
 * rápido". Três nomes para a mesma divisão.
 *
 * As duas mecânicas pedem ações OPOSTAS — no convite você cobra a resposta de
 * uma pessoa; no jogo rápido você precisa achar alguém, porque não há
 * convidado — então a divisão merece uma coluna própria, e não um adjetivo
 * pendurado noutra.
 *
 * As cores são as mesmas duas da pizza "origem das partidas" do dashboard: o
 * jogo rápido é a mesma fatia nos dois lugares.
 */
/** "public" | "connections" → o que o operador lê. Vazio = linha anterior à
    feature, que nunca escolheu; não afirmar "público" sobre ela. */
function visibilidadeLabel(v?: string): string | null {
  if (v === "public") return "aberto a todos";
  if (v === "connections") return "só conexões";
  return null;
}

function Mecanica({ quick, visibility }: { quick: boolean; visibility?: string }) {
  const Icone = quick ? Zap : Mail;
  const vis = quick ? visibilidadeLabel(visibility) : null;
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-4 w-[3px] shrink-0 rounded-full"
        style={{ background: quick ? "var(--chart-cat-a)" : "var(--chart-cat-b)" }}
      />
      <Icone size={11} className="shrink-0 text-[var(--text-tertiary)]" />
      <span className="min-w-0">
        <span className="block whitespace-nowrap text-[11.5px] font-500 text-[var(--text-secondary)]">
          {quick ? "Jogo rápido" : "Convite"}
        </span>
        {/* Privado × aberto muda a ação de ops: jogo de conexões que expira
            vazio não é falta de gente no clube, é falta de gente na REDE do
            host — cobrar divulgação dele, não do mural. */}
        {vis && (
          <span
            className={cn(
              "block whitespace-nowrap text-[9.5px] font-300",
              visibility === "connections" ? "text-[var(--color-clay)]" : "text-[var(--text-tertiary)]"
            )}
          >
            {vis}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * The countdown leads. This panel exists to answer one question — "quem eu
 * preciso cutucar agora?" — and the answer is whichever row is at the top.
 * The guest, the person he actually messages, sits immediately beside it.
 */
const columns: DataTableColumn<OpenInviteItem>[] = [
  {
    id: "expires_at",
    header: "Expira em",
    width: "104px",
    /**
     * Expired invites sort as null, which sinks them to the bottom (DataTable puts
     * nulls last in both directions).
     *
     * Sorting on the raw timestamp looked right and read backwards: an expired
     * invite has the EARLIEST expires_at of all, so the four dead ones took the top
     * four rows and the two the founder could still save — 4 minutes and 18 minutes
     * left on the clock — sat below the fold of his attention. The panel's own
     * subtitle promises "o topo da lista é quem precisa de um WhatsApp agora"; this
     * is what makes that sentence true.
     */
    sortAccessor: (i) => {
      const left = new Date(i.expires_at).getTime() - Date.now();
      return left > 0 ? left : null;
    },
    render: (i) => <CountdownTimer expiresAt={i.expires_at} />,
  },
  {
    id: "kind",
    header: "Tipo",
    width: "132px",
    // Ordena com os jogos rápidos juntos: são as linhas que precisam de
    // divulgação, não de cobrança, e ver o bloco inteiro é a leitura útil.
    sortAccessor: (i) => (i.kind === "quick_match" ? "0 jogo rápido" : "1 convite"),
    render: (i) => <Mecanica quick={i.kind === "quick_match"} visibility={i.visibility} />,
  },
  {
    id: "guest",
    header: "Convidado",
    sortAccessor: (i) => i.guest.name,
    // Jogo rápido não TEM convidado — está no mural esperando qualquer um.
    // Célula vazia se leria como dado faltando; um selo LARANJA se lia como
    // alerta. Não há nada de errado com um mural aberto, então o texto é
    // quieto e diz o que a linha espera: alguém entrar.
    render: (i) =>
      i.kind === "quick_match" ? (
        <span className="text-[11.5px] font-300 text-[var(--text-tertiary)]">
          {i.visibility === "connections" ? "no mural — só conexões do host" : "no mural — qualquer um"}
        </span>
      ) : (
        <Player name={i.guest.name} id={i.guest.user_id} strong />
      ),
  },
  {
    id: "host",
    header: "Host",
    sortAccessor: (i) => i.host.name,
    render: (i) => <Player name={i.host.name} id={i.host.user_id} />,
  },
  {
    id: "court",
    header: "Quadra",
    sortAccessor: (i) => i.court_label,
    render: (i) => (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1">
          <MapPin size={11} className="shrink-0 text-[var(--text-tertiary)]" />
          <span className="truncate">{i.court_label}</span>
        </span>
      </div>
    ),
  },
  {
    id: "starts_at",
    header: "Partida",
    width: "148px",
    sortAccessor: (i) => new Date(i.starts_at).getTime(),
    render: (i) => {
      // An invite still open for a match that ALREADY HAPPENED is not a countdown
      // to anything — it is a dead row, and there are real ones in the beta right
      // now. Saying "há 3 dias" in muted grey next to a live timer would let it
      // pass for normal, so it gets named.
      const past = new Date(i.starts_at).getTime() < Date.now();
      return (
        <div className="flex flex-col gap-1">
          <When iso={i.starts_at} />
          {past && <Badge variant="warning">Já passou</Badge>}
        </div>
      );
    },
  },
  {
    id: "price",
    header: "Valor",
    width: "84px",
    align: "right",
    sortAccessor: (i) => i.price_cents,
    render: (i) => <Price cents={i.price_cents} currency={i.currency} />,
  },
  {
    id: "payment",
    header: "Pagou?",
    width: "142px",
    /**
     * The HOST leg is the only one that carries information here.
     *
     * Every row on this panel is a booking in awaiting_guest_accept, and
     * booking-service only accepts a guest payment from awaiting_guest_PAYMENT —
     * the status the booking reaches AFTER the guest accepts. So the guest leg is
     * unpaid on 100% of these rows by construction; it was painting a red "✗ Conv."
     * on all 8 of 8, which is a debt the guest does not owe and an alert colour
     * spent on nothing. It now reads "aguardando aceite", in neutral.
     *
     * The host leg is genuinely variable — an invite CAN go out on a slot the host
     * never settled — so it keeps the red, and sorts to the top when unpaid.
     */
    sortAccessor: (i) => (i.host_payment.paid ? 1 : 0),
    render: (i) => (
      <PaymentLegs
        priceCents={i.price_cents}
        host={i.host_payment}
        guest={i.guest_payment}
        // Jogo rápido do mural não tem segunda perna: ninguém entrou ainda, logo
        // não existe convidado devendo nem aguardando aceite.
        hasGuest={i.kind !== "quick_match"}
        guestAwaitingAccept
      />
    ),
  },
];

export function OpenInvitesTable({ invites }: { invites: OpenInviteItem[] }) {
  return (
    <DataTable
      rows={invites}
      columns={columns}
      filters={filters}
      initialSort={{ columnId: "expires_at", direction: "asc" }}
      rowKey={(i) => i.booking_id}
      searchText={(i) => `${i.host.name} ${i.guest.name} ${i.court_label} ${i.kind === "quick_match" ? "jogo rápido mural aberto" : "convite"}`}
      searchPlaceholder="Buscar por jogador ou quadra..."
      emptyMessage="Nenhum convite ou jogo rápido em aberto."
      noResultsMessage="Nada encontrado para esse filtro ou busca."
      /**
       * Clay, not red: a closing invite is time pressure, not money owed. Red is
       * spent on the unpaid legs in the "Pagou?" column and nowhere else on this
       * panel, which is exactly why it still means something there.
       *
       * An already-expired invite gets NO rail. The window is shut; decorating it
       * would put weight on the one row he can no longer do anything about.
       */
      rowClassName={(i) => {
        const left = new Date(i.expires_at).getTime() - Date.now();
        if (left <= 0) return undefined;
        return left < URGENT_MS ? rail("attention", true) : undefined;
      }}
      renderDetail={(i) => (
        <DetailGrid
          fields={[
            { label: "Booking ID", value: i.booking_id, mono: true, span: true },
            { label: "Convidado", value: i.kind === "quick_match" ? "— mural aberto" : i.guest.name },
            { label: "Convidado ID", value: i.guest.user_id, mono: true },
            // Both sides, because the founder chases whichever one has not answered.
            { label: "Contato do convidado", value: <Contact user={i.guest} /> },
            { label: "Host", value: i.host.name },
            { label: "Host ID", value: i.host.user_id, mono: true },
            { label: "Contato do host", value: <Contact user={i.host} /> },
            { label: "Quadra", value: i.court_label },
            { label: "Tipo de partida", value: matchTypeLabel(i.match_type) },
            ...(i.kind === "quick_match"
              ? [{ label: "Visibilidade", value: visibilidadeLabel(i.visibility) ?? "— (anterior à escolha)" }]
              : []),
            { label: "Início da partida", value: new Date(i.starts_at).toLocaleString("pt-BR") },
            { label: "Criado em", value: new Date(i.created_at).toLocaleString("pt-BR") },
            {
              // expires_at is computed by the BFF as created_at + 2h — it is not a
              // stored column. Worth stating where it comes from, so nobody goes
              // looking for a bookings.expires_at that does not exist.
              label: "Expira em",
              value: `${new Date(i.expires_at).toLocaleString("pt-BR")} (criado + 2h)`,
            },
          ]}
        />
      )}
    />
  );
}
