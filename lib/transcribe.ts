/**
 * Transcribe a recorded answer with Gemini.
 *
 * Gemini rather than Whisper for two reasons. These students code-switch
 * constantly, and "Main Indore se hoon, and my 12th was around 78 percent" is a
 * normal answer that dedicated Indian-English ASR mangles. And Gemini reads the
 * clip rather than only hearing it, so the analysis that was deferred becomes a
 * change of prompt rather than a second pipeline over the same 10,000 files.
 *
 * Verbatim by default: a counsellor reading these wants what was actually said,
 * Hindi included. TRANSCRIBE_TO_ENGLISH=1 translates instead, which is only the
 * better choice if these are ever scanned in bulk rather than read.
 *
 * Roughly 1,500 tokens a clip, so about $6 to transcribe every answer from all
 * 1,720 students.
 */

import { sql } from '@/lib/db'
import { getS3SignedUrl } from '@/lib/s3'

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

/** Whether transcription is configured. Reported by the sweeper for diagnosis. */
export function transcriptionConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

/**
 * Names it has never heard are the commonest error in a domain like this, so
 * they are given up front: otherwise NSAT becomes "an sat" and Sunstone
 * becomes "sun stone".
 */
function instruction(): string {
  const toEnglish = process.env.TRANSCRIBE_TO_ENGLISH === '1'
  return [
    'Transcribe the speech in this recording.',
    'The speaker is an Indian student and may mix Hindi and English.',
    toEnglish
      ? 'Translate everything into natural English.'
      : 'CRITICAL: write the entire transcript in the Latin/Roman alphabet only. ' +
        'Never use Devanagari. Romanise Hindi words, e.g. "main Indore se hoon", ' +
        'not the Devanagari equivalent.',
    'Names you may hear: Sunstone, NSAT, CSAT, B.Tech, BBA, EMI, semester, ' +
    'aptitude, placement, hostel, campus, scholarship.',
    'Return ONLY the transcript text. No preamble, no labels, no timestamps.',
    'If nobody speaks, return exactly: [no speech]',
  ].join(' ')
}

async function callGemini(bytes: ArrayBuffer, mime: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')

  const res = await fetch(ENDPOINT(MODEL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: instruction() },
          { inline_data: { mime_type: mime, data: Buffer.from(bytes).toString('base64') } },
        ],
      }],
      generationConfig: {
        // Transcription is not a creative task; drift here is invention.
        temperature: 0,
        maxOutputTokens: 2048,
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

  // A refusal or a safety stop returns no text, and storing an empty string
  // would look like a silent recording rather than a failed call.
  if (!text && cand?.finishReason && cand.finishReason !== 'STOP') {
    throw new Error(`gemini returned nothing (${cand.finishReason})`)
  }
  return text
}

/**
 * Transcribe one recording, once.
 *
 * Claims the row before doing any work, so two overlapping sweeps cannot both
 * transcribe the same clip and pay for it twice. Never throws: the error is
 * recorded on the row so it can be read later rather than guessed at, which is
 * the lesson from a completion email that failed silently overnight.
 */
export async function transcribeRecording(recordingId: string): Promise<void> {
  try {
    const claimed = await sql`
      update recordings
         set transcript_status = 'running',
             transcript_attempts = transcript_attempts + 1
       where id = ${recordingId}
         and transcript_status in ('pending', 'failed')
      returning s3_url, duration_sec
    ` as { s3_url: string; duration_sec: number | null }[]

    if (!claimed.length) return   // already done, or claimed by another run

    const { s3_url, duration_sec } = claimed[0]

    // A one second clip is somebody tapping Next immediately. There is nothing
    // in it, and sending it costs money to be told so.
    if ((duration_sec ?? 0) < 2) {
      await sql`
        update recordings
           set transcript_status = 'skipped', transcript = null,
               transcript_error = 'too short to contain speech',
               transcribed_at = now()
         where id = ${recordingId}`
      return
    }

    const key = s3_url.split('.amazonaws.com/')[1]
    if (!key) throw new Error('cannot derive an S3 key from the stored URL')

    const signed = await getS3SignedUrl(decodeURIComponent(key), 900)
    const res = await fetch(signed)
    if (!res.ok) throw new Error(`fetching the recording failed: ${res.status}`)
    const bytes = await res.arrayBuffer()

    // Inline data is capped at 20 MB of request body, and base64 inflates by a
    // third. Answers run to a couple of MB, so this only ever catches an
    // outlier, and catching it here beats a 400 from the API.
    if (bytes.byteLength > 12 * 1024 * 1024) {
      throw new Error(`recording is ${(bytes.byteLength / 1e6).toFixed(1)} MB, too large to send inline`)
    }

    // audio/webm, though the file is video: declaring it as audio makes Gemini
    // ignore the picture entirely. Sent as video it spent 31,560 tokens on
    // frames against 3,840 on speech, cost twenty times more, and returned four
    // words for a two minute answer. There is nothing to read in a webcam clip
    // of someone talking.
    const text = await callGemini(bytes, 'audio/webm')
    const empty = !text || text === '[no speech]'

    await sql`
      update recordings
         set transcript = ${empty ? null : text},
             transcript_status = ${empty ? 'skipped' : 'done'},
             transcript_error = ${empty ? 'no speech detected' : null},
             transcript_model = ${MODEL + (process.env.TRANSCRIBE_TO_ENGLISH === '1' ? ':english' : '')},
             transcribed_at = now()
       where id = ${recordingId}`
  } catch (err) {
    console.error('[transcribe] failed', recordingId, err)
    try {
      await sql`
        update recordings
           set transcript_status = 'failed',
               transcript_error = ${String((err as Error)?.message ?? err).slice(0, 400)}
         where id = ${recordingId}`
    } catch { /* nothing sensible left to do */ }
  }
}

/**
 * Transcribe everything a single attempt recorded.
 *
 * Used the moment a student submits, so their answers are readable within a
 * minute instead of whenever a sweeper next runs. Sequential on purpose: a
 * handful of clips against a rate limit is not worth parallelising, and a
 * burst that trips the limit burns a retry on every one of them.
 */
export async function transcribeAttempt(attemptId: string): Promise<void> {
  try {
    const pending = await sql`
      select id from recordings
      where attempt_id = ${attemptId}
        and transcript_status in ('pending', 'failed')
        and transcript_attempts < 3
      order by uploaded_at asc
    ` as { id: string }[]
    for (const r of pending) await transcribeRecording(r.id)
  } catch (err) {
    console.error('[transcribe] attempt sweep failed', attemptId, err)
  }
}
