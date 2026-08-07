import { sql } from '@/lib/db'
import { sendCompletionEmail, smtpConfigured } from '@/lib/email'

/**
 * The safety net for completion emails.
 *
 * The email is sent inline when a student submits, and that is the path that
 * matters: it arrives while they are still looking at the thank-you screen.
 * But an inline send can fail for reasons that have nothing to do with the
 * student, and one already did. A student completed at 22:42 and was never
 * emailed, and nothing retried it.
 *
 * So this sweeps up anything the inline path missed. Both routes use the same
 * claim-then-send, so a student can never be emailed twice no matter how often
 * this runs or how it overlaps with a live submission.
 *
 * Also a diagnostic. Production has environment variables I cannot read from a
 * laptop, and "was the email skipped, or did it fail?" was unanswerable. The
 * response says whether SMTP is configured on the server that ran it.
 *
 * GET is deliberate: Vercel Cron only issues GET, and it carries the project's
 * CRON_SECRET as a bearer token.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Never send an unbounded burst; Gmail throttles and a run must finish. */
const MAX_PER_RUN = 25

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  // Without a secret configured this is refused rather than left open: it
  // triggers real emails to real students.
  if (!secret) return false

  const header = request.headers.get('authorization') ?? ''
  if (header === `Bearer ${secret}`) return true

  // Also accept ?key= so it can be run by hand while debugging.
  return new URL(request.url).searchParams.get('key') === secret
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const configured = smtpConfigured()

  const pending = await sql`
    select a.id
    from attempts a
    join leads l on l.id = a.lead_id
    where a.status = 'submitted'
      and a.completion_email_sent_at is null
      and l.email is not null
      -- Give the inline send a moment to finish before treating it as missed.
      and a.submitted_at < now() - interval '2 minutes'
      -- Stop hammering an address that keeps failing; it will show up in the
      -- summary below with its error instead.
      and a.completion_email_attempts < 3
    order by a.submitted_at asc
    limit ${MAX_PER_RUN}
  ` as { id: string }[]

  if (!configured) {
    // The single most useful thing this endpoint can tell us.
    return Response.json({
      ok: false,
      smtpConfigured: false,
      pending: pending.length,
      sent: 0,
      note: 'SMTP is not configured on this deployment, so nothing was sent.',
    })
  }

  for (const p of pending) await sendCompletionEmail(p.id)

  // Read back rather than trusting the loop: sendCompletionEmail swallows its
  // own errors by design, so the database is the only honest source.
  const after = await sql`
    select
      count(*) filter (where completion_email_sent_at is not null)::int as sent,
      count(*) filter (where completion_email_sent_at is null)::int     as failed
    from attempts
    where id = any(${pending.map(p => p.id)})
  ` as { sent: number; failed: number }[]

  const stuck = await sql`
    select count(*)::int as n, max(completion_email_error) as last_error
    from attempts
    where status = 'submitted' and completion_email_sent_at is null
      and completion_email_attempts >= 3
  ` as { n: number; last_error: string | null }[]

  return Response.json({
    ok: true,
    smtpConfigured: true,
    considered: pending.length,
    sent: after[0]?.sent ?? 0,
    failed: after[0]?.failed ?? 0,
    givenUp: stuck[0]?.n ?? 0,
    lastError: stuck[0]?.last_error ?? null,
  })
}
