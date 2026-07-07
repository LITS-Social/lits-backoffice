// ─── #01 Partidas Aguardando Jogo ────────────────────────────────────────────

export type MatchStatus = "confirmed" | "pending";
export type WeatherAlert = "rain" | "clear" | "uncertain";

export interface UpcomingMatch {
  id: string;
  player1: string;
  player2: string;
  club: string;
  court: string;
  neighborhood: string;
  datetime: Date;
  category: string;
  type: "ranked" | "casual";
  weather: WeatherAlert;
  status: MatchStatus;
}

const now = new Date();
const h = (hours: number) => new Date(now.getTime() + hours * 3600000);

export const upcomingMatches: UpcomingMatch[] = [
  {
    id: "m1",
    player1: "Rafael Monteiro",
    player2: "Bruno Carvalho",
    club: "Paulista Tennis Center",
    court: "Quadra 3 — Saibro",
    neighborhood: "Jardins",
    datetime: h(1.5),
    category: "B2",
    type: "ranked",
    weather: "rain",
    status: "confirmed",
  },
  {
    id: "m2",
    player1: "Thiago Almeida",
    player2: "Lucas Fernandes",
    club: "Fast Tênis Lapa",
    court: "Quadra 1 — Rápida",
    neighborhood: "Lapa",
    datetime: h(2),
    category: "C1",
    type: "casual",
    weather: "clear",
    status: "confirmed",
  },
  {
    id: "m3",
    player1: "Eduardo Pires",
    player2: "Gustavo Saad",
    club: "Paulista Tennis Center",
    court: "Quadra 7 — Saibro",
    neighborhood: "Jardins",
    datetime: h(3),
    category: "A1",
    type: "ranked",
    weather: "uncertain",
    status: "confirmed",
  },
  {
    id: "m4",
    player1: "Felipe Ramos",
    player2: "Marcos Vieira",
    club: "Clube Atletismo SP",
    court: "Quadra 2 — Indoor",
    neighborhood: "Pinheiros",
    datetime: h(4.5),
    category: "B1",
    type: "ranked",
    weather: "rain",
    status: "confirmed",
  },
  {
    id: "m5",
    player1: "André Lemos",
    player2: "Rodrigo Nunes",
    club: "Fast Tênis Lapa",
    court: "Quadra 4 — Saibro",
    neighborhood: "Lapa",
    datetime: h(6),
    category: "C2",
    type: "casual",
    weather: "clear",
    status: "confirmed",
  },
];

// ─── #02 Partidas Finalizadas ─────────────────────────────────────────────────

export type FinishedIssue = "no_score" | "score_conflict" | "no_show" | null;

export interface FinishedMatch {
  id: string;
  player1: string;
  player2: string;
  club: string;
  datetime: Date;
  category: string;
  score1?: string;
  score2?: string;
  issue: FinishedIssue;
  winner?: string;
}

const past = (hours: number) => new Date(now.getTime() - hours * 3600000);

export const finishedMatches: FinishedMatch[] = [
  {
    id: "f1",
    player1: "Carlos Henrique",
    player2: "Vitor Souza",
    club: "Paulista Tennis Center",
    datetime: past(1),
    category: "B2",
    issue: "no_score",
  },
  {
    id: "f2",
    player1: "Leonardo Batista",
    player2: "Mateus Costa",
    club: "Fast Tênis Lapa",
    datetime: past(3),
    category: "A1",
    score1: "6-3 6-4",
    score2: "6-4 6-3",
    issue: "score_conflict",
  },
  {
    id: "f3",
    player1: "Pedro Maia",
    player2: "Sérgio Fonseca",
    club: "Paulista Tennis Center",
    datetime: past(5),
    category: "C1",
    issue: "no_show",
    winner: "Pedro Maia",
  },
  {
    id: "f4",
    player1: "Fábio Nascimento",
    player2: "Diego Ribeiro",
    club: "Clube Atletismo SP",
    datetime: past(8),
    category: "B1",
    score1: "6-2 6-1",
    score2: "6-2 6-1",
    winner: "Fábio Nascimento",
    issue: null,
  },
  {
    id: "f5",
    player1: "Henrique Tavares",
    player2: "Roberto Campos",
    club: "Fast Tênis Lapa",
    datetime: past(12),
    category: "B2",
    issue: "no_score",
  },
  {
    id: "f6",
    player1: "Alexandre Gomes",
    player2: "Renato Lima",
    club: "Paulista Tennis Center",
    datetime: past(20),
    category: "A2",
    score1: "7-5 4-6 6-3",
    score2: "7-5 4-6 6-3",
    winner: "Alexandre Gomes",
    issue: null,
  },
];

// ─── #03 Convites em Aberto ───────────────────────────────────────────────────

export interface OpenInvite {
  id: string;
  sender: string;
  receiver: string;
  club: string;
  matchDatetime: Date;
  expiresAt: Date;
  category: string;
  type: "ranked" | "casual";
}

export const openInvites: OpenInvite[] = [
  {
    id: "i1",
    sender: "João Ferreira",
    receiver: "Ricardo Andrade",
    club: "Paulista Tennis Center",
    matchDatetime: h(24),
    expiresAt: new Date(now.getTime() + 12 * 60000),
    category: "B2",
    type: "ranked",
  },
  {
    id: "i2",
    sender: "Paulo Silveira",
    receiver: "Marco Pereira",
    club: "Fast Tênis Lapa",
    matchDatetime: h(48),
    expiresAt: new Date(now.getTime() + 38 * 60000),
    category: "C1",
    type: "casual",
  },
  {
    id: "i3",
    sender: "Cláudio Mendes",
    receiver: "Antônio Sousa",
    club: "Clube Atletismo SP",
    matchDatetime: h(72),
    expiresAt: new Date(now.getTime() + 55 * 60000),
    category: "A1",
    type: "ranked",
  },
];

// ─── #04 Jogadores Sem Recomendação ──────────────────────────────────────────

export interface NoMatchPlayer {
  id: string;
  name: string;
  category: string;
  neighborhood: string;
  preferredTime: string;
  fallback: "founder" | "partner";
  since: Date;
}

export const noMatchPlayers: NoMatchPlayer[] = [
  {
    id: "p1",
    name: "André Rodrigues",
    category: "A1",
    neighborhood: "Moema",
    preferredTime: "Manhã (7h-10h)",
    fallback: "founder",
    since: past(48),
  },
  {
    id: "p2",
    name: "Beatriz Lima",
    category: "C2",
    neighborhood: "Santo André",
    preferredTime: "Noite (19h-22h)",
    fallback: "partner",
    since: past(24),
  },
  {
    id: "p3",
    name: "Fernando Cortez",
    category: "B2",
    neighborhood: "Santana",
    preferredTime: "Tarde (13h-17h)",
    fallback: "founder",
    since: past(6),
  },
  {
    id: "p4",
    name: "Mariana Castro",
    category: "B1",
    neighborhood: "Perdizes",
    preferredTime: "Manhã (6h-9h)",
    fallback: "partner",
    since: past(12),
  },
];

// ─── #05 Cancelamentos e Desistências ────────────────────────────────────────

export type CancelType = "cancellation" | "withdrawal";

export interface Cancellation {
  id: string;
  player: string;
  opponent: string;
  club: string;
  matchDatetime: Date;
  cancelledAt: Date;
  type: CancelType;
  withinPolicy: boolean;
  reason?: string;
  quickMatchTriggered: boolean;
}

export const cancellations: Cancellation[] = [
  {
    id: "c1",
    player: "Rodrigo Melo",
    opponent: "Thiago Santos",
    club: "Paulista Tennis Center",
    matchDatetime: h(2),
    cancelledAt: new Date(now.getTime() - 10 * 60000),
    type: "withdrawal",
    withinPolicy: false,
    reason: "Compromisso de trabalho",
    quickMatchTriggered: false,
  },
  {
    id: "c2",
    player: "Lucas Barros",
    opponent: "Fábio Dias",
    club: "Fast Tênis Lapa",
    matchDatetime: h(26),
    cancelledAt: past(2),
    type: "cancellation",
    withinPolicy: true,
    quickMatchTriggered: false,
  },
  {
    id: "c3",
    player: "Guilherme Alves",
    opponent: "Sandro Lima",
    club: "Clube Atletismo SP",
    matchDatetime: h(1),
    cancelledAt: past(0.5),
    type: "withdrawal",
    withinPolicy: false,
    reason: "Problema de saúde",
    quickMatchTriggered: true,
  },
];

// ─── #06 Problemas de Pagamento ──────────────────────────────────────────────

export type PaymentStatus = "pending" | "manual_check" | "resolved" | "failed";

export interface PaymentIssue {
  id: string;
  user: string;
  amount: number;
  method: "pix";
  club: string;
  matchDatetime: Date;
  reportedAt: Date;
  status: PaymentStatus;
  pixKey?: string;
  notes?: string;
}

export const paymentIssues: PaymentIssue[] = [
  {
    id: "pay1",
    user: "Adriano Costa",
    amount: 39.9,
    method: "pix",
    club: "Paulista Tennis Center",
    matchDatetime: h(3),
    reportedAt: past(0.5),
    status: "pending",
    pixKey: "11999999001",
  },
  {
    id: "pay2",
    user: "Renata Figueiredo",
    amount: 39.9,
    method: "pix",
    club: "Fast Tênis Lapa",
    matchDatetime: h(5),
    reportedAt: past(1.5),
    status: "manual_check",
    pixKey: "renata@gmail.com",
    notes: "Usuário enviou comprovante via WhatsApp",
  },
  {
    id: "pay3",
    user: "Cristiano Neves",
    amount: 39.9,
    method: "pix",
    club: "Clube Atletismo SP",
    matchDatetime: past(2),
    reportedAt: past(4),
    status: "resolved",
    pixKey: "21988888002",
  },
];

// ─── #07 Quadras Indisponíveis ────────────────────────────────────────────────

export interface CourtIssue {
  id: string;
  club: string;
  court: string;
  neighborhood: string;
  matchDatetime: Date;
  player1: string;
  player2: string;
  reportedAt: Date;
  reason: string;
  resolved: boolean;
  alternativeOffered?: string;
}

export const courtIssues: CourtIssue[] = [
  {
    id: "ci1",
    club: "Paulista Tennis Center",
    court: "Quadra 5 — Saibro",
    neighborhood: "Jardins",
    matchDatetime: h(1),
    player1: "Bernardo Lima",
    player2: "Caio Martins",
    reportedAt: new Date(now.getTime() - 30 * 60000),
    reason: "Manutenção de última hora — rede danificada",
    resolved: false,
  },
  {
    id: "ci2",
    club: "Fast Tênis Lapa",
    court: "Quadra 2 — Rápida",
    neighborhood: "Lapa",
    matchDatetime: h(3),
    player1: "Diogo Carmo",
    player2: "Evandro Silva",
    reportedAt: past(0.25),
    reason: "Erro no sistema de agendamento — duplo booking",
    resolved: true,
    alternativeOffered: "Quadra 3 — Saibro confirmada",
  },
];

// ─── #08 Avaliações ───────────────────────────────────────────────────────────

export interface PlayerRating {
  id: string;
  player: string;
  category: string;
  ratingsCount: number;
  avgRating: number;
  lastRating: number;
  lastRatedBy: string;
  lastRatedAt: Date;
  flag: "positive" | "neutral" | "negative";
}

export const playerRatings: PlayerRating[] = [
  {
    id: "r1",
    player: "Rafael Monteiro",
    category: "B2",
    ratingsCount: 8,
    avgRating: 4.9,
    lastRating: 5,
    lastRatedBy: "Bruno Carvalho",
    lastRatedAt: past(2),
    flag: "positive",
  },
  {
    id: "r2",
    player: "Pedro Maia",
    category: "C1",
    ratingsCount: 6,
    avgRating: 2.1,
    lastRating: 2,
    lastRatedBy: "Sérgio Fonseca",
    lastRatedAt: past(5),
    flag: "negative",
  },
  {
    id: "r3",
    player: "Thiago Almeida",
    category: "C1",
    ratingsCount: 4,
    avgRating: 4.5,
    lastRating: 4,
    lastRatedBy: "Lucas Fernandes",
    lastRatedAt: past(3),
    flag: "positive",
  },
  {
    id: "r4",
    player: "Fábio Nascimento",
    category: "B1",
    ratingsCount: 10,
    avgRating: 4.7,
    lastRating: 5,
    lastRatedBy: "Diego Ribeiro",
    lastRatedAt: past(8),
    flag: "positive",
  },
  {
    id: "r5",
    player: "Marcos Vieira",
    category: "B1",
    ratingsCount: 5,
    avgRating: 2.8,
    lastRating: 2,
    lastRatedBy: "Felipe Ramos",
    lastRatedAt: past(4.5),
    flag: "negative",
  },
  {
    id: "r6",
    player: "Eduardo Pires",
    category: "A1",
    ratingsCount: 12,
    avgRating: 4.8,
    lastRating: 5,
    lastRatedBy: "Gustavo Saad",
    lastRatedAt: past(3),
    flag: "positive",
  },
  {
    id: "r7",
    player: "Leonardo Batista",
    category: "A1",
    ratingsCount: 9,
    avgRating: 3.6,
    lastRating: 3,
    lastRatedBy: "Mateus Costa",
    lastRatedAt: past(3),
    flag: "neutral",
  },
];

// ─── #09 Denúncias ────────────────────────────────────────────────────────────

export type ReportStatus = "open" | "under_review" | "resolved" | "dismissed";
export type ReportReason =
  | "inappropriate_behavior"
  | "wrong_level"
  | "no_show_repeat"
  | "harassment"
  | "other";

export interface Report {
  id: string;
  reporter: string;
  reported: string;
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
  outcome?: string;
}

export const reports: Report[] = [
  {
    id: "rep1",
    reporter: "Carlos Henrique",
    reported: "Marcos Vieira",
    reason: "inappropriate_behavior",
    description:
      "Jogo intenso e parceiro ficou xingando a cada ponto perdido. Comportamento agressivo dentro de quadra.",
    status: "open",
    createdAt: past(2),
    updatedAt: past(2),
  },
  {
    id: "rep2",
    reporter: "Felipe Ramos",
    reported: "Pedro Maia",
    reason: "no_show_repeat",
    description:
      "Segundo no-show consecutivo. Chegou no clube e adversário não apareceu e nem avisou.",
    status: "under_review",
    createdAt: past(5),
    updatedAt: past(1),
  },
  {
    id: "rep3",
    reporter: "Renato Lima",
    reported: "Alexandre Gomes",
    reason: "wrong_level",
    description:
      "Jogador claramente muito acima da categoria B2. Jogada e posicionamento são de nível A.",
    status: "resolved",
    createdAt: past(48),
    updatedAt: past(24),
    outcome: "Nível revisado para A2 após análise dos resultados.",
  },
];

export const reasonLabel: Record<ReportReason, string> = {
  inappropriate_behavior: "Comportamento inadequado",
  wrong_level: "Nível declarado incorreto",
  no_show_repeat: "No-show recorrente",
  harassment: "Assédio",
  other: "Outro",
};
