"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import { PlayerLink } from "@/components/ui/player-link";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatRelative } from "@/lib/utils";
import type { components } from "@/lib/api/openapi";
import { Absent, Avatar, When } from "../_components/cells";
import { DeviceCell, DEVICE_SOURCE_NOTE } from "../_components/devices";
import { PanelNote } from "../_components/notes";
import type { UsersAll } from "./actions";

type OpsUserRow = components["schemas"]["OpsUserRow"];

// Written verbatim, one column per grid track — the sunken header band and every
// data row share this template so cells line up down the table.
// A última faixa cresceu de 116px pra caber "iOS + Android" numa linha só: um
// crachá quebrado em duas linhas deixaria de ser o sinal de relance que ele
// existe pra ser.
const GRID =
  "minmax(0,1.6fr) minmax(0,0.9fr) minmax(0,1.4fr) 118px 76px 100px 140px";

const QUIET_LINK = cn(
  "truncate rounded-sm underline-offset-2 transition-colors",
  "hover:text-[var(--primary)] hover:underline",
  "focus-visible:text-[var(--primary)] focus-visible:underline"
);

const HEADS = ["Jogador", "Usuário", "Contato", "Cadastro", "Nível", "Últ. acesso", "Aparelho"];

const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";
const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";

const LEVELS = ["A", "B", "C", "D", "PRO", "não nivelado"] as const;

const GENDER_LABEL: Record<string, string> = {
  male: "Masculino",
  female: "Feminino",
  non_binary: "Não binário",
  prefer_not_say: "Prefere não dizer",
};

/** gender/birthdate ship in a pending BFF deploy — read them defensively so
    the console (and the CSV) light up the moment the fields arrive. */
function genderOf(u: OpsUserRow): string | undefined {
  const g = (u as Record<string, unknown>).gender;
  return typeof g === "string" && g !== "" ? g : undefined;
}
function birthdateOf(u: OpsUserRow): string | undefined {
  const b = (u as Record<string, unknown>).birthdate;
  return typeof b === "string" && b !== "" ? b : undefined;
}
function ageOf(u: OpsUserRow): number | null {
  const b = birthdateOf(u);
  if (!b) return null;
  const d = new Date(`${b}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (
    now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())
  )
    age--;
  return age;
}

/** Excel-friendly CSV: BOM (so pt-BR Excel opens UTF-8 right) + semicolon
    separator (the list delimiter in pt-BR locales). */
function exportCsv(rows: OpsUserRow[]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "id", "nome", "usuario", "email", "telefone", "nivel", "xp",
    "sexo", "idade", "nascimento", "entrou_em", "ultimo_acesso",
  ];
  const lines = rows.map((u) =>
    [
      u.id,
      u.name,
      u.username ?? "",
      u.email ?? "",
      u.phone_e164 ?? "",
      u.level ?? "",
      u.xp_level,
      genderOf(u) ? (GENDER_LABEL[genderOf(u)!] ?? genderOf(u)) : "",
      ageOf(u) ?? "",
      birthdateOf(u) ?? "",
      u.created_at ?? "",
      u.last_seen_at ?? "",
    ]
      .map(esc)
      .join(";")
  );
  const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `lits-usuarios-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const dayMs = (ymd: string, endOfDay = false) =>
  new Date(`${ymd}T${endOfDay ? "23:59:59" : "00:00:00"}`).getTime();

export function UsersTable({ initial }: { initial: UsersAll }) {
  const rows = initial.rows;
  const [query, setQuery] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [seenFrom, setSeenFrom] = useState("");
  const [seenTo, setSeenTo] = useState("");
  const [levels, setLevels] = useState<Set<string>>(new Set());
  const [genders, setGenders] = useState<Set<string>>(new Set());
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");

  // Sexo/idade só ganham filtro quando o dado existe na listagem (campos novos
  // do BFF); antes disso os controles seriam mentira.
  const hasGender = useMemo(() => rows.some((u) => genderOf(u) != null), [rows]);
  const hasBirthdate = useMemo(() => rows.some((u) => birthdateOf(u) != null), [rows]);

  const filtered = useMemo(() => {
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const q = norm(query.trim());
    return rows.filter((u) => {
      if (
        q &&
        !norm(`${u.name} ${u.username ?? ""} ${u.email ?? ""} ${u.phone_e164 ?? ""}`).includes(q)
      )
        return false;
      if (createdFrom || createdTo) {
        if (!u.created_at) return false;
        const t = new Date(u.created_at).getTime();
        if (createdFrom && t < dayMs(createdFrom)) return false;
        if (createdTo && t > dayMs(createdTo, true)) return false;
      }
      if (seenFrom || seenTo) {
        if (!u.last_seen_at) return false;
        const t = new Date(u.last_seen_at).getTime();
        if (seenFrom && t < dayMs(seenFrom)) return false;
        if (seenTo && t > dayMs(seenTo, true)) return false;
      }
      if (levels.size > 0) {
        const lvl = u.level || "não nivelado";
        if (!levels.has(lvl)) return false;
      }
      if (genders.size > 0) {
        const g = genderOf(u);
        if (!g || !genders.has(g)) return false;
      }
      if (ageMin || ageMax) {
        const age = ageOf(u);
        if (age == null) return false;
        if (ageMin && age < Number(ageMin)) return false;
        if (ageMax && age > Number(ageMax)) return false;
      }
      return true;
    });
  }, [rows, query, createdFrom, createdTo, seenFrom, seenTo, levels, genders, ageMin, ageMax]);

  const toggle = (set: Set<string>, v: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    apply(next);
  };

  const narrowed = filtered.length !== rows.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
          <span className="font-600 text-[var(--text-secondary)]">{filtered.length}</span>
          {narrowed ? ` de ${rows.length}` : ""} usuário{filtered.length === 1 ? "" : "s"}
          {initial.truncated && " (pelo menos — varredura truncada)"}
        </span>
        <div className="flex items-center gap-2">
          <div className="w-full sm:w-72">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Buscar por nome, @usuário, email ou telefone..."
            />
          </div>
          <button
            type="button"
            onClick={() => exportCsv(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 font-700 text-[9px] uppercase tracking-[0.16em] text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Download size={11} strokeWidth={2.5} />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className={labelClass}>Entrou entre</p>
          <div className="flex items-center gap-1.5">
            <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} className={fieldClass} aria-label="Entrou a partir de" />
            <span className="text-[var(--text-tertiary)]">–</span>
            <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} className={fieldClass} aria-label="Entrou até" />
          </div>
        </div>
        <div>
          <p className={labelClass}>Ativo entre</p>
          <div className="flex items-center gap-1.5">
            <input type="date" value={seenFrom} onChange={(e) => setSeenFrom(e.target.value)} className={fieldClass} aria-label="Ativo a partir de" />
            <span className="text-[var(--text-tertiary)]">–</span>
            <input type="date" value={seenTo} onChange={(e) => setSeenTo(e.target.value)} className={fieldClass} aria-label="Ativo até" />
          </div>
        </div>
        <div>
          <p className={labelClass}>Nível</p>
          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => toggle(levels, l, setLevels)}
                aria-pressed={levels.has(l)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10.5px] font-600 transition-colors",
                  levels.has(l)
                    ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                    : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {hasGender || hasBirthdate ? (
          <div className="space-y-2.5">
            {hasGender && (
              <div>
                <p className={labelClass}>Sexo</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(GENDER_LABEL).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => toggle(genders, v, setGenders)}
                      aria-pressed={genders.has(v)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10.5px] font-600 transition-colors",
                        genders.has(v)
                          ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                          : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {hasBirthdate && (
              <div>
                <p className={labelClass}>Idade</p>
                <div className="flex items-center gap-1.5">
                  <input type="number" min={13} max={99} value={ageMin} onChange={(e) => setAgeMin(e.target.value)} placeholder="mín" className={cn(fieldClass, "w-[72px]")} aria-label="Idade mínima" />
                  <span className="text-[var(--text-tertiary)]">–</span>
                  <input type="number" min={13} max={99} value={ageMax} onChange={(e) => setAgeMax(e.target.value)} placeholder="máx" className={cn(fieldClass, "w-[72px]")} aria-label="Idade máxima" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="self-center text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
            Sexo e idade aparecem aqui quando o backend passar a expor esses campos na listagem
            (deploy pendente do bff).
          </p>
        )}
      </div>

      {/* Sem esta linha, uma coluna Aparelho vazia lê como fato sobre a pessoa
          em vez de fato sobre o nosso dado. Ver DEVICE_SOURCE_NOTE. */}
      <PanelNote>{DEVICE_SOURCE_NOTE}</PanelNote>

      {filtered.length === 0 ? (
        <EmptyState
          message={
            narrowed || query.trim()
              ? "Nenhum usuário encontrado para esses filtros."
              : "Nenhum usuário cadastrado."
          }
          tone="neutral"
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <div className="overflow-x-auto">
          <div className="min-w-[720px]">
          <div
            className="grid items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-2.5"
            style={{ gridTemplateColumns: GRID }}
          >
            {HEADS.map((h) => (
              <span key={h} className="label-colus text-[8.5px] text-[var(--text-tertiary)]">
                {h}
              </span>
            ))}
          </div>

          <div>
            {filtered.map((u) => (
              <div
                key={u.id}
                className="grid items-center gap-3 border-b border-[var(--border)] px-4 py-[11px] text-[12.5px] leading-snug text-[var(--text-primary)] last:border-b-0"
                style={{ gridTemplateColumns: GRID }}
              >
                {/* Jogador — avatar + name, the name a door into the dossier. */}
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar src={u.avatar_url} name={u.name} />
                  <PlayerLink userId={u.id} name={u.name} className="font-500" />
                </span>

                {/* Usuário */}
                <span className="min-w-0 truncate text-[var(--text-secondary)]">
                  {u.username ? `@${u.username}` : <Absent />}
                </span>

                {/* Contato — email over WhatsApp, both quiet links. */}
                <span className="flex min-w-0 flex-col gap-0.5">
                  {u.email ? (
                    <a
                      href={`mailto:${u.email}`}
                      className={cn(QUIET_LINK, "break-all text-[11.5px]")}
                    >
                      {u.email}
                    </a>
                  ) : null}
                  {u.phone_e164 ? (
                    <a
                      href={`https://wa.me/${u.phone_e164.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(QUIET_LINK, "text-[11.5px]")}
                    >
                      {u.phone_e164}
                    </a>
                  ) : null}
                  {!u.email && !u.phone_e164 && <Absent />}
                </span>

                {/* Cadastro */}
                {u.created_at ? <When iso={u.created_at} /> : <Absent />}

                {/* Nível — category, empty until nivelamento (not a default "D"). */}
                <span>
                  {u.level ? (
                    <Badge variant="muted">{u.level}</Badge>
                  ) : (
                    <span className="text-[11px] text-[var(--text-tertiary)]">não nivelado</span>
                  )}
                </span>

                {/* Último acesso — empty until first stamped activity: "nunca", not epoch. */}
                <span className="text-[11.5px] text-[var(--text-secondary)]">
                  {u.last_seen_at ? (
                    <span title={u.last_seen_at}>{formatRelative(new Date(u.last_seen_at))}</span>
                  ) : (
                    <span className="text-[var(--text-tertiary)]">nunca</span>
                  )}
                </span>

                {/* Aparelho — a plataforma registrada no push, e um crachá
                    preenchido quando são as duas. Célula vazia NÃO é "sem
                    celular": ver a nota acima da tabela e DeviceCell. */}
                <DeviceCell devices={u.devices} />
              </div>
            ))}
          </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
