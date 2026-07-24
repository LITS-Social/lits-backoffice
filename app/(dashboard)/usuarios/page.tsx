import { PageHeader } from "@/components/ui/page-header";
import { getApi } from "@/lib/api";
import { PanelError } from "../_components/notes";
import { UsersTable } from "./users-table";

export const dynamic = "force-dynamic";

/**
 * First page size. The endpoint is keyset-paginated (cursor + has_more), NOT
 * limit/offset like the older panels — there is no server-side `total`, so this
 * screen never shows a headline count it cannot stand behind. It shows what it
 * has loaded and a "carregar mais" for the rest.
 */
const PAGE_SIZE = 30;

export default async function UsuariosPage() {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/users", {
    params: { query: { limit: PAGE_SIZE } },
  });

  if (error) {
    return <PanelError eyebrow="#11" title="Usuários" detail={error.detail || error.title} />;
  }

  return (
    <div>
      <PageHeader
        eyebrow="#11"
        title="Usuários"
        description="Todos os jogadores cadastrados. Busque por nome, @usuário, email ou telefone; um clique no nome abre o dossiê completo."
      />

      <div className="px-4 sm:px-8 py-6">
        <UsersTable
          initial={{
            rows: data.users ?? [],
            nextCursor: data.next_cursor,
            hasMore: data.has_more,
          }}
        />
      </div>
    </div>
  );
}
