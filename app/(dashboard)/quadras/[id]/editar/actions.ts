"use server";

import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
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

/* ══ import from a schedule print ═════════════════════════════════════════ */

export type PrintBlock = { start: string; end: string };
export type PrintCourt = { name: string; occupied: PrintBlock[] };
export type ParsePrintState = {
  ok: boolean;
  /** YYYY-MM-DD from the print's header; "" when the print doesn't show one. */
  date?: string;
  courts?: PrintCourt[];
  error?: string;
};

/** Structured-output contract for the extraction — what the model MUST return.
    Kept minimal on purpose: times as HH:MM strings, one entry per court column,
    only the occupied (colored) blocks. Free/white cells carry no information the
    console doesn't already have. */
const PRINT_SCHEMA = {
  type: "object",
  properties: {
    date: {
      type: "string",
      description:
        "Data mostrada no cabeçalho do calendário, formato YYYY-MM-DD. String vazia se o print não mostrar a data.",
    },
    courts: {
      type: "array",
      description: "Uma entrada por coluna/quadra do calendário, na ordem exibida.",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Título da coluna exatamente como aparece no print.",
          },
          occupied: {
            type: "array",
            description:
              "Blocos ocupados/reservados (células coloridas, ex. vermelhas) desta coluna, em ordem cronológica.",
            items: {
              type: "object",
              properties: {
                start: { type: "string", description: "Início do bloco, HH:MM (24h)." },
                end: {
                  type: "string",
                  description: "Fim do bloco, HH:MM (24h). Use 24:00 para meia-noite do fim do dia.",
                },
              },
              required: ["start", "end"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "occupied"],
        additionalProperties: false,
      },
    },
  },
  required: ["date", "courts"],
  additionalProperties: false,
};

/**
 * Reads a club-calendar screenshot and extracts, per court column, the occupied
 * time blocks. Vision + structured outputs on the Claude API — the schema above
 * guarantees parseable JSON, so the only failure modes are transport/auth and
 * a safety refusal, both surfaced as friendly errors.
 *
 * The image never touches the BFF: print → this Worker → Anthropic → JSON.
 */
export async function parseSchedulePrintAction(formData: FormData): Promise<ParsePrintState> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error:
        "ANTHROPIC_API_KEY não configurada no ambiente. Configure o secret e tente de novo.",
    };
  }

  const file = formData.get("print");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Envie a imagem do print." };
  }
  // The Anthropic API rejects images over 5 MB — enforce the real limit up front.
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "Imagem muito grande (máx. 5 MB)." };
  }
  // Mirrors the UI's accept= exactly; find() narrows to the SDK's media_type union.
  const mediaType = (["image/png", "image/jpeg", "image/webp"] as const).find(
    (m) => m === file.type
  );
  if (!mediaType) {
    return { ok: false, error: "Formato não suportado — use PNG, JPEG ou WebP." };
  }

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: PRINT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data },
            },
            {
              type: "text",
              text:
                "Este é um print do sistema de reservas de um clube de tênis: uma grade com " +
                "horários nas linhas e quadras nas colunas. Células coloridas (vermelhas) são " +
                "horários ocupados/reservados; células brancas estão livres. Extraia a data do " +
                "cabeçalho e, para cada coluna (quadra), os blocos ocupados com início e fim. " +
                "Um bloco que rotula um intervalo (ex. '15:00-18:00') é um único bloco desse " +
                "intervalo inteiro. Rótulos '22:00-00:00' terminam à meia-noite — use 24:00.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, error: "O modelo recusou processar esta imagem. Tente outro print." };
    }
    if (response.stop_reason === "max_tokens") {
      // Truncated output would fail JSON.parse below with a useless generic error.
      return {
        ok: false,
        error: "Print muito denso — recorte a imagem pra grade do dia e tente de novo.",
      };
    }
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(text) as { date: string; courts: PrintCourt[] };
    if (!parsed.courts?.length) {
      return { ok: false, error: "Nenhuma quadra reconhecida no print." };
    }
    return { ok: true, date: parsed.date, courts: parsed.courts };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "Chave da Anthropic inválida — confira o secret ANTHROPIC_API_KEY." };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Limite de requisições da Anthropic atingido — tente em instantes." };
    }
    if (err instanceof Anthropic.APIError) {
      return { ok: false, error: `Falha ao ler o print (${err.status ?? "erro"}): ${err.message}` };
    }
    return { ok: false, error: "Falha ao ler o print. Tente novamente." };
  }
}

export type ApplyPrintState = {
  ok: boolean;
  created?: number;
  /** Slots that already existed as available and were PATCHed to blocked. */
  blockedExisting?: number;
  /** Slots already blocked before the import — nothing to do. */
  alreadyBlocked?: number;
  /** Slots with a real booking at that instant — never touched. */
  bookedConflicts?: number;
  /** Pre-existing available slots whose block PATCH failed — retry-worthy. */
  patchFailed?: number;
  error?: string;
};

/**
 * Applies the occupied blocks of a print as BLOCKED slots. The add endpoint
 * skips instants that already have a slot, so this runs in two passes:
 * create the missing ones, then re-read the affected window and PATCH the
 * pre-existing available slots to blocked. Slots with a real booking are
 * reported, never overwritten — the club's print does not outrank a paid
 * reservation in our own ledger.
 */
export async function applyPrintSlotsAction(
  courtId: string,
  slots: AddSlotInput[]
): Promise<ApplyPrintState> {
  if (slots.length === 0) return { ok: false, error: "Nenhum horário selecionado." };
  const api = await getApi();

  const addRes = await api.POST("/v1/ops/courts/{id}/slots", {
    params: { path: { id: courtId } },
    body: { slots },
  });
  if (addRes.error) {
    return {
      ok: false,
      error: addRes.error.detail || addRes.error.title || "Falha ao adicionar horários.",
    };
  }
  const created = addRes.data.slots_created ?? 0;
  const skipped = addRes.data.slots_skipped ?? 0;

  let blockedExisting = 0;
  let alreadyBlocked = 0;
  let bookedConflicts = 0;
  let patchFailed = 0;

  if (skipped > 0) {
    // The skipped instants already exist in the grid — fetch the window and
    // block the ones still selling as available.
    const starts = slots.map((s) => new Date(s.slot_start).getTime());
    const from = new Date(Math.min(...starts) - 1).toISOString();
    const to = new Date(Math.max(...starts) + 1).toISOString();
    const wanted = new Set(slots.map((s) => new Date(s.slot_start).toISOString()));

    const listRes = await api.GET("/v1/ops/courts/{id}/slots", {
      params: { path: { id: courtId }, query: { from, to } },
    });
    if (listRes.error) {
      return {
        ok: false,
        error:
          `${created} criados, mas falhou ao conferir os já existentes: ` +
          (listRes.error.detail || listRes.error.title || "erro"),
      };
    }

    for (const slot of listRes.data.slots ?? []) {
      if (!wanted.has(new Date(slot.slot_start).toISOString())) continue;
      if (slot.status === "blocked") {
        alreadyBlocked++;
      } else if (slot.status === "booked") {
        bookedConflicts++;
      } else {
        const patch = await api.PATCH("/v1/ops/courts/{id}/slots/{slot_start}", {
          params: { path: { id: courtId, slot_start: slot.slot_start } },
          body: { status: "blocked", block_reason: "Importado do print do clube" },
        });
        if (patch.error) patchFailed++;
        else blockedExisting++;
      }
    }
  }

  revalidatePath("/quadras");
  return { ok: true, created, blockedExisting, alreadyBlocked, bookedConflicts, patchFailed };
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
