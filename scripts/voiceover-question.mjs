// Build a question video without HeyGen, by speaking over the idle clip.
//
//   node scripts/voiceover-question.mjs your-questions            default voice
//   node scripts/voiceover-question.mjs your-questions --voice Rishi
//   node scripts/voiceover-question.mjs your-questions --preview  build, do not attach
//
// Why this exists: HeyGen ran out of API credits mid-campaign, and a question
// nobody can render is a station nobody can answer. This costs nothing and
// needs no external service.
//
// How it works: macOS `say` speaks the question in an Indian English voice, the
// silent idle clip is looped to match that audio, and the two are muxed. The
// idle clip is the right base precisely because the avatar is not speaking in
// it: a closed, still mouth reads as a voiceover, whereas laying audio over a
// clip of him saying different words reads as a fault.
//
// The result is attached INACTIVE. Nothing reaches a student unrendered and
// unwatched, for the same reason the idle clips are gated.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'
import { neon } from '@neondatabase/serverless'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

const args = process.argv.slice(2)
const group = args.find(a => !a.startsWith('--'))
const voice = args.includes('--voice') ? args[args.indexOf('--voice') + 1] : 'Aman'
const preview = args.includes('--preview')
if (!group) {
  console.error('Usage: node scripts/voiceover-question.mjs <position_group> [--voice Aman] [--preview]')
  process.exit(1)
}

const sql = neon(env.DATABASE_URL)
const REGION = env.AWS_REGION
const BUCKET = env.S3_BUCKET_NAME
const s3 = new S3Client({
  region: REGION,
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
})

const ff = (...a) => execFileSync(ffmpegPath, a, { stdio: ['ignore', 'pipe', 'pipe'] })
const work = mkdtempSync(join(tmpdir(), 'vo-'))

try {
  const rows = await sql`
    select id, content, active from questions
    where position_group = ${group} limit 1
  `
  if (!rows.length) { console.error(`No question with position_group "${group}".`); process.exit(1) }
  const q = rows[0]
  console.log(`question: ${q.content.slice(0, 70)}…`)
  console.log(`voice   : ${voice}`)

  // ── speak it ──────────────────────────────────────────────────────────────
  // `say` writes AIFF; everything downstream wants a normal audio stream.
  const aiff = join(work, 'vo.aiff')
  // No --data-format: the default AIFF is what ffmpeg wants, and passing a
  // format string here is rejected on this macOS build.
  execFileSync('say', ['-v', voice, '-o', aiff, q.content])

  const wav = join(work, 'vo.wav')
  // Loudness-normalised, so it sits at the same level as the HeyGen clips
  // rather than being noticeably quieter or louder than the other questions.
  ff('-y', '-i', aiff, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '2', wav)

  const probe = (() => {
    try { execFileSync(ffmpegPath, ['-i', wav], { stdio: ['ignore', 'pipe', 'pipe'] }); return '' }
    catch (e) { return (e.stderr?.toString() ?? '') }
  })()
  const m = probe.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
  const seconds = m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0
  console.log(`speech  : ${seconds.toFixed(1)}s`)

  // ── the silent base clip ──────────────────────────────────────────────────
  const idle = await sql`
    select avatar_url from questions
    where bank = 'idle' and avatar_url is not null
    order by position_group asc limit 1
  `
  if (!idle.length) { console.error('No idle clip to speak over.'); process.exit(1) }

  const key = idle[0].avatar_url.split('.amazonaws.com/')[1]
  const src = join(work, 'base.mp4')
  const signed = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 900 })
  writeFileSync(src, Buffer.from(await (await fetch(signed)).arrayBuffer()))
  console.log(`base    : ${(statSync(src).size / 1e6).toFixed(1)} MB idle clip`)

  // ── loop the video under the speech ───────────────────────────────────────
  // -stream_loop -1 with -shortest ends the moment the audio does, so the clip
  // is exactly as long as the question and never freezes on a last frame.
  const out = join(work, 'out.mp4')
  ff('-y',
     '-stream_loop', '-1', '-i', src,
     '-i', wav,
     '-map', '0:v:0', '-map', '1:a:0',
     '-shortest',
     '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p',
     '-c:a', 'aac', '-b:a', '128k',
     '-movflags', '+faststart', out)

  const bytes = readFileSync(out)
  console.log(`built   : ${(bytes.length / 1e3).toFixed(0)} KB`)

  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 10)
  const outKey = `avatars/vo-${q.id}-${voice.toLowerCase()}-${digest}.mp4`
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: outKey, Body: bytes, ContentType: 'video/mp4',
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${outKey}`

  if (!preview) {
    // Inactive on purpose. Watch it, then activate.
    await sql`update questions set avatar_url = ${url}, active = false where id = ${q.id}`
    console.log('\nattached to the question, still INACTIVE')
  } else {
    console.log('\npreview only, question untouched')
  }

  console.log(await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: outKey }), { expiresIn: 21600 }))
} finally {
  rmSync(work, { recursive: true, force: true })
}
