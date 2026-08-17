import { PanelError } from "../../_components/notes";
import { listCourtsAction } from "../../quadras/actions";
import { listFranchisesAction } from "../../quadras/nova/actions";
import { AcademiaPage } from "./academia";
import { EmptyAcademiaPage } from "./empty-academia";
import { getAcademiaMatches } from "./matches";
import { getFranchiseStats } from "./stats";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // O diretório vem junto com as quadras (em paralelo, sem custo de latência)
  // porque é a única fonte do SLUG da academia — a chave natural que o operador
  // redigita para confirmar a exclusão, e que CourtListItem não carrega. Também
  // é o que salva a página quando a academia existe sem nenhuma quadra.
  const [{ courts, error }, { franchises, error: franchisesError }] = await Promise.all([
    listCourtsAction(),
    listFranchisesAction(),
  ]);
  if (error) return <PanelError eyebrow="Gestão" title="Academia" detail={error} />;
  const franchise = franchises.find((f) => f.id === id);

  // display_order is the shared drag-to-reorder preference; unordered courts
  // trail in name order. The BFF already sorts this way — re-sorting here
  // keeps the page honest during the deploy window where the field is absent.
  const mine = courts
    .filter((c) => c.franchise_id === id)
    .sort(
      (a, b) =>
        (a.display_order ?? 1e9) - (b.display_order ?? 1e9) ||
        a.name.localeCompare(b.name, "pt-BR")
    );
  if (mine.length === 0) {
    // Sem quadra não quer dizer que a academia não existe: esta página é
    // montada a partir de GET /v1/ops/courts, então uma franquia órfã (a
    // sobra de apagar as quadras uma a uma, e os venues de diretório do
    // crawler) some daqui apesar de estar viva em `franchises`. O diretório
    // acima é consultado antes de dizer "não encontrada" — e só então é verdade.
    if (franchise) return <EmptyAcademiaPage franchise={franchise} />;
    return (
      <PanelError
        eyebrow="Gestão"
        title="Academia"
        detail={
          franchisesError
            ? `Academia sem quadras, e a lista de academias não respondeu (${franchisesError}) — não dá para dizer se ela existe. Tente de novo.`
            : "Academia não encontrada — este id não existe mais. Veja a lista em Academias."
        }
      />
    );
  }
  // Buscado aqui, no servidor, e não por fetch no cliente: é a mesma página, e
  // o painel não deve piscar um bloco vazio antes de saber o que houve.
  const [matches, stats] = await Promise.all([
    getAcademiaMatches(mine.map((c) => c.id)),
    getFranchiseStats(id),
  ]);
  return <AcademiaPage courts={mine} matches={matches} stats={stats} franchiseSlug={franchise?.slug} />;
}
