import type { Metadata } from "next"
import { AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react"

import {
  ALLOWED_EMAIL_DOMAIN,
  accessLoginUrl,
  safeRedirectPath,
} from "./access"
import { enterDevMode } from "./actions"
import {
  CourtLines,
  LitsWordmark,
  OFF,
  STAGE_GRADIENT,
  StageVignette,
} from "./brand"

export const metadata: Metadata = {
  title: "Entrar — Painel Operacional LITS",
  description: "Acesso interno via Google Workspace @lits.social",
}

/**
 * Reads searchParams, so it renders per-request. That is what we want anyway:
 * the Cloudflare team/app domains come from env, and on Workers env is a runtime
 * binding — baking them into a static HTML file at build time would freeze a
 * deploy-time value into the page.
 */
export const dynamic = "force-dynamic"

/* ─────────────────────────────────────────────────────────────────────────────
   /login — the branded gate.

   There is no password field here, and there must never be one. Authentication
   happens at Cloudflare Access, which sits in front of this app: the button below
   does not check a credential, it hands the person to Cloudflare, which hands them
   to Google. A form that *looked* like it authenticated would be a lie about where
   the security lives, and the next person to touch this code would believe it.

   Worth knowing, because it is counterintuitive: in production this page is
   mostly unreachable by design. Access intercepts before Next.js ever runs, so an
   unauthenticated person is already gone by the time a route would be matched. It
   earns its keep in the leftovers — an expired session on a path Access bypasses,
   a policy misconfiguration, someone landing on the URL directly — and in local
   dev, where there is no Cloudflare at all.
   ───────────────────────────────────────────────────────────────────────────── */

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const { from } = await searchParams
  const destination = safeRedirectPath(from)
  const isProduction = process.env.NODE_ENV === "production"

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* ── The stage ──────────────────────────────────────────────────────
          Always dark, in both themes. It is the printed object; the panel to
          its right is the console. */}
      <section
        className="grain relative isolate flex min-h-[38vh] flex-col justify-between overflow-hidden px-8 py-10 lg:min-h-screen lg:w-[55%] lg:px-16 lg:py-14"
        style={{ background: STAGE_GRADIENT, color: OFF }}
      >
        <CourtLines />
        <StageVignette />

        <header className="relative z-10">
          {/* .eyebrow is unlayered CSS and hard-sets color: var(--color-clay),
              which outranks any Tailwind text-* utility. On this gradient clay is
              near-invisible, so the colour is set inline — the one thing that
              reliably wins. */}
          <span className="eyebrow" style={{ color: "rgba(226,222,204,.72)" }}>
            Beta fechado
          </span>
        </header>

        <div className="relative z-10 py-10 lg:py-0">
          <LitsWordmark
            glow
            className="w-[clamp(180px,26vw,330px)]"
            color={OFF}
          />
          <span className="sr-only">LITS</span>

          <p
            className="mt-7 max-w-[24ch] text-[19px] font-300 italic leading-[1.35] lg:text-[22px]"
            style={{ color: "rgba(226,222,204,.82)" }}
          >
            Live the standard.
          </p>
        </div>

        <footer
          className="label-colus relative z-10 text-[9px] leading-relaxed"
          style={{ color: "rgba(226,222,204,.5)" }}
        >
          Uso interno · LITS Social
        </footer>
      </section>

      {/* ── The gate ───────────────────────────────────────────────────────── */}
      <section className="relative flex flex-1 items-center justify-center bg-[var(--bg)] px-6 py-16 lg:px-14">
        <div className="animate-fade-in-up w-full max-w-[384px]">
          <span className="eyebrow">Acesso restrito</span>

          <h1 className="mt-5 text-[34px] leading-[1.06] tracking-[-0.01em] lg:text-[40px]">
            Painel{" "}
            {/* The flourish is colour, not slant: Colus is never italicized,
                so the second word takes clay — the brand's one energy accent. */}
            <span style={{ color: "var(--color-clay)" }}>Operacional</span>
          </h1>

          <p className="mt-5 text-[14px] font-300 leading-relaxed text-[var(--text-secondary)]">
            A entrada é pela sua conta Google Workspace{" "}
            <span className="font-600 text-[var(--text-primary)]">
              @{ALLOWED_EMAIL_DOMAIN}
            </span>
            . A verificação acontece no Cloudflare Access, antes desta aplicação —
            não há senha para digitar aqui.
          </p>

          {/* The only real control on this page. An anchor, because it is a
              navigation to another origin, not a form submission. */}
          <a
            href={accessLoginUrl(destination)}
            className="group mt-8 flex w-full items-center justify-between gap-3 rounded-md bg-[var(--primary)] px-5 py-3.5 text-[13.5px] font-600 text-[var(--primary-fg)] transition-all duration-200 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span>Continuar com Google Workspace</span>
            <ArrowRight
              size={15}
              strokeWidth={2}
              className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </a>

          <p className="mt-4 flex items-start gap-2 text-[11.5px] font-300 leading-relaxed text-[var(--text-tertiary)]">
            <ShieldCheck
              size={13}
              strokeWidth={1.75}
              className="mt-px shrink-0"
            />
            <span>
              Contas fora de @{ALLOWED_EMAIL_DOMAIN} são recusadas pelo Cloudflare
              Access, e o backend valida a identidade de novo a cada requisição.
            </span>
          </p>

          {/* ── Local dev entry ──────────────────────────────────────────────
              Rendered only outside production, and the server action behind it
              refuses to run there regardless of what gets POSTed.

              Deliberately ugly: hazard hatching, dashed border, warning colour,
              the word "sem autenticação" spelled out. A dev affordance that could
              be mistaken for a production control is how a backdoor ships. */}
          {!isProduction && (
            <div className="mt-11">
              <div className="mb-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-[var(--border)]" />
                <span className="label-colus text-[8.5px] leading-none text-[var(--text-tertiary)]">
                  Ou
                </span>
                <span className="h-px flex-1 bg-[var(--border)]" />
              </div>

              <div
                className="rounded-lg border border-dashed p-4"
                style={{
                  borderColor: "var(--color-warning)",
                  backgroundColor: "var(--color-warning-bg)",
                  backgroundImage:
                    "repeating-linear-gradient(135deg, transparent 0 9px, rgba(181,74,41,.07) 9px 18px)",
                }}
              >
                <p className="label-colus flex items-center gap-1.5 text-[9px] leading-none text-[var(--color-warning)]">
                  <AlertTriangle size={11} strokeWidth={2.25} />
                  Ambiente local
                </p>

                <p className="mt-2.5 text-[12px] font-300 leading-relaxed text-[var(--text-secondary)]">
                  Não existe Cloudflare na frente do{" "}
                  <code className="font-mono text-[11px]">localhost</code>. Este
                  atalho entra{" "}
                  <strong className="font-700 text-[var(--color-warning)]">
                    sem autenticação alguma
                  </strong>{" "}
                  e não existe em produção.
                </p>

                <form action={enterDevMode}>
                  <input type="hidden" name="from" value={destination} />
                  <button
                    type="submit"
                    className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-4 py-2.5 text-[12.5px] font-600 transition-colors duration-150 hover:bg-[var(--color-warning)] hover:text-[var(--surface)]"
                    style={{
                      borderColor: "var(--color-warning)",
                      color: "var(--color-warning)",
                    }}
                  >
                    Entrar sem autenticação (dev)
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
