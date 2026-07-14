import { NextResponse, type NextRequest } from "next/server"

/* ═══════════════════════════════════════════════════════════════════════════
   THIS IS NOT THE SECURITY GATE. IT IS ROUTING.

   Read this before you trust it with anything.

   The gate is Cloudflare Access, at the edge, in front of this app. In production
   an unauthenticated person never reaches Next.js at all — Access intercepts the
   request, sends them through Google Workspace SSO, and only forwards it here once
   they hold a valid session. The second gate is the BFF, which independently
   verifies the relayed JWT (RS256 against the team JWKS, `aud` pinned, and an
   @lits.social email claim) before answering anything. Both live outside this
   repository. See app/login/access.ts and bff-backoffice/internal/humaauth.

   What this middleware does: looks for the header Access sets, and if it is not
   there, sends the person to a branded /login page instead of a broken panel.
   That is a UX affordance. Nothing more.

   What it CANNOT do: stop anybody. It reads a request header, and a header is
   simply a string the client sent. Anyone talking to the origin directly could
   set `cf-access-jwt-assertion: x` and satisfy it — this code never verifies a
   signature, an audience, or an email. It does not need to: in production nothing
   reaches the origin without passing Access first, and the data itself is behind
   the BFF, which does verify. Removing this file would cost us a nice redirect and
   exactly zero security.

   So: do not add authorization logic here. Do not gate a panel on it. Do not read
   an email out of that header and trust it. If you need to know WHO is asking,
   the answer comes from the BFF, which is the thing that checked.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Set by Cloudflare Access on every request that clears the SSO app in front of
 * backoffice.lits.social. `lib/api/index.ts` reads the same header and relays its
 * value to the BFF under `x-lits-access-jwt` (Cloudflare would overwrite the
 * original name on the way into the BFF's own Access app).
 */
const ACCESS_JWT_HEADER = "cf-access-jwt-assertion"

/** Set by the local dev entry. Never consulted in production — see below. */
const DEV_ENTRY_COOKIE = "lits-dev-entry"

const IS_PRODUCTION = process.env.NODE_ENV === "production"

/**
 * Local dev is OPEN by default, and it has to be: there is no Cloudflare in front
 * of localhost, so the header can never exist, so an always-on gate would bounce
 * every request to /login forever and the app would be unusable on a laptop.
 *
 * `BACKOFFICE_ACCESS_GATE=on` turns the redirect on anyway, which is how you
 * exercise the real flow locally. (You do not need it just to LOOK at the screens
 * — /login and /sem-acesso are ordinary routes you can navigate to directly.)
 */
const GATE_ENFORCED =
  IS_PRODUCTION || process.env.BACKOFFICE_ACCESS_GATE === "on"

export function middleware(request: NextRequest) {
  if (!GATE_ENFORCED) return NextResponse.next()

  if (request.headers.get(ACCESS_JWT_HEADER)) return NextResponse.next()

  // The dev cookie is not even LOOKED AT in production. This ordering is the
  // whole safety argument for it: it is not a bypass that prod happens not to
  // grant, it is a branch prod cannot enter. A stray cookie on a real user's
  // browser does nothing.
  if (
    !IS_PRODUCTION &&
    request.cookies.get(DEV_ENTRY_COOKIE)?.value === "1"
  ) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  const from = request.nextUrl.pathname + request.nextUrl.search

  url.pathname = "/login"
  url.search = ""
  // Remember where they were headed so login can send them back. `from` is
  // sanitised at the far end (safeRedirectPath) before it ever reaches
  // Cloudflare's redirect_url — an unchecked value there is an open redirect on
  // an SSO login page.
  if (from !== "/") url.searchParams.set("from", from)

  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   login, sem-acesso  — the two surfaces an unauthenticated person is
     *                        SUPPOSED to see. Gating these would loop forever.
     *   _next/*            — build output.
     *   fonts, assets      — the brand faces and the wordmark, which the login
     *                        page itself needs before anyone has logged in.
     *   favicon.ico
     */
    "/((?!login|sem-acesso|_next/static|_next/image|fonts/|assets/|favicon.ico).*)",
  ],
}
