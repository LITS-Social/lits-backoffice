"use server";

import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";

export type FranchiseItem = components["schemas"]["FranchiseItem"];

export type CreateFranchiseState = {
  ok: boolean;
  franchise?: FranchiseItem;
  error?: string;
};

export type CreateCourtState = {
  ok: boolean;
  courtId?: string;
  slotsCreated?: number;
  error?: string;
};

export async function listFranchisesAction(): Promise<{ franchises: FranchiseItem[]; error?: string }> {
  const api = await getApi();
  const { data, error } = await api.GET("/v1/ops/franchises");
  if (error) return { franchises: [], error: error.detail || error.title || "Falha ao listar franquias." };
  return { franchises: data.franchises ?? [] };
}

export async function createFranchiseAction(
  slug: string,
  name: string,
  kind: "partner" | "public",
  defaultPriceCents?: number | null
): Promise<CreateFranchiseState> {
  const api = await getApi();
  const { data, error } = await api.POST("/v1/ops/franchises", {
    body: {
      slug,
      name,
      kind,
      ...(defaultPriceCents != null ? { default_price_cents: defaultPriceCents } : {}),
    },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao criar franquia." };
  return { ok: true, franchise: data };
}

export async function createCourtAction(params: {
  franchiseId: string;
  name: string;
  surface: "clay" | "hard" | "grass" | "beach" | "carpet";
  indoor: boolean;
  daysForward: number;
  startHour: number;
  endHour: number;
  priceCents?: number | null;
}): Promise<CreateCourtState> {
  const api = await getApi();
  const { data, error } = await api.POST("/v1/ops/courts", {
    body: {
      franchise_id: params.franchiseId,
      name: params.name,
      surface: params.surface,
      indoor: params.indoor,
      days_forward: params.daysForward,
      start_hour: params.startHour,
      end_hour: params.endHour,
      ...(params.priceCents != null ? { price_cents: params.priceCents } : {}),
    },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao criar quadra." };
  return { ok: true, courtId: data.court_id, slotsCreated: data.slots_created };
}
