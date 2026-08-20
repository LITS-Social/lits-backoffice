"use server";

import { revalidatePath } from "next/cache";
import { saveSegment, type Segment } from "@/lib/meta-ads";

const VALID: Segment[] = ["usuarios", "professores", "academias"];

/** Confirma (ou remove, com null) o segmento de um adset. */
export async function setSegmentAction(
  adsetId: string,
  segment: Segment | null
): Promise<{ ok: boolean; error?: string }> {
  if (!adsetId || (segment !== null && !VALID.includes(segment))) {
    return { ok: false, error: "Segmento inválido." };
  }
  try {
    const saved = await saveSegment(adsetId, segment);
    if (!saved) {
      return {
        ok: false,
        error:
          "O cofre (KV) não está disponível neste ambiente — em localhost o mapeamento não persiste.",
      };
    }
    revalidatePath("/aquisicao");
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível gravar o mapeamento." };
  }
}
