import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const attemptId = searchParams.get('attemptId') || '73fd98f3-bfd9-44f8-8311-25ecf816e08b'
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('attempt_questions')
    .select('station_id, position, question_id, questions(content, doubts)')
    .eq('attempt_id', attemptId)
    .order('position', { ascending: true })
  return NextResponse.json({ data, error })
}
