import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, CheckCircle2, Mail, Phone } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, type DetailField } from "@/components/ui/detail-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Timestamp } from "@/components/ui/timestamp";
import { PlayerLink } from "@/components/ui/player-link";
import { getApi } from "@/lib/api";
import type { components } from "@/lib/api/openapi";
import { DossierBookingsTable } from "./bookings-table";

export const dynamic = "force-dynamic";

type Dossier = components["schemas"]["OpsUserDossierResponseBody"];
type Stats = components["schemas"]["OpsDossierStats"];
type Report = components["schemas"]["PostReportItem"];

/**
 * How many reports we scan looking for this player.
 *
 * The dossier endpoint does NOT return reports — it fans out over user-service
 * and booking-service only, and feed-service (where post reports live) is not in
 * that fan-out. So they are fetched here from the panel #09 endpoint and filtered
 * by user_id, which is honest: `reported_user` and `reporter` are real OpsUserRefs
 * on every PostReportItem.
 *
 * What that costs is COMPLETENESS, and it is not papered over. /v1/ops/reports is
 * paginated and returns a true server-side `total` (feed-service runs a real
 * COUNT). If that total is larger than the page we got, we have not looked at
 * every report, and "no reports involving this player" would be a claim we cannot
 * make — so the UI says how far it actually looked instead. See ReportsSection.
 */
const REPORT_SCAN_LIMIT = 200;

export default async function UserDossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await getApi();

  const [dossierRes, reportsRes] = await Promise.all([
    api.GET("/v1/ops/users/{user_id}", { params: { path: { user_id: id } } }),
    api.GET("/v1/ops/reports", {
      params: { query: { limit: REPORT_SCAN_LIMIT, offset: 0 } },
    }),
  ]);

  if (dossierRes.error) {
    // The BFF 404s a user that does not exist, and 422s a malformed id. Both mean
    // "there is no such player here" to a human pasting something into the URL.
    const status = dossierRes.response.status;
    if (status === 404 || status === 422) notFound();

    return (
      <ErrorShell
        message={dossierRes.error.detail || dossierRes.error.title || "Falha ao carregar o dossiê."}
      />
    );
  }

  const d: Dossier = dossierRes.data;
  const bookings = d.bookings ?? [];

  // Reports are a SEPARATE call and can fail on their own. When they do, the
  // section says so — it does not render an empty list, which would read as
  // "this player has never been reported".
  const reportsFailed = !!reportsRes.error;
  const scanned: Report[] = reportsRes.data?.reports ?? [];
  const reportsTotal = reportsRes.data?.total ?? 0;
  const reportsComplete = !reportsFailed && reportsTotal <= scanned.length;

  const against = scanned.filter((r) => r.reported_user.user_id === id);
  const filedBy = scanned.filter((r) => r.reporter.user_id === id);
  const openAgainst = against.filter((r) => r.status === "pending" || r.status === "reviewing");

  return (
    <div>
      <div className="px-8 pt-5">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={12} strokeWidth={2} />
          Painéis
        </Link>
      </div>

      <PageHeader
        eyebrow="Dossiê"
        title={d.user.name}
        description={
          d.profile?.city
            ? [d.profile.city, d.profile.state].filter(Boolean).join(" · ")
            : undefined
        }
      />

      <div className="space-y-10 px-8 py-7">
        <Signals
          account={d.account}
          stats={d.stats}
          statsReason={d.stats_unavailable_reason}
          openReports={openAgainst.length}
          reportsConclusive={reportsComplete}
        />

        <Identity account={d.account} userId={id} />

        <Profile profile={d.profile} />

        <StatsSection stats={d.stats} reason={d.stats_unavailable_reason} />

        <Section
          title="Reservas"
          note={
            d.bookings_truncated
              ? "Histórico truncado no limite de 100 reservas do booking-service. As mais recentes estão abaixo; não é o histórico completo."
              : undefined
          }
          noteTone="warning"
        >
          <DossierBookingsTable bookings={bookings} />
        </Section>

        <RatingsSection ratings={d.ratings_received} />

        <ReportsSection
          against={against}
          filedBy={filedBy}
          failed={reportsFailed}
          complete={reportsComplete}
          scanned={scanned.length}
          total={reportsTotal}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   Signals — the only thing on this page that exists to change a decision.

   The founder opens a dossier to answer one of two questions: do I phone this
   person, or do I take them out of the beta? Everything he needs for that is
   here, at the top, and NOTHING that isn't. A signal only renders when it is
   true — there is no row of zeroes, because "0 no-shows" is not a signal, it is
   the absence of one.
   ═══════════════════════════════════════════════════════════════════════════ */

function Signals({
  account,
  stats,
  statsReason,
  openReports,
  reportsConclusive,
}: {
  account: Dossier["account"];
  stats?: Stats;
  statsReason?: string;
  openReports: number;
  reportsConclusive: boolean;
}) {
  const money: string[] = [];
  const conduct: string[] = [];

  if (account.status !== "active") {
    conduct.push(`Conta ${account.status}`);
  }
  if (stats) {
    if (stats.unpaid_legs > 0) {
      money.push(
        `${stats.unpaid_legs} ${stats.unpaid_legs === 1 ? "perna não paga" : "pernas não pagas"}`
      );
    }
    if (stats.no_shows > 0) {
      conduct.push(`${stats.no_shows} no-show${stats.no_shows === 1 ? "" : "s"}`);
    }
    if (stats.cancelled_within_48h > 0) {
      conduct.push(`${stats.cancelled_within_48h} cancelamento(s) < 48h`);
    }
  }
  if (openReports > 0) {
    conduct.push(`${openReports} denúncia(s) em aberto`);
  }

  const signals = [...money, ...conduct];

  // The all-clear is a CLAIM, and it can only be made when both sources that
  // could contradict it were actually read: the career roll-ups (absent on a
  // truncated history) and the full report list (absent when we only saw a page).
  // Otherwise the honest answer is "here is what I could and could not check".
  const canClaimClear = !!stats && reportsConclusive;

  if (signals.length === 0) {
    return canClaimClear ? (
      <div className="flex items-center gap-2.5 rounded-lg border border-[var(--color-success)]/25 bg-[var(--color-success-bg)] px-4 py-3">
        <CheckCircle2 size={15} strokeWidth={1.75} className="shrink-0 text-[var(--color-success)]" />
        <p className="text-[12.5px] text-[var(--color-success)]">
          Nada pendente: sem dívida em aberto, sem no-show, sem cancelamento tardio e sem denúncia.
        </p>
      </div>
    ) : (
      <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3">
        <AlertTriangle size={15} strokeWidth={1.75} className="mt-px shrink-0 text-[var(--color-clay)]" />
        <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
          Nenhum sinal encontrado no que foi possível verificar — mas a verificação está incompleta,
          então isto <span className="font-600">não</span> é um atestado de que está tudo limpo.
          {!stats && ` ${statsReason ?? "As estatísticas de carreira não puderam ser calculadas."}`}
          {!reportsConclusive && " A lista de denúncias não pôde ser varrida por completo."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-bg)] px-4 py-3.5">
      <p className="label-colus mb-2.5 text-[8.5px] text-[var(--color-error)]">Requer atenção</p>
      <div className="flex flex-wrap gap-1.5">
        {money.map((s) => (
          <Badge key={s} variant="error">
            {s}
          </Badge>
        ))}
        {conduct.map((s) => (
          <Badge key={s} variant="warning">
            {s}
          </Badge>
        ))}
      </div>
      {!canClaimClear && (
        <p className="mt-2.5 text-[11px] leading-snug text-[var(--text-secondary)]">
          Pode haver mais: a verificação não foi completa.
        </p>
      )}
    </div>
  );
}

/* ── Identity ─────────────────────────────────────────────────────────────── */

function Identity({ account, userId }: { account: Dossier["account"]; userId: string }) {
  const fields: DetailField[] = [
    {
      label: "Status da conta",
      value: (
        <Badge variant={account.status === "active" ? "success" : "error"}>{account.status}</Badge>
      ),
    },
  ];

  if (account.role) fields.push({ label: "Papel", value: account.role });

  // Contact is the whole point of "should I phone this person". Both fields are
  // real columns and both are omitempty — they are rendered as live mailto:/tel:
  // links when present and simply do not appear when the column is null. There is
  // no "—" placeholder pretending a phone number exists.
  if (account.email) {
    fields.push({
      label: "Email",
      value: (
        <a
          href={`mailto:${account.email}`}
          className="break-all underline-offset-2 hover:text-[var(--primary)] hover:underline"
        >
          <Mail size={11} className="mr-1 inline align-[-1px]" />
          {account.email}
        </a>
      ),
    });
  }
  if (account.phone_e164) {
    fields.push({
      label: "Telefone",
      value: (
        <a
          href={`tel:${account.phone_e164}`}
          className="underline-offset-2 hover:text-[var(--primary)] hover:underline"
        >
          <Phone size={11} className="mr-1 inline align-[-1px]" />
          {account.phone_e164}
        </a>
      ),
    });
  }

  if (account.created_at) {
    fields.push({ label: "Cadastro", value: <Timestamp iso={account.created_at} /> });
  }
  if (account.deleted_at) {
    fields.push({ label: "Excluída em", value: <Timestamp iso={account.deleted_at} /> });
  }
  fields.push({ label: "User ID", value: userId, mono: true });

  return (
    <Section title="Identidade">
      <DetailGrid fields={fields} />
      {!account.phone_e164 && (
        <p className="mt-4 text-[11px] leading-snug text-[var(--text-tertiary)]">
          Sem telefone cadastrado nesta conta — não há número para ligar.
        </p>
      )}
    </Section>
  );
}

/* ── Profile ──────────────────────────────────────────────────────────────── */

function Profile({ profile }: { profile?: Dossier["profile"] }) {
  if (!profile) {
    return (
      <Section title="Perfil">
        <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
          Este jogador tem conta mas <span className="font-600">não tem perfil</span> — o onboarding
          nunca foi concluído. Não é um erro de carregamento.
        </p>
      </Section>
    );
  }

  const fields: DetailField[] = [];
  if (profile.display_name) fields.push({ label: "Nome de exibição", value: profile.display_name });
  if (profile.sport) fields.push({ label: "Esporte", value: profile.sport });

  // Category is empty until nivelamento. An empty category means "nunca nivelado",
  // which is NOT the same as category D — so it is stated, not defaulted.
  fields.push({
    label: "Categoria",
    value: profile.category ?? (
      <span className="text-[var(--text-tertiary)]">não nivelado</span>
    ),
  });
  if (profile.category_declared) {
    fields.push({ label: "Categoria declarada", value: profile.category_declared });
  }
  if (profile.xp_level !== undefined) fields.push({ label: "Nível XP", value: profile.xp_level });
  if (profile.play_style) fields.push({ label: "Estilo", value: profile.play_style });
  if (profile.city) fields.push({ label: "Cidade", value: profile.city });
  if (profile.state) fields.push({ label: "Estado", value: profile.state });
  if (profile.neighborhood) fields.push({ label: "Bairro", value: profile.neighborhood });
  fields.push({ label: "Joga em casa", value: profile.plays_at_home ? "Sim" : "Não" });
  if (profile.verified_badges?.length) {
    fields.push({
      label: "Selos",
      value: (
        <span className="flex flex-wrap gap-1">
          {profile.verified_badges.map((b) => (
            <Badge key={b} variant="info">
              {b}
            </Badge>
          ))}
        </span>
      ),
    });
  }
  if (profile.created_at) {
    fields.push({ label: "Perfil criado", value: <Timestamp iso={profile.created_at} /> });
  }
  if (profile.bio) fields.push({ label: "Bio", value: profile.bio, span: true });

  return (
    <Section title="Perfil">
      <DetailGrid fields={fields} />
    </Section>
  );
}

/* ── Career roll-ups ──────────────────────────────────────────────────────── */

function StatsSection({ stats, reason }: { stats?: Stats; reason?: string }) {
  if (!stats) {
    return (
      <Section title="Carreira">
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3">
          <AlertTriangle
            size={15}
            strokeWidth={1.75}
            className="mt-px shrink-0 text-[var(--color-clay)]"
          />
          <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
            {/* The BFF withholds the roll-ups rather than shipping a lower bound. It
                says exactly why, and that sentence is worth more than a wrong number. */}
            {reason ?? "As estatísticas de carreira não estão disponíveis para este jogador."}
          </p>
        </div>
      </Section>
    );
  }

  const cells: { label: string; value: number; alarm?: boolean }[] = [
    { label: "Reservas", value: stats.bookings_total },
    { label: "Como host", value: stats.as_host },
    { label: "Como convidado", value: stats.as_guest },
    { label: "Partidas jogadas", value: stats.matches_played },
    { label: "No-shows", value: stats.no_shows, alarm: stats.no_shows > 0 },
    { label: "Cancelamentos", value: stats.cancelled },
    {
      label: "Cancel. < 48h",
      value: stats.cancelled_within_48h,
      alarm: stats.cancelled_within_48h > 0,
    },
    { label: "Pernas não pagas", value: stats.unpaid_legs, alarm: stats.unpaid_legs > 0 },
  ];

  return (
    <Section title="Carreira">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label}>
            <p className="mb-1.5 border-t border-[var(--border)] pt-1.5">
              <span className="label-colus text-[8.5px] text-[var(--text-tertiary)]">{c.label}</span>
            </p>
            <p
              className={
                c.alarm
                  ? "numeral text-[26px] text-[var(--color-error)]"
                  : "numeral text-[26px] text-[var(--text-primary)]"
              }
            >
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* Two honesty notes the numbers above cannot carry on their own. */}
      <div className="mt-5 space-y-1.5 border-t border-[var(--border)] pt-3">
        <p className="text-[11px] leading-snug text-[var(--text-tertiary)]">
          Cancelamentos contam as reservas em que este jogador estava — por qualquer uma das partes
          ou pelo sistema. O banco não guarda quem cancelou (não existe coluna <code>cancelled_by</code>
          ), então não dá para atribuir o cancelamento a um lado.
        </p>
        {stats.cancelled_lead_time_unknown > 0 && (
          <p className="text-[11px] leading-snug text-[var(--text-tertiary)]">
            {stats.cancelled_lead_time_unknown} cancelamento(s) sem <code>cancelled_at</code>: a
            antecedência é desconhecida e por isso <span className="font-600">não</span> entram na
            conta de &lt; 48h.
          </p>
        )}
        <p className="text-[11px] leading-snug text-[var(--text-tertiary)]">
          &ldquo;Pernas não pagas&rdquo; é a contagem de reservas cobráveis em aberto. O valor devido
          não existe em nenhuma tabela — é derivado no momento da cobrança —, então não é exibido.
        </p>
      </div>
    </Section>
  );
}

/* ── Ratings received ─────────────────────────────────────────────────────── */

function RatingsSection({ ratings }: { ratings: Dossier["ratings_received"] }) {
  const items = ratings.ratings ?? [];

  return (
    <Section
      title="Avaliações recebidas"
      aside={
        // An average only exists when somebody rated them. A player nobody has
        // rated does not have a 0.0 reputation — they have no reputation.
        ratings.avg_rating !== undefined && ratings.count > 0 ? (
          <span className="flex items-baseline gap-1.5">
            <span className="numeral text-[20px] text-[var(--text-primary)]">
              {ratings.avg_rating.toFixed(1)}
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              de {ratings.count} avaliação{ratings.count === 1 ? "" : "s"}
            </span>
          </span>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState
          message="Nenhum jogador avaliou esta pessoa ainda."
          tone="neutral"
        />
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {items.map((r, i) => (
            <li key={`${r.author.user_id}-${r.created_at}-${i}`} className="px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="flex items-baseline gap-2 text-[12.5px]">
                  {/* WHO left it — the founder's next question after "what did they say". */}
                  <PlayerLink userId={r.author.user_id} name={r.author.name} className="font-500" />
                  <span className="numeral text-[15px] text-[var(--text-primary)]">{r.rating}</span>
                  <span className="text-[10.5px] text-[var(--text-tertiary)]">/5</span>
                </span>
                <Timestamp iso={r.created_at} className="text-[11px] text-[var(--text-tertiary)]" />
              </div>

              {r.comment && (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                  {r.comment}
                </p>
              )}

              {/* Raw preset tags (e.g. "opponent_conduct:9"). Printed as they come —
                  inventing a friendly translation would be inventing meaning. */}
              {r.tags?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-1.5 py-[3px] font-mono text-[10px] text-[var(--text-tertiary)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ── Reports ──────────────────────────────────────────────────────────────── */

function ReportsSection({
  against,
  filedBy,
  failed,
  complete,
  scanned,
  total,
}: {
  against: Report[];
  filedBy: Report[];
  failed: boolean;
  complete: boolean;
  scanned: number;
  total: number;
}) {
  if (failed) {
    return (
      <Section title="Denúncias">
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error-bg)] px-4 py-3">
          <AlertTriangle size={15} strokeWidth={1.75} className="mt-px shrink-0 text-[var(--color-error)]" />
          <p className="text-[12.5px] leading-relaxed text-[var(--color-error)]">
            Não foi possível ler as denúncias. Isto <span className="font-600">não</span> quer dizer
            que não existam — a consulta falhou.
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="Denúncias"
      note={
        complete
          ? undefined
          : `Varredura parcial: foram verificadas as ${scanned} denúncias mais recentes de ${total}. Pode haver outras envolvendo este jogador fora dessa janela.`
      }
      noteTone="warning"
    >
      {against.length === 0 && filedBy.length === 0 ? (
        <EmptyState
          message={
            complete
              ? "Nenhuma denúncia envolve este jogador — nem contra ele, nem feita por ele."
              : "Nenhuma denúncia encontrada na janela verificada."
          }
          tone={complete ? "success" : "neutral"}
        />
      ) : (
        <div className="space-y-6">
          {against.length > 0 && (
            <ReportList
              label={`Contra este jogador (${against.length})`}
              reports={against}
              counterpartLabel="Denunciado por"
              counterpart={(r) => r.reporter}
              tone="error"
            />
          )}
          {filedBy.length > 0 && (
            <ReportList
              label={`Feitas por este jogador (${filedBy.length})`}
              reports={filedBy}
              counterpartLabel="Denunciou"
              counterpart={(r) => r.reported_user}
              tone="muted"
            />
          )}
        </div>
      )}
    </Section>
  );
}

function ReportList({
  label,
  reports,
  counterpartLabel,
  counterpart,
  tone,
}: {
  label: string;
  reports: Report[];
  counterpartLabel: string;
  counterpart: (r: Report) => components["schemas"]["OpsUserRef"];
  tone: "error" | "muted";
}) {
  return (
    <div>
      <p className="label-colus mb-2 text-[8.5px] text-[var(--text-tertiary)]">{label}</p>
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {reports.map((r) => {
          const other = counterpart(r);
          return (
            <li key={r.report_id} className="px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="flex flex-wrap items-baseline gap-2 text-[12.5px]">
                  <Badge variant={tone === "error" ? "error" : "muted"}>{r.reason}</Badge>
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    {counterpartLabel}{" "}
                    <PlayerLink
                      userId={other.user_id}
                      name={other.name}
                      className="text-[var(--text-secondary)]"
                    />
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <Badge variant={r.status === "pending" ? "warning" : "muted"}>{r.status}</Badge>
                  <Timestamp iso={r.created_at} className="text-[11px] text-[var(--text-tertiary)]" />
                </span>
              </div>

              {r.details && (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                  {r.details}
                </p>
              )}

              <p className="mt-1.5 font-mono text-[10px] text-[var(--text-tertiary)]">
                post {r.post_id}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Shell bits ───────────────────────────────────────────────────────────── */

function Section({
  title,
  aside,
  note,
  noteTone = "neutral",
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  note?: string;
  noteTone?: "neutral" | "warning";
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="eyebrow">{title}</h2>
        {aside}
      </div>

      {note && (
        <p
          className={
            noteTone === "warning"
              ? "mb-3 rounded-md border border-[var(--color-clay)]/25 bg-[var(--color-warning-bg)] px-3 py-2 text-[11.5px] leading-snug text-[var(--color-clay)]"
              : "mb-3 text-[11.5px] leading-snug text-[var(--text-tertiary)]"
          }
        >
          {note}
        </p>
      )}

      {children}
    </section>
  );
}

function ErrorShell({ message }: { message: string }) {
  return (
    <div>
      <PageHeader eyebrow="Dossiê" title="Erro ao carregar" />
      <div className="px-8 py-6 text-[13px] text-[var(--color-error)]">{message}</div>
    </div>
  );
}
