import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { setByAccessToken } from '@/lib/db/leadAccess'
import { startLeadSession } from '@/lib/leadSession'
import { deviceFromUserAgent, logEvent } from '@/lib/events'

/**
 * Passwordless lead entry: GET /q/{access_token}
 *
 * A Route Handler rather than a page, because Next only permits setting cookies
 * from a Route Handler or Server Action. It verifies the token, creates or
 * resumes the attempt, issues the signed session cookie, and redirects to
 * /answer. The token itself never reaches the client beyond the original link.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: raw } = await params
  const token = decodeURIComponent(raw).replace(/=+$/, '')

  const set = await setByAccessToken(token)
  if (!set) {
    return NextResponse.redirect(new URL('/answer?e=invalid', _req.url))
  }
  if (new Date(set.expiresAt) < new Date()) {
    return NextResponse.redirect(new URL('/answer?e=expired', _req.url))
  }

  // Resume or create attempt 1. A second sitting means a new link.
  const existing = await sql`
    select id, status from attempts
    where set_id = ${set.setId} and attempt_number = 1
    limit 1
  ` as { id: string; status: string }[]

  if (existing[0]?.status === 'submitted') {
    return NextResponse.redirect(new URL('/answer?e=done', _req.url))
  }

  let attemptId = existing[0]?.id
  if (!attemptId) {
    const created = await sql`
      insert into attempts (set_id, lead_id, attempt_number)
      values (${set.setId}, ${set.leadId}, 1)
      returning id
    ` as { id: string }[]
    attemptId = created[0].id
  }

  // Server-side, so it lands even if the lead closes the tab a second later.
  // Fires on every open including a refresh, so a count of distinct people who
  // opened their link is count(distinct attempt_id), not count(*).
  await logEvent({
    attemptId,
    leadId: set.leadId,
    event: 'link_opened',
    meta: {
      ...deviceFromUserAgent(_req.headers.get('user-agent')),
      resumed: !!existing[0],
    },
  })

  await startLeadSession({ leadId: set.leadId, setId: set.setId })

  return NextResponse.redirect(new URL('/answer', _req.url))
}
