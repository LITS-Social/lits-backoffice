"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { DEV_ENTRY_COOKIE, safeRedirectPath } from "./access"

/**
 * The local-dev entry. There is no Cloudflare in front of localhost, so the
 * `cf-access-jwt-assertion` header can never appear there and the login button
 * would send a developer to a Cloudflare tenant that has never heard of
 * `localhost:3000`. This is the shortcut that just proceeds.
 *
 * It authenticates nothing. It sets a cookie whose only reader is our own
 * middleware, and only when NODE_ENV !== "production".
 *
 * The production guard below is NOT redundant with hiding the button. A server
 * action is a real HTTP endpoint: Next gives it a stable id, and anything that
 * knows the id can POST to it whether or not a button was ever rendered. Hiding
 * the UI hides the UI. This is what makes the shortcut *not exist* in prod.
 */
export async function enterDevMode(formData: FormData) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "dev entry is not available in production — the gate is Cloudflare Access",
    )
  }

  const destination = safeRedirectPath(formData.get("from")?.toString())

  const jar = await cookies()
  jar.set(DEV_ENTRY_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // a working day; a laptop shortcut should still expire
  })

  redirect(destination)
}
