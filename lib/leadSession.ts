/**
 * Passwordless lead sessions.
 *
 * A lead proves who they are by holding a link containing the random
 * `access_token` of their question set. We verify that token once, then issue a
 * signed cookie so the API routes can authorise the follow-up calls (presign,
 * upload, submit) without the token travelling in every request.
 *
 * The cookie is signed with AUTH_SECRET, so it cannot be forged or edited to
 * point at a different lead. It is HttpOnly, so page scripts cannot read it.
 *
 * This replaces Google sign-in for leads only. Admins still use Auth.js.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

const COOKIE = 'lead_session'
const MAX_AGE_SEC = 60 * 60 * 6 // six hours is far longer than one sitting

export interface LeadSession {
  leadId: string
  setId: string
}

function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET is not set; lead sessions cannot be signed')
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

/** Constant-time compare, so a wrong signature cannot be probed byte by byte. */
function signatureMatches(expected: string, given: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(given)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Issue the cookie. Call only after the access token has been verified against
 * the database, never straight from a URL parameter.
 */
export async function startLeadSession(session: LeadSession): Promise<void> {
  const issuedAt = Date.now()
  const payload = `${session.leadId}.${session.setId}.${issuedAt}`
  const value = `${payload}.${sign(payload)}`

  const jar = await cookies()
  jar.set(COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SEC,
  })
}

/** The current lead, or null. Verifies the signature and the age. */
export async function currentLead(): Promise<LeadSession | null> {
  const jar = await cookies()
  const raw = jar.get(COOKIE)?.value
  if (!raw) return null

  const parts = raw.split('.')
  if (parts.length !== 4) return null
  const [leadId, setId, issuedAtStr, given] = parts

  const payload = `${leadId}.${setId}.${issuedAtStr}`
  if (!signatureMatches(sign(payload), given)) return null

  const issuedAt = Number(issuedAtStr)
  if (!Number.isFinite(issuedAt)) return null
  if (Date.now() - issuedAt > MAX_AGE_SEC * 1000) return null

  return { leadId, setId }
}

export async function endLeadSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}
