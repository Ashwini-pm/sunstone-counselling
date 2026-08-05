// Render a genuine idle "listening" clip with HeyGen, no speech.
//
// The problem with every earlier attempt: HeyGen's `script` field makes the
// avatar talk, and an idle loop must not. Cutting silence out of an existing
// clip failed because there is none, and slowing speech down looked uncanny.
//
// The fix is `audio_url`, which lip-syncs an audio file instead of a script and
// is mutually exclusive with it. Feed it SILENCE: there are no phonemes to
// sync, so the mouth stays closed, while Avatar IV's motion_prompt and
// expressiveness still drive head and body movement. A real idle clip.
//
//   node scripts/make-idle-heygen.mjs
//
// Costs credits, unlike scripts/make-idle-clip.mjs which fakes it locally from
// an existing render. Prefer this one when there is balance.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { neon } from '@neondatabase/serverless'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

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
const need = k => {
  const v = env[k]
  if (!v || v.startsWith('YOUR_') || v.startsWith('NEEDS_')) {
    console.error(`${k} is not set in .env.local`); process.exit(1)
  }
  return v
}

const HEYGEN = 'https://api.heygen.com'
const HEADERS = { 'X-Api-Key': need('HEYGEN_API_KEY'), 'Content-Type': 'application/json' }
const AVATAR = need('HEYGEN_AVATAR_ID')
const REGION = need('AWS_REGION')
const BUCKET = need('S3_BUCKET_NAME')
const sql = neon(need('DATABASE_URL'))
const s3 = new S3Client({
  region: REGION,
  credentials: { accessKeyId: need('AWS_ACCESS_KEY_ID'), secretAccessKey: need('AWS_SECRET_ACCESS_KEY') },
})

const SECONDS = Number(env.IDLE_SECONDS ?? 8)

// Tunable without editing code, because judging these needs eyes on the result.
//
// expressiveness: 'high' was wrong for an idle clip. With no speech to drive,
// high energy has nothing to animate except the face, which distorted the
// mouth. 'medium' gives body movement without facial contortion.
const EXPRESSIVENESS = env.IDLE_EXPRESSIVENESS ?? 'medium'

// Deliberately says nothing about the mouth or lips. The previous prompt asked
// for "mouth closed and relaxed", and naming it appears to have invited the
// model to animate it. Describe only head, gaze and shoulders.
const MOTION = env.IDLE_MOTION_PROMPT ??
  'A man sitting calmly in an office, listening. He slowly turns his head to ' +
  'his left, pauses, returns to centre, then turns slightly to his right. His ' +
  'eyes follow, glancing left and right naturally. Shoulders relaxed and still. ' +
  'Occasional slow blink. Calm, patient, friendly expression. Completely quiet ' +
  'and attentive throughout.'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const work = mkdtempSync(join(tmpdir(), 'idlehg-'))

try {
  // ── silent audio for the avatar to "lip-sync" ────────────────────────────
  const wav = join(work, 'silence.wav')
  execFileSync(ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=24000:cl=mono`,
    '-t', String(SECONDS), '-c:a', 'pcm_s16le', wav,
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  console.log(`silent track: ${SECONDS}s, ${(statSync(wav).size / 1e3).toFixed(0)} KB`)

  // HeyGen fetches this itself, so it needs a URL it can reach.
  const audioKey = `avatars/_silence-${SECONDS}s.wav`
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: audioKey, Body: readFileSync(wav), ContentType: 'audio/wav',
  }))
  const audioUrl = await getSignedUrl(
    s3, new GetObjectCommand({ Bucket: BUCKET, Key: audioKey }), { expiresIn: 3600 },
  )
  console.log('silent track uploaded and presigned for HeyGen')

  // ── render ───────────────────────────────────────────────────────────────
  const body = {
    type: 'avatar',
    avatar_id: AVATAR,
    audio_url: audioUrl,          // instead of a script: nothing to say
    resolution: '720p',           // it is a background loop; 1080p is waste
    engine: { type: 'avatar_iv' },
    expressiveness: EXPRESSIVENESS,
    motion_prompt: MOTION,
  }
  console.log(`expressiveness: ${EXPRESSIVENESS}   ${SECONDS}s`)

  const res = await fetch(`${HEYGEN}/v3/videos`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(body),
  })
  const created = await res.json().catch(() => ({}))
  if (!res.ok || created.error) {
    console.error(`generate failed (${res.status}):`, JSON.stringify(created.error ?? created).slice(0, 400))
    process.exit(1)
  }
  const videoId = created?.data?.video_id
  console.log(`rendering ${videoId} …`)

  let downloadUrl = null
  const deadline = Date.now() + 15 * 60 * 1000
  while (Date.now() < deadline) {
    const st = await fetch(`${HEYGEN}/v3/videos/${videoId}`, { headers: HEADERS })
    const d = (await st.json().catch(() => ({})))?.data ?? {}
    if (d.status === 'completed' || d.status === 'success') { downloadUrl = d.video_url ?? d.url; break }
    if (d.status === 'failed' || d.status === 'error') {
      console.error('render failed:', JSON.stringify(d.error ?? d).slice(0, 400)); process.exit(1)
    }
    await sleep(10000)
  }
  if (!downloadUrl) { console.error('render timed out'); process.exit(1) }

  const raw = join(work, 'idle-raw.mp4')
  writeFileSync(raw, Buffer.from(await (await fetch(downloadUrl)).arrayBuffer()))
  console.log(`rendered: ${(statSync(raw).size / 1e6).toFixed(1)} MB`)

  // ── strip the silent track, and make the loop seamless ───────────────────
  // Even a silent audio stream is dead weight in a looping background clip.
  // The palindrome removes the jump when the loop restarts; unlike speech,
  // reversing idle body motion looks perfectly natural.
  const out = join(work, 'idle.mp4')
  execFileSync(ffmpegPath, [
    '-y', '-i', raw,
    '-filter_complex', '[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]',
    '-map', '[v]', '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  const bytes = readFileSync(out)
  console.log(`looped: ${(bytes.length / 1e3).toFixed(0)} KB, ${SECONDS * 2}s seamless`)

  // ── attach ───────────────────────────────────────────────────────────────
  const idle = await sql`select id from questions where bank = 'idle' and active limit 1`
  let idleId = idle[0]?.id
  if (!idleId) {
    const made = await sql`
      insert into questions (bank, position_group, sort_order, content, duration_sec)
      values ('idle','idle',98,'(silent listening loop)',0) returning id`
    idleId = made[0].id
  }

  // Content-hashed key so a rebuild is never masked by a cached older clip.
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 10)
  const idleKey = `avatars/idle-hg-${idleId}-${digest}.mp4`
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: idleKey, Body: bytes, ContentType: 'video/mp4',
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  const idleUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${idleKey}`
  await sql`update questions set avatar_url = ${idleUrl} where id = ${idleId}`

  console.log(`\nuploaded -> ${idleUrl}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
