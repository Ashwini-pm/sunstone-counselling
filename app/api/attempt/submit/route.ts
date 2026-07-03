import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { attemptId, totalDurationSec } = await request.json()
  if (!attemptId) return Response.json({ error: 'Missing attemptId' }, { status: 400 })

  const { error } = await supabase
    .from('attempts')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      ...(totalDurationSec != null ? { total_duration_sec: totalDurationSec } : {}),
    })
    .eq('id', attemptId)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
