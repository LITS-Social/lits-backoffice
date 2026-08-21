"use client";

import { useState, useTransition } from "react";
import { setAcademiasFechadasAction } from "./actions";

/**
 * O campo do denominador de academias, dentro da célula da régua.
 *
 * Um número e um botão — nada de formulário. Quem sabe quantas academias
 * fecharam no mês é quem fechou, e a fricção tem que ser zero para o número
 * ser mantido em dia. Gravado por mês no cofre; quando o mês vira, a célula
 * volta a pedir o número novo.
 */
export function AcademiasDenominador({ atual, mesNome }: { atual: number | null; mesNome: string }) {
  const [valor, setValor] = useState(atual == null ? "" : String(atual));
  const [editando, setEditando] = useState(atual == null);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const salvar = () => {
    const n = valor.trim() === "" ? null : Number(valor);
    if (n !== null && (!Number.isInteger(n) || n < 0)) {
      setErro("inteiro ≥ 0");
      return;
    }
    startTransition(async () => {
      const res = await setAcademiasFechadasAction(n);
      if (!res.ok) setErro(res.error ?? "não gravou");
      else {
        setErro(null);
        setEditando(false);
      }
    });
  };

  if (!editando) {
    return (
      <span>
        {atual} fechada{atual === 1 ? "" : "s"} em {mesNome}{" "}
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="font-600 text-[var(--primary)] transition-opacity hover:opacity-70"
        >
          editar
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span>fechadas em {mesNome}:</span>
      <input
        inputMode="numeric"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && salvar()}
        placeholder="0"
        className="w-12 rounded border border-[var(--border)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-center text-[11px] text-[var(--text-primary)] outline-none"
      />
      <button
        type="button"
        onClick={salvar}
        disabled={pending}
        className="font-600 text-[var(--primary)] transition-opacity hover:opacity-70 disabled:opacity-40"
      >
        {pending ? "…" : "salvar"}
      </button>
      {erro && <span className="text-[var(--color-error)]">{erro}</span>}
    </span>
  );
}
