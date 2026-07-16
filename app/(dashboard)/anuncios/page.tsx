import { PageHeader } from "@/components/ui/page-header";
import { AnnouncementForm } from "./announcement-form";

/**
 * Panel #13 — Enviar anúncio.
 *
 * A write-only surface: it broadcasts a push + inbox notification to every
 * PlayTennis member. There is no list to read, so unlike the monitoring panels
 * this page is just the composer. Staff authorization is enforced by the BFF on
 * POST /v1/ops/announcements, same as every other /v1/ops/* call.
 */
export default function AnunciosPage() {
  return (
    <div>
      <PageHeader
        eyebrow="#13"
        title="Enviar Anúncio"
        description="Uma mensagem que chega no push e na caixa de entrada de todos os membros PlayTennis. Não dá para desfazer — o passo de confirmação existe por isso."
      />
      <AnnouncementForm />
    </div>
  );
}
