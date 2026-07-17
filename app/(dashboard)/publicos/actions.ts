"use server";

import { revalidatePath } from "next/cache";
import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

export type Audience = components["schemas"]["AudienceBody"];

/** The filter dimensions of an audience — shared by create, edit and inline count. */
export type AudienceFilter = {
  classes: string[];
  genders: string[];
  clubBrand: string;
};

export type ListAudiencesResult =
  | { ok: true; audiences: Audience[] }
  | { ok: false; error: string };

export type AudienceResult = { ok: true; audience: Audience } | { ok: false; error: string };

export type DeleteResult = { ok: true } | { ok: false; error: string };

export type CountResult =
  | { ok: true; matched: number; missingCategory: number }
  | { ok: false; error: string };

/**
 * List saved audiences (panel #14). Presets sort first, then by name — that
 * ordering is the BFF's, this just relays it. `includeDeleted` is left off by
 * default: the panel shows live audiences only unless someone asks for the tomb.
 */
export async function listAudiencesAction(includeDeleted = false): Promise<ListAudiencesResult> {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/audiences", {
    params: { query: includeDeleted ? { include_deleted: true } : {} },
  });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao carregar públicos." };
  }

  return { ok: true, audiences: data.audiences ?? [] };
}

export async function createAudienceAction(
  name: string,
  filter: AudienceFilter
): Promise<AudienceResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Dê um nome ao público." };

  const api = await getApi();
  const { data, error } = await api.POST("/v1/ops/audiences", {
    body: {
      name: trimmed,
      classes: filter.classes,
      genders: filter.genders,
      club_brand: filter.clubBrand.trim(),
    },
  });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao criar o público." };
  }

  revalidatePath("/publicos");
  return { ok: true, audience: data };
}

export async function updateAudienceAction(
  id: string,
  name: string,
  filter: AudienceFilter
): Promise<AudienceResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Dê um nome ao público." };

  const api = await getApi();
  const { data, error } = await api.PUT("/v1/ops/audiences/{id}", {
    params: { path: { id } },
    body: {
      name: trimmed,
      classes: filter.classes,
      genders: filter.genders,
      club_brand: filter.clubBrand.trim(),
    },
  });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao salvar o público." };
  }

  revalidatePath("/publicos");
  return { ok: true, audience: data };
}

/**
 * Soft-delete a saved audience. The BFF rejects preset deletes with a 400, but
 * the UI never lets one reach here — the delete control is disabled on presets.
 * This is the second line: if a preset id ever does arrive, the API's error
 * surfaces verbatim rather than the row vanishing on the client.
 */
export async function deleteAudienceAction(id: string): Promise<DeleteResult> {
  const api = await getApi();
  const { error } = await api.DELETE("/v1/ops/audiences/{id}", {
    params: { path: { id } },
  });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao apagar o público." };
  }

  revalidatePath("/publicos");
  return { ok: true };
}

/**
 * Live reach of a filter. Two modes, exactly as the BFF contracts them: pass an
 * `audienceId` to count a saved audience, or pass the inline filter to preview an
 * audience still being built (the debounced call the form makes on every edit).
 * When both are absent the inline branch sends empty dimensions, which the BFF
 * reads as "any" — the widest possible match.
 */
export async function countAudienceAction(input: {
  audienceId?: string;
  filter?: AudienceFilter;
}): Promise<CountResult> {
  const api = await getApi();
  const body = input.audienceId
    ? { audience_id: input.audienceId }
    : {
        classes: input.filter?.classes ?? [],
        genders: input.filter?.genders ?? [],
        club_brand: input.filter?.clubBrand.trim() ?? "",
      };

  const { data, error } = await api.POST("/v1/ops/audiences/count", { body });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao contar membros." };
  }

  return { ok: true, matched: data.matched, missingCategory: data.missing_category };
}
