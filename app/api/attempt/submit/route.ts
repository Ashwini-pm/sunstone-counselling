import { currentLead } from '@/lib/leadSession'
import { ownedAttempt, submitAttempt } from '@/lib/db/leadAccess'
import { logEvent } from '@/lib/events'
import { sendCompletionEmail } from '@/lib/email'

export async function POST(request: Request) {
  const lead = await currentLead()
  if (!lead) return Response.json({ error: 'No active session' }, { status: 401 })

  const { attemptId, totalDurationSec } = await request.json()
  if (!attemptId) return Response.json({ error: 'Missing attemptId' }, { status: 400 })

  const attempt = await ownedAttempt(attemptId, lead.leadId)
  if (!attempt) return Response.json({ error: 'Not found' }, { status: 404 })

  // Already submitted counts as success; the client may retry.
  const alreadySubmitted = attempt.status === 'submitted'
  await submitAttempt(attemptId, lead.leadId, totalDurationSec ?? null)

  // Only on the transition. The client may retry this call, and a completion
  // counted twice would overstate the funnel's last stage.
  if (!alreadySubmitted) {
    await logEvent({
      attemptId,
      leadId: lead.leadId,
      event: 'attempt_submitted',
      meta: { totalDurationSec: totalDurationSec ?? null },
    })

    // Awaited on purpose. A serverless function can be frozen the moment it
    // responds, so a floating promise here would be killed mid-send often
    // enough to matter. sendCompletionEmail never throws and claims the send
    // in the database first, so the cost is a second or two on a request the
    // student is not waiting on.
    await sendCompletionEmail(attemptId)
  }

  return Response.json({ ok: true })
}
