"use server";

import { revalidatePath } from "next/cache";
import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

export type CourtListItem = components["schemas"]["CourtListItem"];

export type DeleteCourtState = {
  ok: boolean;
  error?: string;
};

export async function listCourtsAction(): Promise<{ courts: CourtListItem[]; error?: string }> {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/courts");
  if (error) return { courts: [], error: error.detail || error.title || "Falha ao listar quadras." };
  return { courts: data.courts ?? [] };
}

export async function deleteCourtAction(id: string): Promise<DeleteCourtState> {
  const api = await getApi();
  const { error } = await api.DELETE("/v1/ops/courts/{id}", {
    params: { path: { id } },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao excluir quadra." };
  revalidatePath("/quadras");
  // A lista de academias é montada a partir das quadras (academias/page.tsx):
  // apagar uma quadra muda a contagem — e apagar a última faz a academia sumir
  // de lá. Sem isto o card volta obsoleto no Router Cache.
  revalidatePath("/academias");
  return { ok: true };
}
