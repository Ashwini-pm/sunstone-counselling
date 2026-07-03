import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { inviteId, stationId, allScores, verdict } = await req.json()
  if (!inviteId || !stationId) return Response.json({ error: 'Missing fields' }, { status: 400 })

  const { data: invite } = await supabase
    .from('reviewer_invites')
    .select('id, attempt_id, email')
    .eq('id', inviteId)
    .single()

  if (!invite) return Response.json({ error: 'Invalid invite' }, { status: 404 })

  if (invite.email.toLowerCase() !== user.email?.toLowerCase()) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // rubric_key = inviteId makes (attempt_id, station_id, rubric_key) unique per reviewer
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
