import { sql } from '@/lib/db'
import { transcribeRecording, transcriptionConfigured } from '@/lib/transcribe'
import { judgeIntent } from '@/lib/intent'

/**
 * Transcribe whatever is still waiting.
 *
 * Same shape as the completion-email sweeper, for the same reasons: driven from
 * the analytics sheet's fifteen minute trigger rather than vercel.json, because
 * a cron more frequent than daily fails the whole deployment on Vercel's Hobby
 * plan. Protected by CRON_SECRET, which is refused rather than defaulted open
 * because this endpoint spends money.
 *
 * Deliberately not run on upload. Transcription takes seconds and a student is
 * waiting on that request; nothing about the answer they just gave should be
 * held up by a third-party API.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Kept small. Each clip is a fetch from S3 plus a model call, and the function
 * has 60 seconds. Whatever is left over is simply picked up next run, so the
 * queue drains steadily rather than one run trying to do everything and timing
 * out halfway with rows stuck in 'running'.
 */
const MAX_PER_RUN = 8

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (request.headers.get('authorization') === `Bearer ${secret}`) return true
  return new URL(request.url).searchParams.get('key') === secret
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const configured = transcriptionConfigured()

  // A row left 'running' means a previous run was killed mid-flight. After ten
  // minutes it is safe to assume nothing is still working on it.
  await sql`
    update recordings
       set transcript_status = 'failed',
           transcript_error = 'interrupted, will retry'
     where transcript_status = 'running'
       and uploaded_at < now() - interval '10 minutes'
       and transcribed_at is null`

  const pending = await sql`
    select id from recordings
    where transcript_status in ('pending', 'failed')
      and transcript_attempts < 3
    order by uploaded_at desc
    limit ${MAX_PER_RUN}
  ` as { id: string }[]

  const queue = await sql`
    select
      count(*) filter (where transcript_status = 'pending')::int as pending,
      count(*) filter (where transcript_status = 'done')::int    as done,
      count(*) filter (where transcript_status = 'skipped')::int as skipped,
      count(*) filter (where transcript_status = 'failed'
                         and transcript_attempts >= 3)::int      as given_up
    from recordings
  ` as { pending: number; done: number; skipped: number; given_up: number }[]

  if (!configured) {
    return Response.json({
      ok: false,
      transcriptionConfigured: false,
      note: 'GEMINI_API_KEY is not set on this deployment, so nothing was transcribed.',
      ...queue[0],
    })
  }

  // One at a time on purpose: the point is a steady drain, and running eight
  // model calls at once against a rate limit turns a slow queue into a failed
  // one, with every row burning an attempt.
  for (const r of pending) await transcribeRecording(r.id)

  const after = await sql`
    select
      count(*) filter (where transcript_status = 'done')::int    as done,
      count(*) filter (where transcript_status = 'skipped')::int as skipped,
      count(*) filter (where transcript_status = 'failed')::int  as failed
    from recordings where id = any(${pending.map(p => p.id)})
  ` as { done: number; skipped: number; failed: number }[]

  // Intent, once a finished student has transcripts to judge. Same run rather
  // than a second endpoint: it depends on transcription having happened, so
  // sequencing them here means it can never race ahead of the text it reads.
  const unjudged = await sql`
    select a.id from attempts a
    where a.status = 'submitted'
      and a.intent is null
      and a.intent_attempts < 3
      and exists (select 1 from recordings r
                  where r.attempt_id = a.id and r.transcript is not null)
    order by a.submitted_at desc
    limit 5
  ` as { id: string }[]

  for (const a of unjudged) await judgeIntent(a.id)

  const intentState = await sql`
    select
      count(*) filter (where intent = 1)::int as intent_yes,
      count(*) filter (where intent = 0)::int as intent_no,
      count(*) filter (where status = 'submitted' and intent is null)::int as intent_pending
    from attempts
  ` as { intent_yes: number; intent_no: number; intent_pending: number }[]

  const lastError = await sql`
    select transcript_error from recordings
    where transcript_status = 'failed' and transcript_error is not null
    order by transcribed_at desc nulls last limit 1
  ` as { transcript_error: string }[]

  return Response.json({
    ok: true,
    transcriptionConfigured: true,
    considered: pending.length,
    ...after[0],
    queue: queue[0],
    intentJudged: unjudged.length,
    intent: intentState[0],
    lastError: lastError[0]?.transcript_error ?? null,
  })
}
