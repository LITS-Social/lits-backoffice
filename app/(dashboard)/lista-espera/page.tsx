import { PageHeader } from "@/components/ui/page-header";
import { fetchWaitlist } from "@/lib/waitlist";
import { StatRail } from "../_components/stat-rail";
import { PanelError, PanelNote } from "../_components/notes";
import { WaitlistTable } from "./waitlist-table";

export const dynamic = "force-dynamic";

/**
 * #15 · Lista de Espera.
 *
 * Único painel que NÃO lê o bff-backoffice: a waitlist vive num Cloudflare D1
 * da landing, não no Postgres do produto (ver lib/waitlist.ts para o porquê de
 * ler na fonte em vez de copiar).
 *
 * Carrega a lista inteira e filtra no cliente, mesma decisão do console de
 * usuários — o filtro por período e as contagens só dizem a verdade sobre o
 * conjunto completo.
 */
export default async function ListaEsperaPage() {
  const res = await fetchWaitlist();

  if (!res.ok) {
    return <PanelError eyebrow="#15" title="Lista de Espera" detail={res.error} />;
  }

  const rows = res.rows;
  const called = rows.filter((r) => r.called_at !== null).length;

  return (
    <div>
      <PageHeader
        eyebrow="#15"
        title="Lista de Espera"
        description="Quem se cadastrou na landing esperando o convite. Filtre por período de inscrição e marque quem já foi chamado — a marcação guarda quem chamou e quando."
      />

      <StatRail
        stats={[
          {
            label: "Na lista",
            value: rows.length,
            tone: "neutral",
            hint: res.truncated ? "pelo menos — a leitura bateu no teto" : "total de inscritos",
          },
          {
            label: "Já chamados",
            value: called,
            tone: "calm",
            hint: rows.length > 0 ? `de ${rows.length}` : undefined,
          },
          {
            label: "A chamar",
            value: rows.length - called,
            tone: rows.length - called > 0 ? "attention" : "calm",
            hint: "ainda sem marcação",
          },
        ]}
      />

      <div className="space-y-4 px-4 sm:px-8 py-6">
        {res.truncated && (
          <PanelNote>
            A leitura bateu no teto de linhas da API e pode haver mais gente inscrita além das{" "}
            {rows.length} abaixo. Os números acima são pisos, não totais.
          </PanelNote>
        )}

        <PanelNote>
          Estes são dados pessoais de quem se cadastrou — nome, e-mail e WhatsApp. Ficam nesta tela;
          não exporte nem cole em outro lugar.
        </PanelNote>

        <WaitlistTable rows={rows} />
      </div>
    </div>
  );
}
