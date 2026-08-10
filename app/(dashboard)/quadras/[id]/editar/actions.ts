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

/** O BFF valida no máximo 200 slots por POST (maxItems do contrato). Uma grade
    de 30 dias passa de 500 — este helper fatia o envio e soma os resultados.
    Em falha no meio, devolve quanto já entrou: o chamador diz a verdade parcial
    em vez de um "falhou" que faria o operador repetir o que já foi. */
const SLOTS_PER_POST = 200;

async function postSlotsChunked(
  api: Awaited<ReturnType<typeof getApi>>,
  id: string,
  slots: AddSlotInput[]
): Promise<{ created: number; skipped: number; error?: string }> {
  let created = 0;
  let skipped = 0;
  for (let i = 0; i < slots.length; i += SLOTS_PER_POST) {
    const batch = slots.slice(i, i + SLOTS_PER_POST);
    const { data, error } = await api.POST("/v1/ops/courts/{id}/slots", {
      params: { path: { id } },
      body: { slots: batch },
    });
    if (error) {
      return { created, skipped, error: error.detail || error.title || "erro" };
    }
    created += data.slots_created;
    skipped += data.slots_skipped ?? 0;
  }
  return { created, skipped };
}

export async function regenerateAvailabilityAction(
  id: string,
  params: {
    startHour: number;
    endHour: number;
    daysForward: number;
    priceCents?: number | null;
    /** Weekend windows; only sent when they differ from the base window, so
        the request stays compatible with a BFF that predates the field. */
    saturday?: { startHour: number; endHour: number };
    sunday?: { startHour: number; endHour: number };
  }
): Promise<RegenerateState> {
  const api = await getApi();

  // A grade padrão nasce BLOQUEADA (pedido do produto): um horário só vende
  // depois de um import do clube ou de um desbloqueio explícito no calendário.
  // Implementação: apaga a grade inteira (só reservas reais sobrevivem) e
  // recria cada janela como blocked via POST — o que também elimina qualquer
  // slot fantasma fora da janela nova (ex.: domingo 20h–22h após encurtar o
  // funcionamento). O endpoint regenerate do BFF (que cria disponíveis) deixa
  // de ser usado pelo painel.
  const del = await api.DELETE("/v1/ops/courts/{id}/slots", { params: { path: { id } } });
  if (del.error) {
    return {
      ok: false,
      error: del.error.detail || del.error.title || "Falha ao limpar a grade atual.",
    };
  }

  const windowFor = (dow: number) => {
    if (dow === 0) return params.sunday ?? { startHour: params.startHour, endHour: params.endHour };
    if (dow === 6) return params.saturday ?? { startHour: params.startHour, endHour: params.endHour };
    return { startHour: params.startHour, endHour: params.endHour };
  };
  const spYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  const spDow = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" });
  const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const now = Date.now();
  const slots: AddSlotInput[] = [];
  for (let d = 0; d < params.daysForward; d++) {
    const day = new Date(now + d * 24 * 3_600_000);
    const ymd = spYmd.format(day);
    const w = windowFor(DOW[spDow.format(day)] ?? 1);
    for (let h = w.startHour; h <= w.endHour; h++) {
      const startMs = new Date(`${ymd}T${String(h).padStart(2, "0")}:00:00-03:00`).getTime();
      if (startMs <= now) continue; // today's past hours stay gone
      slots.push({
        slot_start: new Date(startMs).toISOString(),
        slot_end: new Date(startMs + 3_600_000).toISOString(),
        status: "blocked",
        ...(params.priceCents != null ? { price_cents: params.priceCents } : {}),
      });
    }
  }

  const add = await postSlotsChunked(api, id, slots);
  if (add.error) {
    return {
      ok: false,
      error:
        `Grade antiga apagada e ${add.created} horários criados antes da falha: ` +
        add.error +
        " — gere de novo para completar (horários já criados são pulados).",
    };
  }

  revalidatePath("/quadras");
  return { ok: true, slotsDeleted: del.data.slots_deleted, slotsCreated: add.created };
}

export type ReorderState = { ok: boolean; error?: string };

/**
 * Persists the academia's column order (drag-to-reorder in the calendar) as
 * courts.display_order — shared by every operator and every login, not a
 * browser preference. One PATCH per court, index = position.
 */
export async function reorderCourtsAction(courtIds: string[]): Promise<ReorderState> {
  const api = await getApi();
  for (const [i, id] of courtIds.entries()) {
    const { error, response } = await api.PATCH("/v1/ops/courts/{id}", {
      params: { path: { id } },
      body: { display_order: i },
    });
    if (error) {
      // A deployed BFF that predates display_order 422s the unknown key.
      if (response.status === 422) {
        return {
          ok: false,
          error:
            "Ordem salva só neste navegador por enquanto — publique o bff-backoffice " +
            "(branch feat/delete-court-slots) para valer para todos os logins.",
        };
      }
      return { ok: false, error: error.detail || error.title || "Falha ao salvar a ordem." };
    }
  }
  revalidatePath("/quadras");
  return { ok: true };
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
  const res = await postSlotsChunked(api, id, slots);
  if (res.error) {
    return {
      ok: false,
      error:
        res.created > 0
          ? `${res.created} horários entraram antes da falha: ${res.error}`
          : res.error,
    };
  }
  revalidatePath("/quadras");
  return { ok: true, slotsCreated: res.created, slotsSkipped: res.skipped };
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

  // Read the affected window FIRST. The add endpoint skips existing instants,
  // and reading after the write would make just-created slots
  // indistinguishable from pre-existing ones (this once reported negative
  // "created" counts): only what exists NOW needs reconciling.
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
        "Falha ao conferir os horários existentes: " +
        (listRes.error.detail || listRes.error.title || "erro"),
    };
  }

  const requestedBlocked = slots.filter((s) => (s.status ?? "available") === "blocked").length;
  let skippedBlocked = 0;
  let skippedAvailable = 0;
  let blockedExisting = 0;
  let alreadyBlocked = 0;
  let unblocked = 0;
  let bookedConflicts = 0;
  let patchFailed = 0;

  // Reconcile the pre-existing slots toward each one's desired status
  // ("available" mirrors the add endpoint's default for slots omitting it).
  for (const slot of listRes.data.slots ?? []) {
    const desired = wanted.get(new Date(slot.slot_start).toISOString());
    if (!desired) continue;
    // Which side of the request this existing instant came from — feeds the
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

  // Now create the missing instants; the endpoint skips the existing ones.
  const addRes = await postSlotsChunked(api, courtId, slots);
  if (addRes.error) {
    return {
      ok: false,
      error:
        addRes.created > 0
          ? `${addRes.created} horários entraram antes da falha: ${addRes.error}`
          : addRes.error,
    };
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
    /** Operating hours — the academia's standard schedule. Sent as a set. */
    hours?: {
      weekStart: number;
      weekEnd: number;
      satStart: number;
      satEnd: number;
      sunStart: number;
      sunEnd: number;
    };
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
    // Touched-only like the rest — a BFF without the columns 422s unknown keys.
    ...(params.hours !== undefined
      ? {
          hours_week_start: params.hours.weekStart,
          hours_week_end: params.hours.weekEnd,
          hours_sat_start: params.hours.satStart,
          hours_sat_end: params.hours.satEnd,
          hours_sun_start: params.hours.sunStart,
          hours_sun_end: params.hours.sunEnd,
        }
      : {}),
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
    if (response.status === 422 && params.hours !== undefined) {
      return {
        ok: false,
        error:
          "O backend em produção ainda não guarda o horário de funcionamento — publique o " +
          "bff-backoffice (branch feat/delete-court-slots) e tente de novo.",
      };
    }
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
  // Nome, tipo e localização também desenham o card de /academias — a tela para
  // onde o operador volta depois de salvar.
  revalidatePath("/academias");
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

// Apagar academia mora em `app/(dashboard)/academias/actions.ts`, junto da tela
// que a usa. Havia uma segunda cópia aqui que mandava o DELETE sem corpo — o que
// o servidor entende como PRÉVIA, e responde 200 sem escrever nada. Uma ação de
// apagar que não olha `deleted` no corpo é uma ação que nunca apaga.

/* ══ tabela de preços por faixa de horário ════════════════════════════════ */

export type PriceBand = {
  /** Horas inclusivas nas duas pontas, lidas no fuso de São Paulo: 18–22 pega
      os slots que COMEÇAM às 18, 19, 20, 21 e 22. */
  startHour: number;
  endHour: number;
  priceCents: number;
  /** 0=domingo … 6=sábado. Vazio = todos os dias. */
  weekdays?: number[];
};

export type PriceTableState = {
  ok: boolean;
  /** Slots que o preço base tocou; null quando o plano não trouxe base. */
  repriced?: number | null;
  /** Quantos horários as faixas trocaram por cima do base. */
  updated?: number;
  /** Reservas reais encontradas — puladas, nunca repreçadas. */
  skippedBooked?: number;
  /** Falharam no PATCH; o resto foi aplicado mesmo assim. */
  failed?: number;
  error?: string;
};

/** Quantos dias à frente a tabela alcança. Mesma janela da grade padrão. */
const PRICE_RANGE_DAYS = 30;

/** O GET de slots devolve no máximo 500 linhas e não tem paginação — só
    `from`/`to`. Uma academia aberta das 6h às 22h faz 17 slots/dia, então 30
    dias passam de 500 e a resposta vinha truncada em silêncio: os últimos dias
    simplesmente não eram repreçados. Varremos em janelas de 10 dias (≈170
    linhas) para caber com folga. */
const SCAN_WINDOW_DAYS = 10;

/** PATCHes em paralelo. Cada slot é uma requisição, e uma faixa de 5 horas em
    30 dias são 150 — em série isso é meio minuto de espera por quadra. 12 foi
    onde o ganho parou de compensar: acima disso a fila sai do painel e vira
    fila no BFF. */
const PATCH_CONCURRENCY = 12;

/** Roda `worker` sobre os itens com no máximo `limit` em voo. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

// Hora e dia da semana lidos em São Paulo — o worker roda em UTC, e sem isto a
// faixa da noite cairia na hora errada.
const spHourFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  hour12: false,
});
const spDowFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
});
const DOW_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** O preço que a tabela manda naquele instante, ou null se nenhuma faixa pega.
    Faixa mais abaixo na lista vence — é como o operador lê a tabela. */
function bandPriceAt(bands: PriceBand[], startMs: number): number | null {
  const hour = Number(spHourFmt.format(new Date(startMs)));
  const dow = DOW_INDEX[spDowFmt.format(new Date(startMs))];
  let price: number | null = null;
  for (const b of bands) {
    if (hour < b.startHour || hour > b.endHour) continue;
    if (b.weekdays && b.weekdays.length > 0 && !b.weekdays.includes(dow)) continue;
    price = b.priceCents;
  }
  return price;
}

/**
 * Aplica a TABELA DE PREÇOS a uma quadra: um preço base para o dia inteiro e,
 * por cima dele, as faixas de horário ("das 18h às 22h custa R$ 400").
 *
 * O base vai pelo endpoint de reprice — uma requisição só, e ele também grava o
 * `default_price_cents` da quadra, então a grade gerada daqui pra frente já
 * nasce no preço certo. As faixas vêm depois, slot a slot, só onde o preço
 * difere do que já está lá.
 *
 * Reserva real nunca é tocada: o preço de um slot vendido é o que o jogador
 * combinou, e mudá-lo por baixo reescreveria o que ele deve. São contadas e
 * reportadas, não repreçadas — o operador precisa saber que existiram.
 */
export async function applyPriceTableAction(
  courtId: string,
  plan: {
    /** Preço do resto do dia. null/undefined = não mexe no que já está lá. */
    baseCents?: number | null;
    bands: PriceBand[];
  }
): Promise<PriceTableState> {
  const { baseCents = null, bands } = plan;
  for (const b of bands) {
    if (b.startHour > b.endHour) {
      return { ok: false, error: "Em toda faixa, a hora inicial precisa ser menor ou igual à final." };
    }
  }

  const api = await getApi();

  // 1. O base primeiro: assim o GET seguinte já enxerga o preço novo e as
  //    faixas só tocam o que realmente difere.
  let repriced: number | null = null;
  if (baseCents != null) {
    const { data, error } = await api.POST("/v1/ops/courts/{id}/reprice", {
      params: { path: { id: courtId } },
      body: { price_cents: baseCents },
    });
    if (error) {
      return { ok: false, error: error.detail || error.title || "Falha ao aplicar o preço base." };
    }
    repriced = data.slots_updated;
  }

  if (bands.length === 0) {
    revalidatePath("/quadras");
    return { ok: true, repriced, updated: 0, skippedBooked: 0, failed: 0 };
  }

  // 2. A grade dos próximos 30 dias, em janelas que cabem no teto de 500.
  const now = new Date();
  const nowMs = now.getTime();
  const DAY = 24 * 3_600_000;
  // As janelas vão juntas: são leituras independentes, e em série cada uma
  // custava uma ida e volta inteira antes de qualquer preço ser escrito.
  const windows = [];
  for (let d = 0; d < PRICE_RANGE_DAYS; d += SCAN_WINDOW_DAYS) {
    windows.push([
      new Date(nowMs + d * DAY),
      new Date(nowMs + Math.min(d + SCAN_WINDOW_DAYS, PRICE_RANGE_DAYS) * DAY),
    ] as const);
  }
  const pages = await Promise.all(
    windows.map(([from, to]) =>
      api.GET("/v1/ops/courts/{id}/slots", {
        params: {
          path: { id: courtId },
          query: { from: from.toISOString(), to: to.toISOString() },
        },
      })
    )
  );
  const slots: { slot_start: string; status?: string; price_cents?: number | null }[] = [];
  for (const { data, error } of pages) {
    if (error) {
      return { ok: false, error: error.detail || error.title || "Falha ao ler a grade." };
    }
    slots.push(...(data.slots ?? []));
  }

  // 3. Quem muda de preço.
  let skippedBooked = 0;
  const targets: { slotStart: string; priceCents: number }[] = [];
  for (const s of slots) {
    const startMs = new Date(s.slot_start).getTime();
    if (startMs <= nowMs) continue; // passado não se repreça
    const want = bandPriceAt(bands, startMs);
    if (want === null) continue;
    if (s.status === "booked") {
      skippedBooked++;
      continue;
    }
    if (s.price_cents === want) continue; // já está no preço
    targets.push({ slotStart: s.slot_start, priceCents: want });
  }

  let updated = 0;
  let failed = 0;
  await pool(targets, PATCH_CONCURRENCY, async (t) => {
    const res = await api.PATCH("/v1/ops/courts/{id}/slots/{slot_start}", {
      params: { path: { id: courtId, slot_start: t.slotStart } },
      body: { price_cents: t.priceCents },
    });
    if (res.error) failed++;
    else updated++;
  });

  revalidatePath("/quadras");
  return { ok: true, repriced, updated, skippedBooked, failed };
}

/* ══ ler a tabela de preços de volta da grade ═════════════════════════════ */

export type ReadPriceTableState = {
  ok: boolean;
  /** O preço mais frequente da grade — o "resto do dia". */
  baseCents?: number | null;
  bands?: PriceBand[];
  error?: string;
};

/** Quantos dias ler para enxergar a semana inteira. Sete bastam: a tabela é
    semanal, e ler mais só repete o mesmo padrão a um custo maior. */
const READ_TABLE_DAYS = 7;

/**
 * Reconstrói a tabela de preços a partir dos horários que existem de fato.
 *
 * O painel não guarda a tabela em lugar nenhum — e é de propósito. Uma cópia
 * salva envelhece: alguém repreça uma quadra por fora, importa um print, e a
 * tela passa a mostrar uma tabela que não é mais a verdade. Lendo a grade de
 * volta, o que aparece na tela é o que o jogador vai pagar.
 *
 * O preço mais frequente vira o base; toda sequência contígua de horas que
 * foge dele vira faixa, e dias com a mesma sequência se juntam numa faixa só.
 * Reservas reais ficam de fora: o preço delas é o que foi combinado, não o que
 * a tabela manda.
 */
export async function readPriceTableAction(courtId: string): Promise<ReadPriceTableState> {
  const api = await getApi();
  const now = new Date();
  const to = new Date(now.getTime() + READ_TABLE_DAYS * 24 * 3_600_000);
  const { data, error } = await api.GET("/v1/ops/courts/{id}/slots", {
    params: {
      path: { id: courtId },
      query: { from: now.toISOString(), to: to.toISOString() },
    },
  });
  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao ler a grade." };
  }

  // (dia da semana, hora) → preço. Primeira ocorrência vence; a janela é de
  // sete dias, então cada par aparece uma vez só de qualquer forma.
  const seen = new Map<string, number>();
  const tally = new Map<number, number>();
  for (const s of data.slots ?? []) {
    if (s.status === "booked" || s.price_cents == null) continue;
    const d = new Date(s.slot_start);
    const dow = DOW_INDEX[spDowFmt.format(d)];
    const hour = Number(spHourFmt.format(d));
    if (dow === undefined) continue;
    const key = `${dow}:${hour}`;
    if (seen.has(key)) continue;
    seen.set(key, s.price_cents);
    tally.set(s.price_cents, (tally.get(s.price_cents) ?? 0) + 1);
  }
  if (seen.size === 0) return { ok: true, baseCents: null, bands: [] };

  let baseCents = 0;
  let best = -1;
  for (const [price, n] of tally) if (n > best) { best = n; baseCents = price; }

  // Sequências contíguas de horas fora do base, por dia da semana.
  //
  // Hora SEM slot não quebra a sequência: pode ser uma reserva real no meio da
  // noite (o preço dela é o combinado, não o da tabela) ou uma hora fora do
  // funcionamento. Tratar essa lacuna como "voltou ao base" partia a faixa das
  // 18h–22h em 18–18 e 20–22 só porque as 19h estavam vendidas — e o operador
  // via uma tabela picotada que ele nunca montou.
  type Run = { startHour: number; endHour: number; priceCents: number };
  const runsByDow = new Map<number, Run[]>();
  for (let dow = 0; dow <= 6; dow++) {
    const runs: Run[] = [];
    let cur: Run | null = null;
    for (let h = 0; h <= 23; h++) {
      const price = seen.get(`${dow}:${h}`);
      if (price === undefined) continue; // lacuna: nem fecha nem abre faixa
      if (price === baseCents) {
        if (cur) runs.push(cur);
        cur = null;
        continue;
      }
      if (cur && cur.priceCents === price) {
        cur.endHour = h;
        continue;
      }
      if (cur) runs.push(cur);
      cur = { startHour: h, endHour: h, priceCents: price };
    }
    if (cur) runs.push(cur);
    if (runs.length > 0) runsByDow.set(dow, runs);
  }

  // Dias com a mesma faixa entram numa faixa só, com a lista de dias.
  const merged = new Map<string, PriceBand>();
  for (const [dow, runs] of runsByDow) {
    for (const r of runs) {
      const key = `${r.startHour}-${r.endHour}-${r.priceCents}`;
      const band = merged.get(key) ?? { ...r, weekdays: [] as number[] };
      band.weekdays!.push(dow);
      merged.set(key, band);
    }
  }

  const bands = [...merged.values()]
    .map((b) => ({ ...b, weekdays: b.weekdays!.length === 7 ? [] : b.weekdays!.sort() }))
    .sort((a, b) => a.startHour - b.startHour || a.priceCents - b.priceCents);

  return { ok: true, baseCents, bands };
}
