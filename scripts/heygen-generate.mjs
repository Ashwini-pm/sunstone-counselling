// Generate one avatar video per question and attach it to that question.
//
// Reads every active question with no avatar_url, asks HeyGen to render the
// avatar speaking it, uploads the result to S3, and writes the URL back.
//
// Idempotent: questions that already have a video are skipped, so adding a
// question later renders only that one.
//
//   node scripts/heygen-generate.mjs --dry-run     list what would render
//   node scripts/heygen-generate.mjs --limit 1     render just the first
//   node scripts/heygen-generate.mjs               render everything pending
//
// Needs in .env.local:
//   HEYGEN_API_KEY, HEYGEN_AVATAR_ID, HEYGEN_VOICE_ID
//   HEYGEN_CHARACTER_TYPE   'talking_photo' (default) or 'avatar'
//   DATABASE_URL, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
//   S3_BUCKET_NAME
//
// Written in Node rather than Python so it reuses the dependencies already in
// package.json instead of needing psycopg and boto3.
//
// Uses the HeyGen v3 API with the Avatar IV engine. v2 is deprecated (sunsets
// 2026-10-31) and, more importantly, gave a static talking photo: v3 exposes
// `expressiveness` (which defaults to low, hence the lifeless first cut) and
// `motion_prompt` for body movement and hand gestures.

import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// ── config ───────────────────────────────────────────────────────────────────

function loadEnv() {
  const env = {}
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}

const env = loadEnv()
const need = key => {
  const v = process.env[key] || env[key]
  if (!v || v.startsWith('YOUR_') || v.startsWith('NEEDS_')) {
    console.error(`${key} is not set in .env.local`)
    process.exit(1)
  }
  return v
}

const HEYGEN_KEY = need('HEYGEN_API_KEY')
const CHARACTER_ID = need('HEYGEN_AVATAR_ID')
const VOICE_ID = need('HEYGEN_VOICE_ID')
const CHARACTER_TYPE = (process.env.HEYGEN_CHARACTER_TYPE || env.HEYGEN_CHARACTER_TYPE || 'talking_photo').trim()
// en-IN makes a multilingual voice speak English with an Indian accent. Without
// it the same voice reads the script in a Western accent.
const LOCALE = (process.env.HEYGEN_LOCALE || env.HEYGEN_LOCALE || '').trim()

// Avatar IV motion controls. expressiveness defaults to 'low' at the API,
// which is what made the avatar look like a still photo with a moving mouth.
const EXPRESSIVENESS = (process.env.HEYGEN_EXPRESSIVENESS || env.HEYGEN_EXPRESSIVENESS || 'high').trim()
const MOTION_PROMPT = (process.env.HEYGEN_MOTION_PROMPT || env.HEYGEN_MOTION_PROMPT ||
  'Speaking warmly and directly to the camera as a friendly college counsellor. ' +
  'Natural hand gestures while explaining, relaxed shoulders, occasional small ' +
  'head movements and nods, engaged and encouraging expression.').trim()
const RESOLUTION = (process.env.HEYGEN_RESOLUTION || env.HEYGEN_RESOLUTION || '1080p').trim()

const DATABASE_URL = need('DATABASE_URL')
const AWS_REGION = need('AWS_REGION')
const S3_BUCKET = need('S3_BUCKET_NAME')

const HEYGEN = 'https://api.heygen.com'
const HEADERS = { 'X-Api-Key': HEYGEN_KEY, 'Content-Type': 'application/json' }

const POLL_TIMEOUT_MS = 15 * 60 * 1000
const POLL_INTERVAL_MS = 10 * 1000

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: need('AWS_ACCESS_KEY_ID'),
    secretAccessKey: need('AWS_SECRET_ACCESS_KEY'),
  },
})

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── HeyGen ───────────────────────────────────────────────────────────────────

/**
 * v3 create. Avatar IV animates a photo avatar by look id, so the talking-photo
 * distinction that v2 needed no longer applies.
 */
async function createVideo(text) {
  const res = await fetch(`${HEYGEN}/v3/videos`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      type: 'avatar',
      avatar_id: CHARACTER_ID,
      script: text,
      voice_id: VOICE_ID,
      resolution: RESOLUTION,
      engine: { type: 'avatar_iv' },
      expressiveness: EXPRESSIVENESS,
      motion_prompt: MOTION_PROMPT,
      ...(LOCALE ? { voice_settings: { locale: LOCALE } } : {}),
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) {
    throw new Error(`generate failed (${res.status}): ${JSON.stringify(body.error ?? body).slice(0, 400)}`)
  }
  const id = body?.data?.video_id ?? body?.video_id
  if (!id) throw new Error(`no video_id in response: ${JSON.stringify(body).slice(0, 250)}`)
  return id
}

async function waitForVideo(videoId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const res = await fetch(`${HEYGEN}/v3/videos/${videoId}`, { headers: HEADERS })
    const body = await res.json().catch(() => ({}))
    const d = body?.data ?? body ?? {}
    const status = d.status
    if (status === 'completed' || status === 'success') {
      const url = d.video_url ?? d.url ?? d.output?.video_url
      if (!url) throw new Error(`completed but no url: ${JSON.stringify(d).slice(0, 250)}`)
      return url
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`render failed: ${JSON.stringify(d.error ?? d).slice(0, 300)}`)
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error('render timed out after 15 minutes')
}

// ── S3 ───────────────────────────────────────────────────────────────────────

/** Private upload. Playback uses presigned URLs, never a public ACL. */
async function uploadToS3(key, bytes) {
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET, Key: key, Body: bytes, ContentType: 'video/mp4',
  }))
  return `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`
}

// ── main ─────────────────────────────────────────────────────────────────────

const dryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.indexOf('--limit')
const limit = limitArg > -1 ? parseInt(process.argv[limitArg + 1]) || 0 : 0
// --bank idle  targets one bank; without it --limit picks by sort_order and can
// grab the wrong row entirely.
const bankArg = process.argv.indexOf('--bank')
const bankFilter = bankArg > -1 ? process.argv[bankArg + 1] : null

// HTTP driver, not the WebSocket Client: renders take minutes each and a
// persistent socket dies mid-run, taking the whole batch down with it.
const sql = neon(DATABASE_URL)

try {
  const pending = bankFilter
    ? await sql`
        select id, bank, position_group, sort_order, content
        from questions
        where avatar_url is null and active and bank = ${bankFilter}
        order by sort_order asc`
    : await sql`
        select id, bank, position_group, sort_order, content
        from questions
        where avatar_url is null and active
        order by sort_order asc`

  const queue = limit ? pending.slice(0, limit) : pending

  if (queue.length === 0) {
    console.log('Nothing to do. Every active question already has a video.')
  } else {
    console.log(`engine:    avatar_iv  expressiveness=${EXPRESSIVENESS}  ${RESOLUTION}`)
    console.log(`avatar:    ${CHARACTER_ID}`)
    console.log(`voice:     ${VOICE_ID}${LOCALE ? `  locale=${LOCALE}` : '  (no locale set)'}\n`)
    console.log(`${queue.length} to render:\n`)
    for (const q of queue) {
      const tag = q.bank === 'behavioral' ? `Q${q.sort_order}` : q.bank.toUpperCase()
      console.log(`  ${tag.padEnd(8)} ${q.content.slice(0, 66).replace(/\n/g, ' ')}…`)
    }

    if (dryRun) {
      console.log('\nDry run. Nothing rendered.')
    } else {
      console.log()
      let failures = 0

      for (const [i, q] of queue.entries()) {
        const tag = q.bank === 'behavioral' ? `Q${q.sort_order}` : q.bank.toUpperCase()
        process.stdout.write(`[${i + 1}/${queue.length}] ${tag} … `)
        try {
          const videoId = await createVideo(q.content)
          process.stdout.write(`rendering(${videoId.slice(0, 8)}) … `)
          const url = await waitForVideo(videoId)

          const bytes = Buffer.from(await (await fetch(url)).arrayBuffer())
          const s3Url = await uploadToS3(`avatars/${q.id}.mp4`, bytes)
          await sql`update questions set avatar_url = ${s3Url} where id = ${q.id}`

          console.log(`done (${(bytes.length / 1e6).toFixed(1)} MB)`)
        } catch (err) {
          failures++
          console.log(`FAILED: ${err.message}`)
        }
      }

      console.log(`\n${queue.length - failures} rendered, ${failures} failed.`)
      if (failures) console.log('Re-run to retry. Successful ones are skipped.')
    }
  }
} catch (err) {
  console.error('ERROR:', err.message)
  process.exitCode = 1
}
