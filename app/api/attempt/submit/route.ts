import { currentLead } from '@/lib/leadSession'
import { ownedAttempt, submitAttempt } from '@/lib/db/leadAccess'

export async function POST(request: Request) {
  const lead = await currentLead()
  if (!lead) return Response.json({ error: 'No active session' }, { status: 401 })

  const { attemptId, totalDurationSec } = await request.json()
  if (!attemptId) return Response.json({ error: 'Missing attemptId' }, { status: 400 })

  const attempt = await ownedAttempt(attemptId, lead.leadId)
  if (!attempt) return Response.json({ error: 'Not found' }, { status: 404 })

  // Already submitted counts as success; the client may retry.
  await submitAttempt(attemptId, lead.leadId, totalDurationSec ?? null)

  return Response.json({ ok: true })
}
