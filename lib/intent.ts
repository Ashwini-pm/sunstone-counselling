/**
 * Does this student intend to take admission? 1 or 0.
 *
 * Judged from what they said, not from how far they got. Finishing all six
 * stations proves they had five minutes, not that they will enrol, and the
 * whole point of asking is to tell those apart.
 *
 * One call per student over their whole set of answers rather than per answer:
 * intent lives in the combination. "I want to do B.Tech in AI" plus "my father
 * is still deciding" plus "I am also waiting on another college" is a different
 * read from any one of those alone.
 */

import { sql } from '@/lib/db'

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
const ENDPOINT = (m: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`

export function intentConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

/**
 * The rubric is spelled out because "intent" is otherwise read as enthusiasm.
 * A polite, articulate student who is clearly going elsewhere is a 0, and a
 * terse one who says they will book next week is a 1.
 */
const RUBRIC = [
  'You are reading a prospective student\'s answers from a Sunstone counselling session.',
  'Decide whether they intend to take admission at Sunstone.',
  '',
  'Answer 1 if they show real intent: they speak about joining Sunstone specifically,',
  'name a campus or course they want, describe a concrete plan for fees, or say they',
  'are ready to proceed.',
  '',
  'Answer 0 if they do not: they are only exploring, are committed elsewhere, are',
  'waiting on another college or exam, say the fees are not workable, cannot make a',
  'decision themselves, or say too little to show any intent at all.',
  '',
  'Judge what is said, not how well it is said. Fluency is not intent. Politeness is',
  'not intent. A short answer that commits is worth more than a long one that does not.',
  '',
  'Reply as JSON only: {"intent": 1 or 0, "reason": "one short sentence"}',
].join('\n')

interface Verdict { intent: 0 | 1; reason: string }

async function judge(transcript: string): Promise<Verdict> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')

  const res = await fetch(ENDPOINT(MODEL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: RUBRIC + '\n\n---\n\n' + transcript }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 30000,
        // Forces valid JSON back, so there is no prose to parse around.
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`gemini ${res.status}: ${body.slice(0, 300)}`)
  }

  const json = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  }
  const cand = json.candidates?.[0]
  const text = (cand?.content?.parts ?? []).map(p => p.text ?? '').join('').trim()
  if (!text) throw new Error(`gemini returned nothing (${cand?.finishReason ?? 'no reason'})`)

  const parsed = JSON.parse(text) as { intent?: unknown; reason?: unknown }
  const intent = Number(parsed.intent)
  if (intent !== 0 && intent !== 1) throw new Error(`intent was ${String(parsed.intent)}, not 0 or 1`)

  return { intent: intent as 0 | 1, reason: String(parsed.reason ?? '').slice(0, 300) }
}

/**
 * Judge one attempt, once. Claims before working, never throws.
 */
export async function judgeIntent(attemptId: string): Promise<void> {
  try {
    const claimed = await sql`
      update attempts
         set intent_attempts = intent_attempts + 1
       where id = ${attemptId} and status = 'submitted' and intent is null
      returning id
    ` as { id: string }[]
    if (!claimed.length) return

    // Question order matters: the answers build on each other, and the fee
    // question last is where intent most often shows.
    const rows = await sql`
      select aq.position, q.content, r.transcript
      from recordings r
      join questions q on q.id = r.question_id
      left join attempt_questions aq
        on aq.attempt_id = r.attempt_id and aq.question_id = r.question_id
      where r.attempt_id = ${attemptId} and r.transcript is not null
      order by aq.position asc
    ` as { position: number | null; content: string; transcript: string }[]

    if (!rows.length) {
      // Nothing was said, or nothing is transcribed yet. Not a failure, and not
      // a 0 either: judging silence as "no intent" would be inventing a finding.
      await sql`
        update attempts
           set intent_error = 'no transcript to judge', intent_attempts = 0
         where id = ${attemptId}`
      return
    }

    const transcript = rows
      .map(r => `Q${r.position ?? '?'}: ${r.content}\nA: ${r.transcript}`)
      .join('\n\n')

    const v = await judge(transcript)

    await sql`
      update attempts
         set intent = ${v.intent},
             intent_reason = ${v.reason},
             intent_model = ${MODEL},
             intent_error = null,
             intent_at = now()
       where id = ${attemptId}`
  } catch (err) {
    console.error('[intent] failed', attemptId, err)
    try {
      await sql`
        update attempts
           set intent_error = ${String((err as Error)?.message ?? err).slice(0, 400)}
         where id = ${attemptId}`
    } catch { /* nothing sensible left to do */ }
  }
}
