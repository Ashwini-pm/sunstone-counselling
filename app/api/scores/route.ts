import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows } = await request.json()

  const { error } = await supabase
    .from('scores')
    .upsert(
      rows.map((r: Record<string, unknown>) => ({ ...r, scored_by: user.id })),
      { onConflict: 'attempt_id,station_id,rubric_key' }
    )

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
