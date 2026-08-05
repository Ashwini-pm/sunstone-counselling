import { currentEmail } from '@/lib/auth'
import { findOrCreateAttempt } from '@/lib/db/leadAccess'

export async function POST(request: Request) {
  const email = await currentEmail()
  if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { setId, leadId, attemptNumber } = await request.json()
  if (!setId || !leadId) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  const result = await findOrCreateAttempt(setId, leadId, attemptNumber ?? 1, email)

  if ('error' in result) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json({ attempt: result.attempt })
}
