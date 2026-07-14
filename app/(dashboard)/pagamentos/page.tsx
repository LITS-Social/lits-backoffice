import { PageHeader } from "@/components/ui/page-header";
import { getApi } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { StatRail } from "../_components/stat-rail";
import { PanelError, TruncationNote } from "../_components/notes";
import { PaymentIssuesTable } from "./table";

/**
 * Ask for more than the beta can currently produce.
 *
 * This endpoint used to accept NO query parameters, which pinned it to
 * booking-service's default page of 50 while `total` said 88 — 38 stuck PIX
 * payments were unreachable from the one panel that exists to chase them, and
 * the panel's derived counts (rejected / already-cancelled) were silently
 * page-scoped. `limit` + `offset` now exist on the BFF, so the panel asks for
 * the whole set.
 *
 * It is still a ceiling, not a promise: if the beta ever produces more than 500
 * stuck payments, `truncated` goes true and EVERY number on this page says so
 * (see the stats below). The count is honest whether or not the cap holds.
 */
const LIMIT = 500;

export default async function PagamentosPage() {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/payment-issues", {
    params: { query: { limit: LIMIT } },
  });

  if (error) {
    return <PanelError eyebrow="#06" title="Problemas de Pagamento" detail={error.detail || error.title} />;
  }

  const issues = data.issues ?? [];
  const total = data.total ?? issues.length;
  const truncated = issues.length < total;

  const rejected = issues.filter((i) => i.payment_status === "rejected").length;
  // A stuck payment on a booking that is already CANCELLED is a different animal:
  // nobody is turning up to a court, so there is no match to save — what is left
  // is a refund question. Counting it beside the live ones would inflate the
  // "chase these people" number with rows nobody should be chasing.
  const dead = issues.filter((i) => i.booking_status === "cancelled").length;

  const loadedCents = issues.reduce((sum, i) => sum + i.amount_cents, 0);

  /**
   * Both of these are computed by FILTERING THE ROWS IN HAND, so they can only
   * ever describe the rows in hand. While everything fits under LIMIT that is the
   * whole set and the number is simply true. The moment it does not fit, the
   * number becomes a sample — and a sample rendered as a bare numeral beside a
   * label like "Rejeitados" reads as a total.
   *
   * That is not hypothetical: it is exactly what this panel shipped. It said
   * "Rejeitados 11" when 22 of the 88 records had failed PIX, because it counted
   * 11 within a 50-row page — and the two stats beside it DID disclose their cap,
   * which is precisely what licensed the founder to trust these two.
   *
   * So the disclosure is tied to the same `truncated` flag as its neighbours: the
   * denominator is named whenever the denominator is not everything.
   */
  const scoped = (hint: string) =>
    truncated ? `de ${issues.length} carregadas de ${total} — ${hint}` : hint;

  return (
    <div>
      <PageHeader
        eyebrow="#06"
        title="Problemas de Pagamento"
        description="Pix pendente ou rejeitado. Quem, quanto, e há quanto tempo está parado."
      />

      <StatRail
        stats={[
          {
            label: "Reservas presas",
            value: total,
            tone: "money",
            hint: truncated ? `só ${issues.length} carregadas — veja abaixo` : undefined,
          },
          {
            // The amount is the sum of the rows we ACTUALLY HOLD. When everything is
            // loaded that IS the total and it says so; when it is not, it must not
            // pass itself off as "o valor preso no beta" — a total that silently
            // means "part of the total" is the exact class of lie this console was
            // cleaned of.
            label: truncated ? "Valor carregado" : "Valor preso",
            value: formatCurrency(loadedCents),
            tone: "money",
            hint: truncated
              ? `soma das ${issues.length} reservas carregadas — o valor real das ${total} é maior`
              : `soma das ${total} reservas presas`,
          },
          {
            label: "Rejeitados",
            value: rejected,
            tone: "money",
            hint: scoped("o Pix falhou — não vai se resolver sozinho"),
          },
          {
            label: "Reserva já cancelada",
            value: dead,
            hint: scoped("ninguém vai à quadra — é questão de estorno, não de cobrança"),
          },
        ]}
      />

      <div className="space-y-3 px-8 py-6">
        {/*
          TruncationNote renders nothing when shown === total, which is the normal
          case now that the endpoint pages. It stays because the cap is real: it is
          the thing that speaks up if the beta ever outgrows LIMIT.
        */}
        <TruncationNote
          shown={issues.length}
          total={total}
          noun="reservas com pagamento preso"
          reason={`Esta tela pede ${LIMIT} por vez e o beta já passou disso — as demais não chegam ao painel.`}
        />
        <PaymentIssuesTable issues={issues} />
      </div>
    </div>
  );
}
