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
 * Rótulos humanos por status do slot.
 *
 * O funil PASSOU A EXISTIR com a ADR-0064 (migrations 20260805120000 e
 * 20260805130000). Três estados com writer de verdade, em três momentos
 * diferentes:
 *
 *   declared  → o convidador nomeou o telefone; ninguém se cadastrou ainda
 *   signed_up → a pessoa se cadastrou (antes chamava-se `first_match`, nome
 *               que mentia: era gravado no cadastro, não na primeira partida)
 *   played    → a janela de uma reserva dela terminou. É O QUE CONTA PRÊMIO
 *
 * `first_match` continua mapeado porque é valor LEGADO: durante a janela de
 * deploy da 20260805130000 um pod velho ainda podia escrevê-lo. Leia-o como
 * `signed_up` — o promotor do user-service converte. Já converted/completed
 * seguem no CHECK SEM writer nenhum: aparecem aqui só para o dia em que
 * ganharem write path.
 */
export const MGM_STATUS_LABELS: Record<string, string> = {
  declared: "Reservado · aguardando cadastro",
  signed_up: "Entrou · falta jogar",
  played: "Jogou",
  first_match: "Entrou · falta jogar",
  converted: "Converteu",
  completed: "Completou",
  fraudulent: "Fraude",
  expired: "Expirado",
};

export const MGM_STATUS_NOTE =
  "O prêmio conta 3 indicados que JOGARAM (“Jogou”), não 3 cadastros — mudou em 05/08. " +
  "Quem aparecia com a meta batida por cadastro voltou a pendente de propósito. " +
  "“Reservado” é vaga que o convidador nomeou por telefone e ocupa slot, mas não " +
  "conquista nada. Já “Converteu” e “Completou” continuam sem nenhum processo que os " +
  "escreva — não leia a ausência deles como “ninguém converteu”.";

/**
 * A ressalva da ÚNICA escrita que este painel tem (ADR-0064 §8). Fica separada
 * de MGM_STATUS_NOTE porque só vale onde o botão existe — o card do Norte do
 * Produto lê o mesmo dado e não escreve nada.
 */
export const MGM_FRAUD_NOTE =
  "“Fraude” é a única escrita deste painel, e existe porque o prêmio é entregue à mão: " +
  "marcar tira a indicação do teto de 3 do convidador e do prêmio na hora, e nenhuma " +
  "varredura volta a promovê-la. O motivo é obrigatório e vai literal para o registro de " +
  "auditoria com o e-mail de quem marcou. Não existe botão de “marcar como jogou”: “Jogou” " +
  "é derivado do fim da janela da reserva, e um botão desses seria um botão de fabricar prêmio.";

/**
 * O teto/gatilho do prêmio, espelhando `mgmRewardSlots` do bff-backoffice e
 * `mgmGoal` do bff-mobile. Existe aqui para a UI poder escrever “2/3 jogaram”
 * sem cravar o 3 no meio do JSX; se o goal mudar lá, mude AQUI junto.
 */
export const MGM_REWARD_SLOTS = 3;

export function mgmStatusLabel(status: string): string {
  return MGM_STATUS_LABELS[status] ?? status;
}

/**
 * Cor do selo por status. A regra é a mesma da nota acima: SÓ “Jogou” pinta de
 * verde. Pintar “Entrou” de verde era exatamente a leitura errada que o funil
 * de um tempo só produzia — slot cheio parecendo conquista.
 */
export function mgmStatusTone(
  status: string
): "default" | "success" | "warning" | "error" | "info" | "muted" {
  switch (status) {
    case "played":
      return "success";
    case "fraudulent":
      return "error";
    case "expired":
      return "muted";
    case "declared":
      return "warning";
    default:
      // signed_up / first_match / converted / completed: entrou, não conquistou.
      return "info";
  }
}
