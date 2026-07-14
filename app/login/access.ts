/**
 * Cloudflare Access — the URLs, and only the URLs.
 *
 * NOTHING IN THIS FILE AUTHENTICATES ANYBODY. It builds the links that hand a
 * person over to the thing that does.
 *
 * The real gate is Cloudflare Access, and it sits at the edge, IN FRONT of this
 * Next.js app. In production an unauthenticated request never reaches a page we
 * render: Access intercepts it, bounces it through Google Workspace SSO, and only
 * then forwards it to the Worker with a `cf-access-jwt-assertion` header. The BFF
 * then verifies that JWT independently — RS256 signature against the team's JWKS,
 * `aud` pinned to the app, and an `@lits.social` email claim — before it answers
 * a single question. See:
 *
 *   lits-backend/bffs/bff-backoffice/internal/humaauth/middleware.go
 *   lits-backend/bffs/bff-backoffice/cmd/main.go  (CF_ACCESS_* config)
 *
 * Two independent checks, neither of which lives in this repo. That is the point:
 * /login is a doorway, not a lock.
 */

/**
 * Cloudflare team domain. Default mirrors the BFF's own
 * `CF_ACCESS_TEAM_DOMAIN` default (cmd/main.go).
 */
export const TEAM_DOMAIN =
  process.env.CF_ACCESS_TEAM_DOMAIN || "lits.cloudflareaccess.com"

/**
 * The hostname the *SSO* Access app protects — the one a human logs in to.
 *
 * Not the BFF's hostname. The BFF sits behind a separate service-token Access app
 * and is reached only by this Worker; a person never authenticates against it.
 */
export const APP_DOMAIN =
  process.env.CF_ACCESS_APP_DOMAIN || "backoffice.lits.social"

/**
 * The Google Workspace domain Access admits. Mirrors the BFF's
 * `CF_ACCESS_ALLOWED_EMAIL_DOMAIN`, which rejects any JWT whose email claim does
 * not end in it — so this constant is copy, not policy. Changing it here changes
 * what the screen *says*, not who gets in.
 */
export const ALLOWED_EMAIL_DOMAIN =
  process.env.CF_ACCESS_ALLOWED_EMAIL_DOMAIN || "lits.social"

/** Cookie the local dev entry sets. Ignored outright in production. */
export const DEV_ENTRY_COOKIE = "lits-dev-entry"

/**
 * A path we are willing to send someone back to after login.
 *
 * The `?from=` param is attacker-controllable (it lands in the URL, and the URL
 * is a link anyone can craft), and it is fed to Cloudflare's `redirect_url`. Only
 * same-origin *paths* are allowed: a value starting `//` or `https://` would be an
 * open redirect — a phishing primitive on an SSO login page, of all places.
 */
export function safeRedirectPath(from: string | undefined | null): string {
  if (!from) return "/"
  if (!from.startsWith("/")) return "/"
  if (from.startsWith("//")) return "/"
  // Backslashes get normalised to `/` by some agents — `/\evil.com` is a known
  // bypass of naive `startsWith("/")` checks.
  if (from.startsWith("/\\")) return "/"
  return from
}

/**
 * Start the Cloudflare Access login flow. This is the only "sign in" that exists:
 * it lands on Cloudflare, which lands on Google, which comes back with a JWT.
 */
export function accessLoginUrl(redirectPath = "/"): string {
  const url = new URL(
    `https://${TEAM_DOMAIN}/cdn-cgi/access/login/${APP_DOMAIN}`,
  )
  url.searchParams.set("redirect_url", safeRedirectPath(redirectPath))
  return url.toString()
}

/**
 * Clear the Cloudflare Access session.
 *
 * This is the escape hatch for the single most likely support ticket: someone
 * signed in with their personal Gmail, Access remembers it, and every retry
 * silently reuses the wrong identity. Logout is what lets them pick again.
 */
export function accessLogoutUrl(): string {
  return `https://${TEAM_DOMAIN}/cdn-cgi/access/logout`
}
