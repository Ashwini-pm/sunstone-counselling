import { sql } from '@/lib/db'
import { currentLead } from '@/lib/leadSession'
import { isEventName, logEvent } from '@/lib/events'

/**
 * POST /api/event  — record one funnel event for the current lead.
 *
 * A public write path, so it is deliberately narrow:
 *
 *   - The attempt is resolved from the signed session cookie, never from the
 *     request body. A lead cannot log against somebody else's attempt.
 *   - Unknown event names are rejected, so the table cannot accumulate
 *     categories nobody chose. The database CHECK constraint is the real gate;
 *     this is the polite refusal in front of it.
 *   - `meta` is size-capped and the row count per attempt is capped, both in
 *     lib/events.ts, so the endpoint cannot be used as storage or to grow the
 *     table without bound.
 *
 * `question_id` is not checked against the attempt's own questions. It is a
 * foreign key, so it must name a real question, and the only thing a lead could
 * achieve by sending a different one is to make their own timeline wrong. Not
 * worth an extra query on every event.
 *
 * Always answers 200 once the session is valid. The client fires these without
 * awaiting them, and a failed analytics ping must never surface to a lead who
 * is midway through recording an answer.
 */
export async function POST(request: Request) {
  const lead = await currentLead()
  if (!lead) return Response.json({ error: 'No active session' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Bad body' }, { status: 400 })
  }

  const { event, questionId, position, meta } = (body ?? {}) as {
    event?: unknown
    questionId?: unknown
    position?: unknown
    meta?: unknown
  }

  if (!isEventName(event)) {
    return Response.json({ error: 'Unknown event' }, { status: 400 })
  }

  const attempts = await sql`
    select id from attempts
    where set_id = ${lead.setId} and lead_id = ${lead.leadId}
    order by attempt_number desc
    limit 1
  ` as { id: string }[]

  const attemptId = attempts[0]?.id
  if (!attemptId) return Response.json({ error: 'No attempt' }, { status: 404 })

  await logEvent({
    attemptId,
    leadId: lead.leadId,
    event,
    questionId: typeof questionId === 'string' ? questionId : null,
    position: typeof position === 'number' ? position : null,
    meta,
  })

  return Response.json({ ok: true })
}
