import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type QRow = { id: string; content: string; doubts: string[] | null }

function pick1(pool: QRow[]): QRow {
  return pool[Math.floor(Math.random() * pool.length)]
}

function pick2unique(pool: QRow[]): [QRow, QRow] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return [shuffled[0], shuffled[1]]
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Map legacy role keys to new question bank keys
const ROLE_MAP: Record<string, string> = {
  java: 'tech',
  marketing: 'management',
}

export async function POST(req: Request) {
  const { attemptId, role: rawRole } = await req.json()
  if (!attemptId || !rawRole) {
    return NextResponse.json({ error: 'missing attemptId or role' }, { status: 400 })
  }
  const role = ROLE_MAP[rawRole] ?? rawRole

  const supabase = await createClient()

  // Idempotency: if rows already exist, return them
  const { data: existing } = await supabase
    .from('attempt_questions')
    .select('station_id, position, question_id, questions(content, doubts)')
    .eq('attempt_id', attemptId)
    .order('position')

  if (existing && existing.length > 0) {
    return NextResponse.json({ stations: existing.map(r => ({
      stationId: r.station_id,
      position: r.position,
      questionId: r.question_id,
      content: r.question_id ? (r.questions as any)?.content ?? null : null,
      doubts: r.question_id ? (r.questions as any)?.doubts ?? null : null,
    })) })
  }

  // Fetch all question pools in parallel
  const [microRes, doubtRes, challengeRes, mentoringRes, lessonRes, integrityRes] =
    await Promise.all([
      supabase.from('questions').select('id, content, doubts').eq('station_id', 'micro-teaching').eq('role', role),
      supabase.from('questions').select('id, content, doubts').eq('station_id', 'doubt-resolution').eq('role', role),
      supabase.from('questions').select('id, content, doubts').eq('station_id', 'classroom-challenge').eq('role', 'shared'),
      supabase.from('questions').select('id, content, doubts').eq('station_id', 'mentoring').eq('role', 'shared'),
      supabase.from('questions').select('id, content, doubts').eq('station_id', 'lesson-design').eq('role', role),
      supabase.from('questions').select('id, content, doubts').eq('station_id', 'integrity').eq('role', 'shared'),
    ])

  const micro = microRes.data as QRow[]
  const doubt = doubtRes.data as QRow[]
  const challenge = challengeRes.data as QRow[]
  const mentoring = mentoringRes.data as QRow[]
  const lesson = lessonRes.data as QRow[]
  const integrity = integrityRes.data as QRow[]

  if (!micro?.length || !doubt?.length || !challenge?.length || !mentoring?.length || !lesson?.length || !integrity?.length) {
    return NextResponse.json({ error: 'question banks empty — run seed migration' }, { status: 500 })
  }

  const pickedMicro = pick1(micro)
  const [doubt1, doubt2] = pick2unique(doubt)
  const pickedChallenge = pick1(challenge)
  const pickedMentoring = pick1(mentoring)
  const pickedLesson = pick1(lesson)
  const pickedIntegrity = pick1(integrity)

  // 7 shuffleable middle stations
  const middle = shuffle([
    { stationId: 'micro-teaching', question: pickedMicro },
    { stationId: 'doubt-1', question: doubt1 },
    { stationId: 'doubt-2', question: doubt2 },
    { stationId: 'classroom-challenge', question: pickedChallenge },
    { stationId: 'mentoring', question: pickedMentoring },
    { stationId: 'lesson-design', question: pickedLesson },
    { stationId: 'integrity', question: pickedIntegrity },
  ])

  const fullOrder = [
    { stationId: 'intro', question: null, position: 1 },
    ...middle.map((s, i) => ({ ...s, position: i + 2 })),
    { stationId: 'reflect', question: null, position: 9 },
  ]

  // Insert into attempt_questions
  await supabase.from('attempt_questions').insert(
    fullOrder.map(s => ({
      attempt_id: attemptId,
      station_id: s.stationId,
      question_id: s.question?.id ?? null,
      position: s.position,
    }))
  )

  return NextResponse.json({
    stations: fullOrder.map(s => ({
      stationId: s.stationId,
      position: s.position,
      questionId: s.question?.id ?? null,
      content: s.question?.content ?? null,
      doubts: s.question?.doubts ?? null,
    }))
  })
}
