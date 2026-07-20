"use client";

import { useState, useTransition, type ReactNode } from "react";
import { AlertCircle, Check, Lock, LockOpen, Pencil, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, reaisToCents } from "@/lib/utils";
import type { CourtListItem } from "../../actions";
import {
  regenerateAvailabilityAction,
  repriceCourtAction,
  updateCourtAction,
  updateCourtSlotAction,
  updateFranchiseAction,
  listCourtSlotsAction,
  type CourtSlotItem,
} from "./actions";

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

function dayEndISO(y: string): string {
  return new Date(`${y}T23:59:59.999`).toISOString();
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

function RepriceSection({ courtId, onDone }: { courtId: string; onDone: () => void }) {
  const [price, setPrice] = useState("");
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
      setPrice("");
      onDone();
    });
  }

  return (
    <SectionCard
      title="Repreçar"
      description="Aplica o novo preço a todos os horários futuros ainda disponíveis. Horários passados, reservados ou bloqueados não são tocados."
    >
      <div className="space-y-4">
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
      setError("Hora de início deve ser menor que a hora de fim.");
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
        <div className="grid grid-cols-3 gap-3">
          <div>
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
          <div>
            <label htmlFor="regen_start" className={labelClass}>
              Hora início
            </label>
            <input
              id="regen_start"
              type="number"
              min={0}
              max={22}
              value={startHour}
              onChange={(e) => setStartHour(Number(e.target.value))}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="regen_end" className={labelClass}>
              Hora fim
            </label>
            <input
              id="regen_end"
              type="number"
              min={1}
              max={23}
              value={endHour}
              onChange={(e) => setEndHour(Number(e.target.value))}
              className={fieldClass}
            />
          </div>
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
              {String(startHour).padStart(2, "0")}h às {String(endHour).padStart(2, "0")}h pelos
              próximos {daysForward} dias. Reservas e bloqueios são mantidos.
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

function FranchiseSection({
  franchiseId,
  franchiseName,
}: {
  franchiseId: string;
  franchiseName: string;
}) {
  const [name, setName] = useState(franchiseName);
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [savedPrice, setSavedPrice] = useState<number | null | undefined>(undefined);
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
      setError("Informe o nome da franquia.");
      return;
    }
    const cents = reaisToCents(price);
    if (price.trim() !== "" && cents === null) {
      setError("Preço padrão inválido. Use ex: 220 ou 220,50.");
      return;
    }
    startTransition(async () => {
      const res = await updateFranchiseAction(franchiseId, {
        name: name.trim(),
        ...(cents != null ? { defaultPriceCents: cents } : {}),
      });
      if (!res.ok || !res.franchise) {
        setError(res.error ?? "Falha ao salvar franquia.");
        return;
      }
      setSaved(true);
      setSavedPrice(res.franchise.default_price_cents);
      setPrice("");
    });
  }

  return (
    <SectionCard
      title="Franquia"
      description="Edita a academia dona da quadra. O preço padrão é aplicado às quadras que não têm preço próprio."
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

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2">
          <p className="text-[10px] font-colus uppercase tracking-widest text-[var(--text-tertiary)]">
            Franchise ID
          </p>
          <p className="mt-1 font-mono text-[11px] text-[var(--text-secondary)]">{franchiseId}</p>
        </div>

        {error && <ErrorBanner message={error} />}
        {saved && <SuccessNote>Franquia salva.</SuccessNote>}

        <div className="flex justify-end border-t border-[var(--border)] pt-4">
          <button type="button" onClick={save} disabled={pending} className={primaryBtn}>
            {pending ? "Salvando…" : "Salvar franquia"}
            <Check size={11} strokeWidth={2.5} />
          </button>
        </div>
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
      <CourtBasicsSection court={court} />
      <RepriceSection courtId={court.id} onDone={reloadSlots} />
      <RegenerateSection courtId={court.id} onDone={reloadSlots} />
      <FranchiseSection franchiseId={court.franchise_id} franchiseName={court.franchise_name} />
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
    </div>
  );
}
