"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";

/**
 * O filtro de tempo da aba: UM botão com ícone de calendário, que abre um
 * seletor de intervalo — atalhos à esquerda, dois meses à direita, rodapé
 * com cancelar/aplicar. Padrão Hootsuite/Linear (Mobbin); nada fica exposto
 * no cabeçalho além do que está valendo.
 *
 * O que sai daqui vira URL, e a URL é o estado: ?mes=YYYY-MM para um
 * mês-calendário, ?dias=N para "últimos N dias", ?de&ate para um intervalo
 * marcado no calendário. O servidor recalcula tudo para a janela. Dias
 * futuros não são clicáveis — não existe gasto do futuro.
 */

export type PeriodView = {
  mode: "month" | "days" | "custom";
  since: string;
  until: string;
  month?: string;
  days?: number;
  /** O mês corrente ("YYYY-MM") — teto do navegador de meses. */
  current: string;
  /** Hoje em São Paulo ("YYYY-MM-DD"), do servidor — o teto dos dias clicáveis. */
  today: string;
};

const MES_ANO = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" });
const MES_CURTO = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short" });
const DIA_MES = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
const DOW = ["D", "S", "T", "Q", "Q", "S", "S"];

/* ── datas como strings "YYYY-MM-DD", sem Date de fuso no meio ─────────── */
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const utc = (s: string) => new Date(`${s}T12:00:00Z`);
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const daysIn = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const firstDow = (ym: string) => utc(`${ym}-01`).getUTCDay();

/** O rótulo do botão — diz o que está valendo, no vocabulário de quem lê. */
function rotulo(p: PeriodView): string {
  if (p.mode === "month") {
    const t = MES_ANO.format(utc(`${p.month ?? p.current}-15`));
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  if (p.mode === "days") return `Últimos ${p.days} dias`;
  return `${DIA_MES.format(utc(p.since))} – ${DIA_MES.format(utc(p.until))}`;
}

type Preset = { id: string; label: string; qs: string; match: (p: PeriodView) => boolean };

function presets(current: string): Preset[] {
  return [
    { id: "mes", label: "Este mês", qs: "", match: (p) => p.mode === "month" && p.month === current },
    {
      id: "mes-1",
      label: "Mês passado",
      qs: `mes=${shiftMonth(current, -1)}`,
      match: (p) => p.mode === "month" && p.month === shiftMonth(current, -1),
    },
    ...[7, 14, 30, 90].map((n) => ({
      id: `d${n}`,
      label: `Últimos ${n} dias`,
      qs: `dias=${n}`,
      match: (p: PeriodView) => p.mode === "days" && p.days === n,
    })),
  ];
}

export function PeriodPicker({ p }: { p: PeriodView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // O mês da DIREITA no calendário; a esquerda é o anterior. Abre mostrando
  // o período atual, com o mês do fim à direita.
  const [view, setView] = useState(p.until.slice(0, 7));
  // UM estado para o par, e toda mudança é updater funcional: dois cliques
  // rápidos (ou no mesmo tick) leem o par atual, não o da renderização em que
  // o handler nasceu — senão o segundo clique "perde" o primeiro.
  const [range, setRange] = useState<{ start: string | null; end: string | null }>(
    p.mode === "custom" ? { start: p.since, end: p.until } : { start: null, end: null }
  );
  const { start, end } = range;
  const [hover, setHover] = useState<string | null>(null);

  // Fecha no clique fora e no Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ir = (qs: string) => {
    setOpen(false);
    startTransition(() => router.push(qs ? `/aquisicao?${qs}` : "/aquisicao"));
  };

  // O teto é "hoje em SP", do servidor — não o relógio do navegador, que em
  // outro fuso deixaria clicar num dia que ainda não existe aqui.
  const maxDay = p.today;

  const clickDay = (d: string) => {
    if (d > maxDay) return;
    setRange((r) => {
      if (!r.start || (r.start && r.end)) return { start: d, end: null };
      if (d < r.start) return { start: d, end: r.start };
      return { start: r.start, end: d };
    });
  };

  const aplicar = () => {
    if (!start) return;
    const fim = end ?? start;
    // Mês inteiro marcado no calendário vira ?mes= — mantém o denominador de
    // academias, que é mensal.
    const ym = start.slice(0, 7);
    const mesInteiro = start.endsWith("-01") && fim === iso(+ym.slice(0, 4), +ym.slice(5, 7), daysIn(ym)) && fim.slice(0, 7) === ym;
    if (mesInteiro) return ir(ym === p.current ? "" : `mes=${ym}`);
    ir(`de=${start}&ate=${fim}`);
  };

  const sel = (d: string) => {
    const a = start, b = end ?? (start && hover && hover > start ? hover : null);
    if (!a) return false;
    if (!b) return d === a;
    return d >= a && d <= b;
  };

  return (
    <div ref={wrap} className="relative">
      {/* ── o gatilho ────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-3 pr-2.5 text-[12px] font-600 text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-raised)]",
          pending && "opacity-60"
        )}
      >
        <CalendarDays size={14} className="text-[var(--primary)]" />
        <span>{rotulo(p)}</span>
        <ChevronDown size={13} className={cn("text-[var(--text-tertiary)] transition-transform", open && "rotate-180")} />
      </button>

      {/* ── o seletor ────────────────────────────────────────────────────── */}
      {open && (
        <div
          role="dialog"
          aria-label="Selecionar período"
          className="absolute right-0 z-40 mt-2 flex w-[560px] max-w-[92vw] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_-12px_rgba(0,0,0,.45)]"
        >
          {/* atalhos */}
          <ul className="w-[150px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)]/40 p-2">
            {presets(p.current).map((ps) => {
              const on = ps.match(p) && !start;
              return (
                <li key={ps.id}>
                  <button
                    type="button"
                    onClick={() => ir(ps.qs)}
                    className={cn(
                      "w-full rounded-md px-2.5 py-1.5 text-left text-[11.5px] font-500 transition-colors",
                      on
                        ? "bg-[var(--primary)]/15 text-[var(--primary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    {ps.label}
                  </button>
                </li>
              );
            })}
            <li className="mt-2 border-t border-[var(--border)] px-2.5 pt-2 text-[9.5px] font-300 leading-snug text-[var(--text-tertiary)]">
              ou marque um intervalo no calendário
            </li>
          </ul>

          {/* calendário: dois meses */}
          <div className="min-w-0 flex-1 p-3">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => setView(shiftMonth(view, -1))} aria-label="Meses anteriores" className="rounded-full p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]">
                <ChevronLeft size={14} />
              </button>
              <button type="button" onClick={() => setView(shiftMonth(view, 1))} disabled={view >= p.current} aria-label="Meses seguintes" className="rounded-full p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] disabled:opacity-30">
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[shiftMonth(view, -1), view].map((ym) => (
                <Month key={ym} ym={ym} maxDay={maxDay} sel={sel} isStart={(d) => d === start} isEnd={(d) => d === (end ?? start)} onPick={clickDay} onHover={setHover} />
              ))}
            </div>

            {/* rodapé */}
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
              <span className="text-[10.5px] font-300 text-[var(--text-tertiary)]">
                {start
                  ? `${DIA_MES.format(utc(start))} → ${DIA_MES.format(utc(end ?? start))}`
                  : `${DIA_MES.format(utc(p.since))} → ${DIA_MES.format(utc(p.until))} (atual)`}
              </span>
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRange({ start: null, end: null });
                    setOpen(false);
                  }}
                  className="rounded-full px-3 py-1 text-[10px] font-600 uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={aplicar}
                  disabled={!start}
                  className="rounded-full bg-[var(--primary)] px-3.5 py-1 text-[10px] font-600 uppercase tracking-[0.1em] text-[var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Aplicar
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Month({
  ym,
  maxDay,
  sel,
  isStart,
  isEnd,
  onPick,
  onHover,
}: {
  ym: string;
  maxDay: string;
  sel: (d: string) => boolean;
  isStart: (d: string) => boolean;
  isEnd: (d: string) => boolean;
  onPick: (d: string) => void;
  onHover: (d: string | null) => void;
}) {
  const [y, m] = ym.split("-").map(Number);
  const n = daysIn(ym);
  const pad = firstDow(ym);
  const titulo = `${MES_CURTO.format(utc(`${ym}-15`)).replace(".", "")} ${y}`;
  return (
    <div>
      <p className="mb-1.5 text-center text-[11px] font-600 capitalize text-[var(--text-primary)]">{titulo}</p>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {DOW.map((d, i) => (
          <span key={i} className="label-colus py-0.5 text-[7.5px] text-[var(--text-tertiary)]">
            {d}
          </span>
        ))}
        {Array.from({ length: pad }, (_, i) => (
          <span key={`p${i}`} />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const d = iso(y, m, i + 1);
          const futuro = d > maxDay;
          const on = sel(d);
          const ponta = isStart(d) || isEnd(d);
          return (
            <button
              key={d}
              type="button"
              disabled={futuro}
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover(d)}
              onMouseLeave={() => onHover(null)}
              className={cn(
                "mx-auto h-7 w-7 rounded-md text-[11px] tabular-nums transition-colors",
                futuro && "cursor-not-allowed text-[var(--text-tertiary)]/40",
                !futuro && !on && "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]",
                on && !ponta && "bg-[var(--primary)]/15 text-[var(--text-primary)]",
                ponta && "bg-[var(--primary)] font-600 text-[var(--bg)]"
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
