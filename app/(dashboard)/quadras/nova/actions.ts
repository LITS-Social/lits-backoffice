"use server";

import { getApi } from "@/lib/api";
import { getWithRetry } from "@/lib/api/retry";
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
  // Sem o guarda, um fetch que MORRE aqui derrubava a página da academia
  // inteira: ela pede quadras e academias no mesmo Promise.all, e uma
  // promessa rejeitada leva a outra junto.
  const res = await getWithRetry(
    (attempt) =>
      api.GET("/v1/ops/franchises", { headers: { "x-lits-retry": String(attempt) } }),
    "de academias"
  );
  if (!res.ok) return { franchises: [], error: res.error };
  return { franchises: res.data.franchises ?? [] };
}

export type FranchiseExtras = {
  lat?: number;
  lng?: number;
  streetAddress?: string;
  /** null = fechado naquele grupo de dias — o PATCH nem menciona o campo,
      e sem janela a grade do app não sintetiza nada para vender. */
  hours?: {
    weekStart: number | null;
    weekEnd: number | null;
    satStart: number | null;
    satEnd: number | null;
    sunStart: number | null;
    sunEnd: number | null;
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
  const anyHours =
    extras?.hours != null &&
    Object.values(extras.hours).some((v) => v != null);
  if (
    extras &&
    (extras.lat != null || extras.lng != null || extras.streetAddress || anyHours)
  ) {
    await api.PATCH("/v1/ops/franchises/{id}", {
      params: { path: { id: data.id } },
      body: {
        ...(extras.lat != null && extras.lng != null
          ? { lat: extras.lat, lng: extras.lng }
          : {}),
        ...(extras.streetAddress ? { street_address: extras.streetAddress } : {}),
        // Só as janelas COMPLETAS viajam. Grupo fechado (null) fica fora do
        // corpo — o banco permanece NULL e aquele dia não existe para a grade.
        ...(extras.hours && extras.hours.weekStart != null && extras.hours.weekEnd != null
          ? { hours_week_start: extras.hours.weekStart, hours_week_end: extras.hours.weekEnd }
          : {}),
        ...(extras.hours && extras.hours.satStart != null && extras.hours.satEnd != null
          ? { hours_sat_start: extras.hours.satStart, hours_sat_end: extras.hours.satEnd }
          : {}),
        ...(extras.hours && extras.hours.sunStart != null && extras.hours.sunEnd != null
          ? { hours_sun_start: extras.hours.sunStart, hours_sun_end: extras.hours.sunEnd }
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
