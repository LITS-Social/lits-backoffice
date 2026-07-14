import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Ban, LogOut } from "lucide-react"

import {
  ALLOWED_EMAIL_DOMAIN,
  accessLogoutUrl,
} from "../login/access"
import {
  CourtLines,
  LitsWordmark,
  OFF,
  STAGE_GRADIENT,
  StageVignette,
} from "../login/brand"

export const metadata: Metadata = {
  title: "Sem acesso — Painel Operacional LITS",
  description: "Esta conta não pertence ao domínio autorizado",
}

/** Env (team domain) is a runtime binding on Workers — read it per request. */
export const dynamic = "force-dynamic"

/* ─────────────────────────────────────────────────────────────────────────────
   /sem-acesso — the rejection screen.

   Who lands here: someone who authenticated with Google successfully, but with an
   account outside @lits.social. Cloudflare Access accepted the identity and then
   refused the policy. Today they get Cloudflare's raw block page; this is the LITS
   one.

   ⚠ THIS ROUTE IS NOT WIRED UP BY ITSELF. Cloudflare has to be told to send blocked
   users here — Access → the backoffice app → Block page → custom URL. And because
   Access sits in front of this whole hostname, a *blocked* person cannot load a
   page on it: the block page URL needs an Access Bypass policy on /sem-acesso, or
   the redirect just re-enters the gate and loops. Until that config exists this
   page renders correctly and nobody is ever sent to it. Flagged, not faked.

   What this page does NOT show: the email that was rejected. A blocked user has no
   Access session, so /cdn-cgi/access/get-identity has nothing to return, and
   Cloudflare does not hand us the address on the way out. Printing "sua conta"
   next to a guessed or blank value would be inventing data. It says what it knows.
   ───────────────────────────────────────────────────────────────────────────── */

export default function SemAcessoPage() {
  return (
    <main
      className="grain relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16"
      style={{ background: STAGE_GRADIENT, color: OFF }}
    >
      <CourtLines />
      <StageVignette />

      <div className="animate-fade-in-up relative z-10 w-full max-w-[440px] text-center">
        <LitsWordmark
          glow
          color={OFF}
          className="mx-auto w-[92px] opacity-80"
        />
        <span className="sr-only">LITS</span>

        {/* Colus, uppercase, with the leading rule — inline colour because
            .eyebrow is unlayered CSS and its clay hard-set beats utilities. */}
        <span
          className="eyebrow mt-9 justify-center"
          style={{ color: "#F0A88A" }}
        >
          Acesso negado
        </span>

        <h1
          className="mt-4 text-[30px] leading-[1.1] tracking-[-0.03em] lg:text-[36px]"
          style={{ color: OFF }}
        >
          Esta conta não tem acesso
        </h1>

        <p
          className="mx-auto mt-5 max-w-[38ch] text-[14px] font-300 leading-relaxed"
          style={{ color: "rgba(226,222,204,.8)" }}
        >
          O painel operacional é restrito às contas Google Workspace do domínio{" "}
          <span className="font-600" style={{ color: OFF }}>
            @{ALLOWED_EMAIL_DOMAIN}
          </span>
          . A conta usada no login não pertence a esse domínio, então o Cloudflare
          Access bloqueou a entrada.
        </p>

        <div className="mt-9 flex flex-col gap-2.5">
          {/* The actual fix for the overwhelmingly common case: they are signed in
              to Google as themselves. Without clearing the Access session, every
              retry silently reuses the same rejected identity and looks broken. */}
          <a
            href={accessLogoutUrl()}
            className="flex w-full items-center justify-center gap-2 rounded-md px-5 py-3.5 text-[13.5px] font-600 transition-transform duration-200 hover:-translate-y-px"
            style={{ background: OFF, color: "#2A1A12" }}
          >
            <LogOut size={14} strokeWidth={2} />
            Sair e entrar com outra conta
          </a>

          <Link
            href="/login"
            className="flex w-full items-center justify-center gap-2 rounded-md border px-5 py-3 text-[13px] font-500 transition-colors duration-200"
            style={{
              borderColor: "rgba(226,222,204,.28)",
              color: "rgba(226,222,204,.82)",
            }}
          >
            <ArrowLeft size={14} strokeWidth={2} />
            Voltar
          </Link>
        </div>

        <p
          className="mx-auto mt-8 flex max-w-[40ch] items-start gap-2 text-left text-[11.5px] font-300 leading-relaxed"
          style={{ color: "rgba(226,222,204,.52)" }}
        >
          <Ban size={13} strokeWidth={1.75} className="mt-px shrink-0" />
          <span>
            Se você é do time e mesmo assim chegou aqui, peça para incluírem seu
            e-mail na política de acesso do Cloudflare — não há nada que você possa
            ajustar deste lado.
          </span>
        </p>
      </div>
    </main>
  )
}
