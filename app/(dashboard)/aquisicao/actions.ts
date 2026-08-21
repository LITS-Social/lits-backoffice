"use server";

import { revalidatePath } from "next/cache";
import { saveAcademiasFechadas, saveSegment, spMonthKey, type Segment } from "@/lib/meta-ads";

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

/** Grava quantas academias fecharam contrato no mês corrente — o denominador
    do CAC de academias, que só quem fechou sabe. null limpa. */
export async function setAcademiasFechadasAction(
  n: number | null
): Promise<{ ok: boolean; error?: string }> {
  if (n !== null && (!Number.isInteger(n) || n < 0 || n > 10_000)) {
    return { ok: false, error: "Número inválido." };
  }
  try {
    const saved = await saveAcademiasFechadas(spMonthKey(), n);
    if (!saved) return { ok: false, error: "O cofre (KV) não está disponível neste ambiente." };
    revalidatePath("/aquisicao");
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível gravar." };
  }
}
