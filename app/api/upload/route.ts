import { currentLead } from '@/lib/leadSession'
import { ownsAttemptQuestion, saveRecording } from '@/lib/db/leadAccess'

export async function POST(request: Request) {
  const lead = await currentLead()
  if (!lead) return Response.json({ error: 'No active session' }, { status: 401 })

  const { attemptId, questionId, s3Url, durationSec } = await request.json()
  if (!attemptId || !questionId || !s3Url) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (!(await ownsAttemptQuestion(attemptId, questionId, lead.leadId))) {
    return Response.json({ error: 'Not your attempt' }, { status: 403 })
  }

  try {
    await saveRecording(attemptId, questionId, s3Url, durationSec || 0)
  } catch (err) {
    console.error('[upload] save failed:', err)
    return Response.json({ error: 'Could not save recording' }, { status: 500 })
  }

  return Response.json({ url: s3Url })
}
