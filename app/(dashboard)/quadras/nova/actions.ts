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

export type FranchiseExtras = {
  lat?: number;
  lng?: number;
  streetAddress?: string;
  hours?: {
    weekStart: number;
    weekEnd: number;
    satStart: number;
    satEnd: number;
    sunStart: number;
    sunEnd: number;
  };
};

export async function createFranchiseAction(
  slug: string,
  name: string,
  kind: "partner" | "public" | "listing",
  defaultPriceCents?: number | null,
  extras?: FranchiseExtras
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

  // Localização + horário de funcionamento chegam pelo wizard mas o POST de
  // criação não os aceita — um PATCH logo em seguida grava tudo. Se o PATCH
  // falhar a franquia já existe; o wizard segue e o editor da academia cobre.
  if (
    extras &&
    (extras.lat != null || extras.lng != null || extras.streetAddress || extras.hours)
  ) {
    await api.PATCH("/v1/ops/franchises/{id}", {
      params: { path: { id: data.id } },
      body: {
        ...(extras.lat != null && extras.lng != null
          ? { lat: extras.lat, lng: extras.lng }
          : {}),
        ...(extras.streetAddress ? { street_address: extras.streetAddress } : {}),
        ...(extras.hours
          ? {
              hours_week_start: extras.hours.weekStart,
              hours_week_end: extras.hours.weekEnd,
              hours_sat_start: extras.hours.satStart,
              hours_sat_end: extras.hours.satEnd,
              hours_sun_start: extras.hours.sunStart,
              hours_sun_end: extras.hours.sunEnd,
            }
          : {}),
      },
    });
  }
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
  autoGenerate?: boolean;
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
      auto_generate: params.autoGenerate ?? true,
    },
  });
  if (error) return { ok: false, error: error.detail || error.title || "Falha ao criar quadra." };
  return { ok: true, courtId: data.court_id, slotsCreated: data.slots_created };
}
