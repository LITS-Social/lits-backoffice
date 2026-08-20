"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import { SEGMENT_LABEL, type AdsetSpend, type Segment } from "./segments";
import { setSegmentAction } from "./actions";

/**
 * A tabela de mapeamento: cada adset com seu gasto e o dropdown de segmento.
 *
 * A regra de honestidade que ela carrega: sem categoria NÃO é neutro — é a
 * primeira linha da régua lá em cima, com o valor gasto. O dropdown abre
 * pré-selecionado na SUGESTÃO (derivada do nome), mas sugestão não conta no
 * CAC: só o clique do operador grava. É o que impede um rename de campanha de
 * mudar o número do trimestre em silêncio.
 */
export function AdsetTable({ adsets }: { adsets: AdsetSpend[] }) {
  const [rows, setRows] = useState(adsets);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const escolher = (adsetId: string, valor: string) => {
    const segment = valor === "" ? null : (valor as Segment);
    const anterior = rows;
    // Otimista: a linha muda já; se a gravação falhar, volta e explica.
    setRows((rs) => rs.map((r) => (r.adsetId === adsetId ? { ...r, segment } : r)));
    startTransition(async () => {
      const res = await setSegmentAction(adsetId, segment);
      if (!res.ok) {
        setRows(anterior);
        setErro(res.error ?? "Não foi possível gravar.");
      } else {
        setErro(null);
      }
    });
  };

  return (
    <div>
      {erro && (
        <p className="mb-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-bg)] px-4 py-2.5 text-[11.5px] font-300 text-[var(--color-error)]">
          {erro}
        </p>
      )}
      <ul className="space-y-2">
        {rows.map((a) => (
          <li
            key={a.adsetId}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
            style={{
              borderLeft: `3px solid ${a.segment ? "var(--color-success)" : "var(--color-clay)"}`,
            }}
          >
            <span className="min-w-[220px] flex-1">
              <span className="block truncate text-[12.5px] font-500 text-[var(--text-primary)]">
                {a.adsetName}
              </span>
              <span className="block truncate text-[10.5px] font-300 text-[var(--text-tertiary)]">
                {a.campaignName || "—"}
              </span>
            </span>

            <span className="shrink-0 text-right">
              <span className="numeral block text-[14px] text-[var(--text-primary)]">
                {formatCurrency(a.monthCents)}
              </span>
              <span className="block text-[9.5px] font-300 text-[var(--text-tertiary)]">
                no mês · {formatCurrency(a.last28Cents)} em 28d
              </span>
            </span>

            {a.segment === null && a.suggested && (
              <Badge variant="muted">sugestão: {SEGMENT_LABEL[a.suggested]}</Badge>
            )}

            <select
              value={a.segment ?? ""}
              onChange={(e) => escolher(a.adsetId, e.target.value)}
              className={cn(
                "shrink-0 rounded-lg border bg-[var(--surface-raised)] px-3 py-1.5 text-[11.5px] font-500 outline-none transition-colors",
                a.segment
                  ? "border-[var(--border)] text-[var(--text-primary)]"
                  : "border-[var(--color-clay)]/40 text-[var(--color-clay)]"
              )}
            >
              <option value="">Sem categoria</option>
              {(Object.keys(SEGMENT_LABEL) as Segment[]).map((s) => (
                <option key={s} value={s}>
                  {SEGMENT_LABEL[s]}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
