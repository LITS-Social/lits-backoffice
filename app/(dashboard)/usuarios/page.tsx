import { PageHeader } from "@/components/ui/page-header";
import { PanelError } from "../_components/notes";
import { listAllUsersAction } from "./actions";
import { UsersTable } from "./users-table";

export const dynamic = "force-dynamic";

/**
 * The console loads the WHOLE base up front (the beta is a couple hundred
 * accounts; the metrics dashboard already crawls it on every load) — filters
 * (entrada, último acesso, nível, sexo, idade) and the CSV export only tell
 * the truth over the full set, so search and slicing are client-side.
 */
export default async function UsuariosPage() {
  const res = await listAllUsersAction();

  if (!res.ok) {
    return <PanelError eyebrow="#11" title="Usuários" detail={res.error} />;
  }

  return (
    <div>
      <PageHeader
        eyebrow="#11"
        title="Usuários"
        description="Todos os jogadores cadastrados. Filtre por entrada, atividade, nível — e exporte tudo em CSV; um clique no nome abre o dossiê completo."
      />

      <div className="px-4 sm:px-8 py-6">
        <UsersTable initial={{ rows: res.rows, truncated: res.truncated }} />
      </div>
    </div>
  );
}
