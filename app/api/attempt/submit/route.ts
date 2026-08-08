import { currentLead } from '@/lib/leadSession'
import { ownedAttempt, submitAttempt } from '@/lib/db/leadAccess'
import { logEvent } from '@/lib/events'
import { sendCompletionEmail } from '@/lib/email'
import { transcribeAttempt } from '@/lib/transcribe'
import { judgeIntent } from '@/lib/intent'
import { after } from 'next/server'

// Transcription runs after the response, but still inside this invocation, so
// the function must be allowed to live long enough to finish it.
export const maxDuration = 120

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

    // Transcribe and judge after the response has gone back, so the student
    // waits on none of it.
    //
    // This used to depend entirely on the analytics sheet's trigger calling the
    // sweeper, since Vercel's Hobby plan rejects any cron more frequent than
    // daily. When that trigger stopped running, 47 recordings sat untranscribed
    // for a day with nothing to notice or retry them. Work that must happen
    // should not depend on a spreadsheet being open.
    //
    // The sweeper stays as the safety net for anything this misses.
    after(async () => {
      await transcribeAttempt(attemptId)
      await judgeIntent(attemptId)
    })
  }

  return Response.json({ ok: true })
}
