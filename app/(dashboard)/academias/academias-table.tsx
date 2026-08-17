"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, MapPin, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AcademiaRow } from "./page";

const SURFACE_LABEL: Record<string, string> = {
  clay:   "Saibro",
  hard:   "Duro",
  grass:  "Grama",
  beach:  "Areia",
  carpet: "Carpete",
};

/** Same reading as the old courts table: partners first, then public parks,
    then the directory long tail — the order staff scans in. */
function kindBadge(a: AcademiaRow): { label: string; variant: "success" | "info" | "default" | "muted"; rank: number } {
  if (a.kind === "partner") return { label: "Parceiro", variant: "success", rank: 0 };
  if (a.kind === "public")  return { label: "Pública",  variant: "info",    rank: 1 };
  if (a.brand === "playtennis") return { label: "PlayTennis", variant: "default", rank: 2 };
  return { label: "Diretório", variant: "muted", rank: 2 };
}

const KIND_FILTERS = [
  { value: "",        label: "Todas" },
  { value: "partner", label: "Parceiros" },
  { value: "public",  label: "Públicas" },
  { value: "listing", label: "Diretório" },
] as const;

/** As ordens que a lista oferece. A alfabética é a primeira porque é a única
    que não depende de dado que pode faltar. */
const SORTS = [
  { value: "name", label: "Ordem alfabética" },
  { value: "players", label: "Mais jogadores" },
  { value: "courts", label: "Mais quadras" },
  { value: "bookings", label: "Mais partidas" },
] as const;

type SortValue = (typeof SORTS)[number]["value"];

const SORT_KEY = "lits-academias-sort";

export function AcademiasTable({ academias }: { academias: AcademiaRow[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [sort, setSort] = useState<SortValue>("name");

  // A escolha fica até ser trocada. Lida DEPOIS do primeiro render, num rAF:
  // o servidor não tem localStorage, e ler durante o render faria o HTML do
  // servidor e o do cliente discordarem.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(SORT_KEY);
        if (saved && SORTS.some((o) => o.value === saved)) setSort(saved as SortValue);
      } catch {
        /* sem localStorage a lista abre na ordem alfabética, que é o padrão */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  function changeSort(v: SortValue) {
    setSort(v);
    try {
      localStorage.setItem(SORT_KEY, v);
    } catch {
      /* a ordem vale nesta sessão mesmo sem conseguir guardar */
    }
  }

  const shown = useMemo(() => {
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return academias
      .filter((a) => {
        if (q && !norm(a.name).includes(norm(q)) && !a.courts.some((c) => norm(c.name).includes(norm(q))))
          return false;
        if (kind === "partner") return a.kind === "partner";
        if (kind === "public") return a.kind === "public";
        if (kind === "listing") return a.kind !== "partner" && a.kind !== "public";
        return true;
      })
      .sort((x, y) => {
        if (sort === "name") return x.name.localeCompare(y.name, "pt-BR");
        // Contagem AUSENTE não é zero: a academia não apareceu no diretório, e
        // ordenar por um zero inventado a jogaria para o fim como se não
        // tivesse ninguém. Ela vai para o fim mesmo, mas por não ter resposta.
        const val = (a: AcademiaRow) =>
          sort === "courts"
            ? a.courts.length
            : sort === "players"
              ? a.preferredByUsersCount
              : a.bookingsCount;
        const vx = val(x);
        const vy = val(y);
        if (vx == null && vy == null) return x.name.localeCompare(y.name, "pt-BR");
        if (vx == null) return 1;
        if (vy == null) return -1;
        // Empate cai no de sempre: parceiro antes, e então alfabética.
        if (vy !== vx) return vy - vx;
        const r = kindBadge(x).rank - kindBadge(y).rank;
        return r !== 0 ? r : x.name.localeCompare(y.name, "pt-BR");
      });
  }, [academias, q, kind, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar academia ou quadra…"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] py-2 pl-8 pr-3 text-[13px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setKind(f.value)}
              aria-pressed={kind === f.value}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[11px] font-600 transition-colors",
                kind === f.value
                  ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Select nativo de propósito: abre no teclado, no leitor de tela e no
            seletor do celular sem eu reimplementar nenhum dos três. */}
        <div className="relative ml-auto">
          <select
            aria-label="Ordenar por"
            value={sort}
            onChange={(e) => changeSort(e.target.value as SortValue)}
            className="appearance-none rounded-full border border-[var(--border)] bg-[var(--bg)] py-1.5 pl-3.5 pr-8 text-[11px] font-600 text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none"
          >
            {SORTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center text-[12.5px] font-300 text-[var(--text-tertiary)]">
          Nenhuma academia encontrada.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => {
            const badge = kindBadge(a);
            const active = a.courts.filter((c) => c.is_active).length;
            return (
              <li key={a.franchiseId}>
                <Link
                  href={`/academias/${a.franchiseId}`}
                  className="grain group flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition-colors hover:border-[var(--primary)]/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-[14.5px] font-600 text-[var(--text-primary)]">
                      {a.name}
                    </p>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  <p className="mt-1.5 text-[11.5px] font-300 text-[var(--text-tertiary)]">
                    {a.courts.length} quadra{a.courts.length === 1 ? "" : "s"}
                    {active !== a.courts.length && <> · {active} ativa{active === 1 ? "" : "s"}</>}
                    {!a.hasGeo && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[var(--color-clay)]">
                        <MapPin size={10} /> sem localização
                      </span>
                    )}
                  </p>
                  {(a.preferredByUsersCount != null || a.bookingsCount != null) && (
                    <p className="mt-0.5 text-[10.5px] font-300 text-[var(--text-tertiary)]">
                      {a.preferredByUsersCount != null && (
                        <>{a.preferredByUsersCount} preferi{a.preferredByUsersCount === 1 ? "u" : "ram"}</>
                      )}
                      {a.preferredByUsersCount != null && a.bookingsCount != null && " · "}
                      {a.bookingsCount != null && (
                        <>{a.bookingsCount} reserva{a.bookingsCount === 1 ? "" : "s"}</>
                      )}
                    </p>
                  )}
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {a.courts.slice(0, 6).map((c) => (
                      <li
                        key={c.id}
                        className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[10.5px] font-500 text-[var(--text-secondary)]"
                      >
                        {c.name}
                        <span className="ml-1 font-300 text-[var(--text-tertiary)]">
                          {SURFACE_LABEL[c.surface] ?? c.surface}
                        </span>
                      </li>
                    ))}
                    {a.courts.length > 6 && (
                      <li className="px-1 py-0.5 text-[10.5px] font-300 text-[var(--text-tertiary)]">
                        +{a.courts.length - 6}
                      </li>
                    )}
                  </ul>
                  <span className="mt-auto flex items-center gap-1 pt-4 text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--primary)] opacity-0 transition-opacity group-hover:opacity-100">
                    Gerenciar <ArrowRight size={11} strokeWidth={2.5} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
