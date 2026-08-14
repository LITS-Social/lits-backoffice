import { PageHeader } from "@/components/ui/page-header";
import { fetchProfessores } from "@/lib/professores";
import { StatRail } from "../_components/stat-rail";
import { PanelError, PanelNote } from "../_components/notes";
import { ProfessoresTable } from "./professores-table";

export const dynamic = "force-dynamic";

/** Quantos clubes aparecem na régua de "mais citados". */
const TOP_CLUBES = 6;

/**
 * #16 · Professores.
 *
 * Segundo painel que NÃO lê o bff-backoffice: como a lista de espera, o
 * cadastro de professores embaixadores vive num Cloudflare D1 da landing e não
 * no Postgres do produto (ver lib/professores.ts).
 *
 * Carrega a lista inteira e filtra no cliente — o filtro por período e as
 * contagens só dizem a verdade sobre o conjunto completo.
 */
export default async function ProfessoresPage() {
  const res = await fetchProfessores();

  if (!res.ok) {
    return <PanelError eyebrow="#16" title="Professores" detail={res.error} />;
  }

  const rows = res.rows;
  const called = rows.filter((r) => r.called_at !== null).length;

  // Onde esses professores dão aula, agregado. É a pergunta que o cadastro
  // responde além do contato: qual clube concentra professor interessado —
  // ou seja, onde a indicação tende a render.
  const porClube = new Map<string, number>();
  for (const r of rows) {
    for (const c of r.clubes) {
      const key = c.trim();
      if (key) porClube.set(key, (porClube.get(key) ?? 0) + 1);
    }
  }
  const topClubes = [...porClube.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .slice(0, TOP_CLUBES);

  return (
    <div>
      <PageHeader
        eyebrow="#16"
        title="Professores"
        description="Quem se cadastrou em lits.social/professores para receber o link de indicação. O combinado com eles é chamada no WhatsApp para ativar — marque quem já foi chamado, que a marcação guarda quem chamou e quando."
      />

      <StatRail
        stats={[
          {
            label: "Cadastrados",
            value: rows.length,
            tone: "neutral",
            hint: res.truncated ? "pelo menos — a leitura bateu no teto" : "total de professores",
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
          {
            label: "Clubes citados",
            value: porClube.size,
            tone: "neutral",
            hint: "distintos, somando todos os cadastros",
          },
        ]}
      />

      <div className="space-y-4 px-4 sm:px-8 py-6">
        {res.truncated && (
          <PanelNote>
            A leitura bateu no teto de linhas da API e pode haver mais gente cadastrada além dos{" "}
            {rows.length} abaixo. Os números acima são pisos, não totais.
          </PanelNote>
        )}

        {topClubes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-700 uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              Mais citados
            </span>
            {topClubes.map(([clube, n]) => (
              <span
                key={clube}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
              >
                {clube}
                <span className="font-600 text-[var(--text-primary)]">{n}</span>
              </span>
            ))}
          </div>
        )}

        <PanelNote>
          Estes são dados pessoais de quem se cadastrou — nome, e-mail e WhatsApp. Ficam nesta tela;
          não exporte nem cole em outro lugar.
        </PanelNote>

        <ProfessoresTable rows={rows} />
      </div>
    </div>
  );
}
