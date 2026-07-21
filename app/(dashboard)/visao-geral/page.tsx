import Link from "next/link";
import { ArrowUpRight, Clock, Mail, XCircle, CreditCard, AlertTriangle, Star, Flag } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PaymentLegs } from "@/components/ui/payment-legs";
import { getOpsSummary } from "@/lib/ops";
import { getApi } from "@/lib/api";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { WeekChart, type WeekMatch } from "../_components/week-chart";
import { CountdownTimer } from "../convites/countdown-timer";
import { Player } from "../_components/cells";

// The seven panels with a backend, ordered the way they matter when something is
// on fire: money and moderation first, housekeeping last. #02 and #04 are absent
// — they have no data source, and a card reading "0" would be a lie.
const panels = [
  { id: "06", label: "Problemas de Pagamento", href: "/pagamentos", icon: CreditCard, hint: "Pix preso, sem confirmação", urgent: true },
  { id: "09", label: "Denúncias", href: "/denuncias", icon: Flag, hint: "posts aguardando moderação", urgent: true },
  { id: "07", label: "Quadras Indisponíveis", href: "/quadras-indisponiveis", icon: AlertTriangle, hint: "bloqueadas ou em manutenção", urgent: true },
  { id: "03", label: "Convites em Aberto", href: "/convites", icon: Mail, hint: "aguardando o convidado aceitar" },
  { id: "01", label: "Aguardando Jogo", href: "/partidas-aguardando", icon: Clock, hint: "confirmadas, ainda por acontecer" },
  { id: "05", label: "Cancelamentos", href: "/cancelamentos", icon: XCircle, hint: "reservas canceladas recentemente" },
  { id: "08", label: "Avaliações", href: "/avaliacoes", icon: Star, hint: "notas dadas após a partida" },
];

const DAY_MS = 24 * 3600_000;

export default async function DashboardPage() {
  const api = await getApi();

  // getOpsSummary is React-cached and the layout already called it, so this is
  // free — it gives us every panel's true server-side `total`.
  //
  // The three extra fetches are the ones the founder actually opens this screen
  // to see: the week ahead, the money stuck, and the invites about to lapse. They
  // are the same endpoints the panels use; nothing here is derived from anything
  // but rows that came off the wire.
  const [summary, upcoming, payments, invites] = await Promise.all([
    getOpsSummary(),
    api.GET("/v1/ops/upcoming-matches", { params: { query: { limit: 500, offset: 0 } } }),
    // Ask for the whole set, not a page: this card sums money, and a sum over a
    // page is a smaller number wearing the clothes of a total. The endpoint grew
    // limit/offset for exactly this. `issuesTruncated` below still guards the case
    // where the cap bites anyway — it tells the truth instead of quietly under-reporting.
    api.GET("/v1/ops/payment-issues", { params: { query: { limit: 500, offset: 0 } } }),
    api.GET("/v1/ops/open-invites"),
  ]);

  const broken = panels.filter((p) => summary[p.id]?.failed);

  // ── The week ahead ────────────────────────────────────────────────────────────
  const matches = upcoming.data?.matches ?? [];
  const matchesTotal = upcoming.data?.total ?? matches.length;
  // A histogram over page 1 of 2 is not an approximate shape, it is a wrong one.
  // The chart only exists when we are certain we are holding every row.
  const matchesComplete = !upcoming.error && matches.length >= matchesTotal;
  const weekMatches: WeekMatch[] = matches.map((m) => ({
    starts_at: m.starts_at,
    payment_settled: m.payment_settled,
  }));

  const now = Date.now();
  const nextUp = [...matches]
    .filter((m) => new Date(m.starts_at).getTime() >= now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 5);

  // ── Money stuck ───────────────────────────────────────────────────────────────
  const issues = payments.data?.issues ?? [];
  const issuesTotal = payments.data?.total ?? issues.length;
  const issuesTruncated = issues.length < issuesTotal;
  const stuckCents = issues.reduce((sum, i) => sum + i.amount_cents, 0);

  // ── Invites on the clock ──────────────────────────────────────────────────────
  const openInvites = invites.data?.invites ?? [];
  const closingSoon = [...openInvites]
    .filter((i) => new Date(i.expires_at).getTime() > now)
    .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime())
    .slice(0, 4);

  return (
    <div>
      <PageHeader
        eyebrow="Painel"
        title="Visão Geral"
        description="O estado operacional do beta fechado, agora."
      />

      <div className="space-y-6 px-8 py-6">
        {/* A panel that failed to load is worth saying out loud: the cards below
            would otherwise just be missing a number, which reads as "nothing to do"
            rather than "we don't know". */}
        {broken.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] px-4 py-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[var(--color-clay)]" />
            <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
              Não foi possível carregar{" "}
              {broken.length === 1 ? "o painel" : "os painéis"}{" "}
              <span className="font-600 text-[var(--text-primary)]">
                {broken.map((p) => p.label).join(", ")}
              </span>
              . Os números abaixo estão incompletos — não os leia como zero.
            </p>
          </div>
        )}

        {/* ── The two numbers that cost money ─────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-1">
            <p className="eyebrow mb-4">Dinheiro parado</p>

            {payments.error ? (
              <p className="text-[13px] text-[var(--color-warning)]">
                Não foi possível ler os pagamentos.
              </p>
            ) : (
              <>
                <p className="numeral text-[38px] text-[var(--color-error)]">
                  {formatCurrency(stuckCents)}
                </p>
                {/*
                  The denominator, in the open.

                  This sums the rows it actually holds. Normally that is all of them —
                  the endpoint takes limit/offset and we ask for the lot. But if the set
                  ever outgrows the request, presenting a partial sum as "o valor preso
                  no beta" would be a lie of exactly the kind this console was scrubbed
                  of. So it names its own denominator and admits when it cannot see the rest.
                */}
                <p className="mt-2.5 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
                  {issuesTruncated ? (
                    <>
                      Soma de <span className="font-600 text-[var(--text-secondary)]">{issues.length}</span>{" "}
                      das{" "}
                      <span className="font-600 text-[var(--text-secondary)]">{issuesTotal}</span>{" "}
                      reservas presas. O valor real é maior — a API não pagina esse endpoint.
                    </>
                  ) : (
                    <>
                      Soma das{" "}
                      <span className="font-600 text-[var(--text-secondary)]">{issuesTotal}</span>{" "}
                      reservas com Pix pendente ou rejeitado.
                    </>
                  )}
                </p>
                <Link
                  href="/pagamentos"
                  className="mt-4 inline-flex items-center gap-1 font-700 text-[9px] uppercase tracking-[0.16em] text-[var(--primary)] transition-opacity hover:opacity-70"
                >
                  Ver pagamentos <ArrowUpRight size={11} />
                </Link>
              </>
            )}
          </div>

          {/* ── The week ahead ───────────────────────────────────────────────── */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-2">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow mb-2">Próximos 7 dias</p>
                <p className="text-[11.5px] font-300 text-[var(--text-tertiary)]">
                  Partidas confirmadas por dia. Em vermelho, as que ainda têm pagamento em aberto.
                </p>
              </div>
              <Link
                href="/partidas-aguardando"
                className="shrink-0 font-700 text-[9px] uppercase tracking-[0.16em] text-[var(--primary)] transition-opacity hover:opacity-70"
              >
                Ver todas
              </Link>
            </div>

            {upcoming.error ? (
              <p className="py-12 text-center text-[13px] text-[var(--color-warning)]">
                Não foi possível carregar as partidas.
              </p>
            ) : matchesComplete ? (
              <WeekChart matches={weekMatches} />
            ) : (
              // Rather than draw a plausible-looking shape from a partial page.
              <p className="py-12 text-center text-[12.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
                Gráfico omitido: o painel carregou {matches.length} de {matchesTotal} partidas,
                e um histograma sobre parte da base mostraria uma semana que não existe.
              </p>
            )}
          </div>
        </div>

        {/* ── The next five, and who owes ─────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="eyebrow mb-4">A seguir na quadra</p>

            {nextUp.length === 0 ? (
              <p className="py-6 text-[12.5px] font-300 text-[var(--text-tertiary)]">
                Nenhuma partida confirmada pela frente.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {nextUp.map((m) => {
                  const soon = new Date(m.starts_at).getTime() - now < DAY_MS;
                  return (
                    <li key={m.booking_id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="w-[74px] shrink-0">
                        <span className="block whitespace-nowrap text-[12px] tabular-nums text-[var(--text-primary)]">
                          {formatDate(new Date(m.starts_at))}
                        </span>
                      </span>

                      {/* No "— sem convidado" here: PaymentLegs already says it, in the
                          column where the absence actually means something. Saying it
                          twice on one line is noise dressed up as thoroughness. */}
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <Player name={m.host.name} id={m.host.user_id} strong />
                          {m.guest && (
                            <>
                              <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">e</span>
                              <Player name={m.guest.name} id={m.guest.user_id} />
                            </>
                          )}
                        </span>
                      </span>

                      <span className="shrink-0">
                        <PaymentLegs
                          priceCents={m.price_cents}
                          host={m.host_payment}
                          guest={m.guest_payment}
                          hasGuest={!!m.guest}
                        />
                      </span>

                      {soon && (
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-clay)]"
                          title="Nas próximas 24h"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Invites on the clock ─────────────────────────────────────────── */}
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <p className="eyebrow">Convites fechando</p>
              <Link
                href="/convites"
                className="shrink-0 font-700 text-[9px] uppercase tracking-[0.16em] text-[var(--primary)] transition-opacity hover:opacity-70"
              >
                Ver todos
              </Link>
            </div>

            {closingSoon.length === 0 ? (
              <p className="py-6 text-[12.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
                {openInvites.length === 0
                  ? "Nenhum convite em aberto."
                  : "Nenhum convite com a janela ainda correndo — os que restam já expiraram."}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {closingSoon.map((i) => (
                  <li key={i.booking_id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="w-[74px] shrink-0">
                      <CountdownTimer expiresAt={i.expires_at} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <Player name={i.guest.name} id={i.guest.user_id} strong />
                      <span className="block truncate text-[11px] text-[var(--text-tertiary)]">
                        convidado por {i.host.name}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── Every panel, with its real total ────────────────────────────────── */}
        <div>
          <p className="eyebrow mb-4">Painéis</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {panels.map((panel) => {
              const Icon = panel.icon;
              const stat = summary[panel.id];
              const failed = stat?.failed === true;
              const count = stat?.count;
              const hot = panel.urgent && (count ?? 0) > 0;

              return (
                <Link
                  key={panel.id}
                  href={panel.href}
                  className={cn(
                    "group rounded-xl border bg-[var(--surface)] p-4 transition-colors hover:bg-[var(--surface-raised)]",
                    hot
                      ? "border-[var(--color-error)]/30"
                      : "border-[var(--border)] hover:border-[var(--border-strong)]"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <Icon
                        size={13}
                        strokeWidth={1.75}
                        className={cn(
                          "shrink-0",
                          hot ? "text-[var(--color-error)]" : "text-[var(--text-tertiary)]"
                        )}
                      />
                      <span className="label-colus text-[9px] leading-none text-[var(--text-tertiary)]">
                        {panel.id}
                      </span>
                    </span>

                    {failed ? (
                      // Never a number, never a zero. "We could not ask" and "there is
                      // nothing there" are opposite facts.
                      <span
                        title="Falha ao carregar este painel"
                        className="label-colus text-[9px] text-[var(--color-warning)]"
                      >
                        Erro
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "numeral text-[26px]",
                          hot ? "text-[var(--color-error)]" : "text-[var(--text-primary)]"
                        )}
                      >
                        {count ?? 0}
                      </span>
                    )}
                  </div>

                  <p className="mt-3 text-[13px] font-600 text-[var(--text-primary)] transition-colors group-hover:text-[var(--primary)]">
                    {panel.label}
                  </p>
                  <p className="mt-0.5 text-[11px] font-300 leading-snug text-[var(--text-tertiary)]">
                    {panel.hint}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        <p className="border-t border-[var(--border)] pt-4 text-[11px] font-300 leading-relaxed text-[var(--text-tertiary)]">
          Os painéis <span className="font-600 text-[var(--text-secondary)]">02 Finalizadas</span> e{" "}
          <span className="font-600 text-[var(--text-secondary)]">04 Sem Recomendação</span> não
          aparecem aqui: o backend ainda não captura placar de partida nem telemetria de
          zero-candidato, então não há o que contar.
        </p>
      </div>
    </div>
  );
}
