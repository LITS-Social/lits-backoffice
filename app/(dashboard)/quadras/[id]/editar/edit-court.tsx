"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  Lock,
  LockOpen,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, reaisToCents } from "@/lib/utils";
import type { CourtListItem } from "../../actions";
import {
  addCourtSlotsAction,
  deleteCourtSlotsAction,
  geocodeAction,
  regenerateAvailabilityAction,
  repriceCourtAction,
  updateCourtAction,
  updateCourtSlotAction,
  updateFranchiseAction,
  listCourtSlotsAction,
  type AddSlotInput,
  type CourtSlotItem,
  type GeocodeCandidate,
} from "./actions";
import { ImportPrintSection } from "./import-print";

type Surface = "clay" | "hard" | "grass" | "beach" | "carpet";

const SURFACE_LABELS: Record<Surface, string> = {
  clay: "Saibro",
  hard: "Duro",
  grass: "Grama",
  beach: "Areia",
  carpet: "Carpete",
};

const STATUS_LABEL: Record<string, string> = {
  available: "Disponível",
  booked: "Reservado",
  blocked: "Bloqueado",
};

const STATUS_VARIANT: Record<string, "success" | "info" | "warning" | "muted"> = {
  available: "success",
  booked: "info",
  blocked: "warning",
};

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors placeholder:font-300 placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";

const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";
const labelInlineClass = "label-colus block text-[8.5px] text-[var(--text-tertiary)]";

/* ── shared bits ──────────────────────────────────────────────────────────── */

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-error)]">
      <AlertCircle size={13} className="mt-px shrink-0" />
      {message}
    </p>
  );
}

function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-[var(--color-success)]/25 bg-[var(--color-success-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-success)]">
      <Check size={13} strokeWidth={2.5} className="shrink-0" />
      {children}
    </p>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="eyebrow">{title}</h2>
        {description && (
          <p className="mt-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

const primaryBtn =
  "inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-colus text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50";

/* ── helpers ──────────────────────────────────────────────────────────────── */

function hhmm(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

function dayKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function dayLabelOf(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(iso));
}

function priceLabel(cents: number | null): string {
  return cents == null ? "—" : formatCurrency(cents);
}

function reaisFromCents(cents: number | null): string {
  if (cents == null) return "";
  const v = cents / 100;
  return v % 1 === 0 ? String(v) : v.toFixed(2).replace(".", ",");
}

function dayStartISO(y: string): string {
  return new Date(`${y}T00:00:00`).toISOString();
}

/* ── geo helpers ──────────────────────────────────────────────────────────── */

/** Number for one coordinate field; tolerates the BR decimal comma ("-23,5936"). */
function coordNumber(raw: string): number {
  const t = raw.trim();
  const normalized = t.includes(",") && !t.includes(".") ? t.replace(",", ".") : t;
  return normalized === "" ? NaN : Number(normalized);
}

/**
 * Splits a "lat, lng" pair as staff paste it — Google Maps' dot-decimal form
 * ("-23.5936, -46.6731") plus BR comma-decimal variants ("-23,5936; -46,6731",
 * "-23,5936, -46,6731", "-23,5936 -46,6731") and loose spacing around the
 * separator. Null when the text isn't a recognizable pair.
 */
function splitLatLngPair(text: string): { lat: string; lng: string } | null {
  const t = text.trim().replace(/^\(/, "").replace(/\)$/, "");
  let sides: [string, string] | null = null;

  const semi = t.split(";");
  if (semi.length === 2) {
    sides = [semi[0], semi[1]];
  } else if (semi.length === 1) {
    const commas: number[] = [];
    for (let i = 0; i < t.length; i++) if (t[i] === ",") commas.push(i);
    if (commas.length === 3) {
      // Two BR decimals joined by a comma — the middle comma is the separator.
      sides = [t.slice(0, commas[1]), t.slice(commas[1] + 1)];
    } else if (commas.length === 1) {
      // A lone comma separates when decimals use dots, or when it's followed by
      // whitespace or a minus — otherwise it's the decimal comma of a single BR
      // number ("-23,5936") and there is no pair here.
      const i = commas[0];
      if (t.includes(".") || /^[\s-]/.test(t.slice(i + 1))) {
        sides = [t.slice(0, i), t.slice(i + 1)];
      }
    } else {
      // 0 commas (dot decimals or integers) or 2 (BR decimals): whitespace-only
      // separator, e.g. "-23.5936 -46.6731" / "-23,5936 -46,6731".
      const parts = t.split(/\s+/);
      if (parts.length === 2) sides = [parts[0], parts[1]];
    }
  }

  if (!sides) return null;
  const lat = sides[0].trim();
  const lng = sides[1].trim();
  // The splitter is permissive, so each side must actually read as a number.
  if (!Number.isFinite(coordNumber(lat)) || !Number.isFinite(coordNumber(lng))) return null;
  return { lat, lng };
}

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function dayEndISO(y: string): string {
  return new Date(`${y}T23:59:59.999`).toISOString();
}

/* ── add-slots helpers ────────────────────────────────────────────────────── */

// São Paulo is UTC-3 with no DST, so a fixed offset turns a picked wall-clock
// date+time into the exact absolute instant the backend stores (RFC3339 Z),
// independent of whatever timezone the staff's browser is in.
const SP_OFFSET = "-03:00";

const WEEKDAYS: { idx: number; label: string }[] = [
  { idx: 0, label: "Dom" },
  { idx: 1, label: "Seg" },
  { idx: 2, label: "Ter" },
  { idx: 3, label: "Qua" },
  { idx: 4, label: "Qui" },
  { idx: 5, label: "Sex" },
  { idx: 6, label: "Sáb" },
];

/** Epoch ms for a São Paulo wall-clock date (yyyy-mm-dd) + time (HH:mm). */
function spStartMs(ymd: string, hm: string): number {
  return new Date(`${ymd}T${hm}:00${SP_OFFSET}`).getTime();
}

/** São Paulo local yyyy-mm-dd + HH:mm for an instant — used to advance to the next slot. */
function spParts(ms: number): { ymd: string; hm: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { ymd: `${get("year")}-${get("month")}-${get("day")}`, hm: `${hour}:${get("minute")}` };
}

/** Midnight-UTC epoch ms for a calendar date — a tz-safe anchor for range iteration. */
function ymdToUTC(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToYmd(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

/**
 * "Grátis" pill that clamps a price field to R$ 0,00. A blank price means "use
 * the court/franchise default"; this means "charge nothing" — the two have to be
 * distinguishable, since beta partner clubs can be free too.
 */
function GratisToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-600 transition-colors ${
        active
          ? "bg-[var(--primary)] text-[var(--primary-fg)]"
          : "bg-[var(--surface-raised)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      }`}
    >
      Grátis
    </button>
  );
}

/* ══ court basics ═════════════════════════════════════════════════════════ */

function CourtBasicsSection({ court }: { court: CourtListItem }) {
  const [name, setName] = useState(court.name);
  const [surface, setSurface] = useState<Surface>(
    court.surface in SURFACE_LABELS ? (court.surface as Surface) : "clay",
  );
  const [indoor, setIndoor] = useState(court.indoor);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function touched() {
    setSaved(false);
    setError("");
  }

  function save() {
    setError("");
    setSaved(false);
    if (!name.trim()) {
      setError("Informe o nome da quadra.");
      return;
    }
    startTransition(async () => {
      const res = await updateCourtAction(court.id, { name: name.trim(), surface, indoor });
      if (!res.ok) {
        setError(res.error ?? "Falha ao salvar.");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <SectionCard title="Dados da quadra">
      <div className="space-y-5">
        <div>
          <label htmlFor="court_name" className={labelClass}>
            Nome da quadra
          </label>
          <input
            id="court_name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              touched();
            }}
            placeholder="ex: Quadra 1"
            className={fieldClass}
          />
        </div>

        <div>
          <p className={labelClass}>Superfície</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {(Object.keys(SURFACE_LABELS) as Surface[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSurface(s);
                  touched();
                }}
                className={`rounded-lg border py-2 text-[11.5px] font-600 transition-colors ${
                  surface === s
                    ? "border-[var(--primary)] bg-[var(--primary)]/8 text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                }`}
              >
                {SURFACE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-3">
          <div>
            <p className="text-[13px] font-500 text-[var(--text-primary)]">Coberta</p>
            <p className="text-[10.5px] font-300 text-[var(--text-tertiary)]">A quadra tem cobertura?</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={indoor}
            onClick={() => {
              setIndoor((v) => !v);
              touched();
            }}
            className={`relative h-5 w-9 rounded-full transition-colors focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ${
              indoor ? "bg-[var(--primary)]" : "bg-[var(--border-strong)]"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                indoor ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {error && <ErrorBanner message={error} />}
        {saved && <SuccessNote>Dados da quadra salvos.</SuccessNote>}

        <div className="flex justify-end border-t border-[var(--border)] pt-4">
          <button type="button" onClick={save} disabled={pending} className={primaryBtn}>
            {pending ? "Salvando…" : "Salvar"}
            <Check size={11} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

/* ══ reprice ══════════════════════════════════════════════════════════════ */

function RepriceSection({
  courtId,
  defaultPriceCents,
  onDone,
}: {
  courtId: string;
  defaultPriceCents: number | null | undefined;
  onDone: () => void;
}) {
  const [price, setPrice] = useState("");
  // The franchise default the BFF reported on load — updated locally after a
  // reprice so "último preço" is always visible without a refetch.
  const [currentDefault, setCurrentDefault] = useState<number | null>(defaultPriceCents ?? null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    setResult(null);
    const cents = reaisToCents(price);
    if (cents === null) {
      setError("Preço inválido. Use ex: 250 ou 250,50.");
      return;
    }
    startTransition(async () => {
      const res = await repriceCourtAction(courtId, cents);
      if (!res.ok) {
        setError(res.error ?? "Falha ao repreçar.");
        return;
      }
      setResult(res.slotsUpdated ?? 0);
      setCurrentDefault(cents);
      setPrice("");
      onDone();
    });
  }

  return (
    <SectionCard
      title="Repreçar"
      description="Aplica o novo preço a todos os horários futuros — disponíveis e bloqueados — e o grava como preço padrão da academia (herdado pelas próximas grades). Horários passados e reservas reais não são tocados."
    >
      <div className="space-y-4">
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-[12px] leading-snug text-[var(--text-secondary)]">
          Preço padrão atual:{" "}
          <span className="numeral text-[13px] text-[var(--text-primary)]">
            {currentDefault != null ? formatCurrency(currentDefault) : "nenhum — fórmula por horário"}
          </span>
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label htmlFor="reprice_value" className={labelClass}>
              Novo preço (R$)
            </label>
            <input
              id="reprice_value"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="ex: 250"
              className={fieldClass}
            />
          </div>
          <button type="button" onClick={submit} disabled={pending} className={primaryBtn}>
            {pending ? "Repreçando…" : "Repreçar"}
          </button>
        </div>

        {error && <ErrorBanner message={error} />}
        {result !== null && (
          <SuccessNote>
            {result.toLocaleString("pt-BR")} slot{result === 1 ? "" : "s"} repreçado
            {result === 1 ? "" : "s"}.
          </SuccessNote>
        )}
      </div>
    </SectionCard>
  );
}

/* ══ regenerate availability ══════════════════════════════════════════════ */

function RegenerateSection({ courtId, onDone }: { courtId: string; onDone: () => void }) {
  const [startHour, setStartHour] = useState(6);
  const [endHour, setEndHour] = useState(22);
  // Weekend windows start mirroring the weekday one; the action only sends
  // them when they actually differ, so equal values keep the request minimal.
  const [satStart, setSatStart] = useState(6);
  const [satEnd, setSatEnd] = useState(22);
  const [sunStart, setSunStart] = useState(6);
  const [sunEnd, setSunEnd] = useState(22);
  const [daysForward, setDaysForward] = useState(90);
  const [price, setPrice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ deleted: number; created: number } | null>(null);
  const [pending, startTransition] = useTransition();

  function requestConfirm() {
    setError("");
    setResult(null);
    if (startHour >= endHour) {
      setError("Hora de início deve ser menor que a hora de fim (Seg–Sex).");
      return;
    }
    if (satStart >= satEnd) {
      setError("Hora de início deve ser menor que a hora de fim (Sábado).");
      return;
    }
    if (sunStart >= sunEnd) {
      setError("Hora de início deve ser menor que a hora de fim (Domingo).");
      return;
    }
    const cents = reaisToCents(price);
    if (price.trim() !== "" && cents === null) {
      setError("Preço inválido. Use ex: 250 ou 250,50.");
      return;
    }
    setConfirming(true);
  }

  function confirm() {
    const cents = reaisToCents(price);
    startTransition(async () => {
      const res = await regenerateAvailabilityAction(courtId, {
        startHour,
        endHour,
        daysForward,
        priceCents: cents,
        saturday: { startHour: satStart, endHour: satEnd },
        sunday: { startHour: sunStart, endHour: sunEnd },
      });
      if (!res.ok) {
        setError(res.error ?? "Falha ao regerar disponibilidade.");
        setConfirming(false);
        return;
      }
      setResult({ deleted: res.slotsDeleted ?? 0, created: res.slotsCreated ?? 0 });
      setConfirming(false);
      onDone();
    });
  }

  return (
    <SectionCard
      title="Regerar disponibilidade"
      description="Apaga os horários futuros disponíveis e recria a grade horária. Horários reservados ou bloqueados são preservados."
    >
      <div className="space-y-4">
        <div className="max-w-[220px]">
          <label htmlFor="regen_days" className={labelClass}>
            Dias à frente
          </label>
          <input
            id="regen_days"
            type="number"
            min={1}
            max={365}
            value={daysForward}
            onChange={(e) => setDaysForward(Number(e.target.value))}
            className={fieldClass}
          />
        </div>

        {/* One window per day group — clubs run shorter weekends. */}
        <div className="space-y-2.5">
          {(
            [
              ["Seg–Sex", "regen_week", startHour, setStartHour, endHour, setEndHour],
              ["Sábado", "regen_sat", satStart, setSatStart, satEnd, setSatEnd],
              ["Domingo", "regen_sun", sunStart, setSunStart, sunEnd, setSunEnd],
            ] as const
          ).map(([label, idBase, start, setStart, end, setEnd]) => (
            <div key={idBase} className="grid grid-cols-[88px_1fr_1fr] items-center gap-3">
              <span className="label-colus text-[8.5px] text-[var(--text-tertiary)]">{label}</span>
              <div>
                <label htmlFor={`${idBase}_start`} className="sr-only">
                  Hora início {label}
                </label>
                <input
                  id={`${idBase}_start`}
                  type="number"
                  min={0}
                  max={22}
                  value={start}
                  onChange={(e) => setStart(Number(e.target.value))}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor={`${idBase}_end`} className="sr-only">
                  Hora fim {label}
                </label>
                <input
                  id={`${idBase}_end`}
                  type="number"
                  min={1}
                  max={23}
                  value={end}
                  onChange={(e) => setEnd(Number(e.target.value))}
                  className={fieldClass}
                />
              </div>
            </div>
          ))}
          <p className="text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
            Hora início · hora fim (última hora de começo de jogo) por grupo de dias.
          </p>
        </div>

        <div>
          <label htmlFor="regen_price" className={labelClass}>
            Preço (R$) — opcional, sobrepõe o padrão
          </label>
          <input
            id="regen_price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="ex: 250"
            className={fieldClass}
          />
        </div>

        {error && <ErrorBanner message={error} />}
        {result !== null && (
          <SuccessNote>
            {result.deleted.toLocaleString("pt-BR")} removido
            {result.deleted === 1 ? "" : "s"} / {result.created.toLocaleString("pt-BR")} criado
            {result.created === 1 ? "" : "s"}.
          </SuccessNote>
        )}

        {confirming ? (
          <div className="rounded-lg border border-[var(--color-clay)]/30 bg-[var(--color-warning-bg)] px-4 py-3.5">
            <p className="text-[12.5px] font-500 leading-snug text-[var(--color-clay)]">
              Isto apaga todos os horários futuros disponíveis desta quadra e recria a grade das{" "}
              {String(startHour).padStart(2, "0")}h às {String(endHour).padStart(2, "0")}h (Seg–Sex
              {satStart !== startHour || satEnd !== endHour
                ? `; Sáb ${String(satStart).padStart(2, "0")}h–${String(satEnd).padStart(2, "0")}h`
                : ""}
              {sunStart !== startHour || sunEnd !== endHour
                ? `; Dom ${String(sunStart).padStart(2, "0")}h–${String(sunEnd).padStart(2, "0")}h`
                : ""}
              ) pelos próximos {daysForward} dias. Reservas e bloqueios são mantidos.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="rounded-full bg-[var(--color-error)] px-4 py-1.5 text-[11.5px] font-600 text-white transition-opacity disabled:opacity-50"
              >
                {pending ? "Regerando…" : "Confirmar e regerar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-[11.5px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end border-t border-[var(--border)] pt-4">
            <button type="button" onClick={requestConfirm} disabled={pending} className={primaryBtn}>
              <RefreshCw size={11} strokeWidth={2.5} />
              Regerar
            </button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

/* ══ franchise ════════════════════════════════════════════════════════════ */

type FranchiseKind = "partner" | "public" | "listing";

const KIND_LABELS: Record<FranchiseKind, string> = {
  partner: "Parceira",
  public: "Pública",
  listing: "Diretório",
};

const KIND_HINTS: Record<FranchiseKind, string> = {
  partner: "Parceira: o app vende os slots reais cadastrados aqui, com os preços desta página.",
  public: "Pública: parque gratuito — o app sintetiza a grade livre (06h–22h, R$ 0).",
  listing: "Diretório: local não integrado — o app sintetiza a grade livre (06h–22h, R$ 0).",
};

function FranchiseSection({
  franchiseId,
  franchiseName,
  initialKind,
  initialDefaultPriceCents,
  initialLat,
  initialLng,
  initialAddress,
}: {
  franchiseId: string;
  franchiseName: string;
  initialKind: string;
  initialDefaultPriceCents: number | null | undefined;
  initialLat: number | null | undefined;
  initialLng: number | null | undefined;
  initialAddress: string | null | undefined;
}) {
  const [name, setName] = useState(franchiseName);
  const [price, setPrice] = useState("");
  const normalizedInitialKind: FranchiseKind = (
    ["partner", "public", "listing"] as const
  ).includes(initialKind as FranchiseKind)
    ? (initialKind as FranchiseKind)
    : "partner";
  const [kind, setKind] = useState<FranchiseKind>(normalizedInitialKind);
  // Baseline the dirty check compares against — advances on each successful
  // save, so re-picking the now-current type doesn't re-arm a stale confirm.
  const [lastSavedKind, setLastSavedKind] = useState<FranchiseKind>(normalizedInitialKind);
  // Touched-only, like geo — see updateFranchiseAction.
  const [kindDirty, setKindDirty] = useState(false);
  // Reclassifying re-semantizes the venue's grid in the app (synthesized free
  // vs real paid slots) — the save gates on an explicit confirm when kind moved.
  const [confirmingKind, setConfirmingKind] = useState(false);
  const [address, setAddress] = useState(initialAddress ?? "");
  const [lat, setLat] = useState(initialLat != null ? String(initialLat) : "");
  const [lng, setLng] = useState(initialLng != null ? String(initialLng) : "");
  // Only a touched pair is sent: Huma 422s on unknown body keys, so name/price
  // saves must keep working while the geo-aware BFF rolls out.
  const [geoDirty, setGeoDirty] = useState(false);
  // The address is persisted too (it feeds the app's invite/booking cards) —
  // what's in the field is what gets saved, under the same touched-only gate.
  const [addressDirty, setAddressDirty] = useState(false);
  // null = no search performed; [] = search returned nothing.
  const [candidates, setCandidates] = useState<GeocodeCandidate[] | null>(null);
  const [geoError, setGeoError] = useState("");
  const [geoPending, startGeoTransition] = useTransition();
  const [error, setError] = useState("");
  const [savedPrice, setSavedPrice] = useState<number | null | undefined>(
    initialDefaultPriceCents
  );
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function touched() {
    setSaved(false);
    setError("");
    // Any further edit invalidates a pending kind confirmation.
    setConfirmingKind(false);
  }

  function searchAddress() {
    // Explicit-button search, one request at a time (Enter bypasses the disabled
    // button) — the default provider is public Nominatim/OSM, ~1 req/s policy.
    if (geoPending) return;
    setGeoError("");
    setCandidates(null);
    const q = address.trim();
    if (!q) {
      setGeoError("Informe o endereço para buscar as coordenadas.");
      return;
    }
    // Mirrors the BFF's q length bounds (422 outside 3..300).
    if (q.length < 3) {
      setGeoError("Endereço muito curto — descreva rua, número e cidade.");
      return;
    }
    if (q.length > 300) {
      setGeoError("Endereço muito longo — máximo 300 caracteres.");
      return;
    }
    startGeoTransition(async () => {
      const res = await geocodeAction(q);
      if (!res.ok) {
        setGeoError(res.error ?? "Falha ao buscar o endereço.");
        return;
      }
      setCandidates(res.results ?? []);
    });
  }

  function pickCandidate(c: GeocodeCandidate) {
    setLat(String(c.lat));
    setLng(String(c.lng));
    setGeoDirty(true);
    // Adopt the canonical address so the app card can't contradict the pin —
    // saved together with lat/lng in the same PATCH.
    setAddress(c.formatted_address);
    setAddressDirty(true);
    setCandidates(null);
    setGeoError("");
    touched();
  }

  /** Fills both fields from a pasted "lat, lng" pair; false when it isn't one. */
  function applyPair(text: string): boolean {
    const pair = splitLatLngPair(text);
    if (!pair) return false;
    setLat(pair.lat);
    setLng(pair.lng);
    setGeoDirty(true);
    touched();
    return true;
  }

  async function pasteFromClipboard() {
    setError("");
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setError("Sem acesso à área de transferência — cole o par direto no campo Latitude (⌘V).");
      return;
    }
    if (!applyPair(text)) {
      setError('Não achei um par "lat, lng" no que foi copiado. Ex: -23.5936, -46.6731.');
    }
  }

  const latPreview = coordNumber(lat);
  const lngPreview = coordNumber(lng);
  const previewOk =
    Number.isFinite(latPreview) &&
    Math.abs(latPreview) <= 90 &&
    Number.isFinite(lngPreview) &&
    Math.abs(lngPreview) <= 180 &&
    // (0,0) is the "no coords" sentinel — never a real place to preview.
    !(latPreview === 0 && lngPreview === 0);

  function save() {
    setError("");
    setSaved(false);
    if (!name.trim()) {
      setError("Informe o nome da franquia.");
      return;
    }
    const cents = reaisToCents(price);
    if (price.trim() !== "" && cents === null) {
      setError("Preço padrão inválido. Use ex: 220 ou 220,50.");
      return;
    }
    // Always a complete pair; clearing is its own flag (a JSON null pair would
    // be silently ignored by the BFF) — see updateFranchiseAction.
    let geo: { lat: number; lng: number } | { clearGeo: true } | undefined;
    if (geoDirty) {
      const latEmpty = lat.trim() === "";
      const lngEmpty = lng.trim() === "";
      if (latEmpty !== lngEmpty) {
        setError("Preencha latitude E longitude — ou deixe ambas vazias para remover a localização.");
        return;
      }
      if (latEmpty) {
        geo = { clearGeo: true };
      } else {
        if (!Number.isFinite(latPreview) || Math.abs(latPreview) > 90) {
          setError("Latitude inválida — número entre -90 e 90 (ex: -23.5936).");
          return;
        }
        if (!Number.isFinite(lngPreview) || Math.abs(lngPreview) > 180) {
          setError("Longitude inválida — número entre -180 e 180 (ex: -46.6731).");
          return;
        }
        // The exact (0,0) pair is the app-wide "no coords" sentinel (unranked
        // in proximity sort); the BFF 400s it — catching here saves the trip.
        // Lone zeros (equator/Greenwich) stay valid.
        if (latPreview === 0 && lngPreview === 0) {
          setError("Coordenadas inválidas — o par (0, 0) é reservado para “sem localização”. Confira os valores.");
          return;
        }
        geo = { lat: latPreview, lng: lngPreview };
      }
    }
    // "" clears the street_address on the BFF, matching an emptied field.
    const addr = addressDirty ? address.trim() : undefined;
    // Kind change confirmed only explicitly: first save() shows the warning
    // box (whose confirm button calls save() again with the flag up).
    if (kindDirty && !confirmingKind) {
      setConfirmingKind(true);
      return;
    }
    setConfirmingKind(false);
    startTransition(async () => {
      const res = await updateFranchiseAction(franchiseId, {
        name: name.trim(),
        ...(cents != null ? { defaultPriceCents: cents } : {}),
        ...(kindDirty ? { kind } : {}),
        ...(geo ?? {}),
        ...(addr !== undefined ? { streetAddress: addr } : {}),
      });
      if (!res.ok || !res.franchise) {
        setError(res.error ?? "Falha ao salvar franquia.");
        return;
      }
      setKindDirty(false);
      setLastSavedKind(kind);
      setSaved(true);
      setSavedPrice(res.franchise.default_price_cents);
      setPrice("");
      if (addr !== undefined) {
        setAddressDirty(false);
        setAddress(addr);
      }
      if (geo) {
        setGeoDirty(false);
        if ("clearGeo" in geo) {
          setLat("");
          setLng("");
        } else {
          // Normalize what the staff typed (comma decimals etc.) to what was saved.
          setLat(String(geo.lat));
          setLng(String(geo.lng));
        }
      }
    });
  }

  return (
    <SectionCard
      title="Franquia"
      description="Edita a academia dona da quadra. O preço padrão é aplicado às quadras que não têm preço próprio; a localização posiciona a academia no app (distância e mapa)."
    >
      <div className="space-y-5">
        <div>
          <label htmlFor="franchise_name" className={labelClass}>
            Nome da franquia
          </label>
          <input
            id="franchise_name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              touched();
            }}
            placeholder="ex: PlayTennis Morumbi"
            className={fieldClass}
          />
        </div>

        <div>
          <p className={labelClass}>Tipo</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(KIND_LABELS) as FranchiseKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  setKindDirty(k !== lastSavedKind);
                  touched();
                }}
                aria-pressed={kind === k}
                className={`rounded-lg border px-3 py-1.5 text-[11.5px] font-600 transition-colors ${
                  kind === k
                    ? "border-[var(--primary)] bg-[var(--primary)]/8 text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                }`}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
            {KIND_HINTS[kind]}
          </p>
          {kindDirty && kind === "partner" && (
            <p className="mt-1.5 rounded-lg border border-[var(--color-clay)]/30 bg-[var(--color-warning-bg)] px-3 py-2 text-[11px] leading-snug text-[var(--color-clay)]">
              Ao virar parceira, o app deixa a grade sintetizada e passa a vender os slots reais —
              se a quadra estiver sem disponibilidade, gere a grade nesta página após salvar.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="franchise_price" className={labelClass}>
            Preço padrão da academia (R$)
          </label>
          <input
            id="franchise_price"
            inputMode="decimal"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              touched();
            }}
            placeholder="ex: 220"
            className={fieldClass}
          />
          <p className="mt-1 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
            {savedPrice !== undefined
              ? savedPrice == null
                ? "Preço padrão atual: nenhum. Deixe em branco para manter."
                : `Preço padrão atual: ${formatCurrency(savedPrice)}. Deixe em branco para manter.`
              : "A API não expõe o preço padrão atual na leitura; deixe em branco para não alterá-lo."}
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="franchise_address" className={labelInlineClass}>
              Localização
            </label>
            <button
              type="button"
              onClick={pasteFromClipboard}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-raised)] px-2.5 py-0.5 text-[10.5px] font-600 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <ClipboardPaste size={11} strokeWidth={2} />
              Colar &quot;lat, lng&quot;
            </button>
          </div>

          <div className="flex items-stretch gap-2">
            <input
              id="franchise_address"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setAddressDirty(true);
                setGeoError("");
                touched();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  searchAddress();
                }
              }}
              placeholder="Endereço — ex: Rua Girassol 555, Vila Madalena, São Paulo"
              className={cn(fieldClass, "flex-1")}
            />
            <button
              type="button"
              onClick={searchAddress}
              disabled={geoPending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--surface-raised)] px-3.5 text-[11.5px] font-600 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <Search size={12} strokeWidth={2} />
              {geoPending ? "Buscando…" : "Buscar coordenadas"}
            </button>
          </div>

          {geoError && <p className="mt-1.5 text-[11px] text-[var(--color-error)]">{geoError}</p>}

          {candidates !== null &&
            (candidates.length === 0 ? (
              <p className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-[11.5px] text-[var(--text-tertiary)]">
                Nenhum resultado — refine o endereço (rua, número, bairro, cidade).
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                {candidates.map((c) => (
                  <li key={`${c.lat},${c.lng},${c.formatted_address}`}>
                    <button
                      type="button"
                      onClick={() => pickCandidate(c)}
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-raised)]"
                    >
                      <MapPin size={12} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] text-[var(--text-primary)]">
                          {c.formatted_address}
                        </span>
                        <span className="block tabular-nums text-[10.5px] text-[var(--text-tertiary)]">
                          {c.lat}, {c.lng}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          <div className="mt-3 grid grid-cols-2 gap-3">
            <input
              id="franchise_lat"
              aria-label="Latitude"
              inputMode="decimal"
              value={lat}
              onChange={(e) => {
                setLat(e.target.value);
                setGeoDirty(true);
                touched();
              }}
              onPaste={(e) => {
                if (applyPair(e.clipboardData.getData("text"))) e.preventDefault();
              }}
              placeholder="Latitude — ex: -23.5936"
              className={fieldClass}
            />
            <input
              id="franchise_lng"
              aria-label="Longitude"
              inputMode="decimal"
              value={lng}
              onChange={(e) => {
                setLng(e.target.value);
                setGeoDirty(true);
                touched();
              }}
              onPaste={(e) => {
                if (applyPair(e.clipboardData.getData("text"))) e.preventDefault();
              }}
              placeholder="Longitude — ex: -46.6731"
              className={fieldClass}
            />
          </div>
          <p className="mt-1 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
            {previewOk ? (
              <a
                href={mapsUrl(latPreview, lngPreview)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-500 text-[var(--primary)] hover:underline"
              >
                <MapPin size={11} strokeWidth={2} />
                Conferir no Google Maps
              </a>
            ) : (
              "Busque pelo endereço acima (ele aparece nos cards do app), ou cole coordenadas do Google Maps. Lat/lng vazias = sem localização."
            )}
          </p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2">
          <p className="text-[10px] font-colus uppercase tracking-widest text-[var(--text-tertiary)]">
            Franchise ID
          </p>
          <p className="mt-1 font-mono text-[11px] text-[var(--text-secondary)]">{franchiseId}</p>
        </div>

        {error && <ErrorBanner message={error} />}
        {saved && <SuccessNote>Franquia salva.</SuccessNote>}

        {confirmingKind ? (
          <div className="rounded-lg border border-[var(--color-clay)]/30 bg-[var(--color-warning-bg)] px-4 py-3.5">
            <p className="text-[12.5px] font-500 leading-snug text-[var(--color-clay)]">
              Mudar o tipo de {KIND_LABELS[lastSavedKind]} para {KIND_LABELS[kind]} altera como o
              app vende/mostra os horários desta academia.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="rounded-full bg-[var(--color-clay)] px-4 py-1.5 text-[11.5px] font-600 text-white transition-opacity disabled:opacity-50"
              >
                {pending ? "Salvando…" : "Confirmar e salvar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingKind(false)}
                className="text-[11.5px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end border-t border-[var(--border)] pt-4">
            <button type="button" onClick={save} disabled={pending} className={primaryBtn}>
              {pending ? "Salvando…" : "Salvar franquia"}
              <Check size={11} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

/* ══ slot editor ══════════════════════════════════════════════════════════ */

function SlotRow({
  courtId,
  slot,
  onUpdated,
}: {
  courtId: string;
  slot: CourtSlotItem;
  onUpdated: (s: CourtSlotItem) => void;
}) {
  const [mode, setMode] = useState<"idle" | "blocking" | "pricing">("idle");
  const [reason, setReason] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const isBooked = slot.status === "booked";
  const isBlocked = slot.status === "blocked";

  function run(params: { status?: "available" | "blocked"; priceCents?: number; blockReason?: string }) {
    setError("");
    startTransition(async () => {
      const res = await updateCourtSlotAction(courtId, slot.slot_start, params);
      if (!res.ok || !res.slot) {
        setError(res.error ?? "Falha ao atualizar horário.");
        return;
      }
      onUpdated(res.slot);
      setMode("idle");
      setReason("");
      setPriceInput("");
    });
  }

  function confirmBlock() {
    run({ status: "blocked", ...(reason.trim() ? { blockReason: reason.trim() } : {}) });
  }

  function confirmPrice() {
    const cents = reaisToCents(priceInput);
    if (cents === null) {
      setError("Preço inválido. Use ex: 250 ou 250,50.");
      return;
    }
    run({ priceCents: cents });
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-[12.5px] font-500 text-[var(--text-primary)]">
            {hhmm(slot.slot_start)}–{hhmm(slot.slot_end)}
          </span>
          <span className="tabular-nums text-[12px] text-[var(--text-secondary)]">
            {priceLabel(slot.price_cents)}
          </span>
          <Badge variant={STATUS_VARIANT[slot.status] ?? "muted"}>
            {STATUS_LABEL[slot.status] ?? slot.status}
          </Badge>
        </div>

        {!isBooked && mode === "idle" && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setPriceInput(reaisFromCents(slot.price_cents));
                setMode("pricing");
              }}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] font-500 text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <Pencil size={11} strokeWidth={2} />
              Preço
            </button>
            {isBlocked ? (
              <button
                type="button"
                onClick={() => run({ status: "available", blockReason: "" })}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-success)]/40 px-2.5 py-1 text-[11px] font-500 text-[var(--color-success)] transition-colors hover:bg-[var(--color-success-bg)] disabled:opacity-50"
              >
                <LockOpen size={11} strokeWidth={2} />
                {pending ? "…" : "Desbloquear"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMode("blocking")}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-clay)]/40 px-2.5 py-1 text-[11px] font-500 text-[var(--color-clay)] transition-colors hover:bg-[var(--color-warning-bg)] disabled:opacity-50"
              >
                <Lock size={11} strokeWidth={2} />
                Bloquear
              </button>
            )}
          </div>
        )}
      </div>

      {slot.block_reason && mode === "idle" && (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--text-tertiary)]">
          Motivo: {slot.block_reason}
        </p>
      )}

      {mode === "blocking" && (
        <div className="mt-2.5 space-y-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (opcional) — ex: manutenção do piso"
            className={fieldClass}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={confirmBlock}
              disabled={pending}
              className="rounded-full bg-[var(--color-clay)] px-4 py-1.5 text-[11.5px] font-600 text-white transition-opacity disabled:opacity-50"
            >
              {pending ? "Bloqueando…" : "Bloquear"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setReason("");
                setError("");
              }}
              className="text-[11.5px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {mode === "pricing" && (
        <div className="mt-2.5 space-y-2">
          <input
            inputMode="decimal"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            placeholder="Novo preço (R$) — ex: 250"
            className={fieldClass}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={confirmPrice}
              disabled={pending}
              className="rounded-full bg-[var(--primary)] px-4 py-1.5 text-[11.5px] font-600 text-[var(--primary-fg)] transition-opacity disabled:opacity-50"
            >
              {pending ? "Salvando…" : "Salvar preço"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setPriceInput("");
                setError("");
              }}
              className="text-[11.5px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-[var(--color-error)]">{error}</p>}
    </li>
  );
}

function SlotEditorSection({
  courtId,
  slots,
  from,
  to,
  setFrom,
  setTo,
  onApply,
  pending,
  error,
  onSlotUpdated,
}: {
  courtId: string;
  slots: CourtSlotItem[];
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  onApply: () => void;
  pending: boolean;
  error: string;
  onSlotUpdated: (s: CourtSlotItem) => void;
}) {
  // Preserve the backend's oldest-first order while bucketing by local day.
  const groups: { key: string; label: string; items: CourtSlotItem[] }[] = [];
  for (const s of slots) {
    const key = dayKeyOf(s.slot_start);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: dayLabelOf(s.slot_start), items: [] };
      groups.push(g);
    }
    g.items.push(s);
  }

  return (
    <SectionCard
      title="Horários"
      description="Horários reservados são somente leitura. Disponíveis e bloqueados podem ter o preço editado, ser bloqueados ou desbloqueados."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="slots_from" className={labelClass}>
              De
            </label>
            <input
              id="slots_from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="slots_to" className={labelClass}>
              Até
            </label>
            <input
              id="slots_to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={fieldClass}
            />
          </div>
          <button
            type="button"
            onClick={onApply}
            disabled={pending}
            className="rounded-full bg-[var(--surface-raised)] px-4 py-2 text-[12.5px] font-600 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            {pending ? "Carregando…" : "Aplicar"}
          </button>
        </div>

        {error && <ErrorBanner message={error} />}

        {!error && groups.length === 0 ? (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-6 text-center text-[12.5px] text-[var(--text-tertiary)]">
            Nenhum horário neste intervalo.
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.key}>
                <p className="label-colus mb-2 text-[8.5px] text-[var(--text-tertiary)]">{g.label}</p>
                <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                  {g.items.map((s) => (
                    <SlotRow
                      key={s.slot_start}
                      courtId={courtId}
                      slot={s}
                      onUpdated={onSlotUpdated}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

/* ══ wipe slots ═══════════════════════════════════════════════════════════ */

function DeleteSlotsSection({ courtId, onDone }: { courtId: string; onDone: () => void }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ deleted: number; kept: number } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError("");
    startTransition(async () => {
      const res = await deleteCourtSlotsAction(courtId);
      if (!res.ok) {
        setError(res.error ?? "Falha ao apagar horários.");
        setArmed(false);
        return;
      }
      setResult({ deleted: res.slotsDeleted ?? 0, kept: res.bookedKept ?? 0 });
      setArmed(false);
      onDone();
    });
  }

  return (
    <SectionCard
      title="Apagar todos os horários"
      description="Remove a grade inteira desta quadra — disponíveis e bloqueados, passados e futuros — para recomeçar do zero (novo import ou nova grade). Horários com reserva real nunca são apagados."
    >
      <div className="space-y-4">
        {!armed ? (
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setArmed(true);
            }}
            className="rounded-md border border-[var(--color-error)]/40 px-4 py-2 text-[12px] font-500 text-[var(--color-error)] transition-colors hover:bg-[var(--color-error-bg)]"
          >
            Apagar todos os horários…
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[12px] leading-snug text-[var(--text-secondary)]">
              Tem certeza? Isso apaga toda a grade desta quadra. Não dá para desfazer — só
              recriando (import ou gerar grade).
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={run}
              className="rounded-md bg-[var(--color-error)] px-4 py-2 text-[12px] font-600 text-white transition-opacity disabled:opacity-50"
            >
              {pending ? "Apagando…" : "Confirmar exclusão"}
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              Cancelar
            </button>
          </div>
        )}

        {error && <ErrorBanner message={error} />}
        {result && (
          <SuccessNote>
            {result.deleted.toLocaleString("pt-BR")} horário{result.deleted === 1 ? "" : "s"}{" "}
            apagado{result.deleted === 1 ? "" : "s"}
            {result.kept > 0 && (
              <>
                {" "}
                · <strong>{result.kept} com reserva real mantidos</strong>
              </>
            )}
            .
          </SuccessNote>
        )}
      </div>
    </SectionCard>
  );
}

/* ══ add slots ════════════════════════════════════════════════════════════ */

function AddSlotsSection({ courtId, onDone }: { courtId: string; onDone: () => void }) {
  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;

  const [mode, setMode] = useState<"single" | "range">("single");
  const [date, setDate] = useState(todayYmd);
  const [rangeFrom, setRangeFrom] = useState(todayYmd);
  const [rangeTo, setRangeTo] = useState(todayYmd);
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [time, setTime] = useState("19:00");
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState("");
  const [free, setFree] = useState(false);
  const [status, setStatus] = useState<"available" | "blocked">("available");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleWeekday(idx: number) {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function buildSlots(): { slots: AddSlotInput[]; error?: string } {
    if (!/^\d{2}:\d{2}$/.test(time)) return { slots: [], error: "Informe a hora de início." };
    if (!Number.isFinite(duration) || duration <= 0) {
      return { slots: [], error: "Duração inválida (minutos)." };
    }
    const priceCents = free ? 0 : reaisToCents(price);
    if (!free && price.trim() !== "" && priceCents === null) {
      return { slots: [], error: "Preço inválido. Use ex: 250 ou 250,50." };
    }

    const dates: string[] = [];
    if (mode === "single") {
      if (!date) return { slots: [], error: "Informe a data." };
      dates.push(date);
    } else {
      if (!rangeFrom || !rangeTo) return { slots: [], error: "Informe o intervalo de datas." };
      const fromMs = ymdToUTC(rangeFrom);
      const toMs = ymdToUTC(rangeTo);
      if (toMs < fromMs) return { slots: [], error: "A data final deve ser igual ou após a inicial." };
      if (weekdays.size === 0) return { slots: [], error: "Selecione ao menos um dia da semana." };
      for (let ms = fromMs; ms <= toMs; ms += 86_400_000) {
        if (weekdays.has(new Date(ms).getUTCDay())) dates.push(utcToYmd(ms));
      }
      if (dates.length === 0) {
        return { slots: [], error: "Nenhuma data no intervalo bate com os dias escolhidos." };
      }
      if (dates.length > 366) {
        return { slots: [], error: "Muitos horários de uma vez (máx. 366). Reduza o intervalo." };
      }
    }

    const slots: AddSlotInput[] = dates.map((d) => {
      const startMs = spStartMs(d, time);
      return {
        slot_start: new Date(startMs).toISOString(),
        slot_end: new Date(startMs + duration * 60_000).toISOString(),
        ...(priceCents != null ? { price_cents: priceCents } : {}),
        status,
      };
    });
    return { slots };
  }

  function submit() {
    setError("");
    setResult(null);
    const built = buildSlots();
    if (built.error) {
      setError(built.error);
      return;
    }
    startTransition(async () => {
      const res = await addCourtSlotsAction(courtId, built.slots);
      if (!res.ok) {
        setError(res.error ?? "Falha ao adicionar horários.");
        return;
      }
      setResult({ created: res.slotsCreated ?? 0, skipped: res.slotsSkipped ?? 0 });
      onDone();
      // Keep the form primed for the next add; in single mode advance to the slot
      // that starts where this one ended, so consecutive hours go in fast.
      if (mode === "single") {
        const next = spParts(spStartMs(date, time) + duration * 60_000);
        setDate(next.ymd);
        setTime(next.hm);
      }
    });
  }

  const previewCents = free ? 0 : reaisToCents(price);
  const priceHint = free
    ? "Grátis — R$ 0,00"
    : previewCents != null
      ? formatCurrency(previewCents)
      : "preço padrão da quadra";

  return (
    <SectionCard
      title="Adicionar horário"
      description="Cria horários avulsos em qualquer data e hora, fora da grade automática. Horários já existentes no mesmo instante são ignorados."
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          {(
            [
              ["single", "Um horário"],
              ["range", "Vários dias"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-1.5 text-[11.5px] font-600 transition-colors ${
                mode === m
                  ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "single" ? (
          <div>
            <label htmlFor="add_date" className={labelClass}>
              Data
            </label>
            <input
              id="add_date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="add_from" className={labelClass}>
                  De
                </label>
                <input
                  id="add_from"
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="add_to" className={labelClass}>
                  Até
                </label>
                <input
                  id="add_to"
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
            <div>
              <p className={labelClass}>Dias da semana</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((w) => {
                  const on = weekdays.has(w.idx);
                  return (
                    <button
                      key={w.idx}
                      type="button"
                      onClick={() => toggleWeekday(w.idx)}
                      aria-pressed={on}
                      className={`rounded-md border px-2.5 py-1 text-[11px] font-600 transition-colors ${
                        on
                          ? "border-[var(--primary)] bg-[var(--primary)]/8 text-[var(--primary)]"
                          : "border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="add_time" className={labelClass}>
              Hora início
            </label>
            <input
              id="add_time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="add_duration" className={labelClass}>
              Duração (min)
            </label>
            <input
              id="add_duration"
              type="number"
              min={15}
              step={15}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="add_price" className={labelInlineClass}>
              Preço (R$)
            </label>
            <GratisToggle active={free} onToggle={() => setFree((v) => !v)} />
          </div>
          <input
            id="add_price"
            inputMode="decimal"
            value={free ? "" : price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={free}
            placeholder={free ? "Grátis — R$ 0,00" : "ex: 250 (vazio = padrão)"}
            className={cn(fieldClass, free && "opacity-60")}
          />
          <p className="mt-1 text-[10.5px] font-300 text-[var(--text-tertiary)]">
            Preço aplicado: {priceHint}.
          </p>
        </div>

        <div>
          <p className={labelClass}>Status</p>
          <div className="flex gap-2">
            {(
              [
                ["available", "Disponível"],
                ["blocked", "Bloqueado"],
              ] as const
            ).map(([s, label]) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-lg border px-3 py-1.5 text-[11.5px] font-600 transition-colors ${
                  status === s
                    ? "border-[var(--primary)] bg-[var(--primary)]/8 text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && <ErrorBanner message={error} />}
        {result !== null && (
          <SuccessNote>
            {result.created.toLocaleString("pt-BR")} horário{result.created === 1 ? "" : "s"}{" "}
            adicionado{result.created === 1 ? "" : "s"}
            {result.skipped > 0
              ? ` / ${result.skipped.toLocaleString("pt-BR")} já existia${
                  result.skipped === 1 ? "" : "m"
                }`
              : ""}
            .
          </SuccessNote>
        )}

        <div className="flex justify-end border-t border-[var(--border)] pt-4">
          <button type="button" onClick={submit} disabled={pending} className={primaryBtn}>
            {pending ? "Adicionando…" : "Adicionar"}
            <Plus size={11} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

/* ══ root ═════════════════════════════════════════════════════════════════ */

export function EditCourt({
  court,
  initialSlots,
  initialSlotsError,
  initialFrom,
  initialTo,
}: {
  court: CourtListItem;
  initialSlots: CourtSlotItem[];
  initialSlotsError?: string;
  initialFrom: string;
  initialTo: string;
}) {
  const [slots, setSlots] = useState<CourtSlotItem[]>(initialSlots);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [slotsError, setSlotsError] = useState(initialSlotsError ?? "");
  const [pending, startTransition] = useTransition();

  function reloadSlots() {
    startTransition(async () => {
      setSlotsError("");
      const res = await listCourtSlotsAction(court.id, dayStartISO(from), dayEndISO(to));
      if (!res.ok) {
        setSlotsError(res.error ?? "Falha ao carregar horários.");
        return;
      }
      setSlots(res.slots ?? []);
    });
  }

  function handleSlotUpdated(updated: CourtSlotItem) {
    setSlots((prev) => prev.map((s) => (s.slot_start === updated.slot_start ? updated : s)));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Directory listings serve the kind-based synthesized free grid in-app,
          so the price/slot tools below do not change what users see today. One
          banner up top beats repeating the caveat in every pricing section. */}
      {court.franchise_kind === "listing" && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Local do diretório: o app exibe a grade sintetizada gratuita (06h–22h, R$&nbsp;0),
          independente dos slots e preços cadastrados aqui. As ferramentas seguem editáveis para
          quando o local virar parceiro.
        </p>
      )}
      <CourtBasicsSection court={court} />
      <RepriceSection
        courtId={court.id}
        defaultPriceCents={court.franchise_default_price_cents}
        onDone={reloadSlots}
      />
      <RegenerateSection courtId={court.id} onDone={reloadSlots} />
      {/* "#academia" — the courts list deep-links here via "Editar academia". */}
      <span id="academia" className="block scroll-mt-6" aria-hidden />
      <FranchiseSection
        franchiseId={court.franchise_id}
        franchiseName={court.franchise_name}
        initialKind={court.franchise_kind}
        initialDefaultPriceCents={court.franchise_default_price_cents}
        initialLat={court.franchise_lat}
        initialLng={court.franchise_lng}
        initialAddress={court.franchise_street_address}
      />
      <AddSlotsSection courtId={court.id} onDone={reloadSlots} />
      <ImportPrintSection courtId={court.id} courtName={court.name} onDone={reloadSlots} />
      <SlotEditorSection
        courtId={court.id}
        slots={slots}
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        onApply={reloadSlots}
        pending={pending}
        error={slotsError}
        onSlotUpdated={handleSlotUpdated}
      />
      <DeleteSlotsSection courtId={court.id} onDone={reloadSlots} />
    </div>
  );
}
