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

export async function updateFranchiseAction(
  id: string,
  params: { name?: string; defaultPriceCents?: number }
): Promise<UpdateFranchiseState> {
  const api = await getApi();
  const body: components["schemas"]["UpdateFranchiseBody"] = {};
  if (params.name !== undefined) body.name = params.name;
  if (params.defaultPriceCents !== undefined) body.default_price_cents = params.defaultPriceCents;

  const { data, error } = await api.PATCH("/v1/ops/franchises/{id}", {
    params: { path: { id } },
    body,
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao atualizar franquia." };
  revalidatePath("/quadras");
  return { ok: true, franchise: data };
}
