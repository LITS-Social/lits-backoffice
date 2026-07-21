import { headers } from "next/headers";

/**
 * The signed-in staff member's email, read from the same relayed Cloudflare
 * Access JWT `getApi()` forwards to the BFF (see lib/api/index.ts) — this file
 * just also decodes its `email` claim locally, since a few write actions
 * (sanctions, badge grants) need to attribute "who did this" in their own
 * request body rather than relying on the BFF to derive it.
 *
 * The JWT's signature is NOT verified here — Cloudflare Access already
 * verified it at the edge before this header could exist, and the BFF
 * verifies it again independently. Decoding is trust-the-transport, not a
 * second authentication.
 *
 * Returns null in local dev (no Access header) and lets the caller decide the
 * fallback — never a fake email standing in for silently-missing identity.
 */
export async function getStaffEmail(): Promise<string | null> {
  const incoming = await headers();
  const jwt = incoming.get("cf-access-jwt-assertion");
  if (!jwt) return null;

  const payload = jwt.split(".")[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base64, "base64").toString("utf-8");
    const claims = JSON.parse(json) as { email?: string };
    return claims.email ?? null;
  } catch {
    return null;
  }
}
