import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const { inviteId, attemptId, stationId, verdict } = await req.json()
  if (!inviteId || !stationId || !verdict) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = await createClient()

  // validate invite exists
  const { data: invite } = await supabase
    .from('reviewer_invites')
    .select('id, attempt_id')
    .eq('id', inviteId)
    .single()

  if (!invite) return Response.json({ error: 'Invalid invite' }, { status: 404 })

  // upsert: delete existing verdict for this reviewer+station, then insert
  await supabase
    .from('scores')
    .delete()
    .eq('reviewer_invite_id', inviteId)
    .eq('station_id', stationId)

  const { error } = await supabase
    .from('scores')
    .insert({
      attempt_id: invite.attempt_id,
      station_id: stationId,
      rubric_key: 'verdict',
      verdict,
      reviewer_invite_id: inviteId,
    })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
