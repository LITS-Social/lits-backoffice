import { reaisToCents } from "@/lib/utils";
import type { CourtListItem } from "../../quadras/actions";
import { applyPriceTableAction } from "../../quadras/[id]/editar/actions";

/**
 * A tabela de preços da academia, guardada como REGRA — não como histórico.
 *
 * Duas coisas dependem dela viver aqui e não só na grade:
 *
 * 1. A tela abre no que foi aplicado. A releitura da grade continua existindo
 *    como plano B, mas é LOSSY por natureza: ela infere a tabela dos preços
 *    que sobraram, e toda hora sem slot — vendida, fora do funcionamento, fora
 *    da janela de leitura — some da inferência. Uma faixa das 18h às 22h
 *    voltava como "22–22 na segunda". Quem sabe o que foi aplicado é quem
 *    aplicou.
 *
 * 2. Horário NOVO já nasce nela. O preço base vira o `default_price_cents` da
 *    quadra e a geração da grade o herda, mas as FAIXAS não existem para o
 *    gerador: ele só conhece um preço. Então o painel reaplica a tabela toda
 *    vez que cria horários — regenerar a grade, acrescentar slots, importar
 *    print. Sem isso, todo dia novo entrava chapado no base e o horário nobre
 *    tinha que ser remarcado à mão.
 *
 * Guardada por RECORTE porque coberta e descoberta têm tabelas diferentes de
 * propósito — foi o motivo de o recorte existir.
 */

export type Scope = "all" | "indoor" | "outdoor";

export type SavedBand = {
  startHour: number;
  endHour: number;
  /** Texto cru do campo, como o operador digitou. */
  price: string;
  weekdays: number[];
};

export type SavedTable = {
  basePrice: string;
  bands: SavedBand[];
  at: number;
};

const tableKey = (franchiseId: string, scope: Scope) =>
  `lits-price-table:${franchiseId}:${scope}`;

/** A tabela de UMA quadra — a exceção ao que o tipo dela manda. */
const courtKey = (courtId: string) => `lits-price-table:court:${courtId}`;

export function loadCourtTable(courtId: string): SavedTable | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(courtKey(courtId));
    return raw ? (JSON.parse(raw) as SavedTable) : null;
  } catch {
    return null;
  }
}

export function saveCourtTable(courtId: string, table: SavedTable) {
  try {
    localStorage.setItem(courtKey(courtId), JSON.stringify(table));
  } catch {
    /* sem localStorage a tela cai na releitura da grade, que ainda funciona */
  }
}

export function loadSavedTable(franchiseId: string, scope: Scope): SavedTable | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(tableKey(franchiseId, scope));
    return raw ? (JSON.parse(raw) as SavedTable) : null;
  } catch {
    return null;
  }
}

export function saveTable(franchiseId: string, scope: Scope, table: SavedTable) {
  try {
    localStorage.setItem(tableKey(franchiseId, scope), JSON.stringify(table));
  } catch {
    /* sem localStorage a tela cai na releitura da grade, que ainda funciona */
  }
}

/** A tabela que manda naquela quadra, do mais específico ao mais geral: a
    dela, a do tipo dela, a da academia inteira. Uma tabela feita para UMA
    quadra é a decisão mais deliberada que existe — ganha de todas. */
function tableFor(franchiseId: string, court: CourtListItem): SavedTable | null {
  return (
    loadCourtTable(court.id) ??
    loadSavedTable(franchiseId, court.indoor ? "indoor" : "outdoor") ??
    loadSavedTable(franchiseId, "all")
  );
}

export type Reapplied = { courts: number; slots: number; failed: string[] };

/**
 * Reaplica a tabela guardada nas quadras dadas. É o que faz "horário novo já
 * nasce no padrão" ser verdade: chamado depois de toda operação do painel que
 * cria horários.
 *
 * Devolve null quando não há tabela guardada — aí não há padrão a impor, e
 * silêncio é a resposta certa.
 */
export async function reapplySavedTable(
  franchiseId: string,
  courts: CourtListItem[]
): Promise<Reapplied | null> {
  const jobs = courts
    .map((court) => ({ court, table: tableFor(franchiseId, court) }))
    .filter((j): j is { court: CourtListItem; table: SavedTable } => j.table !== null);
  if (jobs.length === 0) return null;

  const out: Reapplied = { courts: 0, slots: 0, failed: [] };
  const results = await Promise.all(
    jobs.map(async ({ court, table }) => {
      const baseCents = reaisToCents(table.basePrice);
      const bands = [];
      for (const b of table.bands) {
        const cents = reaisToCents(b.price);
        // Faixa sem preço legível é faixa pela metade: melhor pular do que
        // gravar um número inventado.
        if (cents === null) continue;
        bands.push({
          startHour: b.startHour,
          endHour: b.endHour,
          priceCents: cents,
          weekdays: b.weekdays,
        });
      }
      if (baseCents === null && bands.length === 0) return null;
      try {
        const res = await applyPriceTableAction(court.id, { baseCents, bands });
        return { court, res };
      } catch {
        return { court, res: { ok: false as const } };
      }
    })
  );

  for (const r of results) {
    if (!r) continue;
    if (!r.res.ok) {
      out.failed.push(r.court.name);
      continue;
    }
    out.courts++;
    out.slots += (r.res.repriced ?? 0) + (r.res.updated ?? 0);
  }
  return out;
}
