import { PageHeader } from "@/components/ui/page-header";
import { getApi } from "@/lib/api";
import { StatRail } from "../_components/stat-rail";
import { PanelError, PanelNote, TruncationNote } from "../_components/notes";
import { CancellationsTable } from "./table";

const LIMIT = 500;

export default async function CancelamentosPage() {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/cancellations", {
    params: { query: { limit: LIMIT, offset: 0 } },
  });

  if (error) {
    return (
      <PanelError
        eyebrow="#05"
        title="Cancelamentos e Desistências"
        detail={error.detail || error.title}
      />
    );
  }

  const cancellations = data.cancellations ?? [];
  const total = data.total ?? cancellations.length;

  // Three states, not two. `within_policy` is a POINTER on the wire precisely
  // because a row cancelled before cancelled_at was persisted has no knowable
  // answer — so "fora do prazo" and "não sabemos" are counted apart, and neither
  // is quietly folded into the other.
  const outside = cancellations.filter((c) => c.within_policy === false).length;
  const within = cancellations.filter((c) => c.within_policy === true).length;
  const unknown = cancellations.filter((c) => c.within_policy == null).length;

  return (
    <div>
      <PageHeader
        eyebrow="#05"
        title="Cancelamentos e Desistências"
        description="Quem caiu, quando, e com quanta antecedência. Ordenado pelo mais brutal primeiro."
      />

      <StatRail
        stats={[
          { label: "Cancelamentos", value: total },
          {
            label: "Fora do prazo",
            value: outside,
            tone: "attention",
            hint: "menos de 48h de antecedência — candidatos a Jogo Rápido",
          },
          { label: "Dentro do prazo", value: within, tone: "calm", hint: "48h ou mais de aviso" },
          {
            // Note this is a plain count, NOT `unknown: true`. How many rows lack a
            // cancelled_at is something we know exactly; what is unknowable is the
            // 48h verdict *inside* those rows, and that is rendered as "—" per row.
            label: "Sem registro",
            value: unknown,
            hint: "sem cancelled_at — a antecedência não é calculável",
          },
        ]}
      />

      <div className="space-y-3 px-4 sm:px-8 py-6">
        <TruncationNote shown={cancellations.length} total={total} noun="cancelamentos" />
        <PanelNote>
          O motivo distingue uma desistência de verdade de um cancelamento automático do
          sistema (<span className="font-mono text-[10.5px]">payment_rejected:*</span>,{" "}
          <span className="font-mono text-[10.5px]">unpaid_host_timeout</span>,{" "}
          <span className="font-mono text-[10.5px]">guest_no_show_refund</span>). O banco não
          guarda <span className="font-mono text-[10.5px]">cancelled_by</span>, então o painel
          não afirma qual dos dois jogadores desistiu — só o que a reserva registrou.
        </PanelNote>
        <CancellationsTable cancellations={cancellations} />
      </div>
    </div>
  );
}
