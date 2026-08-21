"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

/**
 * O filtro de tempo da aba, em três modos que viram UMA janela no servidor:
 *
 *   mês        ‹ agosto de 2026 ›   (?mes=YYYY-MM)
 *   dias       7 · 14 · 30 · 90     (?dias=N — os últimos N, hoje incluso)
 *   intervalo  de ▭ até ▭           (?de=…&ate=…)
 *
 * Tudo na URL: a página recalcula gasto, cadastros, MGM e professores para a
 * janela, e o link é compartilhável. O denominador de academias é mensal por
 * natureza — fora do modo mês a célula volta a mostrar só o gasto, e diz por
 * quê.
 */
const ROTULO_MES = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  month: "long",
  year: "numeric",
});
const ROTULO_DIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
});
const ATALHOS = [7, 14, 30, 90];

function deslocaMes(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type PeriodView = {
  mode: "month" | "days" | "custom";
  since: string;
  until: string;
  month?: string;
  days?: number;
  /** O mês corrente — teto do navegador de meses. */
  current: string;
};

export function PeriodPicker({ p }: { p: PeriodView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [de, setDe] = useState(p.mode === "custom" ? p.since : "");
  const [ate, setAte] = useState(p.mode === "custom" ? p.until : "");
  const [custom, setCustom] = useState(p.mode === "custom");

  const ir = (qs: string) => startTransition(() => router.push(qs ? `/aquisicao?${qs}` : "/aquisicao"));

  const month = p.month ?? p.current;
  const [y, m] = month.split("-").map(Number);
  const rotuloMes = ROTULO_MES.format(new Date(Date.UTC(y, m - 1, 15)));
  const dia = (iso: string) => ROTULO_DIA.format(new Date(`${iso}T12:00:00-03:00`));

  const chip =
    "rounded-full px-2.5 py-1 text-[10px] font-600 uppercase tracking-[0.08em] transition-colors";
  const on = "bg-[var(--primary)] text-[var(--bg)]";
  const off = "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]";

  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-2", pending && "opacity-60")}>
      {/* ── mês ─────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full border p-0.5",
          p.mode === "month" ? "border-[var(--primary)]/50 bg-[var(--surface)]" : "border-[var(--border)]"
        )}
      >
        <button
          type="button"
          onClick={() => ir(`mes=${deslocaMes(month, -1)}`)}
          aria-label="Mês anterior"
          className="rounded-full p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
        >
          <ChevronLeft size={13} />
        </button>
        <button
          type="button"
          onClick={() => ir(month === p.current ? "" : `mes=${month}`)}
          className={cn(
            "min-w-[128px] text-center text-[11.5px] font-600 capitalize",
            p.mode === "month" ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"
          )}
        >
          {rotuloMes}
        </button>
        <button
          type="button"
          onClick={() => ir(`mes=${deslocaMes(month, 1)}`)}
          disabled={month >= p.current}
          aria-label="Próximo mês"
          className="rounded-full p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight size={13} />
        </button>
      </div>

      {/* ── últimos N dias ──────────────────────────────────────────────── */}
      <div className="inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] p-0.5">
        {ATALHOS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => ir(`dias=${n}`)}
            className={cn(chip, p.mode === "days" && p.days === n ? on : off)}
          >
            {n}d
          </button>
        ))}
      </div>

      {/* ── intervalo ───────────────────────────────────────────────────── */}
      {custom ? (
        <form
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (de) ir(`de=${de}${ate ? `&ate=${ate}` : ""}`);
          }}
        >
          <input
            type="date"
            value={de}
            max={p.current + "-31"}
            onChange={(e) => setDe(e.target.value)}
            className="bg-transparent text-[11px] text-[var(--text-primary)] outline-none"
            aria-label="De"
          />
          <span className="text-[10px] text-[var(--text-tertiary)]">até</span>
          <input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            className="bg-transparent text-[11px] text-[var(--text-primary)] outline-none"
            aria-label="Até"
          />
          <button type="submit" className={cn(chip, on)}>
            ok
          </button>
          <button
            type="button"
            onClick={() => {
              setCustom(false);
              if (p.mode === "custom") ir("");
            }}
            className={cn(chip, off)}
          >
            ×
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setCustom(true)} className={cn(chip, "border border-[var(--border)]", off)}>
          intervalo
        </button>
      )}

      {/* ── o que está valendo, por extenso ─────────────────────────────── */}
      <span className="basis-full text-right text-[10px] font-300 text-[var(--text-tertiary)]">
        {dia(p.since)} → {dia(p.until)}
        {p.mode === "days" && ` · últimos ${p.days} dias`}
      </span>
    </div>
  );
}
