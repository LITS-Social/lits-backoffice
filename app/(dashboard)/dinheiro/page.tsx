import { PageHeader } from "@/components/ui/page-header";
import { getApi } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { PanelNote, TruncationNote } from "../_components/notes";
import { PaymentIssuesTable } from "../pagamentos/table";
import { SuccessfulPaymentsTable } from "../pagamentos/succeeded-table";
import { ManualReservationsTable } from "../reservas-pagas/table";
import { CancellationsTable } from "../cancelamentos/table";
import { MoneyTabs } from "./tabs";

export const dynamic = "force-dynamic";

/**
 * #06 Dinheiro — pagamentos, reservas pagas e cancelamentos numa tela só.
 *
 * Eram três painéis contando a mesma história em capítulos: o Pix que não
 * caiu, a reserva paga que ainda precisa de quadra no clube, o recebido, e o
 * cancelado. O operador pulava de aba em aba para responder UMA pergunta —
 * "como está o dinheiro?". Aqui a régua de números responde de relance, e
 * cada número é a aba da sua fila.
 *
 * Cada seção busca do seu próprio endpoint e falha SOZINHA: um serviço fora
 * do ar apaga uma célula (em-dash, nunca zero), não a tela.
 */
const LIMIT = 500;

export default async function DinheiroPage() {
  const api = await getApi();
  const [issuesRes, succeededRes, reservationsRes, cancellationsRes] = await Promise.all([
    api.GET("/v1/ops/payment-issues", { params: { query: { limit: LIMIT } } }).catch(() => null),
    api.GET("/v1/ops/payments-succeeded", { params: { query: { limit: LIMIT } } }).catch(() => null),
    api.GET("/v1/ops/manual-reservations", { params: { query: { limit: LIMIT } } }).catch(() => null),
    api.GET("/v1/ops/cancellations", { params: { query: { limit: LIMIT, offset: 0 } } }).catch(() => null),
  ]);

  // ── Pix preso ────────────────────────────────────────────────────────────
  const issuesFailed = !issuesRes || !!issuesRes.error;
  const issues = issuesRes?.data?.issues ?? [];
  const issuesTotal = issuesRes?.data?.total ?? issues.length;
  const issuesTruncated = issues.length < issuesTotal;
  const stuckCents = issues.reduce((s, i) => s + i.amount_cents, 0);
  const rejected = issues.filter((i) => i.payment_status === "rejected").length;
  const dead = issues.filter((i) => i.booking_status === "cancelled").length;

  // ── Reservas pagas (falta reservar no clube) ─────────────────────────────
  const reservationsFailed = !reservationsRes || !!reservationsRes.error;
  const reservations = reservationsRes?.data?.reservations ?? [];
  const reservationsTotal = reservationsRes?.data?.total ?? reservations.length;
  const pending = reservationsRes?.data?.pending ?? reservations.length;

  // ── Recebidas ────────────────────────────────────────────────────────────
  const succeededFailed = !succeededRes || !!succeededRes.error;
  const succeeded = succeededRes?.data?.payments ?? [];
  const succeededTotal = succeededRes?.data?.total ?? succeeded.length;
  const succeededTruncated = succeeded.length < succeededTotal;
  const succeededCents = succeeded.reduce((s, p) => s + p.amount_cents, 0);

  // ── Cancelamentos ────────────────────────────────────────────────────────
  const cancellationsFailed = !cancellationsRes || !!cancellationsRes.error;
  const cancellations = cancellationsRes?.data?.cancellations ?? [];
  const cancellationsTotal = cancellationsRes?.data?.total ?? cancellations.length;
  const outside = cancellations.filter((c) => c.within_policy === false).length;

  const failNote = (what: string) => (
    <PanelNote>
      Não foi possível carregar {what} — o número acima está indisponível, não zerado. Recarregue
      para tentar de novo.
    </PanelNote>
  );

  return (
    <div>
      <PageHeader
        eyebrow="#06"
        title="Dinheiro"
        description="Tudo que envolve dinheiro numa tela: o Pix preso, a reserva paga que ainda precisa de quadra no clube, o que entrou, e o que caiu. Clique num número para abrir a fila."
      />

      <MoneyTabs
        tabs={[
          {
            key: "preso",
            label: "Pix preso",
            value: issuesFailed ? "—" : formatCurrency(stuckCents),
            unknown: issuesFailed,
            tone: "money",
            hint: issuesFailed
              ? undefined
              : issuesTruncated
                ? `${issues.length} de ${issuesTotal} reservas carregadas — o valor real é maior`
                : `${issuesTotal} reserva${issuesTotal === 1 ? "" : "s"} com Pix pendente ou rejeitado`,
            content: issuesFailed ? (
              failNote("os problemas de pagamento")
            ) : (
              <>
                <TruncationNote
                  shown={issues.length}
                  total={issuesTotal}
                  noun="reservas presas"
                  reason={`Esta tela pede ${LIMIT} por vez.`}
                />
                {(rejected > 0 || dead > 0) && (
                  <PanelNote>
                    {rejected > 0 && `${rejected} com Pix rejeitado — não se resolvem sozinhas. `}
                    {dead > 0 &&
                      `${dead} em reserva já cancelada: ninguém vai à quadra, o que sobra é a pergunta do estorno.`}
                  </PanelNote>
                )}
                <PaymentIssuesTable issues={issues} />
              </>
            ),
          },
          {
            key: "reservar",
            label: "Falta reservar",
            value: reservationsFailed ? "—" : pending,
            unknown: reservationsFailed,
            tone: "attention",
            hint: reservationsFailed
              ? undefined
              : `de ${reservationsTotal} reservas pagas — pagas mas ainda sem quadra segurada no clube`,
            content: reservationsFailed ? (
              failNote("as reservas pagas")
            ) : (
              <>
                <TruncationNote
                  shown={reservations.length}
                  total={reservationsTotal}
                  noun="reservas pagas"
                  reason={`Esta tela pede ${LIMIT} por vez.`}
                />
                <ManualReservationsTable reservations={reservations} />
              </>
            ),
          },
          {
            key: "recebidas",
            label: "Recebido",
            value: succeededFailed ? "—" : formatCurrency(succeededCents),
            unknown: succeededFailed,
            tone: "calm",
            hint: succeededFailed
              ? undefined
              : succeededTruncated
                ? `soma das ${succeeded.length} carregadas de ${succeededTotal} — o total é maior`
                : `${succeededTotal} pagamento${succeededTotal === 1 ? "" : "s"} Pix aprovado${succeededTotal === 1 ? "" : "s"}`,
            content: succeededFailed ? (
              failNote("os pagamentos aprovados")
            ) : (
              <>
                <TruncationNote
                  shown={succeeded.length}
                  total={succeededTotal}
                  noun="pagamentos aprovados"
                  reason={`Esta tela pede ${LIMIT} por vez.`}
                />
                <SuccessfulPaymentsTable payments={succeeded} />
              </>
            ),
          },
          {
            key: "cancelamentos",
            label: "Cancelamentos",
            value: cancellationsFailed ? "—" : cancellationsTotal,
            unknown: cancellationsFailed,
            tone: "neutral",
            hint: cancellationsFailed
              ? undefined
              : outside > 0
                ? `${outside} fora do prazo de 48h — candidatos a Jogo Rápido`
                : "quem caiu, quando, e com quanta antecedência",
            content: cancellationsFailed ? (
              failNote("os cancelamentos")
            ) : (
              <>
                <TruncationNote
                  shown={cancellations.length}
                  total={cancellationsTotal}
                  noun="cancelamentos"
                  reason={`Esta tela pede ${LIMIT} por vez.`}
                />
                <CancellationsTable cancellations={cancellations} />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
