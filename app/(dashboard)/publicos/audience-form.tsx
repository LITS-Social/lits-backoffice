"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { AlertCircle, MapPin, Search, Users2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CLASS_OPTIONS,
  DAY_OPTIONS,
  GENDER_OPTIONS,
  INTENT_OPTIONS,
  PERIOD_OPTIONS,
  PLAY_STYLE_OPTIONS,
} from "@/lib/audiences";
import {
  countAudienceAction,
  createAudienceAction,
  searchClubsAction,
  updateAudienceAction,
  type Audience,
  type AudienceFilter,
  type OpsClub,
} from "./actions";

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors placeholder:font-300 placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";

const labelClass = "label-colus mb-2 block text-[8.5px] text-[var(--text-tertiary)]";

const hintClass = "mt-1.5 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]";

/** Toggle a value in/out of a list, preserving the rest. */
function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Parse a text field to a finite number, or null when blank/invalid. */
function toNum(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** A multi-select chip row: each chip toggles its value in/out of `selected`. */
function MultiToggle<T extends string | number>({
  options,
  selected,
  onToggle,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onToggle(opt.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-[5px] text-[11.5px] leading-none transition-colors",
              active
                ? "border-[var(--primary)] bg-[var(--primary)] font-600 text-[var(--primary-fg)]"
                : "border-[var(--border)] bg-transparent font-500 text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** A grouped block with a section heading; keeps the tall builder legible. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="label-colus border-b border-[var(--border)] pb-2 text-[9px] text-[var(--text-secondary)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Free-text tag input: type a value, Enter / comma / "Adicionar" appends it as a
 * chip. Used for neighborhoods and cities, which have no lookup endpoint — the
 * operator types the names the profiles use.
 */
function ChipInput({
  id,
  label,
  placeholder,
  values,
  onAdd,
  onRemove,
}: {
  id: string;
  label: string;
  placeholder: string;
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim();
    if (!v) return;
    if (!values.includes(v)) onAdd(v);
    setDraft("");
  }

  return (
    <div role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className={labelClass}>
        {label}
      </span>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder}
          aria-labelledby={`${id}-label`}
          className={fieldClass}
        />
        <button
          type="button"
          onClick={commit}
          disabled={draft.trim().length === 0}
          className="shrink-0 rounded-lg border border-[var(--border)] px-3 text-[11.5px] font-600 text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          Adicionar
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] py-[3px] pr-1 pl-2.5 text-[11px] font-500 text-[var(--text-secondary)]"
            >
              {v}
              <button
                type="button"
                onClick={() => onRemove(v)}
                aria-label={`Remover ${v}`}
                className="rounded-full p-0.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Searchable club multi-select. Debounced search hits GET /v1/ops/clubs (the BFF
 * filters the fleet in memory); picking a result adds its chip. The parent owns
 * the selected clubs so it can hydrate them on edit and derive club_ids.
 */
function ClubMultiSelect({
  selected,
  onAdd,
  onRemove,
}: {
  selected: OpsClub[];
  onAdd: (club: OpsClub) => void;
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpsClub[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const reqId = useRef(0);

  const selectedIds = useMemo(() => new Set(selected.map((c) => c.id)), [selected]);

  // Debounced search. Every state write lives inside the timeout callback so the
  // effect body itself never sets state synchronously (the repo's lint rule).
  useEffect(() => {
    const id = ++reqId.current;
    const q = query.trim();
    const t = setTimeout(() => {
      if (q.length < 2) {
        if (id === reqId.current) {
          setResults([]);
          setStatus("idle");
        }
        return;
      }
      setStatus("loading");
      searchClubsAction(q, 20).then((res) => {
        if (id !== reqId.current) return; // a newer keystroke already fired
        if (!res.ok) {
          setStatus("error");
          setResults([]);
          return;
        }
        setStatus("idle");
        setResults(res.clubs);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const visible = results.filter((c) => !selectedIds.has(c.id));

  return (
    <div role="group" aria-labelledby="audience-clubs-label">
      <span id="audience-clubs-label" className={labelClass}>
        Clubes (busca)
      </span>
      <div className="relative">
        <Search
          size={13}
          strokeWidth={2}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-tertiary)]"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar clube pelo nome…"
          aria-labelledby="audience-clubs-label"
          className={cn(fieldClass, "pl-8")}
        />
      </div>

      {query.trim().length >= 2 && (
        <div className="mt-1.5 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {status === "loading" ? (
            <p className="px-3 py-2 text-[11.5px] font-300 text-[var(--text-tertiary)]">Buscando…</p>
          ) : status === "error" ? (
            <p className="px-3 py-2 text-[11.5px] font-300 text-[var(--color-error)]">
              Falha ao buscar clubes.
            </p>
          ) : visible.length === 0 ? (
            <p className="px-3 py-2 text-[11.5px] font-300 text-[var(--text-tertiary)]">
              Nenhum clube encontrado.
            </p>
          ) : (
            <ul className="max-h-44 overflow-y-auto">
              {visible.map((club) => (
                <li key={club.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(club);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-raised)]"
                  >
                    <span className="truncate text-[12px] font-500 text-[var(--text-primary)]">
                      {club.name}
                    </span>
                    <span className="ml-auto shrink-0 text-[10.5px] font-300 text-[var(--text-tertiary)]">
                      {[club.brand, club.neighborhood].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((club) => (
            <span
              key={club.id}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] py-[3px] pr-1 pl-2.5 text-[11px] font-500 text-[var(--text-secondary)]"
            >
              <span className="text-[var(--text-primary)]">{club.name}</span>
              {(club.brand || club.neighborhood) && (
                <span className="text-[var(--text-tertiary)]">
                  {[club.brand, club.neighborhood].filter(Boolean).join(" · ")}
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(club.id)}
                aria-label={`Remover ${club.name}`}
                className="rounded-full p-0.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
      <p className={hintClass}>Vazio = qualquer clube. A rede inteira usa o campo “Rede” acima.</p>
    </div>
  );
}

type CountState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; matched: number; missingCategory: number }
  | { status: "error"; message: string };

/**
 * Create / edit modal for panel #14 — the full audience builder (12 filter
 * dimensions grouped into Demografia / Local / Jogo).
 *
 * The count block is the point of the whole feature: as the operator builds a
 * filter, a debounced inline count says how many members it would reach and how
 * many are silently dropped for having no declared class. It uses the INLINE
 * count over the whole filter on screen — even when editing a saved audience —
 * so the number reflects the current draft, not the one last persisted.
 */
export function AudienceForm({
  mode,
  audience,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  audience?: Audience;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(audience?.name ?? "");
  const [classes, setClasses] = useState<string[]>(audience?.classes ?? []);
  const [genders, setGenders] = useState<string[]>(audience?.genders ?? []);
  const [clubBrand, setClubBrand] = useState(audience?.club_brand ?? "");
  const [selectedClubs, setSelectedClubs] = useState<OpsClub[]>([]);
  const [ageMin, setAgeMin] = useState(audience?.age_min != null ? String(audience.age_min) : "");
  const [ageMax, setAgeMax] = useState(audience?.age_max != null ? String(audience.age_max) : "");
  const [neighborhoods, setNeighborhoods] = useState<string[]>(audience?.neighborhoods ?? []);
  const [cities, setCities] = useState<string[]>(audience?.cities ?? []);
  const [playStyles, setPlayStyles] = useState<string[]>(audience?.play_styles ?? []);
  const [intents, setIntents] = useState<string[]>(audience?.intents ?? []);
  const [preferredDays, setPreferredDays] = useState<number[]>(audience?.preferred_days ?? []);
  const [preferredPeriods, setPreferredPeriods] = useState<string[]>(
    audience?.preferred_periods ?? []
  );
  // Geo triplet. A saved center coordinate is only "no geo" when NULL, not when
  // it's 0 — lat=0 (equator) / lng=0 (Greenwich) are legitimate points, and the
  // real emptiness guard is the exact (0,0) pair, not either axis alone. So
  // hydrate each coord on `!= null` (mirrors ageMin/ageMax), never truthiness,
  // or a valid off-axis center would drop an axis on edit and jam Save. radiusKm
  // stays truthy: 0 genuinely means "no radius" in the wire contract.
  const [centerLat, setCenterLat] = useState(
    audience?.center_lat != null ? String(audience.center_lat) : ""
  );
  const [centerLng, setCenterLng] = useState(
    audience?.center_lng != null ? String(audience.center_lng) : ""
  );
  const [radiusKm, setRadiusKm] = useState(audience?.radius_km ? String(audience.radius_km) : "");

  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<CountState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  // Same monotonic guard the users table uses: a slow count for an earlier
  // filter must never overwrite the number for the filter now on screen.
  const reqId = useRef(0);

  const clubIds = useMemo(() => selectedClubs.map((c) => c.id), [selectedClubs]);

  // Hydrate the club chips when editing: the saved audience carries only ids, so
  // pull the fleet once and resolve names. Keyed on a stable string of the ids
  // (the audience is fixed while the modal is open) → runs once, lint-clean.
  const initialClubIdsKey = (audience?.club_ids ?? []).join(",");
  useEffect(() => {
    const ids = initialClubIdsKey ? initialClubIdsKey.split(",") : [];
    if (ids.length === 0) return;
    let cancelled = false;
    searchClubsAction("", 200).then((res) => {
      if (cancelled || !res.ok) return;
      const byId = new Map(res.clubs.map((c) => [c.id, c] as const));
      setSelectedClubs(ids.map((id) => byId.get(id) ?? { id, name: id }));
    });
    return () => {
      cancelled = true;
    };
  }, [initialClubIdsKey]);

  // Client-side validity: age range ordered, geo only when a real center anchors
  // a positive radius. center_lat/lng are plain doubles on the wire, so a radius
  // with a 0/0 (or absent) center filters around Null Island = empty audience.
  // The radius input is gated on a real center, and save is blocked on any
  // half-built or 0/0 geo — filterToApiFields is the final wire-level backstop.
  const ageMinNum = toNum(ageMin);
  const ageMaxNum = toNum(ageMax);
  const ageInvalid = ageMinNum != null && ageMaxNum != null && ageMinNum > ageMaxNum;

  const centerLatNum = toNum(centerLat);
  const centerLngNum = toNum(centerLng);
  const radiusNum = toNum(radiusKm);
  const hasCenter = centerLatNum != null && centerLngNum != null;
  const centerIsNullIsland = hasCenter && centerLatNum === 0 && centerLngNum === 0;
  const geoAnyFilled = [centerLat, centerLng, radiusKm].some((v) => v.trim() !== "");
  const geoComplete =
    hasCenter && !centerIsNullIsland && radiusNum != null && radiusNum > 0;
  const geoInvalid = geoAnyFilled && !geoComplete;

  const canSave = name.trim().length > 0 && !isPending && !ageInvalid && !geoInvalid;

  const filter: AudienceFilter = {
    classes,
    genders,
    clubBrand,
    clubIds,
    ageMin: ageMinNum,
    ageMax: ageMaxNum,
    neighborhoods,
    cities,
    playStyles,
    intents,
    preferredDays,
    preferredPeriods,
    centerLat: centerLatNum,
    centerLng: centerLngNum,
    radiusKm: radiusNum,
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPending, onClose]);

  // Debounced live count over the whole filter. The "loading" set lives inside
  // the timeout, not the effect body, so it never runs synchronously on render.
  // A partial geo triplet is dropped by filterToApiFields, so the count just
  // ignores geo until all three fields are set; save stays blocked meanwhile.
  useEffect(() => {
    const id = ++reqId.current;
    const t = setTimeout(() => {
      setCount({ status: "loading" });
      countAudienceAction({
        filter: {
          classes,
          genders,
          clubBrand,
          clubIds,
          ageMin: toNum(ageMin),
          ageMax: toNum(ageMax),
          neighborhoods,
          cities,
          playStyles,
          intents,
          preferredDays,
          preferredPeriods,
          centerLat: toNum(centerLat),
          centerLng: toNum(centerLng),
          radiusKm: toNum(radiusKm),
        },
      }).then((res) => {
        if (id !== reqId.current) return; // a newer filter already fired
        if (!res.ok) {
          setCount({ status: "error", message: res.error });
          return;
        }
        setCount({ status: "done", matched: res.matched, missingCategory: res.missingCategory });
      });
    }, 400);
    return () => clearTimeout(t);
  }, [
    classes,
    genders,
    clubBrand,
    clubIds,
    ageMin,
    ageMax,
    neighborhoods,
    cities,
    playStyles,
    intents,
    preferredDays,
    preferredPeriods,
    centerLat,
    centerLng,
    radiusKm,
  ]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSave) return;
    startTransition(async () => {
      const res =
        mode === "edit" && audience
          ? await updateAudienceAction(audience.id, name, filter)
          : await createAudienceAction(name, filter);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
      onClick={() => !isPending && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="audience-form-title"
        onClick={(e) => e.stopPropagation()}
        className="grain animate-fade-in-up flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-6 pt-6 pb-5">
          <div>
            <p className="eyebrow mb-2.5">Painel 14</p>
            <h2
              id="audience-form-title"
              className="font-display text-[21px] leading-tight tracking-[-0.01em] text-[var(--text-primary)]"
            >
              {mode === "edit" ? "Editar público" : "Novo público"}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !isPending && onClose()}
            aria-label="Fechar"
            disabled={isPending}
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <div>
              <label htmlFor="audience-name" className={labelClass}>
                Nome
              </label>
              <input
                id="audience-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
                placeholder="Ex.: Classe A — São Paulo"
                className={fieldClass}
              />
            </div>

            <Section title="Demografia">
              <div role="group" aria-labelledby="audience-class-label">
                <span id="audience-class-label" className={labelClass}>
                  Classe
                </span>
                <MultiToggle
                  options={CLASS_OPTIONS}
                  selected={classes}
                  onToggle={(v) => setClasses(toggleValue(classes, v))}
                />
                <p className={hintClass}>Nenhuma marcada = qualquer classe.</p>
              </div>

              <div role="group" aria-labelledby="audience-gender-label">
                <span id="audience-gender-label" className={labelClass}>
                  Sexo
                </span>
                <MultiToggle
                  options={GENDER_OPTIONS}
                  selected={genders}
                  onToggle={(v) => setGenders(toggleValue(genders, v))}
                />
                <p className={hintClass}>Nenhum marcado = qualquer sexo.</p>
              </div>

              <div role="group" aria-labelledby="audience-age-label">
                <span id="audience-age-label" className={labelClass}>
                  Faixa etária
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={120}
                    step={1}
                    value={ageMin}
                    onChange={(e) => setAgeMin(e.target.value)}
                    placeholder="mín."
                    aria-label="Idade mínima"
                    className={cn(fieldClass, "w-24")}
                  />
                  <span className="text-[12px] text-[var(--text-tertiary)]">até</span>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    step={1}
                    value={ageMax}
                    onChange={(e) => setAgeMax(e.target.value)}
                    placeholder="máx."
                    aria-label="Idade máxima"
                    className={cn(fieldClass, "w-24")}
                  />
                  <span className="text-[12px] text-[var(--text-tertiary)]">anos</span>
                </div>
                {ageInvalid ? (
                  <p className="mt-1.5 text-[10.5px] font-500 leading-snug text-[var(--color-error)]">
                    A idade mínima não pode ser maior que a máxima.
                  </p>
                ) : (
                  <p className={hintClass}>Vazio = qualquer idade.</p>
                )}
              </div>
            </Section>

            <Section title="Local">
              <div>
                <label htmlFor="audience-brand" className={labelClass}>
                  Rede <span className="normal-case tracking-normal opacity-70">(opcional)</span>
                </label>
                <input
                  id="audience-brand"
                  value={clubBrand}
                  onChange={(e) => setClubBrand(e.target.value)}
                  placeholder="playtennis — vazio = qualquer rede"
                  className={fieldClass}
                />
                <p className={hintClass}>Filtra a franquia inteira. Para clubes específicos, use a busca abaixo.</p>
              </div>

              <ClubMultiSelect
                selected={selectedClubs}
                onAdd={(club) =>
                  setSelectedClubs((prev) =>
                    prev.some((c) => c.id === club.id) ? prev : [...prev, club]
                  )
                }
                onRemove={(id) => setSelectedClubs((prev) => prev.filter((c) => c.id !== id))}
              />

              <ChipInput
                id="audience-neighborhoods"
                label="Bairros"
                placeholder="Digite um bairro e Enter"
                values={neighborhoods}
                onAdd={(v) => setNeighborhoods((prev) => [...prev, v])}
                onRemove={(v) => setNeighborhoods((prev) => prev.filter((n) => n !== v))}
              />

              <ChipInput
                id="audience-cities"
                label="Cidades"
                placeholder="Digite uma cidade e Enter"
                values={cities}
                onAdd={(v) => setCities((prev) => [...prev, v])}
                onRemove={(v) => setCities((prev) => prev.filter((c) => c !== v))}
              />

              <div role="group" aria-labelledby="audience-geo-label">
                <span id="audience-geo-label" className={labelClass}>
                  Raio geográfico <span className="normal-case tracking-normal opacity-70">(opcional)</span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    step="any"
                    value={centerLat}
                    onChange={(e) => setCenterLat(e.target.value)}
                    placeholder="latitude"
                    aria-label="Latitude do centro"
                    className={cn(fieldClass, "w-32")}
                  />
                  <input
                    type="number"
                    step="any"
                    value={centerLng}
                    onChange={(e) => setCenterLng(e.target.value)}
                    placeholder="longitude"
                    aria-label="Longitude do centro"
                    className={cn(fieldClass, "w-32")}
                  />
                  <div className="relative">
                    <MapPin
                      size={13}
                      strokeWidth={2}
                      className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--text-tertiary)]"
                    />
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={radiusKm}
                      onChange={(e) => setRadiusKm(e.target.value)}
                      placeholder="raio km"
                      aria-label="Raio em quilômetros"
                      disabled={!hasCenter || centerIsNullIsland}
                      title={
                        !hasCenter || centerIsNullIsland
                          ? "Defina um centro (lat/lng) real antes do raio"
                          : undefined
                      }
                      className={cn(
                        fieldClass,
                        "w-28 pl-7 disabled:cursor-not-allowed disabled:opacity-50"
                      )}
                    />
                  </div>
                </div>
                {centerIsNullIsland ? (
                  <p className="mt-1.5 text-[10.5px] font-500 leading-snug text-[var(--color-error)]">
                    Centro (0, 0) é inválido — escolha um ponto real.
                  </p>
                ) : geoInvalid ? (
                  <p className="mt-1.5 text-[10.5px] font-500 leading-snug text-[var(--color-error)]">
                    Defina latitude e longitude, depois um raio maior que zero — ou limpe os três.
                  </p>
                ) : (
                  <p className={hintClass}>
                    Defina o centro em lat/lng (copie do Google Maps); o raio habilita depois. Vazio
                    = sem filtro de raio.
                  </p>
                )}
              </div>
            </Section>

            <Section title="Jogo">
              <div role="group" aria-labelledby="audience-style-label">
                <span id="audience-style-label" className={labelClass}>
                  Estilo de jogo
                </span>
                <MultiToggle
                  options={PLAY_STYLE_OPTIONS}
                  selected={playStyles}
                  onToggle={(v) => setPlayStyles(toggleValue(playStyles, v))}
                />
              </div>

              <div role="group" aria-labelledby="audience-intent-label">
                <span id="audience-intent-label" className={labelClass}>
                  Intenção
                </span>
                <MultiToggle
                  options={INTENT_OPTIONS}
                  selected={intents}
                  onToggle={(v) => setIntents(toggleValue(intents, v))}
                />
              </div>

              <div role="group" aria-labelledby="audience-days-label">
                <span id="audience-days-label" className={labelClass}>
                  Dias preferidos
                </span>
                <MultiToggle
                  options={DAY_OPTIONS}
                  selected={preferredDays}
                  onToggle={(v) => setPreferredDays(toggleValue(preferredDays, v))}
                />
              </div>

              <div role="group" aria-labelledby="audience-period-label">
                <span id="audience-period-label" className={labelClass}>
                  Períodos
                </span>
                <MultiToggle
                  options={PERIOD_OPTIONS}
                  selected={preferredPeriods}
                  onToggle={(v) => setPreferredPeriods(toggleValue(preferredPeriods, v))}
                />
                <p className={hintClass}>Nada marcado em Jogo = qualquer preferência.</p>
              </div>
            </Section>
          </div>

          <div className="shrink-0 space-y-3 border-t border-[var(--border)] px-6 py-4">
            {/* Live reach — the "avisar quantas vão enviar" the founder asked for. */}
            <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3.5 py-3">
              <Users2 size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--primary)]" />
              <div className="min-w-0 text-[12px] leading-relaxed">
                {count.status === "loading" || count.status === "idle" ? (
                  <span className="font-300 text-[var(--text-tertiary)]">Calculando alcance…</span>
                ) : count.status === "error" ? (
                  <span className="font-300 text-[var(--color-error)]">{count.message}</span>
                ) : (
                  <span className="font-300 text-[var(--text-secondary)]">
                    <span className="font-600 tabular-nums text-[var(--text-primary)]">
                      {count.matched}
                    </span>{" "}
                    {count.matched === 1 ? "membro" : "membros"}
                    {count.missingCategory > 0 && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="font-600 tabular-nums text-[var(--color-clay)]">
                          {count.missingCategory}
                        </span>{" "}
                        sem classe declarada{" "}
                        <span className="text-[var(--text-tertiary)]">(fora do envio)</span>
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>

            {error && (
              <p className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-error)]">
                <AlertCircle size={13} className="mt-px shrink-0" />
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !isPending && onClose()}
                disabled={isPending}
                className="rounded-full px-4 py-2 text-[12.5px] font-600 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!canSave}
                className="rounded-full bg-[var(--primary)] px-4 py-2 font-700 text-[9.5px] tracking-[0.16em] text-[var(--primary-fg)] uppercase transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {isPending ? "Salvando…" : mode === "edit" ? "Salvar" : "Criar público"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
