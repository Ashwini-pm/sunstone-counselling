import { currentLead } from '@/lib/leadSession'
import { ownedAttempt } from '@/lib/db/leadAccess'
import { sql } from '@/lib/db'
import { getS3SignedUrl } from '@/lib/s3'
import { drawQuestions, type Question, type AttemptQuestion } from '@/lib/questions'
import { NextResponse } from 'next/server'

type QuestionRow = {
  id: string
  bank: string
  position_group: string
  sort_order: number
  content: string
  avatar_url: string | null
  duration_sec: number
}

const toQuestion = (r: QuestionRow): Question => ({
  id: r.id,
  bank: r.bank,
  positionGroup: r.position_group,
  sortOrder: r.sort_order,
  content: r.content,
  avatarUrl: r.avatar_url,
  durationSec: r.duration_sec,
})

/** Swap the stored S3 URL for a short-lived signed playback URL. */
async function signAvatar(url: string | null): Promise<string | null> {
  if (!url) return null
  const key = url.split('.amazonaws.com/')[1]
  return key ? getS3SignedUrl(key, 3600) : url
}


/** The spoken closing, played on the done screen. Not a question. */
async function closingAvatar(): Promise<string | null> {
  const rows = await sql`
    select avatar_url from questions
    where bank = 'closing' and active
    order by sort_order asc
    limit 1
  ` as { avatar_url: string | null }[]
  return signAvatar(rows[0]?.avatar_url ?? null)
}

/**
 * A short looping clip of the counsellor listening, played while the lead
 * answers so the main tile is not a frozen final frame. Optional: without it
 * the client falls back to a CSS drift on the last frame.
 */
async function idleAvatar(): Promise<string | null> {
  const rows = await sql`
    select avatar_url from questions
    where bank = 'idle' and active
    order by sort_order asc
    limit 1
  ` as { avatar_url: string | null }[]
  return signAvatar(rows[0]?.avatar_url ?? null)
}

export async function POST(req: Request) {
  const lead = await currentLead()
  if (!lead) return NextResponse.json({ error: 'No active session' }, { status: 401 })

  const { attemptId } = await req.json()
  if (!attemptId) {
    return NextResponse.json({ error: 'Missing attemptId' }, { status: 400 })
  }

  // Ownership first. Everything below reads by attemptId alone, so this check
  // is what keeps one lead out of another's questions.
  const attempt = await ownedAttempt(attemptId, lead.leadId)
  if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  if (attempt.status === 'submitted') {
    return NextResponse.json({ error: 'Attempt already submitted' }, { status: 409 })
  }

  // Idempotent: re-entering a started attempt returns the same frozen order.
  const existing = await sql`
    select aq.position, aq.question_id, q.content, q.avatar_url, q.duration_sec
    from attempt_questions aq
    join questions q on q.id = aq.question_id
    where aq.attempt_id = ${attemptId}
    order by aq.position asc
  ` as {
    position: number; question_id: string; content: string
    avatar_url: string | null; duration_sec: number
  }[]

  if (existing.length > 0) {
    const questions: AttemptQuestion[] = await Promise.all(
      existing.map(async row => ({
        questionId: row.question_id,
        position: row.position,
        content: row.content,
        avatarUrl: await signAvatar(row.avatar_url),
        durationSec: row.duration_sec,
      })),
    )
    return NextResponse.json({
      questions,
      closingUrl: await closingAvatar(),
      idleUrl: await idleAvatar(),
    })
  }

  // First entry: draw one question per position_group from the assigned bank.
  const bankRows = await sql`
    select bank from question_sets where id = ${attempt.set_id} limit 1
  ` as { bank: string }[]
  const bank = bankRows[0]?.bank ?? 'behavioral'

  const pool = await sql`
    select id, bank, position_group, sort_order, content, avatar_url, duration_sec
    from questions
    where bank = ${bank} and active
  ` as QuestionRow[]

  if (pool.length === 0) {
    return NextResponse.json(
      { error: `Question bank "${bank}" is empty. Load the questions before sending links.` },
      { status: 500 },
    )
  }

  const drawn = drawQuestions(pool.map(toQuestion))

  // Insert the frozen order. A conflict means a concurrent request already
  // drew this attempt's questions, so fall through and read theirs.
  try {
    for (let i = 0; i < drawn.length; i++) {
      await sql`
        insert into attempt_questions (attempt_id, question_id, position)
        values (${attemptId}, ${drawn[i].id}, ${i + 1})
        on conflict do nothing
      `
    }
  } catch (err) {
    console.error('[begin] insert failed:', err)
    return NextResponse.json({ error: 'Could not start the attempt' }, { status: 500 })
  }

  // Read back what actually landed, so the client can never be shown an order
  // that was not persisted. The faculty version skipped this and drifted.
  const persisted = await sql`
    select aq.position, aq.question_id, q.content, q.avatar_url, q.duration_sec
    from attempt_questions aq
    join questions q on q.id = aq.question_id
    where aq.attempt_id = ${attemptId}
    order by aq.position asc
  ` as {
    position: number; question_id: string; content: string
    avatar_url: string | null; duration_sec: number
  }[]

  if (persisted.length === 0) {
    return NextResponse.json({ error: 'Could not start the attempt' }, { status: 500 })
  }

  const questions: AttemptQuestion[] = await Promise.all(
    persisted.map(async row => ({
      questionId: row.question_id,
      position: row.position,
      content: row.content,
      avatarUrl: await signAvatar(row.avatar_url),
      durationSec: row.duration_sec,
    })),
  )

  return NextResponse.json({
      questions,
      closingUrl: await closingAvatar(),
      idleUrl: await idleAvatar(),
    })
}
