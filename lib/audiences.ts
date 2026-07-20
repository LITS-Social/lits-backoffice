import type { components } from "@/lib/api/openapi";

type Audience = components["schemas"]["AudienceBody"];

/** The five skill categories, in ladder order. Values match category_skill. */
export const CLASS_OPTIONS = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
  { value: "PRO", label: "PRO" },
] as const;

/** user_gender values with their Portuguese labels for the ops UI. */
export const GENDER_OPTIONS = [
  { value: "male", label: "Masculino" },
  { value: "female", label: "Feminino" },
  { value: "non_binary", label: "Não-binário" },
  { value: "prefer_not_say", label: "Prefere não dizer" },
] as const;

/** play_style values (matches enum on the profile). */
export const PLAY_STYLE_OPTIONS = [
  { value: "casual", label: "Casual" },
  { value: "ranked", label: "Competitivo" },
] as const;

/** intent_kind values — what the member is on LITS for. */
export const INTENT_OPTIONS = [
  { value: "sport", label: "Jogar" },
  { value: "networking", label: "Networking" },
  { value: "friendship", label: "Amizade" },
] as const;

/** period_of_day values with PT labels. */
export const PERIOD_OPTIONS = [
  { value: "morning", label: "Manhã" },
  { value: "afternoon", label: "Tarde" },
  { value: "evening", label: "Noite" },
] as const;

/** Weekdays as the backend numbers them: 0=Sunday .. 6=Saturday. */
export const DAY_OPTIONS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
] as const;

function labels<T extends string | number>(
  opts: ReadonlyArray<{ value: T; label: string }>
): Record<string, string> {
  return Object.fromEntries(opts.map((o) => [String(o.value), o.label]));
}

const GENDER_LABELS = labels(GENDER_OPTIONS);
const PLAY_STYLE_LABELS = labels(PLAY_STYLE_OPTIONS);
const INTENT_LABELS = labels(INTENT_OPTIONS);
const PERIOD_LABELS = labels(PERIOD_OPTIONS);
const DAY_LABELS = labels(DAY_OPTIONS);

export function genderLabel(value: string): string {
  return GENDER_LABELS[value] ?? value;
}

/** "18–40 anos" / "18+ anos" / "até 40 anos", or null when no age bound is set. */
function ageChip(min?: number, max?: number): string | null {
  const hasMin = min != null;
  const hasMax = max != null;
  if (hasMin && hasMax) return `${min}–${max} anos`;
  if (hasMin) return `${min}+ anos`;
  if (hasMax) return `até ${max} anos`;
  return null;
}

/**
 * The human-readable chips describing an audience's filter, in a fixed order
 * (demografia, then local, then jogo). An audience with no dimensions at all is
 * the everyone-audience; callers render that as a single "Todos os membros" chip
 * rather than an empty row, so a blank filter never looks like missing data.
 *
 * Club scope shows as a count ("3 clubes") because the table row only carries
 * club_ids, not names — resolving names would cost a fetch the list view skips.
 */
export function audienceChips(
  a: Pick<
    Audience,
    | "classes"
    | "genders"
    | "club_brand"
    | "club_ids"
    | "age_min"
    | "age_max"
    | "neighborhoods"
    | "cities"
    | "play_styles"
    | "intents"
    | "preferred_days"
    | "preferred_periods"
    | "radius_km"
  >
): string[] {
  const chips: string[] = [];

  // Demografia
  for (const c of a.classes ?? []) chips.push(`Classe ${c}`);
  for (const g of a.genders ?? []) chips.push(genderLabel(g));
  const age = ageChip(a.age_min, a.age_max);
  if (age) chips.push(age);

  // Local
  if (a.club_brand?.trim()) chips.push(a.club_brand.trim());
  const clubCount = a.club_ids?.length ?? 0;
  if (clubCount > 0) chips.push(clubCount === 1 ? "1 clube" : `${clubCount} clubes`);
  for (const n of a.neighborhoods ?? []) chips.push(n);
  for (const c of a.cities ?? []) chips.push(c);
  if (a.radius_km && a.radius_km > 0) chips.push(`raio ${a.radius_km}km`);

  // Jogo
  for (const p of a.play_styles ?? []) chips.push(PLAY_STYLE_LABELS[p] ?? p);
  for (const i of a.intents ?? []) chips.push(INTENT_LABELS[i] ?? i);
  const days = (a.preferred_days ?? []).map((d) => DAY_LABELS[String(d)] ?? String(d));
  if (days.length > 0) chips.push(days.join("·"));
  for (const p of a.preferred_periods ?? []) chips.push(PERIOD_LABELS[p] ?? p);

  return chips;
}

/** True when an audience carries no filter at all — it targets every member. */
export function isEveryone(
  a: Parameters<typeof audienceChips>[0]
): boolean {
  return audienceChips(a).length === 0;
}
