"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

/**
 * O filtro de tempo da aba: um mês-calendário de cada vez, ‹ › para andar.
 *
 * O mês vive na URL (?mes=YYYY-MM), não em estado local — assim a página
 * recalcula TUDO no servidor para aquele mês (gasto da Meta, cadastros, MGM,
 * professores, o denominador de academias) e o link é compartilhável. O
 * próximo mês trava no corrente: não existe gasto do futuro.
 */
const ROTULO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  month: "long",
  year: "numeric",
});

function desloca(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function MonthPicker({ month, current }: { month: string; current: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [y, m] = month.split("-").map(Number);
  const rotulo = ROTULO.format(new Date(Date.UTC(y, m - 1, 15)));

  const ir = (alvo: string) =>
    startTransition(() => {
      router.push(alvo === current ? "/aquisicao" : `/aquisicao?mes=${alvo}`);
    });

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1">
      <button
        type="button"
        onClick={() => ir(desloca(month, -1))}
        aria-label="Mês anterior"
        className="rounded-full p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)]"
      >
        <ChevronLeft size={14} />
      </button>
      <span
        className={cn(
          "min-w-[150px] text-center text-[12px] font-600 capitalize text-[var(--text-primary)]",
          pending && "opacity-50"
        )}
      >
        {rotulo}
      </span>
      <button
        type="button"
        onClick={() => ir(desloca(month, 1))}
        disabled={month >= current}
        aria-label="Próximo mês"
        className="rounded-full p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight size={14} />
      </button>
      {month !== current && (
        <button
          type="button"
          onClick={() => ir(current)}
          className="ml-1 rounded-full px-2.5 py-1 text-[9.5px] font-600 uppercase tracking-[0.1em] text-[var(--primary)] transition-opacity hover:opacity-70"
        >
          mês atual
        </button>
      )}
    </div>
  );
}
