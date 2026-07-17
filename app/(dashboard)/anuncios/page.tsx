import { PageHeader } from "@/components/ui/page-header";
import { getApi } from "@/lib/api";
import { AnnouncementForm } from "./announcement-form";

export const dynamic = "force-dynamic";

/**
 * Panel #13 — Enviar anúncio.
 *
 * A write-only surface: it broadcasts a push + inbox notification to a chosen
 * audience (panel #14). The audience list is fetched here and passed down so the
 * picker is populated on first paint; if that fetch fails the form falls back to
 * the legacy "all PlayTennis members" target, which needs no audience list. Staff
 * authorization is enforced by the BFF on POST /v1/ops/announcements.
 */
export default async function AnunciosPage() {
  const api = await getApi();
  const { data } = await api.GET("/v1/ops/audiences", {});

  return (
    <div>
      <PageHeader
        eyebrow="#13"
        title="Enviar Anúncio"
        description="Uma mensagem que chega no push e na caixa de entrada dos membros do público escolhido. Não dá para desfazer — o passo de confirmação existe por isso."
      />
      <AnnouncementForm audiences={data?.audiences ?? []} />
    </div>
  );
}
