import { NextRequest } from 'next/server'
import { uploadToS3 } from '@/lib/s3'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const attemptId = formData.get('attemptId') as string
  const stationId = formData.get('stationId') as string
  const durationSec = parseInt(formData.get('durationSec') as string || '0')
  const planNotes = formData.get('planNotes') as string | null

  if (!file || !attemptId || !stationId) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  const key = `recordings/${attemptId}/${stationId}-${Date.now()}.webm`
  const buffer = Buffer.from(await file.arrayBuffer())

  let url: string
  try {
    url = await uploadToS3(key, buffer, 'video/webm')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[upload] S3 error:', msg)
    return Response.json({ error: 'S3 upload failed: ' + msg }, { status: 500 })
  }

  // upsert recording row
  const { error } = await supabase
    .from('recordings')
    .upsert({
      attempt_id: attemptId,
      station_id: stationId,
      r2_url: url,
      duration_sec: durationSec,
      plan_notes: planNotes || null,
    }, { onConflict: 'attempt_id,station_id' })

  if (error) {
    console.error('[upload] Supabase error:', error.message, error.details, error.hint)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ url })
}
