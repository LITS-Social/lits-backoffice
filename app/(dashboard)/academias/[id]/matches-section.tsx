import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { AcademiaMatches, FinishedMatch } from "./matches";

/* ── formatação (fuso de São Paulo — o servidor roda em UTC) ──────────────── */

const SP = "America/Sao_Paulo";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: SP });
const dayLabelFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SP,
  day: "2-digit",
  month: "short",
});
const weekdayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: SP, weekday: "long" });
const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SP,
  hour: "2-digit",
  minute: "2-digit",
});

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "casual" | "ranked" | "quick" … → rótulo curto para o chip do modo. */
const MODE_LABEL: Record<string, string> = {
  casual: "Casual",
  ranked: "Ranked",
  quick: "Quick match",
  social: "Social",
  event: "Evento",
};

/* ── agrupamento por dia ──────────────────────────────────────────────────── */

type Day = { key: string; label: string; weekday: string; matches: FinishedMatch[] };

function groupByDay(matches: FinishedMatch[]): Day[] {
  const days = new Map<string, Day>();
  for (const m of matches) {
    const d = new Date(m.starts_at);
    const key = dayKeyFmt.format(d);
    let day = days.get(key);
    if (!day) {
      day = {
        key,
        label: dayLabelFmt.format(d).replace(".", "").replace(" de ", " ").toUpperCase(),
        weekday: weekdayFmt.format(d),
        matches: [],
      };
      days.set(key, day);
    }
    day.matches.push(m);
  }
  // A lista já vem mais recente primeiro; manter essa ordem entre os dias.
  return [...days.values()];
}

/* ── uma partida ──────────────────────────────────────────────────────────── */

function PlayerLink({ id, name }: { id?: string; name?: string }) {
  const label = name || "sem nome";
  if (!id) return <span>{label}</span>;
  return (
    <Link
      href={`/usuarios/${id}`}
      className="underline-offset-2 transition-colors hover:text-[var(--primary)] hover:underline"
    >
      {label}
    </Link>
  );
}

function MatchRow({ m }: { m: FinishedMatch }) {
  const free = m.price_cents === 0;
  const unpaid = (m.alerts ?? []).some((a) => a === "host_unpaid" || a === "guest_unpaid");

  return (
    <li className="grid grid-cols-[68px_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 py-3 sm:grid-cols-[68px_minmax(0,1fr)_auto]">
      {/* Quando — a hora é o eixo de leitura da linha, então vem primeiro e
          alinhada em coluna própria. */}
      <span className="numeral text-[13px] tabular-nums text-[var(--text-secondary)]">
        {timeFmt.format(new Date(m.starts_at))}
      </span>

      <div className="min-w-0">
        {/* Onde */}
        <p className="truncate text-[12.5px] text-[var(--text-primary)]">
          {m.court_label}
          {m.match_type && MODE_LABEL[m.match_type] && (
            <span className="ml-2 text-[10.5px] font-300 text-[var(--text-tertiary)]">
              {MODE_LABEL[m.match_type]}
            </span>
          )}
        </p>
        {/* Quem */}
        <p className="mt-0.5 truncate text-[11.5px] font-300 text-[var(--text-secondary)]">
          <PlayerLink id={m.host?.user_id} name={m.host?.name} />
          {m.guest ? (
            <>
              <span className="mx-1.5 text-[var(--text-tertiary)]">×</span>
              <PlayerLink id={m.guest.user_id} name={m.guest.name} />
            </>
          ) : (
            <span className="ml-1.5 text-[var(--text-tertiary)]">· sem convidado</span>
          )}
        </p>
      </div>

      {/* Quanto — alinhado à direita, com o estado do pagamento logo abaixo.
          Só partida paga ganha chip: "grátis" já diz tudo sobre o dinheiro. */}
      <div className="col-start-2 flex items-center gap-2 sm:col-start-3 sm:flex-col sm:items-end sm:gap-1">
        <span
          className={
            free
              ? "text-[11.5px] font-300 text-[var(--text-tertiary)]"
              : "numeral text-[14px] text-[var(--text-primary)]"
          }
        >
          {free ? "grátis" : brl(m.price_cents)}
        </span>
        <span className="flex items-center gap-1.5">
          {!free &&
            (unpaid ? (
              <Badge variant="warning">a receber</Badge>
            ) : (
              <Badge variant="success">pago</Badge>
            ))}
          {!m.has_score && <Badge variant="muted">sem placar</Badge>}
        </span>
      </div>
    </li>
  );
}

/* ── a seção ──────────────────────────────────────────────────────────────── */

/**
 * As partidas jogadas nesta academia — quando, em qual quadra, quem jogou e
 * quanto entrou.
 *
 * Layout agrupado por dia (referências no Mobbin: Cal.com e Eventbrite para a
 * lista por data, KAYAK para o valor ancorado à direita): o dia é um cabeçalho
 * com régua, e cada linha lê "hora → quadra e jogadores → valor". Os nomes
 * levam ao dossiê do jogador, que é onde a próxima pergunta ("quem é essa
 * pessoa?") é respondida.
 */
export function MatchesSection({ data }: { data: AcademiaMatches }) {
  const { matches, truncated, needsDeploy, failed } = data;

  const total = matches.length;
  const gmvCents = matches.reduce((sum, m) => sum + m.price_cents, 0);
  const pagas = matches.filter((m) => m.price_cents > 0).length;
  const aReceber = matches.filter((m) =>
    (m.alerts ?? []).some((a) => a === "host_unpaid" || a === "guest_unpaid")
  ).length;

  const days = groupByDay(matches);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="eyebrow">Partidas</h2>
          <p className="mt-2 text-[11.5px] font-300 text-[var(--text-tertiary)]">
            Clique num nome para abrir o dossiê do jogador.
          </p>
        </div>

        {/* O resumo do período: quantas, quanto e o que falta receber. */}
        {total > 0 && (
          <dl className="flex items-end gap-6">
            <div>
              <dt className="label-colus text-[8px] text-[var(--text-tertiary)]">Partidas</dt>
              <dd className="numeral mt-1 text-[22px] leading-none text-[var(--text-primary)]">
                {total}
              </dd>
            </div>
            <div>
              <dt className="label-colus text-[8px] text-[var(--text-tertiary)]">Em quadra</dt>
              <dd className="numeral mt-1 text-[22px] leading-none text-[var(--text-primary)]">
                {brl(gmvCents)}
              </dd>
            </div>
            {aReceber > 0 && (
              <div>
                <dt className="label-colus text-[8px] text-[var(--color-clay)]">A receber</dt>
                <dd className="numeral mt-1 text-[22px] leading-none text-[var(--color-clay)]">
                  {aReceber}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {failed && (
        <p className="text-[12px] font-300 leading-relaxed text-[var(--color-warning)]">
          Não foi possível carregar as partidas. O número acima não está zerado — está desconhecido.
        </p>
      )}

      {needsDeploy && (
        <p className="text-[12px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          As partidas chegam com o próximo deploy do bff-backoffice: sem o <code>court_id</code> na
          resposta não dá para dizer de qual academia é cada partida — “Quadra 1” existe em toda
          academia, e casar por nome mostraria jogo de outro clube aqui.
        </p>
      )}

      {!failed && !needsDeploy && total === 0 && (
        <p className="text-[12px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Nenhuma partida jogada nestas quadras ainda. Reservas futuras aparecem no calendário
          acima; aqui ficam as que já aconteceram.
        </p>
      )}

      {days.length > 0 && (
        <div className="space-y-5">
          {days.map((day) => (
            <div key={day.key}>
              {/* Cabeçalho do dia: rótulo tracked + régua até a borda — o
                  device editorial da marca no lugar de um subtítulo. */}
              <div className="flex items-center gap-3">
                <span className="label-colus shrink-0 text-[8.5px] text-[var(--text-secondary)]">
                  {day.label}
                </span>
                <span className="shrink-0 text-[10px] font-300 text-[var(--text-tertiary)]">
                  {day.weekday}
                </span>
                <span className="h-px flex-1 bg-[var(--border)]" />
                <span className="shrink-0 text-[10px] font-300 tabular-nums text-[var(--text-tertiary)]">
                  {day.matches.length} {day.matches.length === 1 ? "partida" : "partidas"}
                </span>
              </div>

              <ul className="divide-y divide-[var(--border)]">
                {day.matches.map((m) => (
                  <MatchRow key={m.booking_id} m={m} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {truncated && (
        <p className="mt-4 border-t border-[var(--border)] pt-3 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
          A varredura parou nas partidas mais recentes da plataforma — pode haver jogos antigos
          desta academia fora desta lista.
        </p>
      )}

      {!failed && !needsDeploy && total > 0 && pagas < total && (
        <p className="mt-4 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
          {total - pagas} de {total} sem cobrança — partidas grátis não entram no valor em quadra.
        </p>
      )}
    </section>
  );
}
