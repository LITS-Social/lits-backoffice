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

const GENDER_LABELS: Record<string, string> = Object.fromEntries(
  GENDER_OPTIONS.map((g) => [g.value, g.label])
);

export function genderLabel(value: string): string {
  return GENDER_LABELS[value] ?? value;
}

/**
 * The human-readable chips describing an audience's filter, in a fixed order
 * (class, then gender, then club). An audience with no dimensions at all is the
 * everyone-audience; callers render that as a single "Todos os membros" chip
 * rather than an empty row, so a blank filter never looks like missing data.
 */
export function audienceChips(a: Pick<Audience, "classes" | "genders" | "club_brand">): string[] {
  const chips: string[] = [];
  for (const c of a.classes ?? []) chips.push(`Classe ${c}`);
  for (const g of a.genders ?? []) chips.push(genderLabel(g));
  if (a.club_brand?.trim()) chips.push(a.club_brand.trim());
  return chips;
}

/** True when an audience carries no filter at all — it targets every member. */
export function isEveryone(a: Pick<Audience, "classes" | "genders" | "club_brand">): boolean {
  return audienceChips(a).length === 0;
}
