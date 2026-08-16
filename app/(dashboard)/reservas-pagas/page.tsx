import { PageHeader } from "@/components/ui/page-header";
import { getApi } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { StatRail } from "../_components/stat-rail";
import { PanelError, TruncationNote } from "../_components/notes";
import { ManualReservationsTable } from "./table";

export const dynamic = "force-dynamic";

/**
 * A ceiling, not a promise. The endpoint pages (limit/offset); we ask for the
 * whole beta at once and let TruncationNote speak up if it ever outgrows this.
 * Same contract as #06 payments — the count is honest whether or not the cap holds.
 */
const LIMIT = 500;

export default async function ReservasPagasPage() {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/manual-reservations", {
    params: { query: { limit: LIMIT } },
  });

  if (error) {
    return <PanelError eyebrow="#10" title="Reservas Pagas" detail={error.detail || error.title} />;
  }

  const reservations = data.reservations ?? [];
  const total = data.total ?? reservations.length;
  const truncated = reservations.length < total;
  const pending = data.pending ?? reservations.length;

  // The money these confirmed-and-paid bookings represent. It is the sum of the
  // rows we actually hold: when everything fits under LIMIT that IS the total and
  // says so; when it does not, the label switches to "carregado" so it never
  // passes a partial sum off as the whole.
  const paidCents = reservations.reduce((sum, r) => sum + r.price_cents, 0);

  return (
    <div>
      <PageHeader
        eyebrow="#10"
        title="Reservas Pagas"
        description="Partidas com dinheiro em caixa que ainda precisam da quadra reservada no clube — inclusive quando só um dos jogadores pagou. Quem ligar, para onde, o telefone dos dois jogadores, e cancelar com estorno integral."
      />

      <StatRail
        stats={[
          {
            // O que é TAREFA de verdade: ainda sem carimbo de reservado no
            // clube. As já reservadas seguem na lista com selo (decisão do
            // founder), então o total sozinho não diz o que falta fazer.
            label: "Falta reservar",
            value: pending,
            tone: "attention",
            hint:
              truncated
                ? `contado nas ${reservations.length} carregadas — pode haver mais`
                : `de ${total} reservas com dinheiro em caixa`,
          },
          {
            label: truncated ? "Valor carregado" : "Valor pago",
            value: formatCurrency(paidCents),
            tone: "money",
            hint: truncated
              ? `soma das ${reservations.length} carregadas — o valor real das ${total} é maior`
              : `soma das ${total} reservas pagas`,
          },
        ]}
      />

      <div className="space-y-3 px-4 sm:px-8 py-6">
        <TruncationNote
          shown={reservations.length}
          total={total}
          noun="reservas pagas"
          reason={`Esta tela pede ${LIMIT} por vez — se o beta passar disso, as demais não chegam ao painel.`}
        />
        <ManualReservationsTable reservations={reservations} />
      </div>
    </div>
  );
}
