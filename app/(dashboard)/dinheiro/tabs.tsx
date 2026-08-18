"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A régua de números que também é a navegação do painel de dinheiro.
 *
 * Mesma gramática editorial do StatRail — rótulo Colus sobre numeral serifado,
 * células divididas por fios — mas cada célula é um BOTÃO: o número que você
 * lê é o número que você clica, e a fila correspondente abre embaixo. Sem uma
 * fileira de estatísticas E uma fileira de abas dizendo quase a mesma coisa.
 *
 * As mesmas leis de honestidade do StatRail valem aqui:
 * - tom é categoria (money=vermelho só para dívida; calm=verde; attention=clay);
 * - zero nunca grita — renderiza quieto seja qual for o tom pedido;
 * - `unknown` é "não conseguimos perguntar": em-dash, nunca um 0 fantasma.
 */
export type MoneyTab = {
  key: string;
  label: string;
  /** O número grande — já formatado quando é dinheiro. */
  value: number | string;
  hint?: ReactNode;
  tone?: "neutral" | "attention" | "money" | "calm";
  /** A busca desta seção falhou — o valor vira "—" e o conteúdo explica. */
  unknown?: boolean;
  content: ReactNode;
};

const toneClass = {
  neutral: "text-[var(--text-primary)]",
  attention: "text-[var(--color-clay)]",
  money: "text-[var(--color-error)]",
  calm: "text-[var(--color-success)]",
} as const;

export function MoneyTabs({ tabs }: { tabs: MoneyTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div className="border-b border-[var(--border)] bg-[var(--surface)]/60 px-4 sm:px-8">
        <div className="flex flex-wrap items-stretch gap-y-2" role="tablist">
          {tabs.map((tab) => {
            const on = tab.key === current?.key;
            const tone = tab.tone ?? "neutral";
            const quiet = tab.unknown || tab.value === 0;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActive(tab.key)}
                className={cn(
                  // A borda inferior é o indicador de aba; transparente nas
                  // inativas para o texto não pular quando a ativa troca.
                  "group min-w-[132px] border-b-2 border-l border-l-[var(--border)] px-6 pb-4 pt-5 text-left transition-colors first:border-l-0 first:pl-0",
                  on ? "border-b-[var(--primary)]" : "border-b-transparent hover:bg-[var(--surface-raised)]/40"
                )}
              >
                <span
                  className={cn(
                    "label-colus block text-[8px] transition-colors",
                    on ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"
                  )}
                >
                  {tab.label}
                </span>
                <span
                  className={cn(
                    "numeral mt-1.5 block text-[24px] leading-none",
                    tab.unknown || quiet ? "text-[var(--text-tertiary)]" : toneClass[tone]
                  )}
                >
                  {tab.unknown ? "—" : typeof tab.value === "number" ? tab.value.toLocaleString("pt-BR") : tab.value}
                </span>
                {tab.hint && (
                  <span className="mt-1 block max-w-[220px] text-[10px] font-300 leading-snug text-[var(--text-tertiary)]">
                    {tab.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 px-4 sm:px-8 py-6">{current?.content}</div>
    </div>
  );
}
