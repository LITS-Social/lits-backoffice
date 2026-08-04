import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import type { FranchiseItem } from "../../quadras/nova/actions";
import { DangerZone } from "./danger-zone";

const KIND_LABEL: Record<string, string> = {
  partner: "Parceiro",
  public: "Pública",
  listing: "Diretório",
};

/**
 * A academia existe em `franchises` mas não tem nenhuma quadra.
 *
 * Sem isto a página respondia “Academia não encontrada” para uma academia que
 * existe — a tela mentia, porque ela é montada a partir de GET /v1/ops/courts.
 * É também o estado em que se cai apagando as quadras uma a uma, e o único
 * lugar de onde dá para apagar a franquia órfã que sobrou.
 *
 * Definições, horário, calendário e import de print não aparecem aqui de
 * propósito: todos leem os campos da franquia de dentro de uma quadra
 * (CourtListItem), e não há nenhuma para ler — desenhar os campos vazios diria
 * que a academia não tem preço/horário quando ela pode ter.
 */
export function EmptyAcademiaPage({ franchise }: { franchise: FranchiseItem }) {
  return (
    <div>
      <PageHeader
        eyebrow="Gestão"
        title={franchise.name}
        description="Esta academia existe no banco, mas ainda não tem nenhuma quadra cadastrada."
      />
      <div className="space-y-5 px-4 sm:px-8 py-6">
        <Link
          href="/academias"
          className="inline-flex items-center gap-1.5 text-[11px] font-600 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={12} /> Todas as academias
        </Link>

        <section className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <h2 className="eyebrow">Sem quadras</h2>
            <Badge variant="muted">{KIND_LABEL[franchise.kind] ?? franchise.kind}</Badge>
            {!franchise.has_geo && <Badge variant="muted">sem localização</Badge>}
          </div>
          <p className="text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
            Definições, horário de funcionamento, calendário e import de print aparecem assim que
            existir ao menos uma quadra — todos eles são editados a partir da quadra. Cadastre a
            primeira, ou apague a academia se ela não deveria existir.
          </p>
          <Link
            href={`/quadras/nova?franquia=${franchise.id}`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90"
          >
            <Plus size={11} strokeWidth={2.5} /> Adicionar quadra
          </Link>
        </section>

        <DangerZone
          franchiseId={franchise.id}
          franchiseName={franchise.name}
          franchiseKind={franchise.kind}
          franchiseSlug={franchise.slug}
          courtCount={0}
        />
      </div>
    </div>
  );
}
