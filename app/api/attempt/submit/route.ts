import { currentEmail } from '@/lib/auth'
import { ownedAttempt, submitAttempt } from '@/lib/db/leadAccess'

export async function POST(request: Request) {
  const email = await currentEmail()
  if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { attemptId, totalDurationSec } = await request.json()
  if (!attemptId) return Response.json({ error: 'Missing attemptId' }, { status: 400 })

  const attempt = await ownedAttempt(attemptId, email)
  if (!attempt) return Response.json({ error: 'Not found' }, { status: 404 })

  // Already submitted is success, not an error — the client may retry.
  await submitAttempt(attemptId, email, totalDurationSec ?? null)

  return Response.json({ ok: true })
}
