import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { inviteId, stationId, allScores, verdict } = await req.json()
  if (!inviteId || !stationId) return Response.json({ error: 'Missing fields' }, { status: 400 })

  const { data: invite } = await supabase
    .from('reviewer_invites')
    .select('id, attempt_id')
    .eq('id', inviteId)
    .single()

  if (!invite) return Response.json({ error: 'Invalid invite' }, { status: 404 })

  // rubric_key = inviteId makes (attempt_id, station_id, rubric_key) unique per reviewer
  // upsert so we never conflict regardless of prior state
  const { error } = await supabase.from('scores').upsert({
    attempt_id: invite.attempt_id,
    station_id: stationId,
    rubric_key: inviteId,
    evaluator_notes: JSON.stringify(allScores || {}),
    ...(verdict != null ? { verdict } : {}),
    reviewer_invite_id: inviteId,
  }, { onConflict: 'attempt_id,station_id,rubric_key' })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
