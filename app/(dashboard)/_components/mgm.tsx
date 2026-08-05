/**
 * ── Indicação entre jogadores (MGM) ───────────────────────────────────────────
 *
 * A armadilha que este arquivo existe para desarmar: "quantos convites foram
 * ENVIADOS?" não tem resposta server-side. O envio é o share sheet do aparelho
 * — o backend só vê (1) o código nascer quando alguém ABRE a tela de convite
 * (GET /v1/mgm/me, lazy) e (2) o ACEITE (POST /v1/mgm/accept). Qualquer
 * superfície que rotule um desses dois como "enviados" está mentindo; por isso
 * a ressalva é escrita UMA vez aqui e lida no card do Norte e no detalhe.
 *
 * E o aceite é PISO: quando o convidador já tem 3 slots ativos, o 4º aceite é
 * descartado em silêncio (nenhuma linha nasce), e quem já foi indicado uma vez
 * não conta de novo (invitee é UNIQUE).
 */

/** A ressalva de origem do dado, citada em toda superfície MGM. */
export const MGM_SENT_NOTE =
  "Convites ENVIADOS não são mensuráveis: o compartilhamento acontece no aparelho (share " +
  "sheet) e o painel não lê telemetria de app — o que o backend registra é o ACEITE " +
  "(POST /v1/mgm/accept) e a criação do código (abrir a tela de convite). E o aceite é " +
  "piso: o 4º aceite de quem já tem 3 ativos é descartado sem registro, e quem já foi " +
  "indicado uma vez não conta de novo.";

/**
 * Rótulos humanos por status do slot. O funil de status NÃO é instrumentado:
 * nenhum writer flipa first_match → converted/completed/fraudulent/expired
 * hoje, então toda linha vive em first_match — os outros valores existem no
 * schema e aparecem aqui só para o dia em que ganharem write path. Quem
 * renderizar isto deve dizer que o funil não roda ainda (MGM_STATUS_NOTE).
 */
export const MGM_STATUS_LABELS: Record<string, string> = {
  first_match: "Aceito · 1º jogo pendente",
  converted: "Converteu",
  completed: "Completou",
  fraudulent: "Fraude",
  expired: "Expirado",
};

export const MGM_STATUS_NOTE =
  "O funil de status não é instrumentado: nenhum processo muda o status de um aceite hoje, " +
  "então todo slot fica em “Aceito · 1º jogo pendente” para sempre — não leia isso como " +
  "“ninguém converteu”.";

export function mgmStatusLabel(status: string): string {
  return MGM_STATUS_LABELS[status] ?? status;
}
