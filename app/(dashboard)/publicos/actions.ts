"use server";

import { revalidatePath } from "next/cache";
import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

export type Audience = components["schemas"]["AudienceBody"];
export type OpsClub = components["schemas"]["OpsClub"];

/**
 * The filter dimensions of an audience — shared by create, edit and inline count.
 * "Empty" (empty array / empty string / null) means "any" for that dimension, so
 * an audience with every field empty targets the whole base. Age and geo use
 * `null` for "no bound"; the geo triplet (center + radius) only applies when all
 * three are present and the radius is positive.
 */
export type AudienceFilter = {
  classes: string[];
  genders: string[];
  clubBrand: string;
  clubIds: string[];
  ageMin: number | null;
  ageMax: number | null;
  neighborhoods: string[];
  cities: string[];
  playStyles: string[];
  intents: string[];
  preferredDays: number[];
  preferredPeriods: string[];
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
};

/** The subset of the mutation/count bodies that describes a filter (no name). */
type AudienceApiFields = Omit<
  components["schemas"]["AudienceMutationBody"],
  "$schema" | "name"
>;

/**
 * Map the UI filter onto the wire fields the BFF expects. Bounded fields
 * (age, geo) are omitted when unset rather than sent as zero — the contract
 * reads absent age as "no bound" and a zero-radius as "no geo filter".
 *
 * The geo triplet is the load-bearing guard: center_lat/center_lng are plain
 * `double` on the proto (no presence bit), so a radius sent with a 0/0 center
 * silently filters around Null Island (gulf of Guinea) = an empty audience the
 * backend cannot flag. So geo is emitted ONLY when a real center (both coords
 * present AND not both zero) is paired with a positive radius. This is the last
 * line under the form's own guard — never send radius_km > 0 without a center.
 */
function filterToApiFields(filter: AudienceFilter): AudienceApiFields {
  const fields: AudienceApiFields = {
    classes: filter.classes,
    genders: filter.genders,
    club_brand: filter.clubBrand.trim(),
    club_ids: filter.clubIds,
    neighborhoods: filter.neighborhoods,
    cities: filter.cities,
    play_styles: filter.playStyles,
    intents: filter.intents,
    preferred_days: filter.preferredDays,
    preferred_periods: filter.preferredPeriods,
  };
  if (filter.ageMin != null) fields.age_min = filter.ageMin;
  if (filter.ageMax != null) fields.age_max = filter.ageMax;

  if (
    filter.centerLat != null &&
    filter.centerLng != null &&
    !(filter.centerLat === 0 && filter.centerLng === 0) &&
    filter.radiusKm != null &&
    filter.radiusKm > 0
  ) {
    fields.center_lat = filter.centerLat;
    fields.center_lng = filter.centerLng;
    fields.radius_km = filter.radiusKm;
  }
  return fields;
}

export type ListAudiencesResult =
  | { ok: true; audiences: Audience[] }
  | { ok: false; error: string };

export type AudienceResult = { ok: true; audience: Audience } | { ok: false; error: string };

export type DeleteResult = { ok: true } | { ok: false; error: string };

export type CountResult =
  | { ok: true; matched: number; missingCategory: number }
  | { ok: false; error: string };

export type SearchClubsResult = { ok: true; clubs: OpsClub[] } | { ok: false; error: string };

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

/**
 * Substring search over the club fleet for the audience-builder multi-select.
 * The BFF pulls the ~184-club fleet once and filters in memory; an empty query
 * returns the first `limit` clubs (used to hydrate chips when editing a saved
 * audience whose club_ids need names).
 */
export async function searchClubsAction(q: string, limit = 20): Promise<SearchClubsResult> {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/clubs", {
    params: { query: { q: q.trim(), limit } },
  });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao buscar clubes." };
  }

  return { ok: true, clubs: data.clubs ?? [] };
}

export async function createAudienceAction(
  name: string,
  filter: AudienceFilter
): Promise<AudienceResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Dê um nome ao público." };

  const api = await getApi();
  const { data, error } = await api.POST("/v1/ops/audiences", {
    body: { name: trimmed, ...filterToApiFields(filter) },
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
    body: { name: trimmed, ...filterToApiFields(filter) },
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
    : input.filter
      ? filterToApiFields(input.filter)
      : {};

  const { data, error } = await api.POST("/v1/ops/audiences/count", { body });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao contar membros." };
  }

  return { ok: true, matched: data.matched, missingCategory: data.missing_category };
}
