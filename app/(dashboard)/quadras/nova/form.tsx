"use client";

import Link from "next/link";
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

/**
 * Venue kind as staff read it — PlayTennis (brand) split out of the generic
 * directory listings, mirroring the /quadras table chips.
 */
function franchiseKindLabel(f: FranchiseItem): string {
  if (f.kind === "partner") return "Parceiro";
  if (f.kind === "public") return "Pública";
  if (f.brand === "playtennis") return "PlayTennis";
  return "Diretório";
}

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors placeholder:font-300 placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";

const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";
const labelInlineClass = "label-colus block text-[8.5px] text-[var(--text-tertiary)]";

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-error)]">
      <AlertCircle size={13} className="mt-px shrink-0" />
      {message}
    </p>
  );
}

/**
 * "Grátis" pill that clamps a price field to R$ 0,00. Beta partner clubs (not
 * just public parks) can be free, so the free choice has to be explicit — a
 * blank field means "use the default", whereas this means "charge nothing".
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
  onNext: (id: string, name: string, kind: string) => void;
}) {
  // The directory has 160+ active venues, so the picker is search-first and
  // demands an explicit click — a silent default under that many rows is how a
  // court lands on the wrong franchise.
  const selectable = franchises.filter((f) => f.active);
  const [mode, setMode] = useState<FranchiseMode>(selectable.length > 0 ? "existing" : "new");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"partner" | "public" | "listing">("partner");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [freeFranchise, setFreeFranchise] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const visible = q
    ? selectable.filter((f) =>
        `${f.name} ${f.slug} ${franchiseKindLabel(f)}`.toLowerCase().includes(q)
      )
    : selectable;
  const selected = selectable.find((f) => f.id === selectedId);

  function handleSubmit() {
    setError("");
    if (mode === "existing") {
      if (!selected) { setError("Selecione uma franquia."); return; }
      onNext(selected.id, selected.name, selected.kind);
    } else {
      const defaultPriceCents = freeFranchise ? 0 : reaisToCents(defaultPrice);
      if (!freeFranchise && defaultPrice.trim() !== "" && defaultPriceCents === null) {
        setError("Preço padrão inválido. Use ex: 220 ou 220,50.");
        return;
      }
      startTransition(async () => {
        const result = await createFranchiseAction(slug.trim(), name.trim(), kind, defaultPriceCents);
        if (!result.ok || !result.franchise) {
          setError(result.error ?? "Falha ao criar franquia.");
          return;
        }
        onNext(result.franchise.id, result.franchise.name, result.franchise.kind);
      });
    }
  }

  return (
    <div className="space-y-5">
      {selectable.length > 0 && (
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
          <label htmlFor="franchise_search" className={labelClass}>
            Selecione a franquia
          </label>
          <input
            id="franchise_search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, slug ou tipo…"
            className={fieldClass}
          />
          <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
            {visible.length === 0 ? (
              <p className="px-3 py-3 text-[12px] font-300 text-[var(--text-tertiary)]">
                Nenhuma franquia encontrada para essa busca.
              </p>
            ) : (
              visible.map((f) => {
                const isSelected = f.id === selectedId;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedId(f.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-left transition-colors last:border-b-0",
                      isSelected ? "bg-[var(--primary)]/8" : "hover:bg-[var(--surface-raised)]"
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-0 truncate text-[12.5px]",
                        isSelected
                          ? "font-600 text-[var(--primary)]"
                          : "text-[var(--text-primary)]"
                      )}
                    >
                      {f.name}
                    </span>
                    <span className="shrink-0 text-[10px] font-300 text-[var(--text-tertiary)]">
                      {franchiseKindLabel(f)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className="mt-1.5 text-[10.5px] font-300 text-[var(--text-tertiary)]">
            {selected
              ? `Selecionada: ${selected.name} (${franchiseKindLabel(selected)})`
              : `${visible.length} de ${selectable.length} franquias ativas. Clique para selecionar.`}
          </p>
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
            <div className="flex flex-wrap gap-3">
              {(["partner", "public", "listing"] as const).map((k) => (
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
                  {k === "partner"
                    ? "Parceiro (pago)"
                    : k === "public"
                      ? "Público (gratuito)"
                      : "Diretório (vitrine)"}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="default_price" className={labelInlineClass}>
                Preço padrão da academia (R$)
              </label>
              <GratisToggle active={freeFranchise} onToggle={() => setFreeFranchise((v) => !v)} />
            </div>
            <input
              id="default_price"
              inputMode="decimal"
              value={freeFranchise ? "" : defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)}
              disabled={freeFranchise}
              placeholder={freeFranchise ? "Grátis — R$ 0,00" : "ex: 220"}
              className={cn(fieldClass, freeFranchise && "opacity-60")}
            />
            <p className="mt-1 text-[10.5px] font-300 text-[var(--text-tertiary)]">
              {freeFranchise
                ? "Academia gratuita: quadras sem preço próprio ficam R$ 0,00 (parceiro pode ser grátis no beta)."
                : "Opcional. Aplicado às quadras desta academia quando não houver preço próprio."}
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
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50"
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
  franchiseKind,
  onDone,
  onBack,
}: {
  franchiseId: string;
  franchiseKind: string;
  onDone: (result: CreateCourtState) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [surface, setSurface] = useState<Surface>("clay");
  const [indoor, setIndoor] = useState(false);
  const [availabilityMode, setAvailabilityMode] = useState<"auto" | "manual">("auto");
  const [daysForward, setDaysForward] = useState(90);
  const [startHour, setStartHour] = useState(6);
  const [endHour, setEndHour] = useState(22);
  const [price, setPrice] = useState("");
  const [freeCourt, setFreeCourt] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const manual = availabilityMode === "manual";

  function handleSubmit() {
    setError("");
    if (!name.trim()) { setError("Informe o nome da quadra."); return; }
    if (!manual && startHour >= endHour) { setError("Hora de início deve ser menor que a hora de fim."); return; }
    const priceCents = freeCourt ? 0 : reaisToCents(price);
    if (!freeCourt && price.trim() !== "" && priceCents === null) {
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
        autoGenerate: !manual,
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

      <div>
        <p className={labelClass}>Disponibilidade</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              ["auto", "Gerar automático", "Janela de horários por dia"],
              ["manual", "Adiciono na mão", "Cadastro os horários depois"],
            ] as const
          ).map(([m, title, sub]) => (
            <button
              key={m}
              type="button"
              onClick={() => setAvailabilityMode(m)}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                availabilityMode === m
                  ? "border-[var(--primary)] bg-[var(--primary)]/8"
                  : "border-[var(--border)] hover:border-[var(--border-strong)]"
              }`}
            >
              <p
                className={`text-[12.5px] font-600 ${
                  availabilityMode === m ? "text-[var(--primary)]" : "text-[var(--text-primary)]"
                }`}
              >
                {title}
              </p>
              <p className="mt-0.5 text-[10.5px] font-300 text-[var(--text-tertiary)]">{sub}</p>
            </button>
          ))}
        </div>
      </div>

      {!manual && (
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
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="court_price" className={labelInlineClass}>
            Preço da quadra (R$) — opcional, sobrepõe o padrão
          </label>
          <GratisToggle active={freeCourt} onToggle={() => setFreeCourt((v) => !v)} />
        </div>
        <input
          id="court_price"
          inputMode="decimal"
          value={freeCourt ? "" : price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={freeCourt}
          placeholder={freeCourt ? "Grátis — R$ 0,00" : "ex: 250"}
          className={cn(fieldClass, freeCourt && "opacity-60")}
        />
      </div>

      {franchiseKind === "listing" && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-[10.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Local do diretório: o app hoje exibe a grade sintetizada gratuita (06h–22h, R$&nbsp;0) —
          slots e preços cadastrados aqui não mudam a vitrine. Os campos seguem editáveis para
          quando o local virar parceiro.
        </p>
      )}

      <p className="text-[10.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
        {manual ? (
          "A quadra é criada sem horários. Adicione os horários manualmente na edição da quadra."
        ) : (
          <>
            Gera slots das {String(startHour).padStart(2, "0")}h às {String(endHour).padStart(2, "0")}h para os próximos {daysForward} dias.
            Preço personalizado (quadra ou padrão da academia) sobrepõe a fórmula 10h–17h59 → R$&nbsp;220; demais → R$&nbsp;280; quadras públicas e do diretório → R$&nbsp;0.
          </>
        )}
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
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50"
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
          {slotsCreated > 0
            ? `${slotsCreated.toLocaleString("pt-BR")} slots de disponibilidade gerados.`
            : "Criada sem horários. Adicione os horários manualmente na edição."}
        </p>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-left">
        <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--text-tertiary)]">ID da quadra</p>
        <p className="mt-1 font-mono text-[12px] text-[var(--text-primary)]">{courtId}</p>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Link
          href={`/quadras/${courtId}/editar`}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90"
        >
          {slotsCreated > 0 ? "Editar quadra" : "Adicionar horários"}
          <ChevronRight size={11} strokeWidth={2.5} />
        </Link>
        <button
          type="button"
          onClick={onNew}
          className="rounded-full bg-[var(--surface-raised)] px-5 py-2 text-[12.5px] font-600 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          Criar outra quadra
        </button>
      </div>
    </div>
  );
}

export function NovaQuadraForm({
  franchises,
  initialFranchise,
}: {
  franchises: FranchiseItem[];
  /** Pre-selected academia (deep link from the courts list) — skips straight
      to the court step; "voltar" still reopens the picker. */
  initialFranchise?: FranchiseItem;
}) {
  const [step, setStep] = useState<Step>(initialFranchise ? "court" : "franchise");
  const [franchiseId, setFranchiseId] = useState(initialFranchise?.id ?? "");
  const [franchiseName, setFranchiseName] = useState(initialFranchise?.name ?? "");
  const [franchiseKind, setFranchiseKind] = useState(initialFranchise?.kind ?? "");
  const [result, setResult] = useState<CreateCourtState | null>(null);

  function handleFranchiseNext(id: string, name: string, kind: string) {
    setFranchiseId(id);
    setFranchiseName(name);
    setFranchiseKind(kind);
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
    setFranchiseKind("");
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

      <div className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
        {step === "franchise" && (
          <FranchiseStep franchises={franchises} onNext={handleFranchiseNext} />
        )}
        {step === "court" && (
          <CourtStep
            franchiseId={franchiseId}
            franchiseKind={franchiseKind}
            onDone={handleCourtDone}
            onBack={() => setStep("franchise")}
          />
        )}
      </div>
    </div>
  );
}
