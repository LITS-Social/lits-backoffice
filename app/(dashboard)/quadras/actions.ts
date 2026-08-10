"use server";

import { revalidatePath } from "next/cache";
import { getApi } from "@/lib/api";
import { getWithRetry } from "@/lib/api/retry";
import type { components } from "@/lib/api/openapi";

export type CourtListItem = components["schemas"]["CourtListItem"];

export type DeleteCourtState = {
  ok: boolean;
  error?: string;
};

export async function listCourtsAction(): Promise<{ courts: CourtListItem[]; error?: string }> {
  const api = await getApi();
  const res = await getWithRetry(
    (attempt) =>
      api.GET("/v1/ops/courts", { headers: { "x-lits-retry": String(attempt) } }),
    "de quadras"
  );
  if (!res.ok) return { courts: [], error: res.error };
  return { courts: res.data.courts ?? [] };
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
