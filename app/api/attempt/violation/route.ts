import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const FLAG_THRESHOLD = 3

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { attemptId } = await request.json()
  if (!attemptId) return Response.json({ error: 'Missing attemptId' }, { status: 400 })

  // increment violation count and flag if threshold reached
  const { data: attempt } = await supabase
    .from('attempts')
    .select('violation_count')
    .eq('id', attemptId)
    .single()

  const newCount = (attempt?.violation_count || 0) + 1
  const shouldFlag = newCount >= FLAG_THRESHOLD

  await supabase
    .from('attempts')
    .update({
      violation_count: newCount,
      is_flagged: shouldFlag,
    })
    .eq('id', attemptId)

  return Response.json({ violationCount: newCount, isFlagged: shouldFlag })
}
