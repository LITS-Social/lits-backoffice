import { headers } from "next/headers";
import createClient from "openapi-fetch";
import type { paths } from "./openapi";

// Header the BFF reads the staff identity from. Deliberately not
// Cf-Access-Jwt-Assertion: the BFF's hostname sits behind a service-token Access
// app, and Cloudflare overwrites that header on the way in with an assertion that
// describes this Worker (common_name, no email). The human's JWT — minted by the
// Google Workspace SSO app in front of this frontend — has to ride under a name
// Cloudflare will not touch.
const STAFF_JWT_HEADER = "x-lits-access-jwt";

/**
 * Per-request BFF client.
 *
 * Must be called inside a server component or server action: it reads the
 * incoming request's headers to relay the caller's Cloudflare Access JWT, so
 * every ops call is attributable to the person who made it (that is what lands
 * in `resolved_by` when staff resolves a report). A module-level singleton
 * cannot do this — it has no request to read from.
 *
 * The CF Access service-token pair authenticates *this Worker* to the API
 * hostname's Access app. It is the network gate; the relayed JWT is the person.
 * Both are required, and neither substitutes for the other.
 */
export async function getApi() {
  const incoming = await headers();

  // Cloudflare Access sets this on the request reaching the Worker, after the
  // user has signed in with Google. Absent in local dev, where the BFF runs with
  // BFF_BACKOFFICE_DEV_AUTH=1 and ignores the header entirely.
  const staffJwt = incoming.get("cf-access-jwt-assertion") ?? "";

  return createClient<paths>({
    baseUrl: process.env.API_URL || "http://localhost:8080",
    headers: {
      "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID || "",
      "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET || "",
      [STAFF_JWT_HEADER]: staffJwt,
    },
  });
}
