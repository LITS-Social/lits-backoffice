"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  RefreshCw,
  ClipboardPaste,
  MapPin,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourtListItem } from "../../actions";
import {
  deleteCourtSlotsAction,
  regenerateAvailabilityAction,
  geocodeAction,
  updateCourtAction,
  updateFranchiseAction,
  type GeocodeCandidate,
} from "./actions";
import { ImportPrintSection } from "./import-print";
import { AcademiaCalendar } from "../../../academias/[id]/calendar";
import { initialWindows, type HourWindows } from "../../../academias/[id]/academia";
import { PriceTableSection } from "../../../academias/[id]/price-table";
import { reapplySavedTable } from "../../../academias/[id]/price-table-store";

type Surface = "clay" | "hard" | "grass" | "beach" | "carpet";

const SURFACE_LABELS: Record<Surface, string> = {
  clay: "Saibro",
  hard: "Duro",
  grass: "Grama",
  beach: "Areia",
  carpet: "Carpete",
};

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors placeholder:font-300 placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";

const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";

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
    <section className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
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
  "inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50";

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

/* ── add-slots helpers ────────────────────────────────────────────────────── */

// São Paulo is UTC-3 with no DST, so a fixed offset turns a picked wall-clock
// date+time into the exact absolute instant the backend stores (RFC3339 Z),
// independent of whatever timezone the staff's browser is in.
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

/* ══ preço por faixa de horário ═══════════════════════════════════════════ */

/**
 * Preço de uma FAIXA — "o horário nobre custa mais". A seção acima põe um
 * preço só na quadra inteira; esta cobra diferente por hora do dia, que é como
 * clube de verdade preça.
 *
 * Os dias da semana são opcionais: nenhum marcado = todos. Reserva real fica
 * de fora por regra (o preço de um jogo vendido é o que o jogador combinou),
 * e a tela diz quantas foram puladas em vez de omitir.
 */
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

/* ══ definições da academia ═══════════════════════════════════════════════ */

/** Uma linha de configuração: rótulo e ajuda à esquerda, controle à direita.
    É o formato de tela de ajustes que o operador já conhece de fora daqui
    (Linear · Settings, Stripe · Business details, Vercel · Project settings):
    a coluna da esquerda vira um índice que se lê de cima a baixo sem entrar
    em nenhum campo, e cada linha ocupa a altura do que ela precisa. Os dois
    cards antigos empilhavam rótulo sobre campo, e a página ficava com o dobro
    da altura para a mesma informação. */
function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-x-6 gap-y-2 border-t border-[var(--border)] py-4 first:border-t-0 first:pt-0 sm:grid-cols-[168px_minmax(0,1fr)]">
      <div className="sm:pt-2">
        <p className="text-[12px] font-500 text-[var(--text-primary)]">{label}</p>
        {hint && (
          <p className="mt-0.5 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
            {hint}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Tudo que é da ACADEMIA num card só: nome, tipo, localização e horário de
 * funcionamento — com UM botão de salvar.
 *
 * Eram dois cards com dois botões, e a divisão não tinha razão de ser: os dois
 * gravavam a mesma franquia, pela mesma ação. Quem mudava o nome e o horário
 * na mesma visita tinha que lembrar de salvar duas vezes, e esquecer um deles
 * era silencioso.
 *
 * "Aplicar grade em todas as quadras" fica junto, mas separado por uma régua e
 * fora do botão principal: salvar é registrar a janela; aplicar RECRIA a grade
 * de todas as quadras. São gestos de peso diferente e não devem parecer o
 * mesmo botão.
 */
export function FranchiseSection({
  franchiseId,
  franchiseName,
  initialKind,
  initialLat,
  initialLng,
  initialAddress,
  courts,
  onApplied,
}: {
  franchiseId: string;
  franchiseName: string;
  initialKind: string;
  initialLat: number | null | undefined;
  initialLng: number | null | undefined;
  initialAddress: string | null | undefined;
  courts: CourtListItem[];
  onApplied: () => void;
}) {
  const [name, setName] = useState(franchiseName);
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
  // Only a touched pair is sent: Huma 422s on unknown body keys, so the other
  // fields keep saving while the geo-aware BFF rolls out.
  const [geoDirty, setGeoDirty] = useState(false);
  // The address is persisted too (it feeds the app's invite/booking cards) —
  // what's in the field is what gets saved, under the same touched-only gate.
  const [addressDirty, setAddressDirty] = useState(false);
  // null = no search performed; [] = search returned nothing.
  const [candidates, setCandidates] = useState<GeocodeCandidate[] | null>(null);
  const [geoError, setGeoError] = useState("");
  const [geoPending, startGeoTransition] = useTransition();
  // As janelas de funcionamento — a grade de todas as quadras as segue.
  const [hours, setHours] = useState<HourWindows>(() => initialWindows(courts[0]));
  const [confirmingApply, setConfirmingApply] = useState(false);
  const [applyNote, setApplyNote] = useState("");
  const [applying, startApplying] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  /** As horas que a régua mostra. Fora de 5h–23h nenhuma academia opera, e
      cada coluna a mais encolhe as outras. */
  const HOUR_RULER = Array.from({ length: 19 }, (_, i) => i + 5);

  /** Move a borda MAIS PRÓXIMA da hora clicada. Um clique só, sem modo: fora
      da janela ela cresce, dentro ela encolhe pelo lado mais perto. A janela
      nunca fecha — o fim fica ao menos uma hora depois do início. */
  function moveEdge(ks: "weekStart" | "satStart" | "sunStart", ke: "weekEnd" | "satEnd" | "sunEnd", h: number) {
    touched();
    setHours((cur: HourWindows) => {
      const s = cur[ks];
      const e = cur[ke];
      if (h <= s) return { ...cur, [ks]: Math.min(h, e - 1) };
      if (h >= e) return { ...cur, [ke]: Math.max(h, s + 1) };
      return h - s <= e - h
        ? { ...cur, [ks]: Math.min(h, e - 1) }
        : { ...cur, [ke]: Math.max(h, s + 1) };
    });
  }

  const HOUR_ROWS = [
    ["Segunda a sexta", "weekStart", "weekEnd"],
    ["Sábado", "satStart", "satEnd"],
    ["Domingo", "sunStart", "sunEnd"],
  ] as const;

  function touched() {
    setSaved(false);
    setError("");
    setApplyNote("");
    // Any further edit invalidates a pending confirmation.
    setConfirmingKind(false);
    setConfirmingApply(false);
  }

  /** "" quando as janelas fazem sentido; a queixa, quando não. */
  function hoursProblem(): string {
    for (const [label, ks, ke] of HOUR_ROWS) {
      if (hours[ks] < 0 || hours[ks] > 22 || hours[ke] < 1 || hours[ke] > 23 || hours[ks] >= hours[ke])
        return `${label}: início deve ser antes do fim (início 0–22, fim 1–23).`;
    }
    return "";
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
      setError("Informe o nome da academia.");
      return;
    }
    const hp = hoursProblem();
    if (hp) {
      setError(hp);
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
        hours,
        ...(kindDirty ? { kind } : {}),
        ...(geo ?? {}),
        ...(addr !== undefined ? { streetAddress: addr } : {}),
      });
      if (!res.ok || !res.franchise) {
        setError(res.error ?? "Falha ao salvar a academia.");
        return;
      }
      setKindDirty(false);
      setLastSavedKind(kind);
      setSaved(true);
      if (addr !== undefined) {
        setAddressDirty(false);
        setAddress(addr);
      }
      if (geo) {
        setGeoDirty(false);
        if ("clearGeo" in geo) {
          setLat("");
          setLng("");
        }
      }
    });
  }

  function applyGrid() {
    const hp = hoursProblem();
    if (hp) {
      setError(hp);
      setConfirmingApply(false);
      return;
    }
    // Horizonte fixo: um mês rolante — não é decisão do operador.
    const daysForward = 30;
    setError("");
    setApplyNote("");
    setConfirmingApply(false);
    startApplying(async () => {
      // Sequential on purpose: each regenerate is a whole-court rewrite; a
      // clear per-court failure beats a pile of interleaved errors.
      let created = 0;
      let deleted = 0;
      const failures: string[] = [];
      for (const c of courts) {
        const res = await regenerateAvailabilityAction(c.id, {
          startHour: hours.weekStart,
          endHour: hours.weekEnd,
          daysForward,
          saturday: { startHour: hours.satStart, endHour: hours.satEnd },
          sunday: { startHour: hours.sunStart, endHour: hours.sunEnd },
        });
        if (res.ok) {
          created += res.slotsCreated ?? 0;
          deleted += res.slotsDeleted ?? 0;
        } else {
          failures.push(`${c.name}: ${res.error ?? "falha"}`);
        }
      }
      if (failures.length > 0) setError(failures.join(" · "));
      if (failures.length < courts.length) {
        // A grade nova nasce toda no preço padrão da quadra; as FAIXAS não
        // existem para o gerador, que só conhece um preço. Reaplicar a tabela
        // guardada é o que faz "horário novo já sai no padrão" ser verdade —
        // e cada quadra segue a tabela do SEU tipo, coberta ou descoberta.
        const done = courts.filter((c) => !failures.some((f) => f.startsWith(`${c.name}:`)));
        const priced = await reapplySavedTable(franchiseId, done);
        setApplyNote(
          `Grade aplicada em ${courts.length - failures.length} de ${courts.length} quadras — ` +
            `${created} horários criados (bloqueados), ${deleted} antigos removidos (reservas reais preservadas).` +
            (priced
              ? ` A tabela de preços foi reaplicada: ${priced.slots.toLocaleString("pt-BR")} horários já saíram no padrão.`
              : "")
        );
        onApplied();
      }
    });
  }

  return (
    <SectionCard
      title="A academia"
      description="Nome, tipo, localização e horário de funcionamento. Um salvar para tudo; os preços ficam na tabela abaixo."
    >
      <div>
        <SettingRow label="Nome">
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
        </SettingRow>

        <SettingRow label="Tipo" hint={KIND_HINTS[kind]}>
          <div className="flex flex-wrap gap-1.5">
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
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[11.5px] font-500 transition-colors",
                  kind === k
                    ? "border-[var(--primary)] bg-[var(--primary)]/12 text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                )}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
          {kindDirty && kind === "partner" && (
            <p className="mt-2 rounded-lg border border-[var(--color-clay)]/30 bg-[var(--color-warning-bg)] px-3 py-2 text-[11px] leading-snug text-[var(--color-clay)]">
              Ao virar parceira, o app deixa a grade sintetizada e passa a vender os slots reais —
              se as quadras estiverem sem disponibilidade, aplique a grade depois de salvar.
            </p>
          )}
        </SettingRow>

        <SettingRow
          label="Localização"
          hint="Posiciona a academia no app — distância e mapa. O endereço aparece nos cards."
        >
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
              placeholder="Rua Girassol 555, Vila Madalena, São Paulo"
              className={cn(fieldClass, "flex-1")}
            />
            <button
              type="button"
              onClick={searchAddress}
              disabled={geoPending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--surface-raised)] px-3 text-[11.5px] font-500 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <Search size={12} strokeWidth={2} />
              {geoPending ? "Buscando…" : "Buscar"}
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

          <div className="mt-2 flex flex-wrap items-center gap-2">
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
              placeholder="-23.5936"
              className={cn(fieldClass, "w-[130px] tabular-nums")}
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
              placeholder="-46.6731"
              className={cn(fieldClass, "w-[130px] tabular-nums")}
            />
            {previewOk ? (
              <a
                href={mapsUrl(latPreview, lngPreview)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10.5px] font-500 text-[var(--primary)] hover:underline"
              >
                <MapPin size={11} strokeWidth={2} />
                Conferir no mapa
              </a>
            ) : (
              <button
                type="button"
                onClick={pasteFromClipboard}
                className="inline-flex items-center gap-1 text-[10.5px] font-500 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
              >
                <ClipboardPaste size={11} strokeWidth={2} />
                Colar &quot;lat, lng&quot;
              </button>
            )}
          </div>
        </SettingRow>

        <SettingRow
          label="Funcionamento"
          hint={
            <>
              Clique numa hora para mover a borda mais perto. A grade de{" "}
              <strong>todas as quadras</strong> segue estas janelas.
            </>
          }
        >
          {/* A régua: as horas são COLUNAS, os grupos de dias são linhas, e a
              janela aberta é uma barra cheia. Antes eram seis campos numéricos
              com um "às" no meio e a janela resultante escrita ao lado — o
              operador tinha que montar a imagem de cabeça para conferir se
              sábado abria mais cedo que domingo. Agora ele vê.

              Um clique só, sem modo: a borda mais próxima da hora clicada é
              que se move. Clique fora da janela, ela cresce; clique dentro,
              ela encolhe do lado mais perto. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] border-separate border-spacing-[2px]">
              <thead>
                <tr>
                  <th className="w-[86px]" />
                  {HOUR_RULER.map((h) => (
                    <th
                      key={h}
                      className="numeral pb-1 text-[9px] font-300 text-[var(--text-tertiary)]"
                    >
                      {h % 2 === 0 ? h : ""}
                    </th>
                  ))}
                  <th className="w-[58px]" />
                </tr>
              </thead>
              <tbody>
                {HOUR_ROWS.map(([label, ks, ke]) => (
                  <tr key={label}>
                    <th className="pr-2 text-right text-[11px] font-400 text-[var(--text-secondary)]">
                      {label}
                    </th>
                    {HOUR_RULER.map((h) => {
                      const open = h >= hours[ks] && h <= hours[ke];
                      const edge = h === hours[ks] || h === hours[ke];
                      return (
                        <td key={h} className="p-0">
                          <button
                            type="button"
                            aria-label={`${label} — ${h}h`}
                            aria-pressed={open}
                            onClick={() => moveEdge(ks, ke, h)}
                            className={cn(
                              "block h-6 w-full rounded-[2px] transition-colors",
                              open
                                ? edge
                                  ? "bg-[var(--primary)]"
                                  : "bg-[var(--primary)]/45 hover:bg-[var(--primary)]/60"
                                : "bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)]"
                            )}
                          />
                        </td>
                      );
                    })}
                    <th className="numeral pl-2 text-left text-[10.5px] font-400 text-[var(--text-primary)]">
                      {String(hours[ks]).padStart(2, "0")}–{String(hours[ke] + 1).padStart(2, "0")}h
                    </th>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingRow>

        <SettingRow label="ID" hint="A chave desta academia no banco.">
          <p className="font-mono text-[11px] text-[var(--text-tertiary)]">{franchiseId}</p>
        </SettingRow>
      </div>

      <div className="mt-4 space-y-3">
        {error && <ErrorBanner message={error} />}
        {saved && <SuccessNote>Academia salva.</SuccessNote>}
        {applyNote && <SuccessNote>{applyNote}</SuccessNote>}

        {confirmingKind && (
          <div className="rounded-lg border border-[var(--color-clay)]/30 bg-[var(--color-warning-bg)] px-4 py-3.5">
            <p className="text-[12.5px] font-500 leading-snug text-[var(--color-clay)]">
              Mudar o tipo de {KIND_LABELS[lastSavedKind]} para {KIND_LABELS[kind]} altera como o
              app vende e mostra os horários desta academia.
            </p>
            <div className="mt-3 flex items-center gap-3">
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
        )}

        {confirmingApply && (
          <div className="rounded-lg border border-[var(--color-clay)]/30 bg-[var(--color-warning-bg)] px-4 py-3.5">
            <p className="text-[12.5px] font-500 leading-snug text-[var(--color-clay)]">
              Isto RECRIA a grade das {courts.length} quadras nos próximos 30 dias, inteira
              bloqueada — os horários voltam a vender pelo import do print ou pelo calendário.
              Reservas reais nunca são apagadas.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={applyGrid}
                disabled={applying}
                className="rounded-full bg-[var(--color-clay)] px-4 py-1.5 text-[11.5px] font-600 text-white transition-opacity disabled:opacity-50"
              >
                {applying ? "Aplicando…" : "Recriar a grade"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingApply(false)}
                className="text-[11.5px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {!confirmingKind && !confirmingApply && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
            {/* Um gesto de peso maior, e por isso longe do botão principal:
                salvar registra a janela; aplicar recria a grade inteira. */}
            <button
              type="button"
              onClick={() => setConfirmingApply(true)}
              disabled={applying || courts.length === 0}
              className="inline-flex items-center gap-1.5 text-[11px] font-500 text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-clay)] disabled:opacity-50"
            >
              <RefreshCw size={11} strokeWidth={2} />
              {applying ? "Aplicando grade…" : "Aplicar grade em todas as quadras"}
            </button>
            <button type="button" onClick={save} disabled={pending} className={primaryBtn}>
              {pending ? "Salvando…" : "Salvar"}
              <Check size={11} strokeWidth={2.5} />
            </button>
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

/* ══ root ═════════════════════════════════════════════════════════════════ */

export function EditCourt({ court }: { court: CourtListItem }) {
  // Remonta o calendário depois de toda reescrita de grade — ele busca a
  // própria janela, então trocar a key é o jeito honesto de forçar o refetch.
  const [calendarEpoch, setCalendarEpoch] = useState(0);

  function reloadSlots() {
    setCalendarEpoch((v) => v + 1);
  }

  /** Depois de CRIAR horários, a tabela da academia volta por cima deles.
      A grade nova nasce toda no preço padrão da quadra — as faixas não existem
      para o gerador, que só conhece um preço. Sem isto, todo dia novo entrava
      chapado e o horário nobre tinha que ser remarcado à mão. A quadra segue a
      tabela do SEU tipo: coberta ou descoberta. */
  const [repriceNote, setRepriceNote] = useState("");
  async function slotsCreated() {
    const res = await reapplySavedTable(court.franchise_id, [court]);
    setRepriceNote(
      res && res.slots > 0
        ? `A tabela de preços da academia foi reaplicada — ${res.slots.toLocaleString("pt-BR")} horários já saíram no padrão.`
        : ""
    );
    reloadSlots();
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
      {/* A MESMA tabela da academia, com uma quadra só: base, faixas, prévia e
          um botão. Antes eram duas seções — "Preço" e "Preço por faixa" — que
          não conversavam entre si e não mostravam o resultado antes de gravar.
          O horário de funcionamento saiu daqui: ele é da ACADEMIA, e editá-lo
          por dentro de uma quadra dava a impressão de valer só para ela. */}
      <PriceTableSection
        courts={[court]}
        windows={initialWindows(court)}
        onDone={slotsCreated}
        singleCourt
      />
      <ImportPrintSection courtId={court.id} courtName={court.name} onDone={slotsCreated} />
      {repriceNote && (
        <p className="flex items-center gap-2 rounded-lg border border-[var(--color-success)]/25 bg-[var(--color-success-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-success)]">
          <Check size={13} strokeWidth={2.5} className="shrink-0" />
          {repriceNote}
        </p>
      )}
      {/* O MESMO calendário da academia, só que com uma coluna: o operador que
          aprendeu a grade lá não reaprende nada aqui. A lista vertical antiga
          mostrava um dia de cada vez em linhas soltas e não deixava comparar
          horas na mesma tela. */}
      <AcademiaCalendar
        key={calendarEpoch}
        courts={[court]}
        windows={initialWindows(court)}
        title="Calendário desta quadra"
        description={
          <>
            A grade desta quadra, hora a hora, um dia por vez. Clique numa célula para alternar{" "}
            <strong>disponível ↔ bloqueado</strong>; célula vazia vira disponível. Horários com
            reserva real ficam travados.
          </>
        }
      />
      <DeleteSlotsSection courtId={court.id} onDone={reloadSlots} />
    </div>
  );
}
