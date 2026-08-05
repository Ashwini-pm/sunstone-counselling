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
 * A generated-photo avatar is a "talking photo" and takes talking_photo_id.
 * A studio avatar takes avatar_id with an avatar_style. Sending the wrong
 * shape is a 400, so the type is explicit rather than guessed.
 */
function characterBlock() {
  return CHARACTER_TYPE === 'talking_photo'
    ? { type: 'talking_photo', talking_photo_id: CHARACTER_ID }
    : { type: 'avatar', avatar_id: CHARACTER_ID, avatar_style: 'normal' }
}

async function createVideo(text) {
  const res = await fetch(`${HEYGEN}/v2/video/generate`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      video_inputs: [{
        character: characterBlock(),
        voice: {
          type: 'text',
          input_text: text,
          voice_id: VOICE_ID,
          ...(LOCALE ? { locale: LOCALE } : {}),
        },
      }],
      dimension: { width: 1280, height: 720 },
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) {
    throw new Error(`generate failed (${res.status}): ${JSON.stringify(body.error ?? body).slice(0, 300)}`)
  }
  const id = body?.data?.video_id
  if (!id) throw new Error(`no video_id in response: ${JSON.stringify(body).slice(0, 200)}`)
  return id
}

async function waitForVideo(videoId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const res = await fetch(`${HEYGEN}/v1/video_status.get?video_id=${videoId}`, { headers: HEADERS })
    const body = await res.json().catch(() => ({}))
    const d = body?.data ?? {}
    if (d.status === 'completed') return d.video_url
    if (d.status === 'failed') throw new Error(`render failed: ${JSON.stringify(d.error ?? d).slice(0, 300)}`)
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

// HTTP driver, not the WebSocket Client: renders take minutes each and a
// persistent socket dies mid-run, taking the whole batch down with it.
const sql = neon(DATABASE_URL)

try {
  const pending = await sql`
    select id, bank, position_group, sort_order, content
    from questions
    where avatar_url is null and active
    order by sort_order asc
  `

  const queue = limit ? pending.slice(0, limit) : pending

  if (queue.length === 0) {
    console.log('Nothing to do. Every active question already has a video.')
  } else {
    console.log(`character: ${CHARACTER_TYPE} ${CHARACTER_ID}`)
    console.log(`voice:     ${VOICE_ID}${LOCALE ? `  locale=${LOCALE}` : '  (no locale set)'}\n`)
    console.log(`${queue.length} to render:\n`)
    for (const q of queue) {
      const tag = q.bank === 'closing' ? 'CLOSING' : `Q${q.sort_order}`
      console.log(`  ${tag.padEnd(8)} ${q.content.slice(0, 66).replace(/\n/g, ' ')}…`)
    }

    if (dryRun) {
      console.log('\nDry run. Nothing rendered.')
    } else {
      console.log()
      let failures = 0

      for (const [i, q] of queue.entries()) {
        const tag = q.bank === 'closing' ? 'CLOSING' : `Q${q.sort_order}`
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
