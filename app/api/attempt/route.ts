import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: fetch existing attempt + recordings
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = request.nextUrl
  const testId = searchParams.get('testId')
  const candidateId = searchParams.get('candidateId')
  const attemptNumber = parseInt(searchParams.get('attempt') || '1')

  if (!testId || !candidateId) {
    return Response.json({ error: 'Missing params' }, { status: 400 })
  }

  const { data: attempt } = await supabase
    .from('attempts')
    .select('*, recordings(*)')
    .eq('test_id', testId)
    .eq('candidate_id', candidateId)
    .eq('attempt_number', attemptNumber)
    .single()

  return Response.json({ attempt })
}

// POST: create a new attempt
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { testId, candidateId, attemptNumber } = await request.json()

  // verify candidate email matches user email
  const { data: candidate } = await supabase
    .from('candidates')
    .select('email')
    .eq('id', candidateId)
    .single()

  if (candidate?.email !== user.email) {
    return Response.json({ error: 'Test link does not match your account.' }, { status: 403 })
  }

  const { data: attempt, error } = await supabase
    .from('attempts')
    .insert({ test_id: testId, candidate_id: candidateId, attempt_number: attemptNumber })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ attempt })
}
