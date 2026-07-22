"use server";

import { revalidatePath } from "next/cache";
import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

export type CourtSlotItem = components["schemas"]["CourtSlotItem"];
export type CourtDetail = components["schemas"]["CourtDetail"];
export type FranchiseDetail = components["schemas"]["FranchiseDetail"];

type Surface = "clay" | "hard" | "grass" | "beach" | "carpet";

export type UpdateCourtState = { ok: boolean; court?: CourtDetail; error?: string };
export type RepriceState = { ok: boolean; slotsUpdated?: number; error?: string };
export type RegenerateState = {
  ok: boolean;
  slotsDeleted?: number;
  slotsCreated?: number;
  error?: string;
};
export type ListSlotsState = { ok: boolean; slots?: CourtSlotItem[]; error?: string };
export type UpdateSlotState = { ok: boolean; slot?: CourtSlotItem; error?: string };
export type UpdateFranchiseState = { ok: boolean; franchise?: FranchiseDetail; error?: string };
export type AddSlotsState = {
  ok: boolean;
  slotsCreated?: number;
  slotsSkipped?: number;
  error?: string;
};

export type AddSlotInput = NonNullable<components["schemas"]["AddCourtSlotsBody"]["slots"]>[number];

export async function updateCourtAction(
  id: string,
  params: { name: string; surface: Surface; indoor: boolean }
): Promise<UpdateCourtState> {
  const api = await getApi();
  const { data, error } = await api.PATCH("/v1/ops/courts/{id}", {
    params: { path: { id } },
    body: { name: params.name, surface: params.surface, indoor: params.indoor },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao atualizar quadra." };
  revalidatePath("/quadras");
  return { ok: true, court: data };
}

export async function repriceCourtAction(id: string, priceCents: number): Promise<RepriceState> {
  const api = await getApi();
  const { data, error } = await api.POST("/v1/ops/courts/{id}/reprice", {
    params: { path: { id } },
    body: { price_cents: priceCents },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao repreçar quadra." };
  return { ok: true, slotsUpdated: data.slots_updated };
}

export async function regenerateAvailabilityAction(
  id: string,
  params: { startHour: number; endHour: number; daysForward: number; priceCents?: number | null }
): Promise<RegenerateState> {
  const api = await getApi();
  const { data, error } = await api.POST("/v1/ops/courts/{id}/regenerate-availability", {
    params: { path: { id } },
    body: {
      start_hour: params.startHour,
      end_hour: params.endHour,
      days_forward: params.daysForward,
      ...(params.priceCents != null ? { price_cents: params.priceCents } : {}),
    },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao regerar disponibilidade." };
  revalidatePath("/quadras");
  return { ok: true, slotsDeleted: data.slots_deleted, slotsCreated: data.slots_created };
}

export async function listCourtSlotsAction(
  id: string,
  from: string,
  to: string
): Promise<ListSlotsState> {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/courts/{id}/slots", {
    params: { path: { id }, query: { from, to } },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao carregar horários." };
  return { ok: true, slots: data.slots ?? [] };
}

export async function updateCourtSlotAction(
  id: string,
  slotStart: string,
  params: { status?: "available" | "blocked"; priceCents?: number; blockReason?: string }
): Promise<UpdateSlotState> {
  const api = await getApi();
  const body: components["schemas"]["UpdateCourtSlotBody"] = {};
  if (params.status !== undefined) body.status = params.status;
  if (params.priceCents !== undefined) body.price_cents = params.priceCents;
  if (params.blockReason !== undefined) body.block_reason = params.blockReason;

  // openapi-fetch URL-encodes path params, so the raw RFC3339 slot_start is passed
  // as-is (double-encoding would break the lookup).
  const { data, error } = await api.PATCH("/v1/ops/courts/{id}/slots/{slot_start}", {
    params: { path: { id, slot_start: slotStart } },
    body,
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao atualizar horário." };
  return { ok: true, slot: data };
}

export async function addCourtSlotsAction(
  id: string,
  slots: AddSlotInput[]
): Promise<AddSlotsState> {
  const api = await getApi();
  const { data, error } = await api.POST("/v1/ops/courts/{id}/slots", {
    params: { path: { id } },
    body: { slots },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao adicionar horários." };
  revalidatePath("/quadras");
  return { ok: true, slotsCreated: data.slots_created, slotsSkipped: data.slots_skipped };
}

export async function updateFranchiseAction(
  id: string,
  params: {
    name?: string;
    defaultPriceCents?: number;
    /** Set as a complete pair (BFF 400s a lone lat or lng). Absent = unchanged. */
    lat?: number;
    lng?: number;
    /** Clears the location. Never combined with lat/lng (BFF 400s the mix). */
    clearGeo?: boolean;
    /** Shown on app cards (invite/booking). "" clears; absent = unchanged. */
    streetAddress?: string;
  }
): Promise<UpdateFranchiseState> {
  const api = await getApi();
  // A JSON `lat: null` is NOT a clear — Go decodes it same as absent and
  // silently changes nothing; clearing goes through clear_geo (location) and
  // "" (street_address). Geo keys are only included when the caller touched
  // them, so name/price saves stay compatible with a pre-geo BFF (which 422s
  // unknown body keys).
  const body: components["schemas"]["UpdateFranchiseBody"] = {
    ...(params.name !== undefined ? { name: params.name } : {}),
    ...(params.defaultPriceCents !== undefined
      ? { default_price_cents: params.defaultPriceCents }
      : {}),
    ...(params.lat !== undefined && params.lng !== undefined
      ? { lat: params.lat, lng: params.lng }
      : {}),
    ...(params.clearGeo ? { clear_geo: true } : {}),
    ...(params.streetAddress !== undefined ? { street_address: params.streetAddress } : {}),
  };

  const { data, error, response } = await api.PATCH("/v1/ops/franchises/{id}", {
    params: { path: { id } },
    body,
  });
  if (error) {
    // The BFF 400s the exact (0,0) pair — the app-wide "no coords" sentinel.
    // The form pre-validates it, so this mapping is belt-and-braces.
    if (response.status === 400 && params.lat === 0 && params.lng === 0) {
      return { ok: false, error: "O par (0, 0) não é uma localização válida — confira as coordenadas." };
    }
    return { ok: false, error: error.detail || error.title || "Falha ao atualizar franquia." };
  }
  revalidatePath("/quadras");
  return { ok: true, franchise: data };
}

export type GeocodeCandidate = components["schemas"]["GeocodeCandidate"];
export type GeocodeState = {
  ok: boolean;
  results?: GeocodeCandidate[];
  /** BFF predates the geocode route (404) — steer staff to manual lat/lng. */
  unavailable?: boolean;
  error?: string;
};

export async function geocodeAction(q: string): Promise<GeocodeState> {
  const api = await getApi();
  const { data, error, response } = await api.GET("/v1/ops/geocode", {
    params: { query: { q } },
  });
  if (error) {
    if (response.status === 404) {
      return {
        ok: false,
        unavailable: true,
        error:
          "Busca por endereço ainda não disponível neste ambiente — preencha lat/lng manualmente ou cole do Google Maps.",
      };
    }
    if (response.status === 502) {
      return { ok: false, error: "Provedor de geocoding fora do ar — tente novamente." };
    }
    return { ok: false, error: error.detail || error.title || "Falha ao buscar o endereço." };
  }
  return { ok: true, results: data?.candidates ?? [] };
}
