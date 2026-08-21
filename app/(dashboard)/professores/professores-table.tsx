"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, KeyRound, Mail, MessageCircle, RefreshCw } from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFilterGroup,
} from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid, type DetailField } from "@/components/ui/detail-grid";
import { Timestamp } from "@/components/ui/timestamp";
import type { ProfessorRow } from "@/lib/professores";
import { liberarPrimeiroAcessoAction, markProfessorCalledAction } from "./actions";
import { syncProfessorAction } from "./sync-actions";

const DAY = 24 * 60 * 60;

/** Epoch em segundos → ISO, que é o que o Timestamp consome. */
function iso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

/**
 * Link do WhatsApp a partir do que o formulário gravou (só dígitos).
 *
 * O campo é preenchido com DDD + número por um input BR, então o DDI quase
 * nunca está lá; o wa.me exige o número completo. A regra é conservadora de
 * propósito: 10 ou 11 dígitos é número nacional e ganha o 55; 12 ou 13 já
 * começando com 55 vai como está. Qualquer outra forma devolve null e a tela
 * mostra o número como texto — abrir uma conversa com o número ERRADO é pior
 * que obrigar a copiar e colar.
 */
function waLink(digits: string): string | null {
  const d = digits.replace(/\D+/g, "");
  if (d.length === 10 || d.length === 11) return `https://wa.me/55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `https://wa.me/${d}`;
  return null;
}

/** Formata para leitura; não altera o que foi gravado. */
function prettyPhone(digits: string): string {
  const d = digits.replace(/\D+/g, "");
  const nat = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  if (nat.length === 11) return `(${nat.slice(0, 2)}) ${nat.slice(2, 7)}-${nat.slice(7)}`;
  if (nat.length === 10) return `(${nat.slice(0, 2)}) ${nat.slice(2, 6)}-${nat.slice(6)}`;
  return digits;
}

/** Estado de chamada de uma linha, depois de aplicar o que já mudou nesta sessão. */
type CallState = { calledAt: number | null; calledBy: string | null };

/** Resultado da última publicação do painel, por professor. */
type SyncState = { ok: boolean; texto: string };

export function ProfessoresTable({ rows }: { rows: ProfessorRow[] }) {
  // Sobreposição do que foi marcado/desmarcado aqui, por id — guarda a
  // resposta REAL da API (called_at/called_by como o banco gravou), não um
  // palpite otimista. Mesmo desenho do #15.
  const [overlay, setOverlay] = useState<Record<number, CallState>>({});
  // Conjunto de ids em voo, não um id só: marcar B enquanto A ainda não
  // respondeu não pode reabilitar o botão de A.
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  // O sync tem estado próprio: publicar o painel do professor A não pode
  // apagar o resultado que o operador acabou de ler sobre o professor B.
  const [sync, setSync] = useState<Record<number, SyncState>>({});
  const [syncing, setSyncing] = useState<Set<number>>(new Set());

  const stateOf = useMemo(
    () =>
      (r: ProfessorRow): CallState =>
        overlay[r.id] ?? { calledAt: r.called_at, calledBy: r.called_by },
    [overlay]
  );

  const toggle = useCallback(
    (r: ProfessorRow) => {
      const next = stateOf(r).calledAt === null;
      setError("");
      setPending((cur) => new Set(cur).add(r.id));

      markProfessorCalledAction(r.id, next).then((res) => {
        setPending((cur) => {
          const s = new Set(cur);
          s.delete(r.id);
          return s;
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setOverlay((cur) => ({
          ...cur,
          [r.id]: { calledAt: res.calledAt, calledBy: res.calledBy },
        }));
      });
    },
    [stateOf]
  );

  const liberar = useCallback((r: ProfessorRow) => {
    setSyncing((cur) => new Set(cur).add(r.id));
    setSync((cur) => {
      const { [r.id]: _fora, ...resto } = cur;
      return resto;
    });

    liberarPrimeiroAcessoAction(r.id).then((res) => {
      setSyncing((cur) => {
        const s = new Set(cur);
        s.delete(r.id);
        return s;
      });
      setSync((cur) => ({
        ...cur,
        [r.id]: res.ok
          ? {
              ok: true,
              texto: res.ate
                ? `pode entrar com o e-mail até ${new Date(res.ate * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                : "primeiro acesso liberado",
            }
          : { ok: false, texto: res.error },
      }));
    });
  }, []);

  const publicar = useCallback((r: ProfessorRow) => {
    setSyncing((cur) => new Set(cur).add(r.id));
    setSync((cur) => {
      const { [r.id]: _fora, ...resto } = cur;
      return resto;
    });

    syncProfessorAction(r.email).then((res) => {
      setSyncing((cur) => {
        const s = new Set(cur);
        s.delete(r.id);
        return s;
      });
      setSync((cur) => ({
        ...cur,
        [r.id]: res.ok
          ? {
              ok: true,
              texto: res.aviso
                ? res.aviso
                : `${res.alunos} aluno${res.alunos === 1 ? "" : "s"} · ${res.partidas} partida${res.partidas === 1 ? "" : "s"}`,
            }
          : { ok: false, texto: res.error },
      }));
    });
  }, []);

  const filters = useMemo<DataTableFilterGroup<ProfessorRow>[]>(() => {
    // O relógio é lido DENTRO do predicado, não no corpo do memo: a janela é a
    // de quando o filtro roda e o render segue puro.
    const withinDays = (days: number) => (r: ProfessorRow) =>
      r.created_at >= Math.floor(Date.now() / 1000) - days * DAY;

    return [
      {
        id: "periodo",
        label: "Cadastro",
        options: [
          { value: "7d", label: "7 dias", predicate: withinDays(7) },
          { value: "30d", label: "30 dias", predicate: withinDays(30) },
          { value: "90d", label: "90 dias", predicate: withinDays(90) },
        ],
      },
      {
        id: "status",
        label: "Chamada",
        options: [
          { value: "pendente", label: "A chamar", predicate: (r) => stateOf(r).calledAt === null },
          { value: "chamado", label: "Já chamados", predicate: (r) => stateOf(r).calledAt !== null },
        ],
      },
    ];
  }, [stateOf]);

  const columns = useMemo<DataTableColumn<ProfessorRow>[]>(
    () => [
      {
        id: "professor",
        header: "Professor",
        sortAccessor: (r) => r.nome,
        render: (r) => (
          <div className="min-w-0">
            <p className="truncate font-600 text-[var(--text-primary)]">{r.nome}</p>
            <p className="truncate text-[11px] text-[var(--text-tertiary)]">
              {r.clubes.length
                ? `${r.clubes.length} clube${r.clubes.length === 1 ? "" : "s"}`
                : "sem clube informado"}
            </p>
          </div>
        ),
      },
      {
        id: "contato",
        header: "Contato",
        width: "250px",
        render: (r) => {
          const wa = waLink(r.whatsapp);
          return (
            <div className="min-w-0 space-y-0.5 text-[11.5px]">
              <p className="flex items-center gap-1.5 truncate text-[var(--text-secondary)]">
                <Mail size={11} className="shrink-0 text-[var(--text-tertiary)]" />
                {r.email}
              </p>
              <p className="flex items-center gap-1.5 truncate text-[var(--text-secondary)]">
                <MessageCircle size={11} className="shrink-0 text-[var(--text-tertiary)]" />
                {wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-[var(--text-primary)]"
                  >
                    {prettyPhone(r.whatsapp)}
                  </a>
                ) : (
                  prettyPhone(r.whatsapp)
                )}
              </p>
            </div>
          );
        },
      },
      {
        id: "clubes",
        header: "Onde dá aula",
        width: "280px",
        sortAccessor: (r) => r.clubes[0] ?? "",
        render: (r) =>
          r.clubes.length ? (
            <div className="flex flex-wrap gap-1">
              {r.clubes.slice(0, 3).map((c) => (
                <span
                  key={c}
                  className="truncate rounded-full border border-[var(--border)] px-2 py-0.5 text-[10.5px] text-[var(--text-secondary)]"
                >
                  {c}
                </span>
              ))}
              {r.clubes.length > 3 && (
                <span className="px-1 py-0.5 text-[10.5px] text-[var(--text-tertiary)]">
                  +{r.clubes.length - 3}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11.5px] text-[var(--text-tertiary)]">—</span>
          ),
      },
      {
        id: "cadastro",
        header: "Cadastro",
        width: "180px",
        sortAccessor: (r) => r.created_at,
        render: (r) => <Timestamp iso={iso(r.created_at)} className="text-[11.5px]" />,
      },
      {
        id: "chamada",
        header: "Já chamei",
        width: "220px",
        // Ordena por QUANDO foi chamado; quem ainda não foi vai para o fim (o
        // DataTable afunda nulos nos dois sentidos), que é a ordem útil: a
        // fila a chamar não fica escondida embaixo do histórico.
        sortAccessor: (r) => stateOf(r).calledAt,
        render: (r) => {
          const st = stateOf(r);
          const busy = pending.has(r.id);
          const done = st.calledAt !== null;
          return (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                aria-pressed={done}
                onClick={() => toggle(r)}
                title={done ? "Clique para desmarcar" : "Marcar como já chamado"}
                className={
                  done
                    ? "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-success)]/40 bg-[var(--color-success-bg)] px-2.5 py-1 text-[11px] font-500 text-[var(--color-success)] transition-opacity disabled:opacity-50"
                    : "inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-500 text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] disabled:opacity-50"
                }
              >
                <Check size={11} strokeWidth={done ? 3 : 2} />
                {busy ? "…" : done ? "Chamado" : "Marcar"}
              </button>
              {done && st.calledBy && (
                <span className="min-w-0 truncate text-[10.5px] text-[var(--text-tertiary)]">
                  {st.calledBy.split("@")[0]}
                  {st.calledAt !== null && (
                    <> · {new Date(st.calledAt * 1000).toLocaleDateString("pt-BR")}</>
                  )}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "painel",
        header: "Painel dele",
        width: "330px",
        sortAccessor: (r) => (sync[r.id]?.ok ? 1 : 0),
        render: (r) => {
          const busy = syncing.has(r.id);
          const st = sync[r.id];
          return (
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => publicar(r)}
                title="Lê os alunos indicados no produto e publica o painel que esse professor abre na landing"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-500 text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] disabled:opacity-50"
              >
                <RefreshCw size={11} className={busy ? "animate-spin" : undefined} />
                {busy ? "Publicando…" : "Publicar"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => liberar(r)}
                title="Deixa esse professor entrar só com o e-mail, por 48h, para criar a senha dele. Use depois de falar com ele."
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-500 text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] disabled:opacity-50"
              >
                <KeyRound size={11} />
                Liberar acesso
              </button>
              {st && (
                <span
                  className={
                    st.ok
                      ? "min-w-0 truncate text-[10.5px] text-[var(--text-tertiary)]"
                      : "min-w-0 truncate text-[10.5px] text-[var(--color-error)]"
                  }
                  title={st.texto}
                >
                  {st.texto}
                </span>
              )}
            </div>
          );
        },
      },
    ],
    [stateOf, pending, toggle, sync, syncing, publicar, liberar]
  );

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-bg)] px-3 py-2 text-[11.5px] text-[var(--color-error)]">
          {error}
        </p>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => String(r.id)}
        searchText={(r) =>
          [r.nome, r.email, r.whatsapp, ...r.clubes].filter(Boolean).join(" ").toLowerCase()
        }
        searchPlaceholder="Buscar por nome, e-mail, WhatsApp, clube…"
        filters={filters}
        initialSort={{ columnId: "cadastro", direction: "desc" }}
        emptyMessage="Nenhum professor se cadastrou ainda."
        noResultsMessage="Nenhum professor com esses filtros."
        renderDetail={(r) => {
          const st = stateOf(r);
          const wa = waLink(r.whatsapp);
          const fields: DetailField[] = [
            { label: "Nome", value: r.nome },
            { label: "E-mail", value: r.email },
            {
              label: "WhatsApp",
              value: wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-dotted underline-offset-2"
                >
                  {prettyPhone(r.whatsapp)}
                </a>
              ) : (
                prettyPhone(r.whatsapp)
              ),
            },
            {
              label: "Onde dá aula",
              value: r.clubes.length ? r.clubes.join(" · ") : "—",
              span: true,
            },
            { label: "Origem", value: r.origem },
          ];
          if (r.ip_country) fields.push({ label: "País (IP)", value: r.ip_country });
          fields.push({ label: "Cadastro", value: <Timestamp iso={iso(r.created_at)} /> });
          fields.push({
            label: "Chamada",
            value:
              st.calledAt === null ? (
                <Badge variant="muted">Ainda não chamado</Badge>
              ) : (
                <span className="flex flex-wrap items-baseline gap-2">
                  <Badge variant="success">Chamado</Badge>
                  <span className="text-[11.5px] text-[var(--text-secondary)]">
                    por {st.calledBy ?? "—"}
                  </span>
                  <Timestamp iso={iso(st.calledAt)} className="text-[11px]" />
                </span>
              ),
            span: true,
          });
          return <DetailGrid fields={fields} />;
        }}
      />
    </div>
  );
}
