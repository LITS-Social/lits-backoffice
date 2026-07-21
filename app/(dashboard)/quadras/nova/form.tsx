"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, ChevronRight, Plus } from "lucide-react";
import { cn, reaisToCents } from "@/lib/utils";
import {
  createFranchiseAction,
  createCourtAction,
  type FranchiseItem,
  type CreateCourtState,
} from "./actions";

type Surface = "clay" | "hard" | "grass" | "beach" | "carpet";
type Step = "franchise" | "court" | "done";
type FranchiseMode = "existing" | "new";

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

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-error)]">
      <AlertCircle size={13} className="mt-px shrink-0" />
      {message}
    </p>
  );
}

const STEP_RAIL: { key: Step; label: string; hint: string }[] = [
  { key: "franchise", label: "Franquia", hint: "Escolha ou crie a academia" },
  { key: "court", label: "Quadra", hint: "Superfície, horário e preço" },
];

/**
 * Vertical, anchored stepper for the left rail. Reads top-to-bottom like a
 * checklist, with a connector that fills in green as steps complete — so the
 * left column carries the flow's state instead of sitting empty.
 */
function StepRail({ current, franchiseName }: { current: Step; franchiseName?: string }) {
  const currentIdx = STEP_RAIL.findIndex((s) => s.key === current);

  return (
    <div className="lg:sticky lg:top-6">
      <p className="eyebrow mb-5">Nova quadra</p>

      <ol>
        {STEP_RAIL.map((s, i) => {
          const done = current === "done" || i < currentIdx;
          const active = s.key === current;
          const last = i === STEP_RAIL.length - 1;
          return (
            <li key={s.key} className="relative flex gap-3 pb-6 last:pb-0">
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-px transition-colors",
                    done ? "bg-[var(--primary)]" : "bg-[var(--border)]"
                  )}
                />
              )}
              <div
                className={cn(
                  "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-700 transition-colors",
                  done
                    ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                    : active
                      ? "border-2 border-[var(--primary)] text-[var(--primary)]"
                      : "border border-[var(--border)] text-[var(--text-tertiary)]"
                )}
              >
                {done ? <Check size={11} strokeWidth={3} /> : i + 1}
              </div>
              <div className="min-w-0 pt-0.5">
                <p
                  className={cn(
                    "text-[12.5px] leading-none transition-colors",
                    active || done
                      ? "font-600 text-[var(--text-primary)]"
                      : "font-500 text-[var(--text-tertiary)]"
                  )}
                >
                  {s.label}
                </p>
                <p className="mt-1 text-[11px] font-300 leading-snug text-[var(--text-tertiary)]">
                  {s.hint}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {franchiseName && current !== "franchise" && (
        <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5">
          <p className="label-colus mb-1 text-[8.5px] text-[var(--text-tertiary)]">Franquia</p>
          <p className="truncate text-[12.5px] font-600 text-[var(--text-primary)]">{franchiseName}</p>
        </div>
      )}
    </div>
  );
}

function FranchiseStep({
  franchises,
  onNext,
}: {
  franchises: FranchiseItem[];
  onNext: (id: string, name: string) => void;
}) {
  const [mode, setMode] = useState<FranchiseMode>(franchises.length > 0 ? "existing" : "new");
  const [selectedId, setSelectedId] = useState(franchises[0]?.id ?? "");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"partner" | "public">("partner");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError("");
    if (mode === "existing") {
      if (!selectedId) { setError("Selecione uma franquia."); return; }
      const f = franchises.find((f) => f.id === selectedId);
      onNext(selectedId, f?.name ?? selectedId);
    } else {
      const defaultPriceCents = reaisToCents(defaultPrice);
      if (defaultPrice.trim() !== "" && defaultPriceCents === null) {
        setError("Preço padrão inválido. Use ex: 220 ou 220,50.");
        return;
      }
      startTransition(async () => {
        const result = await createFranchiseAction(slug.trim(), name.trim(), kind, defaultPriceCents);
        if (!result.ok || !result.franchise) {
          setError(result.error ?? "Falha ao criar franquia.");
          return;
        }
        onNext(result.franchise.id, result.franchise.name);
      });
    }
  }

  return (
    <div className="space-y-5">
      {franchises.length > 0 && (
        <div className="flex gap-2">
          {(["existing", "new"] as FranchiseMode[]).map((m) => (
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
              {m === "existing" ? "Franquia existente" : "Nova franquia"}
            </button>
          ))}
        </div>
      )}

      {mode === "existing" ? (
        <div>
          <label htmlFor="franchise_select" className={labelClass}>
            Selecione a franquia
          </label>
          <select
            id="franchise_select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className={fieldClass}
          >
            {franchises.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.kind})
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="new_slug" className={labelClass}>
              Slug
            </label>
            <input
              id="new_slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="ex: playtennis-morumbi"
              className={fieldClass}
            />
            <p className="mt-1 text-[10.5px] font-300 text-[var(--text-tertiary)]">
              Minúsculas, hifens, sem espaços.
            </p>
          </div>
          <div>
            <label htmlFor="new_name" className={labelClass}>
              Nome
            </label>
            <input
              id="new_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: PlayTennis Morumbi"
              className={fieldClass}
            />
          </div>
          <div>
            <p className={labelClass}>Tipo</p>
            <div className="flex gap-3">
              {(["partner", "public"] as const).map((k) => (
                <label
                  key={k}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12px] transition-colors ${
                    kind === k
                      ? "border-[var(--primary)] bg-[var(--primary)]/8 text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={k}
                    checked={kind === k}
                    onChange={() => setKind(k)}
                    className="sr-only"
                  />
                  {k === "partner" ? "Parceiro (pago)" : "Público (gratuito)"}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="default_price" className={labelClass}>
              Preço padrão da academia (R$)
            </label>
            <input
              id="default_price"
              inputMode="decimal"
              value={defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)}
              placeholder="ex: 220"
              className={fieldClass}
            />
            <p className="mt-1 text-[10.5px] font-300 text-[var(--text-tertiary)]">
              Opcional. Aplicado às quadras desta academia quando não houver preço próprio.
            </p>
          </div>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      <div className="flex justify-end border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-colus text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Criando…" : "Próximo"}
          <ChevronRight size={11} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

function CourtStep({
  franchiseId,
  onDone,
  onBack,
}: {
  franchiseId: string;
  onDone: (result: CreateCourtState) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [surface, setSurface] = useState<Surface>("clay");
  const [indoor, setIndoor] = useState(false);
  const [daysForward, setDaysForward] = useState(90);
  const [startHour, setStartHour] = useState(6);
  const [endHour, setEndHour] = useState(22);
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError("");
    if (!name.trim()) { setError("Informe o nome da quadra."); return; }
    if (startHour >= endHour) { setError("Hora de início deve ser menor que a hora de fim."); return; }
    const priceCents = reaisToCents(price);
    if (price.trim() !== "" && priceCents === null) {
      setError("Preço da quadra inválido. Use ex: 250 ou 250,50.");
      return;
    }
    startTransition(async () => {
      const result = await createCourtAction({
        franchiseId,
        name: name.trim(),
        surface,
        indoor,
        daysForward,
        startHour,
        endHour,
        priceCents,
      });
      if (!result.ok) {
        setError(result.error ?? "Falha ao criar quadra.");
        return;
      }
      onDone(result);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="court_name" className={labelClass}>
          Nome da quadra
        </label>
        <input
          id="court_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
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
              onClick={() => setSurface(s)}
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
          onClick={() => setIndoor((v) => !v)}
          className={`relative h-5 w-9 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:rounded-full ${
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

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="days_forward" className={labelClass}>
            Dias à frente
          </label>
          <input
            id="days_forward"
            type="number"
            min={1}
            max={365}
            value={daysForward}
            onChange={(e) => setDaysForward(Number(e.target.value))}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="start_hour" className={labelClass}>
            Hora início
          </label>
          <input
            id="start_hour"
            type="number"
            min={0}
            max={22}
            value={startHour}
            onChange={(e) => setStartHour(Number(e.target.value))}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="end_hour" className={labelClass}>
            Hora fim
          </label>
          <input
            id="end_hour"
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
        <label htmlFor="court_price" className={labelClass}>
          Preço da quadra (R$) — opcional, sobrepõe o padrão
        </label>
        <input
          id="court_price"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="ex: 250"
          className={fieldClass}
        />
      </div>

      <p className="text-[10.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
        Gera slots das {String(startHour).padStart(2, "0")}h às {String(endHour).padStart(2, "0")}h para os próximos {daysForward} dias.
        Preço personalizado (quadra ou padrão da academia) sobrepõe a fórmula 10h–17h59 → R$&nbsp;220; demais → R$&nbsp;280; quadras públicas → R$&nbsp;0.
      </p>

      {error && <ErrorBanner message={error} />}

      <div className="flex justify-between border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full px-4 py-2 text-[12.5px] font-600 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-colus text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Criando…" : "Criar quadra"}
          <Plus size={11} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

function DoneStep({ courtId, slotsCreated, onNew }: { courtId: string; slotsCreated: number; onNew: () => void }) {
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/12">
        <Check size={22} strokeWidth={2} className="text-[var(--primary)]" />
      </div>
      <div>
        <p className="text-[17px] font-600 text-[var(--text-primary)]">Quadra criada</p>
        <p className="mt-1 text-[12.5px] font-300 text-[var(--text-tertiary)]">
          {slotsCreated.toLocaleString("pt-BR")} slots de disponibilidade gerados.
        </p>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-left">
        <p className="text-[10px] font-colus uppercase tracking-widest text-[var(--text-tertiary)]">ID da quadra</p>
        <p className="mt-1 font-mono text-[12px] text-[var(--text-primary)]">{courtId}</p>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="rounded-full bg-[var(--surface-raised)] px-5 py-2 text-[12.5px] font-600 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        Criar outra quadra
      </button>
    </div>
  );
}

export function NovaQuadraForm({ franchises }: { franchises: FranchiseItem[] }) {
  const [step, setStep] = useState<Step>("franchise");
  const [franchiseId, setFranchiseId] = useState("");
  const [franchiseName, setFranchiseName] = useState("");
  const [result, setResult] = useState<CreateCourtState | null>(null);

  function handleFranchiseNext(id: string, name: string) {
    setFranchiseId(id);
    setFranchiseName(name);
    setStep("court");
  }

  function handleCourtDone(r: CreateCourtState) {
    setResult(r);
    setStep("done");
  }

  function reset() {
    setStep("franchise");
    setFranchiseId("");
    setFranchiseName("");
    setResult(null);
  }

  // Success is a terminal, self-contained moment — no rail, just a centered card.
  if (step === "done" && result) {
    return (
      <div className="mx-auto max-w-md">
        <div className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
          <DoneStep
            courtId={result.courtId!}
            slotsCreated={result.slotsCreated!}
            onNew={reset}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-[210px_minmax(0,1fr)]">
      <StepRail current={step} franchiseName={franchiseName} />

      <div className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        {step === "franchise" && (
          <FranchiseStep franchises={franchises} onNext={handleFranchiseNext} />
        )}
        {step === "court" && (
          <CourtStep
            franchiseId={franchiseId}
            onDone={handleCourtDone}
            onBack={() => setStep("franchise")}
          />
        )}
      </div>
    </div>
  );
}
