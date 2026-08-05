import { currentLead } from '@/lib/leadSession'
import { ownsAttemptQuestion } from '@/lib/db/leadAccess'
import { getS3UploadUrl } from '@/lib/s3'

const S3_BUCKET = process.env.S3_BUCKET_NAME!
const AWS_REGION = process.env.AWS_REGION!

export async function POST(request: Request) {
  const lead = await currentLead()
  if (!lead) return Response.json({ error: 'No active session' }, { status: 401 })

  const { attemptId, questionId } = await request.json()
  if (!attemptId || !questionId) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Without this, a session could mint an upload URL into another lead's
  // folder. There is no RLS behind this to catch it.
  if (!(await ownsAttemptQuestion(attemptId, questionId, lead.leadId))) {
    return Response.json({ error: 'Not your attempt' }, { status: 403 })
  }

  const key = `answers/${attemptId}/${questionId}-${Date.now()}.webm`
  const uploadUrl = await getS3UploadUrl(key, 'video/webm')
  const finalUrl = `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`

  return Response.json({ uploadUrl, key, finalUrl })
}
