// Build a looping "listening" clip for the counsellor, with no HeyGen credits.
//
// Why this exists: a question clip is finite, so when it ends the video element
// holds its final frame and the counsellor reads as a dead photograph.
//
// What did NOT work, so nobody retries it:
//
//   1. Cutting a non-speaking moment. There isn't one. silencedetect over all
//      four clips at -35, -45 and -55dB found zero silent windows, because
//      HeyGen trims wall to wall.
//   2. Taking 0.35s and slowing it 8x. Slowed speech looks uncanny rather than
//      idle, minterpolate smears a face badly at that factor, and playing it
//      in reverse makes the mouth un-speak. It looked worse than a still.
//
// What this does instead: pick the single frame where his mouth is most closed,
// then add slow camera motion to it. No mouth movement means nothing uncanny,
// and no interpolation means no smearing. A held shot with a gentle push in is
// ordinary film language and reads as calm rather than broken.
//
// Finding a closed mouth without being able to see the video: audio amplitude
// tracks mouth openness closely, so the quietest audio frame is the best
// available guess at a closed mouth.
//
//   node scripts/make-idle-clip.mjs --dry-run    analyse only
//   node scripts/make-idle-clip.mjs              build and upload

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { neon } from '@neondatabase/serverless'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const dryRun = process.argv.includes('--dry-run')

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

const sql = neon(need('DATABASE_URL'))
const REGION = need('AWS_REGION')
const BUCKET = need('S3_BUCKET_NAME')
const s3 = new S3Client({
  region: REGION,
  credentials: { accessKeyId: need('AWS_ACCESS_KEY_ID'), secretAccessKey: need('AWS_SECRET_ACCESS_KEY') },
})

const ff = (...args) => execFileSync(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
function ffLog(...args) {
  try { execFileSync(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] }); return '' }
  catch (e) { return (e.stderr?.toString() ?? '') + (e.stdout?.toString() ?? '') }
}

// Loop shape. 6s in, 6s back out, so a 12s cycle that returns exactly to its
// first frame. Long and slow enough that the motion is felt, not watched.
const HALF_SEC = 6
const ZOOM_TO = 1.055        // a 5.5% push. More than this reads as a zoom.

const work = mkdtempSync(join(tmpdir(), 'idle-'))

try {
  const rows = await sql`
    select sort_order, avatar_url
    from questions
    where avatar_url is not null and bank = 'behavioral'
    order by length(content) desc
    limit 1
  `
  const source = rows[0]
  if (!source) { console.error('No rendered question clip to cut from.'); process.exit(1) }
  console.log(`source: Q${source.sort_order}`)

  // ── download ─────────────────────────────────────────────────────────────
  const key = source.avatar_url.split('.amazonaws.com/')[1]
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 900 })
  const src = join(work, 'src.mp4')
  writeFileSync(src, Buffer.from(await (await fetch(url)).arrayBuffer()))

  const probe = ffLog('-i', src)
  const dm = probe.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
  const duration = dm ? (+dm[1]) * 3600 + (+dm[2]) * 60 + parseFloat(dm[3]) : 0
  const res = probe.match(/,\s*(\d{3,4})x(\d{3,4})/)
  const W = res ? +res[1] : 1920
  const H = res ? +res[2] : 1080
  console.log(`downloaded: ${(statSync(src).size / 1e6).toFixed(1)} MB, ${duration.toFixed(2)}s, ${W}x${H}`)

  // ── find the quietest audio frame: mouth most likely closed ──────────────
  const stats = ffLog(
    '-i', src,
    // asetnsamples fixes the analysis window at ~46ms, giving one reading per
    // couple of video frames instead of a single reading for the whole file.
    '-af', 'asetnsamples=n=2048,astats=metadata=1:reset=1,ametadata=print',
    '-f', 'null', '-',
  )

  const samples = []
  let pending = null
  for (const line of stats.split('\n')) {
    const t = line.match(/pts_time:([\d.]+)/)
    if (t) { pending = parseFloat(t[1]); continue }
    // Keys are per channel: lavfi.astats.1.RMS_level, not Overall.
    const r = line.match(/lavfi\.astats\.\d+\.RMS_level=(-?[\d.]+|-inf)/)
    if (r && pending != null) {
      const v = r[1] === '-inf' ? -120 : parseFloat(r[1])
      samples.push({ t: pending, rms: v })
      pending = null
    }
  }

  let frameAt
  if (samples.length > 5) {
    // Ignore the first and last 8%: edges are often mid-word or a hard cut.
    const lo = duration * 0.08, hi = duration * 0.92
    const usable = samples.filter(s => s.t >= lo && s.t <= hi)
    const pool = usable.length > 3 ? usable : samples
    const quietest = pool.reduce((a, b) => (b.rms < a.rms ? b : a))
    frameAt = quietest.t
    const loudest = pool.reduce((a, b) => (b.rms > a.rms ? b : a))
    console.log(`audio frames: ${samples.length}`)
    console.log(`quietest ${quietest.rms.toFixed(1)}dB at ${frameAt.toFixed(2)}s  (loudest ${loudest.rms.toFixed(1)}dB)`)
  } else {
    frameAt = duration * 0.5
    console.log(`no audio stats; taking the midpoint at ${frameAt.toFixed(2)}s`)
  }

  if (dryRun) { console.log('\nDry run. Nothing built.'); process.exit(0) }

  // ── grab that single frame ───────────────────────────────────────────────
  const still = join(work, 'still.png')
  ff('-y', '-ss', String(frameAt), '-i', src, '-frames:v', '1', '-q:v', '2', still)
  console.log(`still: ${(statSync(still).size / 1e3).toFixed(0)} KB`)

  // ── slow push in, then the same push back out ────────────────────────────
  // Two passes rather than one reversed pass: reversing a zoom of a still is
  // identical either way, and rendering both keeps the motion perfectly linear
  // with no decode-order artefacts.
  const fps = 25
  const frames = HALF_SEC * fps
  const zStep = (ZOOM_TO - 1) / frames

  const inHalf = join(work, 'in.mp4')
  ff('-y', '-loop', '1', '-i', still, '-t', String(HALF_SEC),
     '-vf', [
       `zoompan=z='min(1+${zStep.toFixed(8)}*on,${ZOOM_TO})'`,
       `:x='iw/2-(iw/zoom/2)'`,
       // Drift the framing up a touch as it pushes in, so it feels alive
       // rather than mechanical. Biased to the upper third, toward the face.
       `:y='ih/2.35-(ih/zoom/2.35)'`,
       `:d=1:fps=${fps}:s=${W}x${H}`,
     ].join(''),
     '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
     '-pix_fmt', 'yuv420p', inHalf)

  const outHalf = join(work, 'out.mp4')
  ff('-y', '-i', inHalf, '-vf', 'reverse', '-an',
     '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
     '-pix_fmt', 'yuv420p', outHalf)

  // ── join into one seamless cycle ─────────────────────────────────────────
  const listFile = join(work, 'list.txt')
  writeFileSync(listFile, `file '${inHalf}'\nfile '${outHalf}'\n`)
  const outFile = join(work, 'idle.mp4')
  ff('-y', '-f', 'concat', '-safe', '0', '-i', listFile,
     '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
     '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile)

  const size = statSync(outFile).size
  console.log(`built: ${(size / 1e3).toFixed(0)} KB, ${HALF_SEC * 2}s seamless loop, no mouth movement`)

  // ── upload and attach ───────────────────────────────────────────────────
  const idle = await sql`select id from questions where bank = 'idle' and active limit 1`
  let idleId = idle[0]?.id
  if (!idleId) {
    const made = await sql`
      insert into questions (bank, position_group, sort_order, content, duration_sec)
      values ('idle','idle',98,'(silent listening loop)',0) returning id`
    idleId = made[0].id
  }

  // Hash the bytes into the key: identical content keeps its URL and stays
  // cacheable, new content gets a new URL so no browser or CDN can serve the
  // previous clip. Overwriting one fixed key is how the last bad version kept
  // reappearing after a rebuild.
  const bytes = readFileSync(outFile)
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 10)
  const idleKey = `avatars/idle-${idleId}-${digest}.mp4`
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
