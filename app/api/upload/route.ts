import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { attemptId, stationId, s3Url, durationSec, planNotes } = await request.json()

  if (!attemptId || !stationId || !s3Url) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { error } = await supabase
    .from('recordings')
    .upsert({
      attempt_id: attemptId,
      station_id: stationId,
      r2_url: s3Url,
      duration_sec: durationSec || 0,
      plan_notes: planNotes || null,
    }, { onConflict: 'attempt_id,station_id' })

  if (error) {
    console.error('[upload] Supabase error:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ url: s3Url })
}
