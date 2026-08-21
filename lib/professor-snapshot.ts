import "server-only";
import { TOKEN_MISSING, errorFrom, landingAuthHeaders, landingBaseUrl } from "./landing-admin";

/**
 * O painel do professor embaixador, montado a partir do produto.
 *
 * O professor abre `lits.social/professores/painel` e vê os alunos que
 * entraram pelo código dele, as partidas de cada um e quanto aquilo rendeu.
 * Nada disso pode ser lido de lá: a landing é pública e sem sessão de staff,
 * e o vínculo aluno↔quem indicou vive no Postgres do produto. Então o
 * backoffice — que tem o JWT humano do Access — lê o produto, monta o
 * snapshot e EMPURRA para o D1 da landing, exatamente como já faz com o
 * diretório de academias (`landing-academias.ts`) e com o RI (`ri-sync.ts`).
 *
 * COMO OS DOIS MUNDOS SE LIGAM
 *
 *   professor (D1 `professores`) ──email──▶ usuário do app (`/v1/ops/users`)
 *        │                                         │
 *        └── mgm_user_id ◀────── é o mesmo UUID ────┘
 *                                                  │
 *                        `mgm_codes.user_id` ──▶ `mgm_invites.inviter_id`
 *                                                  │
 *                                          alunos indicados (invitees[])
 *
 * O e-mail resolve o vínculo UMA vez; daí em diante o `mgm_user_id` gravado
 * no D1 é a chave. Isso importa porque e-mail é chave que funciona até o dia
 * em que o professor se cadastra no app com outro — e nesse dia o painel
 * ficaria vazio sem ninguém entender por quê.
 *
 * O QUE O PRODUTO AINDA NÃO SABE RESPONDER
 *
 * Dois campos do painel não existem em contrato nenhum do BFF hoje:
 *
 *   · `membro` / `membro_desde` — não há assinatura paga no beta (todo
 *     signup ganha Premium de cortesia por 90 dias). Usamos como proxy o
 *     mesmo critério que o próprio produto usa para premiar indicação:
 *     `status === 'played'`, o aluno que já jogou uma partida PAGA. É o
 *     evento que de fato vira dinheiro, e é honesto chamá-lo de "entrou".
 *   · `placar` e `piso` — o primeiro só existe em `lits.posts.score_json`,
 *     o segundo em `/v1/ops/courts.surface`. Ambos exigiriam uma segunda
 *     leitura por partida; ficam de fora até haver contrato que os traga
 *     junto, e o painel já sabe desenhar a ausência (mostra "placar ainda
 *     não registrado" em vez de inventar).
 *
 * A COMISSÃO NÃO É CALCULADA AQUI
 *
 * O snapshot manda `valor_centavos` (o preço da quadra) e quem aplica os 5%
 * é a landing, em `src/shared/comissao.ts`. Uma regra de dinheiro em dois
 * repositórios é uma regra que um dia diverge; a que vale é a que o
 * professor lê no painel.
 */

/** Um professor cadastrado na landing, o mínimo para montar o snapshot dele. */
export interface ProfessorAlvo {
  email: string;
  /** Quando já se sabe; evita depender do casamento por e-mail. */
  mgmUserId?: string | null;
}

/** `/v1/ops/mgm-referrals` → um indicado do professor. */
export interface InviteeLike {
  user_id?: string | null;
  name?: string | null;
  status?: string | null;
  accepted_at?: string | null;
}

/** `/v1/ops/mgm-referrals` → a linha do convidador. */
export interface ReferralLike {
  inviter_id?: string | null;
  invitees?: InviteeLike[] | null;
}

/** `/v1/ops/users` → o que usamos de um usuário. */
export interface UserLike {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone_e164?: string | null;
  level?: string | null;
  avatar_url?: string | null;
}

/** `/v1/ops/finished-matches` → uma partida encerrada. */
export interface MatchLike {
  booking_id?: string | null;
  club_name?: string | null;
  court_label?: string | null;
  starts_at?: string | null;
  price_cents?: number | null;
  host?: { user_id?: string | null; name?: string | null } | null;
  guest?: { user_id?: string | null; name?: string | null } | null;
}

/** O corpo que `POST /api/admin/professores-sync` espera. */
export interface ProfessorSnapshot {
  email: string;
  mgm_user_id?: string;
  codigo?: string;
  meses: { mes: string; gerou_centavos: number; jogos: number; novos_membros: number }[];
  alunos: SnapshotAluno[];
}

interface SnapshotAluno {
  ref: string;
  nome: string;
  categoria: string | null;
  membro: boolean;
  membro_desde: string | null;
  jogos_mes: number;
  gerou_mes_centavos: number;
  gerou_total_centavos: number;
  celular: string | null;
  email: string | null;
  academia: string | null;
  foto: string | null;
  partidas: SnapshotPartida[];
}

interface SnapshotPartida {
  ref: string;
  vs: string;
  vs_categoria: string | null;
  vs_foto: string | null;
  jogada_em: string | null;
  horario: string | null;
  local: string | null;
  /** O preço da quadra. A landing deriva a comissão daqui. */
  valor_centavos: number;
}

/**
 * Percentual espelhado da landing (`src/shared/comissao.ts`) — usado SÓ para
 * a prévia que o operador vê antes de publicar. O valor que o professor
 * recebe é sempre o que a landing calcula.
 */
const PCT_COMISSAO = 0.05;

/** 'YYYY-MM-DD' de um ISO, sem passar por Date (evita fuso). */
function dia(iso?: string | null): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(iso ?? ""));
  return m ? m[1] : null;
}

/** 'HH' de um ISO, no formato que o painel exibe ("19h"). */
function hora(iso?: string | null): string | null {
  const m = /T(\d{2}):/.exec(String(iso ?? ""));
  return m ? `${Number(m[1])}h` : null;
}

/** Mês 'YYYY-MM' de um ISO. */
function mes(iso?: string | null): string | null {
  const m = /^(\d{4}-\d{2})/.exec(String(iso ?? ""));
  return m ? m[1] : null;
}

/** Nome curto — o painel mostra "vs Marina C.", não o nome inteiro. */
function nomeCurto(nome?: string | null): string {
  const partes = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "Jogador";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1].charAt(0).toUpperCase()}.`;
}

/** Categoria do produto (A|B|C|D|PRO) — o painel só desenha badge de A/B/C. */
function categoria(level?: string | null): string | null {
  const v = String(level ?? "").trim().toUpperCase();
  return v === "A" || v === "B" || v === "C" ? v : null;
}

/**
 * Monta o snapshot. Função PURA: recebe o que já foi lido do BFF e devolve o
 * corpo do POST. Sem I/O aqui, porque é a parte que precisa ser conferível —
 * é ela que decide quanto cada professor vai receber.
 */
export function buildProfessorSnapshot(input: {
  professor: ProfessorAlvo;
  mgmUserId: string;
  codigo?: string | null;
  referral: ReferralLike | null;
  usuarios: Map<string, UserLike>;
  partidas: MatchLike[];
  /** Mês de referência ('YYYY-MM') para os campos "do mês" do painel. */
  mesVigente: string;
}): ProfessorSnapshot {
  const { professor, mgmUserId, codigo, referral, usuarios, partidas, mesVigente } = input;

  const indicados = (referral?.invitees ?? []).filter(
    (i): i is InviteeLike & { user_id: string } => typeof i?.user_id === "string" && !!i.user_id
  );
  const idsIndicados = new Set(indicados.map((i) => i.user_id));

  // Uma passada nas partidas: cada uma interessa a no máximo um aluno
  // indicado (o professor não indicou os dois lados na prática, mas se
  // indicou, a partida entra para os dois — e é o certo: são duas pernas
  // pagas).
  const porAluno = new Map<string, MatchLike[]>();
  for (const p of partidas) {
    for (const lado of [p.host, p.guest]) {
      const id = lado?.user_id;
      if (!id || !idsIndicados.has(id)) continue;
      const lista = porAluno.get(id) ?? [];
      lista.push(p);
      porAluno.set(id, lista);
    }
  }

  const alunos: SnapshotAluno[] = indicados.map((inv) => {
    const u = usuarios.get(inv.user_id) ?? {};
    const minhas = (porAluno.get(inv.user_id) ?? []).sort((a, b) =>
      String(b.starts_at ?? "").localeCompare(String(a.starts_at ?? ""))
    );

    const comissaoDe = (p: MatchLike) => Math.round(Number(p.price_cents ?? 0) * PCT_COMISSAO);
    const doMes = minhas.filter((p) => mes(p.starts_at) === mesVigente);

    // "Entrou pro clube" = jogou partida paga (ver o cabeçalho). O produto
    // usa exatamente este critério para premiar indicação.
    const jogou = String(inv.status ?? "") === "played";

    return {
      ref: inv.user_id,
      nome: String(u.name ?? inv.name ?? "").trim() || "Aluno",
      categoria: categoria(u.level),
      membro: jogou,
      membro_desde: jogou ? mes(inv.accepted_at) : null,
      jogos_mes: doMes.length,
      gerou_mes_centavos: doMes.reduce((t, p) => t + comissaoDe(p), 0),
      gerou_total_centavos: minhas.reduce((t, p) => t + comissaoDe(p), 0),
      celular: u.phone_e164 ?? null,
      email: u.email ?? null,
      // A academia do aluno é onde ele de fato jogou por último — o produto
      // não guarda "clube do usuário", e o último clube é o que o professor
      // reconhece quando bate o olho.
      academia: minhas.find((p) => p.club_name)?.club_name ?? null,
      foto: u.avatar_url ?? null,
      partidas: minhas.map((p) => {
        const euSouHost = p.host?.user_id === inv.user_id;
        const outro = euSouHost ? p.guest : p.host;
        const outroId = outro?.user_id ?? "";
        const outroU = outroId ? usuarios.get(outroId) : undefined;
        return {
          ref: String(p.booking_id ?? ""),
          vs: `vs ${nomeCurto(outro?.name)}`,
          vs_categoria: categoria(outroU?.level),
          vs_foto: outroU?.avatar_url ?? null,
          jogada_em: dia(p.starts_at),
          horario: hora(p.starts_at),
          local: [p.club_name, p.court_label].filter(Boolean).join(" · ") || null,
          valor_centavos: Math.round(Number(p.price_cents ?? 0)),
        };
      }),
    };
  });

  // A série mensal do filtro do painel, derivada das mesmas partidas — não
  // de uma segunda contagem que poderia discordar da primeira.
  const serie = new Map<string, { gerou_centavos: number; jogos: number; novos_membros: number }>();
  for (const a of alunos) {
    for (const p of a.partidas) {
      const m = mes(p.jogada_em);
      if (!m) continue;
      const linha = serie.get(m) ?? { gerou_centavos: 0, jogos: 0, novos_membros: 0 };
      linha.gerou_centavos += Math.round(p.valor_centavos * PCT_COMISSAO);
      linha.jogos += 1;
      serie.set(m, linha);
    }
    if (a.membro && a.membro_desde) {
      const linha = serie.get(a.membro_desde) ?? { gerou_centavos: 0, jogos: 0, novos_membros: 0 };
      linha.novos_membros += 1;
      serie.set(a.membro_desde, linha);
    }
  }

  return {
    email: professor.email,
    mgm_user_id: mgmUserId,
    ...(codigo ? { codigo } : {}),
    meses: [...serie.entries()]
      .map(([mesRef, v]) => ({ mes: mesRef, ...v }))
      .sort((a, b) => b.mes.localeCompare(a.mes)),
    alunos,
  };
}

export type PushSnapshotResult = { ok: true; alunos: number } | { ok: false; error: string };

/** Publica o snapshot de um professor no D1 da landing. */
export async function pushProfessorSnapshot(
  snapshot: ProfessorSnapshot,
  staffEmail?: string | null
): Promise<PushSnapshotResult> {
  const headers = landingAuthHeaders(staffEmail);
  if (!headers) return { ok: false, error: TOKEN_MISSING };

  let res: Response;
  try {
    res = await fetch(`${landingBaseUrl()}/api/admin/professores-sync`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(snapshot),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "não deu para falar com a landing agora." };
  }

  if (!res.ok) {
    return { ok: false, error: await errorFrom(res, "a landing recusou o snapshot") };
  }
  try {
    const body = (await res.json()) as { alunos?: unknown };
    return { ok: true, alunos: typeof body.alunos === "number" ? body.alunos : snapshot.alunos.length };
  } catch {
    return { ok: true, alunos: snapshot.alunos.length };
  }
}
