"use client";

import { useState, useTransition } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import {
  applySanctionAction,
  deactivateUserAction,
  grantBadgeAction,
  liftSanctionAction,
  reactivateUserAction,
  revokeBadgeAction,
  type Badge as BadgeType,
  type SanctionItem,
  type SanctionType,
} from "./actions";

const BADGE_LABEL: Record<BadgeType, string> = {
  selfie_match: "Selfie verificada",
  celebrity: "Celebridade",
  club_official: "Oficial do clube",
  federation_athlete: "Atleta federado",
  beta_tester: "Beta tester",
};

const ALL_BADGES: BadgeType[] = [
  "selfie_match",
  "celebrity",
  "club_official",
  "federation_athlete",
  "beta_tester",
];

const SANCTION_LABEL: Record<SanctionType, string> = {
  ranked_suspension: "Suspensão ranked",
  platform_ban: "Banimento da plataforma",
  shadowban: "Shadowban",
};

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-bg)] px-3 py-2 text-[11.5px] text-[var(--color-error)]">
      {message}
    </p>
  );
}

/* ── Desativar / reativar ─────────────────────────────────────────────────── */

function DeactivateSection({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (isActive === false) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3">
        <p className="text-[12.5px] text-[var(--text-secondary)]">
          Conta desativada — dentro da janela de 30 dias de reversão.
        </p>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await reactivateUserAction(userId);
              if (!res.ok) setError(res.error);
            })
          }
          className="shrink-0 rounded-md border border-[var(--color-success)]/40 px-3 py-1.5 text-[11.5px] font-500 text-[var(--color-success)] transition-colors hover:bg-[var(--color-success-bg)] disabled:opacity-50"
        >
          {pending ? "Reativando…" : "Reativar conta"}
        </button>
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md border border-[var(--color-error)]/40 px-3 py-1.5 text-[11.5px] font-500 text-[var(--color-error)] transition-colors hover:bg-[var(--color-error-bg)]"
      >
        Desativar conta
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-bg)] px-4 py-3.5">
      <p className="text-[11.5px] text-[var(--color-error)]">
        Soft-delete LGPD — 30 dias de graça antes da exclusão definitiva. Reversível até lá.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (obrigatório)"
        rows={2}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
      />
      {error && <ErrorBanner message={error} />}
      <div className="flex items-center gap-2">
        <button
          disabled={pending || !reason.trim()}
          onClick={() =>
            startTransition(async () => {
              const res = await deactivateUserAction(userId, reason.trim());
              if (!res.ok) setError(res.error);
              else setConfirming(false);
            })
          }
          className="rounded-md bg-[var(--color-error)] px-3 py-1.5 text-[11.5px] font-600 text-white transition-opacity disabled:opacity-50"
        >
          {pending ? "Desativando…" : "Confirmar desativação"}
        </button>
        <button
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
          className="text-[11.5px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ── Selos ────────────────────────────────────────────────────────────────── */

function BadgesSection({ userId, initialBadges }: { userId: string; initialBadges: string[] }) {
  const [badges, setBadges] = useState<Set<string>>(new Set(initialBadges));
  const [error, setError] = useState("");
  // A SET of in-flight badges, not a single scalar: clicking badge B while A is
  // still in flight must not re-enable A's button (a single "pendingBadge"
  // string would silently do that, opening a double-submit) or let whichever
  // response resolves last clobber the other's local state.
  const [pending, setPending] = useState<Set<string>>(new Set());

  function toggle(badge: BadgeType) {
    setError("");
    const wasActive = badges.has(badge);
    setPending((cur) => new Set(cur).add(badge));
    const action = wasActive ? revokeBadgeAction : grantBadgeAction;
    action(userId, badge).then((res) => {
      setPending((cur) => {
        const next = new Set(cur);
        next.delete(badge);
        return next;
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Toggle just THIS badge locally rather than overwrite the whole set
      // from the response — with two toggles in flight at once, the response
      // that resolves last would otherwise stomp on whichever badge the
      // other request just changed.
      setBadges((cur) => {
        const next = new Set(cur);
        if (wasActive) next.delete(badge);
        else next.add(badge);
        return next;
      });
    });
  }

  return (
    <div>
      {error && (
        <div className="mb-2">
          <ErrorBanner message={error} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {ALL_BADGES.map((b) => {
          const active = badges.has(b);
          const isBeta = b === "beta_tester";
          return (
            <button
              key={b}
              disabled={pending.has(b)}
              onClick={() => toggle(b)}
              className={
                active
                  ? isBeta
                    ? "rounded-full border border-[var(--color-info)]/40 bg-[var(--color-info-bg)] px-3 py-1.5 text-[11.5px] font-500 text-[var(--color-info)] transition-opacity disabled:opacity-50"
                    : "rounded-full border border-[var(--color-success)]/40 bg-[var(--color-success-bg)] px-3 py-1.5 text-[11.5px] font-500 text-[var(--color-success)] transition-opacity disabled:opacity-50"
                  : "rounded-full border border-[var(--border)] px-3 py-1.5 text-[11.5px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)] disabled:opacity-50"
              }
            >
              {active ? "✓ " : "+ "}
              {BADGE_LABEL[b]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Sanções ──────────────────────────────────────────────────────────────── */

function SanctionsSection({
  userId,
  initial,
  incomplete,
}: {
  userId: string;
  initial: SanctionItem[];
  incomplete: boolean;
}) {
  const [sanctions, setSanctions] = useState<SanctionItem[]>(initial);
  const [applying, setApplying] = useState(false);
  const [type, setType] = useState<SanctionType>("ranked_suspension");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      {incomplete && (
        <p className="rounded-md border border-[var(--color-clay)]/30 bg-[var(--color-warning-bg)] px-3 py-2 text-[11.5px] text-[var(--color-clay)]">
          Não foi possível confirmar todas as sanções ativas — a lista abaixo pode
          estar incompleta. Não interprete a ausência de sanção aqui como confirmação
          de que não há nenhuma.
        </p>
      )}
      {sanctions.length > 0 && (
        <div className="space-y-2">
          {sanctions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-bg)] px-4 py-3"
            >
              <div className="flex items-center gap-2 text-[12.5px]">
                <ShieldAlert size={14} className="shrink-0 text-[var(--color-error)]" />
                <span className="font-600 text-[var(--color-error)]">{SANCTION_LABEL[s.sanction_type as SanctionType] ?? s.sanction_type}</span>
                <span className="text-[var(--text-tertiary)]">— {s.reason}</span>
              </div>
              <button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await liftSanctionAction(s.id, userId);
                    if (!res.ok) {
                      setError(res.error);
                      return;
                    }
                    setSanctions((cur) => cur.filter((x) => x.id !== s.id));
                  })
                }
                className="shrink-0 rounded-md border border-[var(--color-error)]/40 px-2.5 py-1 text-[11px] font-500 text-[var(--color-error)] transition-colors hover:bg-white/50"
              >
                Levantar
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {!applying ? (
        <button
          onClick={() => setApplying(true)}
          className="flex items-center gap-1.5 text-[11.5px] font-500 text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-error)]"
        >
          <ShieldCheck size={13} />
          Aplicar sanção
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-[var(--border)] px-4 py-3.5">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as SanctionType)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text-primary)]"
          >
            {(Object.keys(SANCTION_LABEL) as SanctionType[]).map((t) => (
              <option key={t} value={t}>
                {SANCTION_LABEL[t]}
              </option>
            ))}
          </select>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (obrigatório)"
            rows={2}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          <div className="flex items-center gap-2">
            <button
              disabled={pending || !reason.trim()}
              onClick={() =>
                startTransition(async () => {
                  const res = await applySanctionAction(userId, { sanctionType: type, reason: reason.trim() });
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setSanctions((cur) => [...cur, res.data]);
                  setApplying(false);
                  setReason("");
                })
              }
              className="rounded-md bg-[var(--color-error)] px-3 py-1.5 text-[11.5px] font-600 text-white transition-opacity disabled:opacity-50"
            >
              {pending ? "Aplicando…" : "Aplicar"}
            </button>
            <button
              onClick={() => {
                setApplying(false);
                setError("");
              }}
              className="text-[11.5px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shell ────────────────────────────────────────────────────────────────── */

export function AccountActions({
  userId,
  isActive,
  badges,
  sanctions,
  sanctionsIncomplete,
}: {
  userId: string;
  isActive: boolean;
  badges: string[];
  sanctions: SanctionItem[];
  sanctionsIncomplete: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="label-colus mb-2 text-[8.5px] text-[var(--text-tertiary)]">Conta</p>
        <DeactivateSection userId={userId} isActive={isActive} />
      </div>
      <div>
        <p className="label-colus mb-2 text-[8.5px] text-[var(--text-tertiary)]">Selos</p>
        <BadgesSection userId={userId} initialBadges={badges} />
      </div>
      <div>
        <p className="label-colus mb-2 text-[8.5px] text-[var(--text-tertiary)]">Sanções</p>
        <SanctionsSection userId={userId} initial={sanctions} incomplete={sanctionsIncomplete} />
      </div>
    </div>
  );
}
