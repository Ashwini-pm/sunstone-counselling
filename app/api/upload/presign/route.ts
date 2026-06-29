import { createClient } from '@/lib/supabase/server'
import { getS3UploadUrl } from '@/lib/s3'
import { NextRequest } from 'next/server'

const S3_BUCKET = process.env.S3_BUCKET_NAME!
const AWS_REGION = process.env.AWS_REGION!

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { attemptId, stationId } = await request.json()
  if (!attemptId || !stationId) return Response.json({ error: 'Missing fields' }, { status: 400 })

  const key = `recordings/${attemptId}/${stationId}-${Date.now()}.webm`
  const uploadUrl = await getS3UploadUrl(key, 'video/webm')
  const finalUrl = `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`

  return Response.json({ uploadUrl, key, finalUrl })
}
