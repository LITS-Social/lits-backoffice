"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { fetchClubAnalyticsAction, type ClubAnalytics } from "./analytics-actions";

/**
 * O dashboard de liquidez por academia — só as parceiras LITS.
 *
 * A tese que o desenho carrega: liquidez é POR NÓ (fill varia de 0% a 75%
 * entre clubes), então tudo aqui responde sobre UM clube, escolhido no
 * dropdown. A última escolha fica no localStorage e vira o padrão da próxima
 * visita.
 *
 * A ordem dos blocos é a ordem de importância que o founder definiu — heatmap
 * primeiro ("o horário do slot é o preditor mais forte"), depois fill, tempo,
 * cancelamento em faixas, jogadores no raio, visibilidade e ocupação.
 */

const STORAGE_KEY = "lits-club-analytics:franchise";
const DOWS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export type PartnerOption = { id: string; name: string };

export function ClubAnalyticsBoard({ partners }: { partners: PartnerOption[] }) {
  const [franchiseId, setFranchiseId] = useState<string | null>(null);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; error: string }
    | { kind: "ready"; data: ClubAnalytics }
  >({ kind: "loading" });
  const requested = useRef<string | null>(null);

  // A academia padrão: a última analisada, se ainda for parceira; senão a 1ª.
  // Diferido por setTimeout, não rAF: a regra da casa proíbe setState síncrono
  // em effect, e rAF NÃO DISPARA em aba sem foco — a tela ficava presa no
  // "Carregando…" até a aba ganhar frente.
  useEffect(() => {
    const t = setTimeout(() => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(STORAGE_KEY);
      } catch {
        /* sem localStorage, cai na primeira */
      }
      const valid = partners.some((p) => p.id === saved);
      setFranchiseId(valid ? saved : (partners[0]?.id ?? null));
    }, 0);
    return () => clearTimeout(t);
  }, [partners]);

  const load = useCallback(async (id: string) => {
    requested.current = id;
    setState({ kind: "loading" });
    const res = await fetchClubAnalyticsAction(id);
    // Trocou de academia enquanto carregava: a resposta velha não pode vencer.
    if (requested.current !== id) return;
    setState(res.ok ? { kind: "ready", data: res.data } : { kind: "error", error: res.error });
  }, []);

  useEffect(() => {
    if (!franchiseId) return;
    const t = setTimeout(() => void load(franchiseId), 0);
    return () => clearTimeout(t);
  }, [franchiseId, load]);

  if (partners.length === 0) return null;

  return (
    <section className="grain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="eyebrow">Liquidez por academia</h2>
          <p className="mt-1 text-[10.5px] font-300 text-[var(--text-tertiary)]">
            quick matches, tempos e ocupação de um clube parceiro por vez
          </p>
        </div>
        <select
          value={franchiseId ?? ""}
          onChange={(e) => {
            const id = e.target.value;
            setFranchiseId(id);
            try {
              localStorage.setItem(STORAGE_KEY, id);
            } catch {
              /* padrão volta à primeira na próxima visita */
            }
          }}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[12.5px] font-500 text-[var(--text-primary)] outline-none"
        >
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {state.kind === "loading" && (
        <p className="py-10 text-center text-[11.5px] font-300 text-[var(--text-tertiary)]">
          Carregando a análise…
        </p>
      )}
      {state.kind === "error" && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/40 px-4 py-6 text-center text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          {state.error}
        </p>
      )}
      {state.kind === "ready" && <Board d={state.data} />}
    </section>
  );
}

function Board({ d }: { d: ClubAnalytics }) {
  const fill = d.funnel.fill_rate ?? null;
  const pct = (v: number | null | undefined) =>
    v == null ? "—" : `${Math.round(v * 100)}%`;
  const min = (v: number | null | undefined) =>
    v == null ? "—" : v < 90 ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} min` : `${(v / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

  return (
    <div className="space-y-6">
      {/* ── A régua-mãe ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
        <Cel
          rotulo="Fill rate"
          valor={pct(fill)}
          tom={fill == null ? undefined : fill < 0.25 ? "var(--color-error)" : "var(--color-success)"}
          hint={
            fill == null
              ? "sem quick match aqui ainda"
              : `${d.funnel.matched} de ${d.funnel.opened} abertos${fill < 0.25 ? " · abaixo de 25%" : ""}`
          }
        />
        <Cel
          rotulo="Mediana até encher"
          valor={min(d.median_fill_min)}
          tom={
            d.median_fill_min == null
              ? undefined
              : d.median_fill_min <= 10
                ? "var(--color-success)"
                : "var(--color-clay)"
          }
          hint="meta < 10 min — sinal antecedente do fill"
        />
        <Cel
          rotulo="Cancelamento"
          valor={pct(d.cancel.rate)}
          tom={d.cancel.rate != null && d.cancel.rate > 0.5 ? "var(--color-clay)" : undefined}
          hint={d.cancel.median_min != null ? `mediana de ${min(d.cancel.median_min)} até cancelar` : "—"}
        />
        <Cel
          rotulo="Ocupação 28d"
          valor={pct(d.occupancy.rate_28d)}
          hint="ocupados ÷ (abertos + ocupados) — bloqueado não é oferta"
        />
      </div>

      {/* ── O preditor mais forte: fill por hora × dia ──────────────────── */}
      <Heatmap cells={d.heatmap ?? []} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Cancelamento em faixas: três causas diferentes ────────────── */}
        <div>
          <p className="label-colus mb-3 text-[8.5px] text-[var(--text-tertiary)]">
            Cancelados — em que minuto
          </p>
          <Bandas
            bandas={[
              { rotulo: "< 1 min", hint: "arrependimento imediato", n: d.cancel.under_1min },
              { rotulo: "1–15 min", hint: "impaciência", n: d.cancel.min_1_to_15 },
              { rotulo: "> 15 min", hint: "ausência real de parceiro", n: d.cancel.over_15min },
            ]}
          />
          {(d.cancel.unbanded ?? 0) > 0 && (
            <p className="mt-2 text-[9.5px] font-300 text-[var(--text-tertiary)]">
              +{d.cancel.unbanded} cancelados sem instante registrado — contam na taxa, não nas
              faixas.
            </p>
          )}
        </div>

        {/* ── O denominador da liquidez: gente no raio ──────────────────── */}
        <div>
          <p className="label-colus mb-3 text-[8.5px] text-[var(--text-tertiary)]">
            Jogadores a 8 km, por nível
          </p>
          {d.players_8km && d.players_8km.length > 0 ? (
            <ul className="space-y-2">
              {d.players_8km.map((r) => (
                <li key={r.category} className="flex items-center gap-3">
                  <span className="label-colus w-16 shrink-0 text-[9px] text-[var(--text-secondary)]">
                    {r.category === "sem_nivel" ? "sem nível" : r.category}
                  </span>
                  <span className="h-2 rounded-full bg-[var(--primary)]/25" style={{ width: `${Math.min(r.total * 2, 100)}%` }}>
                    <span
                      className="block h-2 rounded-full bg-[var(--primary)]"
                      style={{ width: r.total > 0 ? `${(r.active_30d / r.total) * 100}%` : 0 }}
                    />
                  </span>
                  <span className="numeral ml-auto shrink-0 text-[12px] text-[var(--text-primary)]">
                    {r.active_30d}
                    <span className="text-[var(--text-tertiary)]"> / {r.total}</span>
                  </span>
                </li>
              ))}
              <li className="pt-1 text-[9.5px] font-300 text-[var(--text-tertiary)]">
                ativos em 30 dias / com geo no raio · {d.players_sem_geo} usuários sem
                localização ficam fora desta conta
              </li>
            </ul>
          ) : (
            <p className="text-[11px] font-300 text-[var(--text-tertiary)]">
              Este clube não tem lat/lng cadastrada — sem centro, não há raio.
            </p>
          )}
        </div>

        {/* ── Onde há tecido social ─────────────────────────────────────── */}
        <div>
          <p className="label-colus mb-3 text-[8.5px] text-[var(--text-tertiary)]">
            Fill por visibilidade
          </p>
          {d.visibility && d.visibility.length > 0 ? (
            <ul className="space-y-2.5">
              {d.visibility.map((v) => (
                <li key={v.visibility} className="flex items-baseline gap-3">
                  <span className="label-colus w-24 shrink-0 text-[9px] text-[var(--text-secondary)]">
                    {v.visibility === "connections" ? "Conexões" : "Público"}
                  </span>
                  <span className="numeral text-[15px] text-[var(--text-primary)]">
                    {pct(v.fill_rate)}
                  </span>
                  <span className="text-[10px] font-300 text-[var(--text-tertiary)]">
                    {v.matched} de {v.opened}
                    {v.median_fill_min != null && <> · enche em {min(v.median_fill_min)}</>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] font-300 text-[var(--text-tertiary)]">Sem quick matches aqui.</p>
          )}
        </div>

        {/* ── Oferta: a grade da semana ─────────────────────────────────── */}
        <div>
          <p className="label-colus mb-3 text-[8.5px] text-[var(--text-tertiary)]">
            Oferta da semana
          </p>
          <ul className="space-y-2.5">
            <li className="flex items-baseline gap-3">
              <span className="numeral text-[15px] text-[var(--text-primary)]">
                {d.occupancy.slots_week.toLocaleString("pt-BR")}
              </span>
              <span className="text-[10px] font-300 text-[var(--text-tertiary)]">
                slots abertos na semana (seg–dom)
              </span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="numeral text-[15px] text-[var(--text-primary)]">
                {d.occupancy.slots_week_left.toLocaleString("pt-BR")}
              </span>
              <span className="text-[10px] font-300 text-[var(--text-tertiary)]">
                ainda por vir até domingo
              </span>
            </li>
            {d.occupancy.slots_per_quick != null && (
              <li className="flex items-baseline gap-3">
                <span className="numeral text-[15px] text-[var(--text-primary)]">
                  {d.occupancy.slots_per_quick.toLocaleString("pt-BR")}
                </span>
                <span className="text-[10px] font-300 text-[var(--text-tertiary)]">
                  slots abertos por quick match criado (28d) — quadra não é o gargalo quando isto
                  é alto
                </span>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Cel({
  rotulo,
  valor,
  tom,
  hint,
}: {
  rotulo: string;
  valor: string;
  tom?: string;
  hint?: string;
}) {
  return (
    <div className="bg-[var(--surface)] px-4 py-3">
      <p className="label-colus text-[8px] text-[var(--text-tertiary)]">{rotulo}</p>
      <p className="numeral mt-1 text-[22px] leading-none" style={{ color: tom ?? "var(--text-primary)" }}>
        {valor}
      </p>
      {hint && (
        <p className="mt-1 text-[9.5px] font-300 leading-snug text-[var(--text-tertiary)]">{hint}</p>
      )}
    </div>
  );
}

function Bandas({ bandas }: { bandas: { rotulo: string; hint: string; n: number }[] }) {
  const max = Math.max(...bandas.map((b) => b.n), 1);
  return (
    <ul className="space-y-2">
      {bandas.map((b) => (
        <li key={b.rotulo} className="flex items-center gap-3">
          <span className="label-colus w-16 shrink-0 text-[9px] text-[var(--text-secondary)]">
            {b.rotulo}
          </span>
          <span
            className="h-4 rounded-[3px] bg-[var(--color-clay)]"
            style={{ width: `${(b.n / max) * 100}%`, opacity: b.n === 0 ? 0.15 : 0.85 }}
          />
          <span className="numeral shrink-0 text-[13px] text-[var(--text-primary)]">{b.n}</span>
          <span className="truncate text-[9.5px] font-300 text-[var(--text-tertiary)]">
            {b.hint}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Fill por hora × dia. Só desenha as horas com alguma tentativa em algum dia
 * (a régua vertical encolhe para o horário de funcionamento real). A cor diz o
 * FILL da célula; a opacidade nunca esconde o volume — o title carrega os dois.
 */
function Heatmap({ cells }: { cells: { dow: number; hour: number; opened: number; filled: number }[] }) {
  if (cells.length === 0) return null;
  const hours = [...new Set(cells.map((c) => c.hour))].sort((a, b) => a - b);
  const byKey = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c]));
  return (
    <div>
      <p className="label-colus mb-3 text-[8.5px] text-[var(--text-tertiary)]">
        Fill por hora do slot × dia — onde a liquidez mora
      </p>
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th />
              {hours.map((h) => (
                <th key={h} className="label-colus pb-1 text-center text-[8px] font-400 text-[var(--text-tertiary)]">
                  {h}h
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOWS.map((nome, dow) => (
              <tr key={dow}>
                <td className="label-colus pr-2 text-[8px] text-[var(--text-tertiary)]">{nome}</td>
                {hours.map((h) => {
                  const c = byKey.get(`${dow}:${h}`);
                  const fillPct = c && c.opened > 0 ? c.filled / c.opened : null;
                  return (
                    <td key={h}>
                      <div
                        title={
                          c
                            ? `${nome} ${h}h — ${c.filled} de ${c.opened} encheram`
                            : `${nome} ${h}h — sem tentativas`
                        }
                        className={cn("h-5 w-7 rounded-[3px]", !c && "border border-[var(--border)]/60")}
                        style={
                          c
                            ? {
                                background:
                                  fillPct === 0
                                    ? "var(--color-clay)"
                                    : "var(--color-success)",
                                opacity: fillPct === 0 ? 0.35 : 0.25 + 0.75 * (fillPct ?? 0),
                              }
                            : undefined
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[9.5px] font-300 text-[var(--text-tertiary)]">
        verde = encheu (mais forte, mais fill) · terroso = tentativas que não encheram · vazio =
        ninguém tentou
      </p>
    </div>
  );
}
