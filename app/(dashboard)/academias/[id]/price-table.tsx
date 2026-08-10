"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Plus, Trash2 } from "lucide-react";
import { cn, formatCurrency, reaisToCents } from "@/lib/utils";
import type { CourtListItem } from "../../quadras/actions";
import {
  applyPriceTableAction,
  readPriceTableAction,
  updateFranchiseAction,
} from "../../quadras/[id]/editar/actions";
import type { PriceBand } from "../../quadras/[id]/editar/actions";
import type { HourWindows } from "./academia";
import { loadSavedTable, saveTable, type SavedTable, type Scope } from "./price-table-store";

/**
 * A tabela de preços da academia: um preço base para o dia inteiro e, por cima
 * dele, faixas de horário — "manhã R$ 250, nobre R$ 400". Aplica em TODAS as
 * quadras de uma vez.
 *
 * O que fazia o operador perder a tarde era o caminho antigo: entrar em cada
 * quadra, digitar a mesma faixa nove vezes, e no fim não ter como conferir o
 * resultado sem abrir o calendário dia a dia. Aqui a tabela é uma coisa só,
 * a prévia mostra o que cada hora vai custar antes de gravar, e o "aplicar"
 * anda quadra a quadra com o progresso à vista.
 *
 * O preço base também vira o padrão da academia e o de cada quadra, então a
 * grade gerada daqui pra frente já nasce no preço certo — não é um retoque nos
 * 30 dias visíveis, é a regra da casa.
 */

const DOW_OPTIONS = [
  { v: 1, label: "Seg" },
  { v: 2, label: "Ter" },
  { v: 3, label: "Qua" },
  { v: 4, label: "Qui" },
  { v: 5, label: "Sex" },
  { v: 6, label: "Sáb" },
  { v: 0, label: "Dom" },
] as const;

const ALL_DAYS = DOW_OPTIONS.map((d) => d.v);

type BandDraft = {
  id: number;
  startHour: number;
  endHour: number;
  /** Texto cru do campo — só vira centavos na hora de aplicar. */
  price: string;
  weekdays: number[];
};

/** Atalhos para as faixas que toda academia repete. */
const PRESETS: { label: string; band: Omit<BandDraft, "id" | "price"> }[] = [
  { label: "Manhã 6–11", band: { startHour: 6, endHour: 11, weekdays: [] } },
  { label: "Tarde 12–17", band: { startHour: 12, endHour: 17, weekdays: [] } },
  { label: "Nobre 18–22", band: { startHour: 18, endHour: 22, weekdays: [] } },
  { label: "Fim de semana", band: { startHour: 6, endHour: 22, weekdays: [0, 6] } },
];

/** Onde a tabela cai. Coberta e descoberta quase nunca custam o mesmo — a
    coberta chove e continua jogando —, então o operador precisa poder mandar
    uma tabela numa metade sem tocar na outra. */
const SCOPE_LABEL: Record<Scope, string> = {
  all: "Todas",
  indoor: "Só cobertas",
  outdoor: "Só descobertas",
};

/** Centavos → o texto que vai no campo: "25000" vira "250", "40050" vira
    "400,50". Sem os zeros à direita que ninguém digita. */
function centsToInput(cents: number) {
  return cents % 100 === 0 ? String(cents / 100) : String(cents / 100).replace(".", ",");
}

function inScope(c: CourtListItem, scope: Scope) {
  if (scope === "all") return true;
  return scope === "indoor" ? c.indoor : !c.indoor;
}

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";
const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";
const primaryBtn =
  "inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2 font-700 text-[9.5px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50";

/* ── prévia ───────────────────────────────────────────────────────────────── */

/** A janela de funcionamento daquele dia da semana (0=dom … 6=sáb). */
function windowFor(w: HourWindows, dow: number): [number, number] {
  if (dow === 0) return [w.sunStart, w.sunEnd];
  if (dow === 6) return [w.satStart, w.satEnd];
  return [w.weekStart, w.weekEnd];
}

/** O preço que a tabela manda naquela hora daquele dia — a última faixa que
    pega vence, que é como o operador lê a lista de cima para baixo. */
function priceAt(bands: BandDraft[], baseCents: number | null, dow: number, hour: number) {
  let price = baseCents;
  for (const b of bands) {
    if (hour < b.startHour || hour > b.endHour) continue;
    if (b.weekdays.length > 0 && !b.weekdays.includes(dow)) continue;
    const c = reaisToCents(b.price);
    if (c !== null) price = c;
  }
  return price;
}

function PricePreview({
  bands,
  baseCents,
  windows,
  scopeNote,
}: {
  bands: BandDraft[];
  baseCents: number | null;
  windows: HourWindows;
  /** Em quantas — e quais — quadras esta grade vai cair. Sem isto a prévia
      parece valer para a academia inteira mesmo com um recorte ativo. */
  scopeNote: string;
}) {
  // Todas as horas que a academia abre em algum dia da semana — a régua.
  const hours = useMemo(() => {
    let min = 23;
    let max = 0;
    for (const d of ALL_DAYS) {
      const [a, b] = windowFor(windows, d);
      min = Math.min(min, a);
      max = Math.max(max, b);
    }
    return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
  }, [windows]);

  // Os preços distintos que a tabela produz, do mais barato ao mais caro — a
  // escala de tom é feita por posto, não por valor: dois preços próximos
  // precisam ficar visivelmente diferentes.
  const scale = useMemo(() => {
    const set = new Set<number>();
    for (const d of ALL_DAYS) {
      const [a, b] = windowFor(windows, d);
      for (let h = a; h <= b; h++) {
        const p = priceAt(bands, baseCents, d, h);
        if (p !== null) set.add(p);
      }
    }
    return [...set].sort((x, y) => x - y);
  }, [bands, baseCents, windows]);

  /** Tom da célula: um só matiz (a regra das sete cores), variando a opacidade
      pelo POSTO do preço na escala — dois preços próximos precisam ficar
      visivelmente diferentes, e o valor bruto não garante isso. Grátis é
      ausência de dinheiro, não o preço mais barato: ganha o tom neutro.
      As classes são literais porque o Tailwind lê o código-fonte — string
      montada em runtime não gera CSS nenhum. */
  const TONES = [
    "bg-[var(--primary)]/12",
    "bg-[var(--primary)]/25",
    "bg-[var(--primary)]/40",
    "bg-[var(--primary)]/55",
    "bg-[var(--primary)]/70",
    "bg-[var(--primary)]/85",
  ];
  const paid = scale.filter((v) => v > 0);
  const toneOf = (cents: number | null) => {
    if (cents === null) return "bg-[var(--surface-sunken)]";
    if (cents === 0) return "bg-[var(--surface-raised)]";
    const rank =
      paid.length <= 1
        ? 3
        : Math.round((paid.indexOf(cents) / (paid.length - 1)) * (TONES.length - 1));
    return TONES[Math.max(0, Math.min(TONES.length - 1, rank))];
  };

  const hasClosed = useMemo(
    () =>
      ALL_DAYS.some((d) => {
        const [a, b] = windowFor(windows, d);
        return hours.some((h) => h < a || h > b);
      }),
    [hours, windows]
  );

  if (hours.length === 0) return null;

  return (
    <div>
      <span className={labelClass}>Prévia — o que cada hora vai custar {scopeNote}</span>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-[2px] text-center">
          <thead>
            <tr>
              <th className="w-8" />
              {hours.map((h) => (
                <th
                  key={h}
                  className="numeral pb-1 text-[9px] font-300 text-[var(--text-tertiary)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOW_OPTIONS.map((d) => {
              const [a, b] = windowFor(windows, d.v);
              return (
                <tr key={d.v}>
                  <th className="pr-1.5 text-right text-[9.5px] font-400 text-[var(--text-tertiary)]">
                    {d.label}
                  </th>
                  {hours.map((h) => {
                    const open = h >= a && h <= b;
                    const p = open ? priceAt(bands, baseCents, d.v, h) : null;
                    return (
                      <td
                        key={h}
                        title={
                          open
                            ? `${d.label} ${h}h — ${p === null ? "sem mudança" : formatCurrency(p)}`
                            : `${d.label} ${h}h — fechado`
                        }
                        className={cn(
                          "h-5 rounded-[3px] text-[8.5px] leading-none",
                          open
                            ? toneOf(p)
                            : "border border-dashed border-[var(--border)] bg-transparent"
                        )}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {scale.map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-[2px]", toneOf(c))} />
            <span
              className={cn(
                "text-[10px] text-[var(--text-tertiary)]",
                c === 0 ? "font-300" : "numeral"
              )}
            >
              {c === 0 ? "grátis" : formatCurrency(c)}
            </span>
          </span>
        ))}
        {/* Só quando existe hora fechada de fato — legenda de um símbolo que
            não aparece na grade é ruído. */}
        {hasClosed && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px] border border-dashed border-[var(--border)]" />
            <span className="text-[10px] font-300 text-[var(--text-tertiary)]">fechado</span>
          </span>
        )}
      </div>
    </div>
  );
}

/* ── a seção ──────────────────────────────────────────────────────────────── */

type Progress = {
  done: number;
  total: number;
  running: string[];
  /** Horários já gravados — o número que prova que a coisa anda mesmo quando
      um bloco demora. */
  written: number;
  startedAt: number;
  /** Quadras que já falharam — mostradas durante a corrida, não só no fim:
      esperar o resumo final para descobrir que a primeira quebrou é tarde. */
  broken: string[];
  /** Quando o governador está segurando o ritmo, até quando. Parado sem
      explicação parece travado; "aguardando o limite" é informação. */
  waitingUntil: number;
};

/** Quantas quadras em voo. O trabalho por quadra virou punhado de requisições
    (uma para o base, uma por faixa), então três de uma vez terminam num
    piscar sem chegar perto do orçamento do servidor. */
const WORK_CONCURRENCY = 3;

/** Requisições por minuto que esta tela pode gastar. O BFF concede 600 por
    pessoa, no serviço inteiro; as outras 250 ficam para quem estiver
    navegando o painel. Com o reprice por faixa isto virou um freio de
    segurança que quase nunca atua — antes era o que segurava a tela de pé. */
const BUDGET_PER_MINUTE = 350;

const LEDGER_KEY = "lits-bff-budget";

/** O gasto vive no sessionStorage, não só na memória do módulo. O limite é do
    SERVIDOR e dura 60s: recarregar a página zerava a minha contabilidade sem
    zerar a dele, e a primeira tentativa depois do F5 tomava 429 na cara. */
function loadLedger(): { at: number; n: number }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(LEDGER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

let spent: { at: number; n: number }[] = [];
let ledgerLoaded = false;

function budgetUsed(now: number) {
  if (!ledgerLoaded) {
    spent = loadLedger();
    ledgerLoaded = true;
  }
  while (spent.length > 0 && now - spent[0].at > 60_000) spent.shift();
  return spent.reduce((t, e) => t + e.n, 0);
}

/** Milissegundos de espera até caber `cost`; 0 se cabe agora. */
function waitForBudget(cost: number, now: number) {
  if (budgetUsed(now) + cost <= BUDGET_PER_MINUTE) return 0;
  const oldest = spent[0]?.at ?? now;
  return Math.max(0, 60_000 - (now - oldest));
}

function recordSpend(n: number, now: number) {
  budgetUsed(now);
  spent.push({ at: now, n });
  try {
    sessionStorage.setItem(LEDGER_KEY, JSON.stringify(spent));
  } catch {
    /* sem sessionStorage o governador ainda funciona dentro da aba */
  }
}

/** Quanto a tabela vai custar de requisições: uma para o preço base e uma por
    faixa, vezes o número de quadras. O BFF resolve cada uma num UPDATE só. */
function estimateRequests(courtCount: number, bandCount: number, hasBase: boolean) {
  return courtCount * (bandCount + (hasBase ? 1 : 0));
}
type Result = {
  courts: number;
  repriced: number;
  updated: number;
  skippedBooked: number;
  failed: number;
  /** Quadras que não responderam — nomeadas, para o operador repetir só nelas. */
  brokenCourts: string[];
};

/** A linha de vida do "aplicar": o que já foi gravado, onde está e há quanto
    tempo. Um contador que anda é o que separa "está indo" de "travou" — a
    barra sozinha pode ficar parada um bom tempo num bloco lento. */
function ProgressLine({ progress }: { progress: Progress }) {
  const [now, setNow] = useState(progress.startedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.round((now - progress.startedAt) / 1000));
  const holding = progress.waitingUntil > now;
  if (holding) {
    // Segurando o ritmo de propósito. Sem dizer isso, uma pausa de vinte
    // segundos é indistinguível de um travamento.
    const left = Math.ceil((progress.waitingUntil - now) / 1000);
    return (
      <span className="text-[11px] font-300 text-[var(--text-tertiary)]">
        Segurando o ritmo para não estourar o limite do servidor ·{" "}
        <span className="numeral">{left}s</span> ·{" "}
        <span className="numeral">{progress.written.toLocaleString("pt-BR")}</span> horários
        gravados
      </span>
    );
  }
  return (
    <span className="text-[11px] font-300 text-[var(--text-tertiary)]">
      <span className="numeral">{progress.written.toLocaleString("pt-BR")}</span> horários
      gravados · bloco <span className="numeral">{progress.done}</span>/
      <span className="numeral">{progress.total}</span> ·{" "}
      <span className="numeral">{secs}s</span>
      {progress.running.length > 0 && ` · ${[...new Set(progress.running)].join(", ")}`}
      {progress.broken.length > 0 && (
        <span className="text-[var(--color-error)]">
          {" "}
          · falhou em {progress.broken.join(", ")}
        </span>
      )}
    </span>
  );
}

export function PriceTableSection({
  courts,
  windows,
  onDone,
}: {
  courts: CourtListItem[];
  windows: HourWindows;
  onDone: () => void;
}) {
  const base = courts[0];
  const franchiseId = base.franchise_id;
  // Nasce vazio: o valor certo vem da grade, logo abaixo, e semear com o
  // padrão da franquia mostraria um número que pode não estar mais valendo.
  const [basePrice, setBasePrice] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [bands, setBands] = useState<BandDraft[]>([]);
  const [nextId, setNextId] = useState(1);
  // `dirty` protege o que o operador digitou: a tabela em vigor é recarregada
  // quando ele troca de recorte, mas nunca por cima de uma edição em curso.
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = useCallback((v: boolean) => {
    dirtyRef.current = v;
    setDirtyState(v);
  }, []);
  const [loading, setLoading] = useState(true);
  /** De onde veio o que está na tela: a última aplicação, ou a grade. */
  const [source, setSource] = useState<
    { kind: "saved"; at: number } | { kind: "grid"; courtName: string } | null
  >(null);
  const idSeed = useRef(1000);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const baseCents = reaisToCents(basePrice);
  const running = progress !== null;
  const counts = {
    all: courts.length,
    indoor: courts.filter((c) => c.indoor).length,
    outdoor: courts.filter((c) => !c.indoor).length,
  };
  const targets = courts.filter((c) => inScope(c, scope));
  const sample = targets[0];

  /** Lê a tabela DA GRADE — o plano B, quando não há uma aplicada guardada. */
  const loadFromGrid = useCallback(
    async (courtId: string, courtName: string) => {
      setLoading(true);
      const res = await readPriceTableAction(courtId);
      setLoading(false);
      if (!res.ok) {
        setSource(null);
        return;
      }
      setBasePrice(res.baseCents != null ? centsToInput(res.baseCents) : "");
      setBands(
        (res.bands ?? []).map((b) => ({
          id: idSeed.current++,
          startHour: b.startHour,
          endHour: b.endHour,
          price: centsToInput(b.priceCents),
          weekdays: b.weekdays ?? [],
        }))
      );
      setSource({ kind: "grid", courtName });
      setDirty(false);
    },
    [setDirty]
  );

  /** Abre com a última tabela aplicada neste recorte; sem ela, lê da grade. */
  const loadTable = useCallback(
    async (courtId: string, courtName: string, scopeKey: Scope) => {
      const saved = loadSavedTable(franchiseId, scopeKey);
      if (!saved) {
        await loadFromGrid(courtId, courtName);
        return;
      }
      setLoading(false);
      setBasePrice(saved.basePrice);
      setBands(saved.bands.map((b) => ({ ...b, id: idSeed.current++ })));
      setSource({ kind: "saved", at: saved.at });
      setDirty(false);
    },
    [franchiseId, loadFromGrid, setDirty]
  );

  // Ao abrir, e a cada troca de recorte, a tela mostra a tabela em vigor —
  // menos quando há edição em curso, que seria apagada sem aviso. O estado
  // "sujo" mora num ref porque é uma CONDIÇÃO para recarregar, não um gatilho:
  // como dependência, marcar o formulário como editado dispararia a recarga
  // que este guarda existe para impedir.
  const sampleId = sample?.id;
  const sampleName = sample?.name;
  useEffect(() => {
    if (!sampleId || !sampleName) return;
    // rAF tira o setState do corpo do efeito (regra do lint) e é o mesmo
    // recurso que o calendário já usa aqui do lado.
    const raf = requestAnimationFrame(() => {
      if (dirtyRef.current) return;
      void loadTable(sampleId, sampleName, scope);
    });
    return () => cancelAnimationFrame(raf);
  }, [sampleId, sampleName, scope, loadTable]);

  const addBand = (b?: Omit<BandDraft, "id" | "price">) => {
    setDirty(true);
    setBands((cur) => [
      ...cur,
      { id: nextId, price: "", startHour: 18, endHour: 22, weekdays: [], ...b },
    ]);
    setNextId((v) => v + 1);
  };
  const patchBand = (id: number, patch: Partial<BandDraft>) => {
    setDirty(true);
    setBands((cur) => cur.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  /** Altera uma faixa a partir do estado ATUAL dela, não do que o render
      capturou. É a diferença entre marcar sete dias e marcar um: clicar em
      Seg, Ter, Qua… mais rápido do que o React re-renderiza fazia cada
      handler ler a mesma lista velha (`[]`) e sobrescrever o clique anterior
      — no fim sobrava um dia só. Medido: sete cliques em rajada davam [Dom]. */
  const updateBand = (id: number, fn: (b: BandDraft) => BandDraft) => {
    setDirty(true);
    setBands((cur) => cur.map((b) => (b.id === id ? fn(b) : b)));
  };

  const toggleDay = (id: number, dow: number) =>
    updateBand(id, (b) => ({
      ...b,
      weekdays: b.weekdays.includes(dow)
        ? b.weekdays.filter((v) => v !== dow)
        : [...b.weekdays, dow],
    }));
  const removeBand = (id: number) => {
    setDirty(true);
    setBands((cur) => cur.filter((b) => b.id !== id));
  };

  async function apply() {
    setError("");
    setResult(null);

    if (basePrice.trim() !== "" && baseCents === null) {
      setError("Preço base inválido. Use ex: 400 ou 400,50.");
      return;
    }
    const payload: PriceBand[] = [];
    for (const b of bands) {
      const cents = reaisToCents(b.price);
      if (cents === null) {
        setError("Toda faixa precisa de um preço válido — ex: 400 ou 400,50.");
        return;
      }
      if (b.startHour > b.endHour) {
        setError("Em toda faixa, a hora inicial precisa ser menor ou igual à final.");
        return;
      }
      payload.push({
        startHour: b.startHour,
        endHour: b.endHour,
        priceCents: cents,
        weekdays: b.weekdays,
      });
    }
    if (baseCents === null && payload.length === 0) {
      setError("Preencha o preço base ou pelo menos uma faixa.");
      return;
    }
    if (targets.length === 0) {
      setError("Nenhuma quadra neste recorte.");
      return;
    }

    const totals: Result = {
      courts: 0,
      repriced: 0,
      updated: 0,
      skippedBooked: 0,
      failed: 0,
      brokenCourts: [],
    };

    // O padrão da academia acompanha o base — sem isto, quadra criada amanhã
    // nasceria no preço velho e ninguém entenderia por quê. Só quando o recorte
    // é a academia inteira: um preço pensado para as cobertas não é o padrão da
    // casa, e gravá-lo como tal faria a próxima descoberta nascer errada.
    if (baseCents !== null && scope === "all") {
      await updateFranchiseAction(base.franchise_id, { defaultPriceCents: baseCents });
    }

    // Várias quadras ao mesmo tempo. Em série, nove quadras eram nove esperas
    // somadas — e a espera de uma quadra é dominada por ida e volta de rede,
    // não por CPU, então esperar uma de cada vez era só desperdício.
    // Uma unidade de trabalho por QUADRA — não mais por janela de dias. Cada
    // uma custa uma requisição para o base e uma por faixa, e o BFF resolve
    // cada requisição num UPDATE em massa. O fatiamento em pedaços de cinco
    // dias existia porque eram ~157 requisições por quadra e a barra precisava
    // andar; agora são poucas e terminam num piscar.
    //
    // A ordem dentro da quadra continua importando, e é a ação que garante:
    // base primeiro (reescreve a quadra inteira), faixas depois, de cima para
    // baixo (a de baixo vence quando duas pegam a mesma hora).
    const inFlight = new Set<string>();
    const okCourts = new Set<string>();
    const startedAt = Date.now();
    let done = 0;
    let written = 0;
    let waitingUntil = 0;
    let hitRateLimit = false;
    const tick = () =>
      setProgress({
        done,
        total: targets.length,
        running: [...inFlight],
        written,
        startedAt,
        broken: [...totals.brokenCourts],
        waitingUntil,
      });
    tick();

    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(WORK_CONCURRENCY, targets.length) }, async () => {
        for (;;) {
          if (hitRateLimit) return;
          const i = next++;
          if (i >= targets.length) return;
          const court = targets[i];

          // Freio de segurança: com o reprice por faixa isto quase nunca atua,
          // mas o orçamento é do painel inteiro e não só desta tela.
          const cost = payload.length + (baseCents !== null ? 1 : 0);
          for (;;) {
            const ms = waitForBudget(cost, Date.now());
            if (ms <= 0) break;
            waitingUntil = Date.now() + ms;
            tick();
            await new Promise((r) => setTimeout(r, Math.min(ms, 1000)));
          }
          waitingUntil = 0;

          inFlight.add(court.name);
          tick();
          let res;
          try {
            res = await applyPriceTableAction(court.id, { baseCents, bands: payload });
          } catch {
            // Server action que rejeita (rede caída, Worker derrubado) não pode
            // matar a corrida: sem este catch a tela ficava em "Aplicando…"
            // para sempre, porque o `finally` lá embaixo nunca rodava.
            res = { ok: false as const };
          }
          recordSpend(res.requests ?? cost, Date.now());
          inFlight.delete(court.name);
          done++;
          totals.repriced += res.repriced ?? 0;
          totals.updated += res.updated ?? 0;
          totals.failed += res.failed ?? 0;
          written = totals.repriced + totals.updated;
          if (res.rateLimited) {
            hitRateLimit = true;
            tick();
            return;
          }
          if (!res.ok) {
            if (!totals.brokenCourts.includes(court.name)) {
              totals.brokenCourts.push(court.name);
            }
            tick();
            continue;
          }
          okCourts.add(court.name);
          tick();
        }
      })
    );
    totals.courts = okCourts.size;
    if (hitRateLimit) {
      setError(
        "O limite de requisições do servidor foi atingido (600 por minuto, e vale para o painel inteiro). A grade ficou nivelada no preço base e as faixas NÃO entraram — elas continuam aqui no formulário. Espere um minuto e aplique de novo: os horários que já estão no preço certo são pulados, então a segunda passada é bem mais curta."
      );
    }

    setResult(totals);

    // Corrida incompleta NÃO relê da grade. O preço base é aplicado de uma vez
    // em todos os horários, e as faixas vêm por cima, um horário por vez: se a
    // corrida morre no meio, a grade fica NIVELADA NO BASE — sem as faixas.
    // Reler dali apagaria do formulário justamente o que o operador acabou de
    // digitar e ainda não conseguiu gravar, e ele teria que redigitar tudo.
    // O que ele escreveu fica na tela, marcado como não aplicado.
    const incomplete =
      hitRateLimit || totals.brokenCourts.length > 0 || totals.failed > 0;
    if (incomplete) {
      setDirty(true);
      onDone();
      return;
    }

    setDirty(false);
    // Guarda o que ACABOU de ser aplicado e deixa na tela. Antes a tela relia
    // a grade aqui, e a releitura devolvia uma versão empobrecida do que o
    // operador tinha mandado — a faixa das 18h às 22h voltava como "22–22 na
    // segunda", porque a inferência não enxerga hora sem slot. Quem sabe o que
    // foi aplicado é quem aplicou.
    const applied: SavedTable = {
      basePrice,
      bands: bands.map((b) => ({
        startHour: b.startHour,
        endHour: b.endHour,
        price: b.price,
        weekdays: b.weekdays,
      })),
      at: Date.now(),
    };
    saveTable(franchiseId, scope, applied);
    setSource({ kind: "saved", at: applied.at });
    onDone();
  }

  /** O que o botão chama. `finally` é o ponto: qualquer coisa que estoure
      dentro de `apply` tem que destravar a tela — um painel preso em
      "Aplicando…" por cinco minutos não diz se está indo ou se morreu. */
  async function applySafely() {
    try {
      await apply();
    } catch {
      setError(
        "Alguma coisa quebrou no meio da aplicação. O que já foi gravado valeu — confira a prévia e aplique de novo para pegar o resto."
      );
    } finally {
      setProgress(null);
    }
  }

  return (
    <section className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="eyebrow">Tabela de preços</h2>
        <p className="mt-2 max-w-3xl text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Um preço base para o dia inteiro e, por cima dele, as faixas de horário. Aplica nas
          quadras escolhidas de uma vez e <strong>fica valendo como padrão</strong>: toda vez que
          o painel criar horários — regenerar a grade, acrescentar horários, importar print — a
          tabela do tipo daquela quadra volta por cima, e o horário novo já nasce nela. O base
          pega todo horário futuro; as faixas alcançam os próximos 30 dias. Quando duas faixas
          pegam a mesma hora, vale a de baixo. Reservas já vendidas mantêm o preço combinado.
        </p>
      </div>

      <div className="space-y-5">
        {/* ── recorte ─────────────────────────────────────────────────────── */}
        <div>
          <span className={labelClass}>Onde aplicar</span>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "indoor", "outdoor"] as const).map((sc) => {
              const n = counts[sc];
              const on = scope === sc;
              return (
                <button
                  key={sc}
                  type="button"
                  aria-pressed={on}
                  disabled={n === 0}
                  onClick={() => setScope(sc)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[11.5px] font-500 transition-colors disabled:opacity-40",
                    on
                      ? "border-[var(--primary)] bg-[var(--primary)]/12 text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                  )}
                >
                  {SCOPE_LABEL[sc]}{" "}
                  <span className="numeral text-[10.5px] opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
            {scope === "all"
              ? "Coberta e descoberta vão pelo mesmo preço, e o base também vira o padrão da academia — quadra criada depois já nasce nele."
              : `A tabela cai só ${
                  scope === "indoor" ? "nas cobertas" : "nas descobertas"
                }; ${
                  scope === "indoor" ? "as descobertas" : "as cobertas"
                } ficam como estão. Recorte parcial não mexe no padrão da academia.`}
          </p>
        </div>

        {/* De onde veio o que está na tela. Sem isto o formulário parece um
            rascunho em branco quando na verdade mostra a tabela em vigor. */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-300 text-[var(--text-tertiary)]">
          {loading ? (
            "Lendo a tabela…"
          ) : dirty ? (
            <>
              <span className="text-[var(--primary)]">Alterações não aplicadas.</span>
              <button
                type="button"
                onClick={() => sample && loadTable(sample.id, sample.name, scope)}
                className="font-500 text-[var(--primary)] underline-offset-2 transition-opacity hover:opacity-70"
              >
                Descartar
              </button>
            </>
          ) : source?.kind === "saved" ? (
            <>
              Última tabela aplicada aqui, em{" "}
              {new Date(source.at).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
              .{" "}
              {/* A grade continua sendo a verdade final; o botão existe para
                  quando alguém repreçar uma quadra por fora daqui. */}
              <button
                type="button"
                onClick={() => sample && loadFromGrid(sample.id, sample.name)}
                className="font-500 text-[var(--primary)] underline-offset-2 transition-opacity hover:opacity-70"
              >
                Ler da grade
              </button>
            </>
          ) : source?.kind === "grid" ? (
            <>Lida da grade da {source.courtName}. Mude o que precisar e aplique.</>
          ) : (
            "Não deu para ler a tabela — o que você preencher aqui vai valer mesmo assim."
          )}
        </p>

        <div className="sm:max-w-[220px]">
          <label htmlFor="pt_base" className={labelClass}>
            Preço base da hora (R$)
          </label>
          <input
            id="pt_base"
            inputMode="decimal"
            value={basePrice}
            onChange={(e) => {
              setDirty(true);
              setBasePrice(e.target.value);
            }}
            placeholder="ex: 250"
            className={fieldClass}
          />
          <p className="mt-1.5 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
            Vale para toda hora que nenhuma faixa pegar. Em branco, o preço atual de cada horário
            fica como está.
          </p>
        </div>

        {/* ── faixas ──────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className={labelClass}>Faixas de horário</span>
            <button
              type="button"
              onClick={() => addBand()}
              className="inline-flex items-center gap-1 text-[10.5px] font-500 text-[var(--primary)] transition-opacity hover:opacity-70"
            >
              <Plus size={11} strokeWidth={2.5} /> Adicionar faixa
            </button>
          </div>

          {bands.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-[11.5px] font-300 leading-snug text-[var(--text-tertiary)]">
              Sem faixa nenhuma, todo horário sai pelo preço base. Comece por um atalho abaixo.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {bands.map((b) => (
                <li
                  key={b.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-[72px]">
                      <label className={labelClass} htmlFor={`b${b.id}_from`}>
                        Da hora
                      </label>
                      <input
                        id={`b${b.id}_from`}
                        type="number"
                        min={0}
                        max={23}
                        value={b.startHour}
                        onChange={(e) => patchBand(b.id, { startHour: Number(e.target.value) })}
                        className={fieldClass}
                      />
                    </div>
                    <div className="w-[72px]">
                      <label className={labelClass} htmlFor={`b${b.id}_to`}>
                        Até (incl.)
                      </label>
                      <input
                        id={`b${b.id}_to`}
                        type="number"
                        min={0}
                        max={23}
                        value={b.endHour}
                        onChange={(e) => patchBand(b.id, { endHour: Number(e.target.value) })}
                        className={fieldClass}
                      />
                    </div>
                    <div className="w-[110px]">
                      <label className={labelClass} htmlFor={`b${b.id}_price`}>
                        Preço (R$)
                      </label>
                      <input
                        id={`b${b.id}_price`}
                        inputMode="decimal"
                        value={b.price}
                        onChange={(e) => patchBand(b.id, { price: e.target.value })}
                        placeholder="ex: 400"
                        className={fieldClass}
                      />
                    </div>

                    <div className="min-w-[240px] flex-1">
                      <span className={labelClass}>Dias</span>
                      {/* O atalho anda junto dos chips, na mesma linha que
                          quebra: encostado na borda direita do card ele ficava
                          longe demais do que comanda. */}
                      <div className="flex flex-wrap items-center gap-1">
                        {DOW_OPTIONS.map((d) => {
                          const on = b.weekdays.includes(d.v);
                          return (
                            <button
                              key={d.v}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggleDay(b.id, d.v)}
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-[10.5px] font-500 transition-colors",
                                on
                                  ? "border-[var(--primary)] bg-[var(--primary)]/12 text-[var(--primary)]"
                                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                              )}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() =>
                            updateBand(b.id, (cur) => ({
                              ...cur,
                              weekdays: cur.weekdays.length === 7 ? [] : [...ALL_DAYS],
                            }))
                          }
                          className="ml-1 text-[10px] font-500 text-[var(--primary)] transition-opacity hover:opacity-70"
                        >
                          {b.weekdays.length === 7 ? "Limpar" : "Todos"}
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeBand(b.id)}
                      aria-label="Remover faixa"
                      className="mb-1.5 inline-flex items-center gap-1 text-[10.5px] font-500 text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-error)]"
                    >
                      <Trash2 size={12} /> Remover
                    </button>
                  </div>
                  {b.weekdays.length > 0 && b.weekdays.length < 7 && (
                    <p className="mt-2 text-[10.5px] font-300 text-[var(--text-tertiary)]">
                      Vale só {b.weekdays.length === 1 ? "neste dia" : "nestes dias"}; nos outros,
                      o preço base.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-300 text-[var(--text-tertiary)]">Atalhos:</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => addBand({ ...p.band, weekdays: [...p.band.weekdays] })}
                className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[10.5px] font-500 text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <PricePreview
          bands={bands}
          baseCents={baseCents}
          windows={windows}
          scopeNote={
            targets.length === 1
              ? `na ${targets[0].name}`
              : `nas ${targets.length} quadras${
                  scope === "indoor" ? " cobertas" : scope === "outdoor" ? " descobertas" : ""
                }`
          }
        />

        {(baseCents !== null || bands.length > 0) && targets.length > 0 && (
          <p className="text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
            {(() => {
              const reqs = estimateRequests(targets.length, bands.length, baseCents !== null);
              return (
                <>
                  <span className="numeral">{reqs}</span> requisições ao servidor — uma para o
                  preço base e uma por faixa, em cada quadra.{" "}
                </>
              );
            })()}
            {baseCents !== null && bands.length > 0 && (
              <>
                O base entra primeiro, em todos os horários, e as faixas logo em seguida por
                cima — cada uma numa requisição só.{" "}
              </>
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
          <button type="button" onClick={applySafely} disabled={running} className={primaryBtn}>
            {running
              ? "Aplicando…"
              : targets.length === 1
                ? "Aplicar na quadra"
                : `Aplicar nas ${targets.length} quadras${
                    scope === "indoor" ? " cobertas" : scope === "outdoor" ? " descobertas" : ""
                  }`}
            {!running && <Check size={11} strokeWidth={2.5} />}
          </button>
          {progress && <ProgressLine progress={progress} />}
        </div>

        {progress && (
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
              style={{ width: `${Math.max(4, (progress.done / progress.total) * 100)}%` }}
            />
          </div>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-error)]">
            <AlertCircle size={13} className="mt-px shrink-0" />
            {error}
          </p>
        )}

        {result && (
          <p className="flex items-start gap-2 rounded-lg border border-[var(--color-success)]/25 bg-[var(--color-success-bg)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-success)]">
            <Check size={13} strokeWidth={2.5} className="mt-px shrink-0" />
            <span>
              Tabela aplicada em {result.courts} quadra{result.courts === 1 ? "" : "s"} —{" "}
              {result.repriced.toLocaleString("pt-BR")} horário
              {result.repriced === 1 ? "" : "s"} no preço base e{" "}
              {result.updated.toLocaleString("pt-BR")} nas faixas.
              {result.skippedBooked > 0 &&
                ` ${result.skippedBooked} com reserva ${
                  result.skippedBooked === 1 ? "ficou" : "ficaram"
                } com o preço combinado.`}
              {result.failed > 0 &&
                ` ${result.failed} horário${result.failed === 1 ? "" : "s"} não responder${
                  result.failed === 1 ? "am" : "am"
                } — aplique de novo para pegar o que faltou.`}
              {result.brokenCourts.length > 0 &&
                ` Não deu para aplicar em: ${result.brokenCourts.join(", ")}.`}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
