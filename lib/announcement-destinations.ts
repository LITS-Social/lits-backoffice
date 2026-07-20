/**
 * Canonical deep-link destinations offered in the #13 "Enviar anúncio" picker.
 *
 * Each `value` is the exact `lits://<host>` string the app understands, and the
 * picker only ever writes one of these — so an operator can no longer ship a
 * typo'd host that dead-ends in the app. `label` is the Portuguese screen name
 * shown in the dropdown and in the send confirm dialog.
 *
 * MIRROR: this list must stay in sync with the deep-link resolver in lits-mobile
 * (same hosts). When a navigable screen is added or renamed on the app side, add
 * or rename it here too — the two sides are a single manual of destinations kept
 * in two places.
 */
export const ANNOUNCEMENT_DESTINATIONS = [
  { value: "lits://feed", label: "Feed (padrão)" },
  { value: "lits://discovery", label: "Descobrir" },
  { value: "lits://messages", label: "Mensagens" },
  { value: "lits://ranking", label: "Ranking" },
  { value: "lits://voce", label: "Meu perfil (Você)" },
  { value: "lits://bookings", label: "Minhas reservas" },
  { value: "lits://match-history", label: "Meus jogos" },
  { value: "lits://connections", label: "Conexões" },
  { value: "lits://nivelamento", label: "Nivelamento" },
  { value: "lits://subscription", label: "Premium (assinatura)" },
  { value: "lits://wallet", label: "Carteira" },
  { value: "lits://events", label: "Eventos" },
  { value: "lits://notifications", label: "Notificações" },
  { value: "lits://mutuals", label: "Conexões em comum" },
  { value: "lits://settings", label: "Configurações" },
  { value: "lits://referral", label: "Convide e ganhe" },
  { value: "lits://quick-match", label: "Jogo Rápido" },
] as const;

/**
 * Sentinel select value for the "Outro (avançado)" escape hatch, which reveals a
 * free-text input for parametric deep links (e.g. `lits://profile/123`) that no
 * fixed screen entry can express. Never sent to the BFF — it only toggles the UI.
 */
export const CUSTOM_DESTINATION = "__custom__";

/** True for any well-formed `lits://<something>` deep link. */
export function isValidDeepLink(value: string): boolean {
  return /^lits:\/\/.+/.test(value.trim());
}

const DESTINATION_LABELS: Record<string, string> = Object.fromEntries(
  ANNOUNCEMENT_DESTINATIONS.map((d) => [d.value, d.label])
);

/**
 * Friendly PT label for a deep link, for the confirm dialog. Known hosts resolve
 * to their screen name; an empty value is the feed default; anything else (a
 * parametric link typed via the escape hatch) falls back to the raw string.
 */
export function destinationLabel(deepLink: string): string {
  const v = deepLink.trim();
  if (!v) return ANNOUNCEMENT_DESTINATIONS[0].label;
  return DESTINATION_LABELS[v] ?? v;
}
