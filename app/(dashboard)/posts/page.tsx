import { PageHeader } from "@/components/ui/page-header";
import { getApi } from "@/lib/api";
import { PanelError } from "../_components/notes";
import { PostsView } from "./posts-table";

export const dynamic = "force-dynamic";

/**
 * Keyset page size (cursor + has_more). Live posts only on the first render —
 * soft-deleted ones are off by default and pulled in via the "incluir deletados"
 * toggle, which re-fetches with include_deleted=true.
 */
const PAGE_SIZE = 30;

export default async function PostsPage() {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/posts", {
    params: { query: { limit: PAGE_SIZE } },
  });

  if (error) {
    return <PanelError eyebrow="#12" title="Posts" detail={error.detail || error.title} />;
  }

  return (
    <div>
      <PageHeader
        eyebrow="#12"
        title="Posts"
        description="Conteúdo do feed. Busque pela legenda, inclua deletados, e remova publicações que violam as regras — toda remoção é registrada no audit log."
      />

      <div className="px-4 sm:px-8 py-6">
        <PostsView
          initial={{
            rows: data.posts ?? [],
            nextCursor: data.next_cursor,
            hasMore: data.has_more,
          }}
        />
      </div>
    </div>
  );
}
