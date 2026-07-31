"use client";

import { useCallback, useMemo, useState } from "react";
import { AtSign, Check, Mail, Phone } from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFilterGroup,
} from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid, type DetailField } from "@/components/ui/detail-grid";
import { Timestamp } from "@/components/ui/timestamp";
import type { WaitlistRow } from "@/lib/waitlist";
import { markCalledAction } from "./actions";

const DAY = 24 * 60 * 60;

/** Epoch em segundos → ISO, que é o que o Timestamp consome. */
function iso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

/** Estado de chamada de uma linha, depois de aplicar o que já mudou nesta sessão. */
type CallState = { calledAt: number | null; calledBy: string | null };

export function WaitlistTable({ rows }: { rows: WaitlistRow[] }) {
  // Sobreposição do que foi marcado/desmarcado aqui, por id. O servidor
  // revalida a página a cada ação, mas o React preserva este estado — e ele
  // guarda a resposta REAL da API (called_at/called_by como o banco gravou),
  // não um palpite otimista.
  const [overlay, setOverlay] = useState<Record<number, CallState>>({});
  // Conjunto de ids em voo, não um id só: marcar B enquanto A ainda não
  // respondeu não pode reabilitar o botão de A nem deixar a resposta que
  // chegar por último mandar na outra linha.
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");

  const stateOf = useMemo(
    () =>
      (r: WaitlistRow): CallState =>
        overlay[r.id] ?? { calledAt: r.called_at, calledBy: r.called_by },
    [overlay]
  );

  const toggle = useCallback(
    (r: WaitlistRow) => {
      const next = stateOf(r).calledAt === null;
      setError("");
      setPending((cur) => new Set(cur).add(r.id));

      markCalledAction(r.id, next).then((res) => {
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

  const filters = useMemo<DataTableFilterGroup<WaitlistRow>[]>(() => {
    // O relógio é lido DENTRO do predicado, não no corpo do memo: assim a
    // janela é a de quando o filtro roda, e o componente segue puro no render
    // (mesma forma dos predicados de convites/table.tsx).
    const withinDays = (days: number) => (r: WaitlistRow) =>
      r.created_at >= Math.floor(Date.now() / 1000) - days * DAY;

    return [
      {
        id: "periodo",
        label: "Inscrição",
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

  const columns = useMemo<DataTableColumn<WaitlistRow>[]>(
    () => [
      {
        id: "pessoa",
        header: "Pessoa",
        sortAccessor: (r) => r.name,
        render: (r) => (
          <div className="min-w-0">
            <p className="truncate font-600 text-[var(--text-primary)]">{r.name}</p>
            <p className="truncate text-[11px] text-[var(--text-tertiary)]">{r.club}</p>
          </div>
        ),
      },
      {
        id: "contato",
        header: "Contato",
        width: "260px",
        render: (r) => (
          <div className="min-w-0 space-y-0.5 text-[11.5px]">
            <p className="flex items-center gap-1.5 truncate text-[var(--text-secondary)]">
              <Mail size={11} className="shrink-0 text-[var(--text-tertiary)]" />
              {r.email}
            </p>
            <p className="flex items-center gap-1.5 truncate text-[var(--text-secondary)]">
              <Phone size={11} className="shrink-0 text-[var(--text-tertiary)]" />
              {r.whatsapp}
            </p>
            {r.instagram && (
              <p className="flex items-center gap-1.5 truncate text-[var(--text-tertiary)]">
                <AtSign size={11} className="shrink-0" />
                {r.instagram}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "regiao",
        header: "Região",
        width: "130px",
        sortAccessor: (r) => r.region ?? r.city ?? "",
        render: (r) =>
          r.region || r.city ? (
            <span className="text-[11.5px] text-[var(--text-secondary)]">
              {r.region ?? r.city}
            </span>
          ) : (
            <span className="text-[11.5px] text-[var(--text-tertiary)]">—</span>
          ),
      },
      {
        id: "inscricao",
        header: "Inscrição",
        width: "180px",
        sortAccessor: (r) => r.created_at,
        render: (r) => <Timestamp iso={iso(r.created_at)} className="text-[11.5px]" />,
      },
      {
        id: "chamada",
        header: "Já chamei",
        width: "220px",
        // Ordena por QUANDO foi chamado; quem ainda não foi vai para o fim
        // (o DataTable afunda nulos nos dois sentidos), que é a ordem útil:
        // a fila a chamar não fica escondida embaixo do histórico.
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
                // Quem marcou, à vista. É o que separa isto de um booleano
                // anônimo — daqui a uma semana a pergunta é "quem falou com
                // essa pessoa?", e a resposta tem que estar na linha.
                <span className="min-w-0 truncate text-[10.5px] text-[var(--text-tertiary)]">
                  {st.calledBy.split("@")[0]}
                  {st.calledAt !== null && <> · {new Date(st.calledAt * 1000).toLocaleDateString("pt-BR")}</>}
                </span>
              )}
            </div>
          );
        },
      },
    ],
    [stateOf, pending, toggle]
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
          [r.name, r.email, r.whatsapp, r.instagram, r.club, r.region, r.city, r.court]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
        }
        searchPlaceholder="Buscar por nome, e-mail, WhatsApp, clube…"
        filters={filters}
        initialSort={{ columnId: "inscricao", direction: "desc" }}
        emptyMessage="Ninguém na lista de espera ainda."
        noResultsMessage="Nenhum inscrito com esses filtros."
        renderDetail={(r) => {
          const st = stateOf(r);
          const fields: DetailField[] = [
            { label: "Nome", value: r.name },
            { label: "E-mail", value: r.email },
            { label: "WhatsApp", value: r.whatsapp },
          ];
          if (r.instagram) fields.push({ label: "Instagram", value: r.instagram });
          fields.push({ label: "Clube", value: r.club });
          if (r.region) fields.push({ label: "Região", value: r.region });
          if (r.court) fields.push({ label: "Onde joga", value: r.court });
          // city/state são do schema 0001 e o formulário atual não escreve
          // mais neles — só aparecem para inscrições antigas.
          if (r.city) fields.push({ label: "Cidade", value: r.city });
          if (r.state) fields.push({ label: "Estado", value: r.state });
          fields.push({ label: "Origem", value: r.source });
          fields.push({ label: "Idioma", value: r.locale });
          if (r.ip_country) fields.push({ label: "País (IP)", value: r.ip_country });
          fields.push({
            label: "Inscrição",
            value: <Timestamp iso={iso(r.created_at)} />,
          });
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
