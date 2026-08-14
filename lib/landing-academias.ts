import "server-only";
import { TOKEN_MISSING, errorFrom, landingAuthHeaders, landingBaseUrl } from "./landing-admin";

/**
 * Publicação do diretório de academias na landing.
 *
 * Inverte o sentido dos outros clientes deste canal. A waitlist e os
 * professores nascem na landing e o painel vem LER; as academias nascem no
 * Postgres do produto (`franchises`) e é a LANDING que precisa ler — o
 * dropdown "onde você dá aula" de lits.social/professores tem que oferecer as
 * academias reais do app, senão o professor escreve o nome à mão e ninguém
 * consegue ligar o cadastro dele a uma academia de verdade.
 *
 * A landing não tem como consultar o Postgres: o BFF exige o JWT humano do
 * Cloudflare Access e a landing é pública, sem sessão. Abrir rota pública no
 * BFF significaria furar o Access e criar CORS e rate-limit novos em cima da
 * infra do produto, para servir um dado que é público e muda pouco. Então o
 * backoffice — que já é o portador do token e já fala com a landing —
 * EMPURRA a lista para um espelho em D1.
 *
 * O espelho é cache: ninguém edita nada lá, e cada publicação reescreve tudo.
 * A verdade continua sendo o Postgres.
 */

/** O que vai no corpo do POST. Espelha o que a Pages Function aceita. */
export interface AcademiaPayload {
  id: string;
  nome: string;
  slug: string;
  kind: string;
  marca: string | null;
  endereco: string | null;
  cidade: string | null;
  lat: number | null;
  lng: number | null;
}

/** Forma mínima de uma franquia vinda do BFF — só o que a publicação usa. */
export interface FranchiseLike {
  id: string;
  name: string;
  slug: string;
  kind: string;
  brand: string | null;
  active: boolean;
  lat: number | null;
  lng: number | null;
  street_address?: string | null;
}

export type MirrorStatus =
  | { ok: true; total: number; syncedAt: number | null }
  | { ok: false; error: string };

export type PublishResult =
  | { ok: true; total: number; removed: number; ignored: number; syncedAt: number }
  | { ok: false; error: string; needsForce?: boolean };

/**
 * Cidade, quando o endereço diz sem ambiguidade.
 *
 * Deliberadamente burro: procura "sao paulo" no endereço normalizado e pronto.
 * Não existe campo de cidade em `franchises` — o endereço é texto livre vindo
 * do crawler —, e inventar um parser de endereço brasileiro para preencher uma
 * coluna que hoje ninguém filtra seria trocar "sem dado" por "dado errado".
 * Null é a resposta honesta para todo o resto.
 */
export function cidadeDoEndereco(address: string | null | undefined): string | null {
  if (!address) return null;
  const flat = address
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return flat.includes("sao paulo") ? "São Paulo" : null;
}

/**
 * Quais franquias vão para a landing.
 *
 * ATIVAS e com nome — nada além disso. A tentação é recortar por cidade ou por
 * tipo (só as parceiras, só as de São Paulo), mas o dropdown tem busca: uma
 * lista maior custa nada a quem digita, e uma lista recortada demais custa um
 * professor que não acha o clube dele e escreve o nome à mão em "Outro" — que
 * é justamente o que a integração existe para evitar.
 */
export function academiasParaPublicar(franchises: FranchiseLike[]): AcademiaPayload[] {
  return franchises
    .filter((f) => f.active && f.name?.trim())
    .map((f) => ({
      id: f.id,
      nome: f.name.trim(),
      slug: f.slug,
      kind: f.kind,
      marca: f.brand,
      endereco: f.street_address ?? null,
      cidade: cidadeDoEndereco(f.street_address),
      lat: f.lat,
      lng: f.lng,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Quantas academias o dropdown está oferecendo hoje, e de quando é a lista. */
export async function fetchMirrorStatus(): Promise<MirrorStatus> {
  const headers = landingAuthHeaders();
  if (!headers) return { ok: false, error: TOKEN_MISSING };

  let res: Response;
  try {
    res = await fetch(new URL("/api/admin/academias", landingBaseUrl()), {
      headers,
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Não foi possível falar com a landing." };
  }
  if (!res.ok) {
    return { ok: false, error: await errorFrom(res, "Falha ao ler o estado da landing.") };
  }
  try {
    const body = (await res.json()) as { total?: number; synced_at?: number | null };
    return { ok: true, total: body.total ?? 0, syncedAt: body.synced_at ?? null };
  } catch {
    return { ok: false, error: "Resposta inválida da landing." };
  }
}

/**
 * Publica a lista INTEIRA. A rota do outro lado reconcilia: o que não vier
 * neste envio é apagado de lá.
 *
 * `force` só existe para o caso em que a lista encolheu de verdade (academias
 * desativadas em massa) — sem ele a landing recusa uma queda grande, que é
 * quase sempre sintoma de leitura quebrada aqui, não de decisão de ninguém.
 */
export async function publishAcademias(
  academias: AcademiaPayload[],
  force = false
): Promise<PublishResult> {
  const headers = landingAuthHeaders();
  if (!headers) return { ok: false, error: TOKEN_MISSING };
  if (academias.length === 0) {
    // Mesma recusa que a landing faria, só que sem gastar a viagem: publicar
    // lista vazia apagaria o dropdown.
    return { ok: false, error: "Nada para publicar — a leitura das academias voltou vazia." };
  }

  const url = new URL("/api/admin/academias", landingBaseUrl());
  if (force) url.searchParams.set("force", "1");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ academias }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Não foi possível falar com a landing." };
  }

  if (res.status === 409) {
    // Encolhimento suspeito: a mensagem da Function traz os dois números, e
    // quem está na tela decide se aquilo é real.
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    return {
      ok: false,
      needsForce: true,
      error: body?.detail ?? "A landing recusou: a lista encolheu muito de uma vez.",
    };
  }
  if (!res.ok) {
    return { ok: false, error: await errorFrom(res, "Falha ao publicar na landing.") };
  }

  try {
    const body = (await res.json()) as {
      total?: number;
      removed?: number;
      ignored?: number;
      synced_at?: number;
    };
    return {
      ok: true,
      total: body.total ?? academias.length,
      removed: body.removed ?? 0,
      ignored: body.ignored ?? 0,
      syncedAt: body.synced_at ?? Math.floor(Date.now() / 1000),
    };
  } catch {
    return { ok: false, error: "Resposta inválida da landing." };
  }
}
