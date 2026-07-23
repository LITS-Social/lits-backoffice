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

export type PrintBlock = { date: string; start: string; end: string };
export type PrintCourt = { name: string; occupied: PrintBlock[] };
/** How the model read the print: blocks the club SOLD vs blocks it OFFERED. */
export type PrintKind = "occupied" | "available";
export type ParsePrintState = {
  ok: boolean;
  /** The model's classification — operator-correctable in the UI. */
  kind?: PrintKind;
  /** Default YYYY-MM-DD (a grid print's header date); "" when absent. */
  date?: string;
  courts?: PrintCourt[];
  error?: string;
};

/** Structured-output contract for the extraction — what the model MUST return.
    Times as HH:MM strings, one entry per court, only the occupied blocks. Each
    block carries its own date so a chat print listing several days ("quinta…,
    sexta…, domingo…") round-trips losslessly; grid prints repeat the header
    date. Free/white cells carry no information the console doesn't have. */
const PRINT_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["occupied", "available"],
      description:
        "Classificação do print. 'occupied': os horários são afirmados como reservados/" +
        "ocupados/combinados — grade de calendário é SEMPRE 'occupied' (células coloridas " +
        "são reservas). 'available': os horários são OFERECIDOS como livres/disponíveis " +
        "para reservar (ex. 'temos:', 'temos disponível', resposta a 'quais horários " +
        "vocês têm?').",
    },
    date: {
      type: "string",
      description:
        "Data padrão do print (cabeçalho do calendário), formato YYYY-MM-DD. String vazia se não houver uma data única.",
    },
    courts: {
      type: "array",
      description: "Uma entrada por quadra identificada no print, na ordem em que aparece.",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "Nome da quadra exatamente como aparece no print (título da coluna, ou como citada na mensagem, ex. 'quadra rápida'). Se o print não distinguir quadras, use 'Quadra'.",
          },
          occupied: {
            type: "array",
            description: "Blocos ocupados/reservados desta quadra, em ordem cronológica.",
            items: {
              type: "object",
              properties: {
                date: {
                  type: "string",
                  description:
                    "Data deste bloco, YYYY-MM-DD. Resolva dias da semana e datas parciais (ex. '23/07'). String vazia apenas se for impossível determinar.",
                },
                start: { type: "string", description: "Início do bloco, HH:MM (24h)." },
                end: {
                  type: "string",
                  description: "Fim do bloco, HH:MM (24h). Use 24:00 para meia-noite do fim do dia.",
                },
              },
              required: ["date", "start", "end"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "occupied"],
        additionalProperties: false,
      },
    },
  },
  required: ["kind", "date", "courts"],
  additionalProperties: false,
};

/** Today's wall-clock date in São Paulo — the anchor the model needs to resolve
    relative dates in chat prints ("sexta", "23/07" sem ano). */
function spToday(): { ymd: string; weekday: string } {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
  }).format(now);
  return { ymd, weekday };
}

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
  const today = spToday();
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
                `Hoje é ${today.weekday}, ${today.ymd} (America/Sao_Paulo). ` +
                "Este print vem de um clube de tênis e mostra horários ocupados/reservados em um " +
                "de dois formatos. (1) GRADE DE CALENDÁRIO: horários nas linhas, quadras nas " +
                "colunas; células coloridas (ex. vermelhas) são ocupadas, brancas estão livres. " +
                "Extraia a data do cabeçalho como data padrão e repita-a no campo date de cada " +
                "bloco. Um rótulo de intervalo ('15:00-18:00') é um único bloco inteiro; " +
                "'22:00-00:00' termina à meia-noite — use 24:00. (2) PRINT DE MENSAGEM/CONVERSA " +
                "(ex. WhatsApp) listando horários por dia: cada menção de hora vira um bloco. " +
                "Hora avulsa ('às 14h') é um bloco de 1 hora (14:00–15:00); horas em sequência " +
                "('16h, 17h e 18h') são blocos de 1 hora cada. Agrupe por quadra citada (ex. " +
                "'quadra rápida', 'grama'); se nenhuma for citada, use o nome 'Quadra'. Resolva " +
                "as datas: uma data ancorada (ex. 'Quinta (23/07)') fixa a semana e os dias " +
                "seguintes da lista são consecutivos a ela ('sexta' = dia seguinte, etc.); sem " +
                "âncora, use a PRÓXIMA ocorrência do dia da semana a partir de hoje. Datas sem " +
                "ano recebem o ano dessa resolução. Nesse formato deixe a data padrão vazia. " +
                "Classifique o print no campo kind: 'occupied' quando os horários são " +
                "afirmados como reservados/ocupados/combinados — grade de calendário é SEMPRE " +
                "'occupied' (células coloridas são reservas); 'available' quando os horários " +
                "são OFERECIDOS como livres/disponíveis para reservar (ex. 'temos:', 'temos " +
                "disponível', resposta a 'quais horários vocês têm?'). Extraia apenas os " +
                "horários mencionados — ignore saudações e texto sem horário.",
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
    const parsed = JSON.parse(text) as { kind: PrintKind; date: string; courts: PrintCourt[] };
    if (!parsed.courts?.length) {
      return { ok: false, error: "Nenhuma quadra reconhecida no print." };
    }
    return { ok: true, kind: parsed.kind, date: parsed.date, courts: parsed.courts };
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
  /** New slots created, split by the status they were created with. */
  createdBlocked?: number;
  createdAvailable?: number;
  /** Existing slots PATCHed to blocked because the print shows them occupied. */
  blockedExisting?: number;
  /** Slots already blocked before the import — nothing to do. */
  alreadyBlocked?: number;
  /** Slots that existed as blocked and were PATCHed back to available. */
  unblocked?: number;
  /** Slots with a real booking at that instant — never touched. */
  bookedConflicts?: number;
  /** Pre-existing slots whose status PATCH failed — retry-worthy. */
  patchFailed?: number;
  error?: string;
};

/**
 * Applies a print's slots with each one's OWN desired status ("blocked" for
 * what the club sold; "available" for what it offered or for the free rest of
 * the day in "completar o dia"). The add endpoint skips instants that already
 * have a slot, so this runs in two passes: create the missing ones, then
 * re-read the affected window and PATCH the pre-existing slots toward their
 * desired status (available→blocked, blocked→available). Slots with a real
 * booking are reported, never overwritten — the club's print does not outrank
 * a paid reservation in our own ledger.
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

  // The created split reported back is derived by subtraction: created per
  // side = requested per side − skipped per side (counted in the second pass).
  const requestedBlocked = slots.filter((s) => (s.status ?? "available") === "blocked").length;

  let skippedBlocked = 0;
  let skippedAvailable = 0;
  let blockedExisting = 0;
  let alreadyBlocked = 0;
  let unblocked = 0;
  let bookedConflicts = 0;
  let patchFailed = 0;

  if (skipped > 0) {
    // The skipped instants already exist in the grid — fetch the window and
    // reconcile each one toward its desired status. "available" mirrors the
    // add endpoint's default for slots that omitted the field.
    const starts = slots.map((s) => new Date(s.slot_start).getTime());
    const from = new Date(Math.min(...starts) - 1).toISOString();
    const to = new Date(Math.max(...starts) + 1).toISOString();
    const wanted = new Map(
      slots.map((s) => [new Date(s.slot_start).toISOString(), s.status ?? "available"] as const)
    );

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
      const desired = wanted.get(new Date(slot.slot_start).toISOString());
      if (!desired) continue;
      // Which side of the request this skipped instant came from — feeds the
      // created split reported back (created = requested − skipped, per side).
      if (desired === "blocked") skippedBlocked++;
      else skippedAvailable++;
      if (slot.status === "booked") {
        // A real reservation in our ledger — surfaced either way: the club
        // "selling" it again or "offering" it free are both conflicts.
        bookedConflicts++;
      } else if (slot.status === desired) {
        if (desired === "blocked") alreadyBlocked++;
        // desired available + already available = nothing to do, no counter.
      } else {
        const patch = await api.PATCH("/v1/ops/courts/{id}/slots/{slot_start}", {
          params: { path: { id: courtId, slot_start: slot.slot_start } },
          body:
            desired === "blocked"
              ? { status: "blocked", block_reason: "Importado do print do clube" }
              : { status: "available", block_reason: "" },
        });
        if (patch.error) patchFailed++;
        else if (desired === "blocked") blockedExisting++;
        else unblocked++;
      }
    }
  }

  revalidatePath("/quadras");
  return {
    ok: true,
    createdBlocked: requestedBlocked - skippedBlocked,
    createdAvailable: slots.length - requestedBlocked - skippedAvailable,
    blockedExisting,
    alreadyBlocked,
    unblocked,
    bookedConflicts,
    patchFailed,
  };
}

export type DeleteSlotsState = {
  ok: boolean;
  slotsDeleted?: number;
  bookedKept?: number;
  error?: string;
};

/** Wipes the court's grid (available + blocked, past and future). Booked slots
    survive on the BFF side — a real reservation outranks a cleanup. */
export async function deleteCourtSlotsAction(id: string): Promise<DeleteSlotsState> {
  const api = await getApi();
  const { data, error, response } = await api.DELETE("/v1/ops/courts/{id}/slots", {
    params: { path: { id } },
  });
  if (error) {
    // A deployed BFF that predates this endpoint 404s the route itself.
    if (response.status === 404 && !error.detail?.includes("court")) {
      return {
        ok: false,
        error:
          "O backend em produção ainda não tem este endpoint — publique o bff-backoffice e tente de novo.",
      };
    }
    return { ok: false, error: error.detail || error.title || "Falha ao apagar horários." };
  }
  revalidatePath("/quadras");
  return { ok: true, slotsDeleted: data.slots_deleted, bookedKept: data.booked_kept };
}

export async function updateFranchiseAction(
  id: string,
  params: {
    name?: string;
    defaultPriceCents?: number;
    /** Reclassifies the venue (app grid semantics change at read time). */
    kind?: "partner" | "public" | "listing";
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
    // Touched-only, like geo: a BFF that predates the kind field 422s unknown
    // body keys, so name/price saves must not carry it implicitly.
    ...(params.kind !== undefined ? { kind: params.kind } : {}),
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
    // A deployed BFF that predates the kind field rejects the unknown key with
    // Huma's bare "validation failed" — name the real cause during the rollout
    // window instead of leaking that string.
    if (response.status === 422 && params.kind !== undefined) {
      return {
        ok: false,
        error:
          "O backend em produção ainda não aceita mudança de tipo — publique o " +
          "bff-backoffice com o campo kind (lits-backend, branch feat/franchise-kind-update) " +
          "e tente de novo. Os demais campos salvam se você desfazer a troca de tipo.",
      };
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
