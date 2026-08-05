// Build a looping "listening" clip for the counsellor, with no HeyGen credits.
//
// Why this exists: a question clip is finite, so when it ends the video element
// holds its last frame and the counsellor looks like a dead photograph. The
// proper fix is a short idle loop. Rendering one costs credits, but the clips
// already rendered contain real motion we have paid for, so we cut one out.
//
// The hard part is that he never stops speaking. silencedetect over all four
// clips at -35, -45 and -55dB found zero silent windows: HeyGen trims tight,
// wall to wall. So there is no non-speaking moment to cut.
//
// Instead we take a very short segment and slow it down hard. Across 0.35s the
// mouth travels very little, so at 8x slower that becomes an almost
// imperceptible shift while head and shoulder motion becomes a gentle sway.
// Muted and palindromic, it reads as someone listening rather than talking.
//
//   node scripts/make-idle-clip.mjs              build and upload
//   node scripts/make-idle-clip.mjs --dry-run    analyse only, upload nothing
//
// Output is muted, ~4s, and palindromic (forward then reversed) so it loops
// without a visible jump.

import { execFileSync } from 'node:child_process'
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

const ff = (...args) =>
  execFileSync(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString()

/** ffmpeg writes silencedetect results to stderr, so capture it deliberately. */
function ffStderr(...args) {
  try {
    execFileSync(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    return ''
  } catch (e) {
    return (e.stderr?.toString() ?? '') + (e.stdout?.toString() ?? '')
  }
}

const work = mkdtempSync(join(tmpdir(), 'idle-'))

try {
  // Longest existing clip gives the best chance of a decent silent window.
  const rows = await sql`
    select id, sort_order, bank, avatar_url, length(content) as chars
    from questions
    where avatar_url is not null and bank = 'behavioral'
    order by length(content) desc
    limit 1
  `
  const source = rows[0]
  if (!source) { console.error('No rendered question clip to cut from.'); process.exit(1) }
  console.log(`source: Q${source.sort_order} (${source.chars} chars of script)`)

  // ── download ──────────────────────────────────────────────────────────────
  const key = source.avatar_url.split('.amazonaws.com/')[1]
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 900 })
  const src = join(work, 'src.mp4')
  writeFileSync(src, Buffer.from(await (await fetch(url)).arrayBuffer()))
  console.log(`downloaded: ${(statSync(src).size / 1e6).toFixed(1)} MB`)

  // ── duration ──────────────────────────────────────────────────────────────
  const probe = ffStderr('-i', src)
  const dm = probe.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
  const duration = dm ? (+dm[1]) * 3600 + (+dm[2]) * 60 + parseFloat(dm[3]) : 0
  console.log(`duration: ${duration.toFixed(2)}s`)

  // ── pick the calmest short segment ────────────────────────────────────────
  // Least visual change means least mouth movement, which survives the
  // slow-down best. scdet reports a score per frame; take the quietest run.
  const scores = []
  const sc = ffStderr('-i', src, '-vf', 'scdet=threshold=0', '-f', 'null', '-')
  for (const m of sc.matchAll(/lavfi\.scd\.score:\s*([\d.]+)/g)) scores.push(parseFloat(m[1]))

  const SRC_LEN = 0.35            // slowed 8x -> 2.8s
  const SLOW = 8
  let cutAt

  if (scores.length > 10) {
    // Frame index -> time, assuming a constant frame rate across the clip.
    const perFrame = duration / scores.length
    const win = Math.max(2, Math.round(SRC_LEN / perFrame))
    let best = Infinity, bestI = 0
    for (let i = 0; i + win < scores.length; i++) {
      let sum = 0
      for (let j = i; j < i + win; j++) sum += scores[j]
      if (sum < best) { best = sum; bestI = i }
    }
    cutAt = Math.min(bestI * perFrame, Math.max(0, duration - SRC_LEN - 0.05))
    console.log(`frames analysed: ${scores.length}, calmest run at ${cutAt.toFixed(2)}s`)
  } else {
    cutAt = Math.max(0, duration - SRC_LEN - 0.05)
    console.log(`no per-frame scores; using tail at ${cutAt.toFixed(2)}s`)
  }

  if (dryRun) { console.log('\nDry run. Nothing built.'); process.exit(0) }

  // ── cut, slow down, interpolate to stay smooth ───────────────────────────
  const seg = join(work, 'seg.mp4')
  ff('-y', '-ss', String(cutAt), '-t', String(SRC_LEN), '-i', src,
     '-an',                                    // silent by design
     // setpts stretches time; minterpolate synthesises the in-between frames so
     // an 8x slow-down does not look like a stutter of duplicated frames.
     '-vf', `setpts=${SLOW}*PTS,minterpolate=fps=25:mi_mode=mci:mc_mode=aobmc:vsbmc=1`,
     '-c:v', 'libx264', '-preset', 'slow', '-crf', '25',
     '-pix_fmt', 'yuv420p', '-movflags', '+faststart', seg)

  // ── palindrome, so the loop has no visible jump ───────────────────────────
  const out = join(work, 'idle.mp4')
  ff('-y', '-i', seg,
     '-filter_complex', '[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]',
     '-map', '[v]', '-an',
     '-c:v', 'libx264', '-preset', 'slow', '-crf', '25',
     '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out)

  const size = statSync(out).size
  console.log(`built: ${(size / 1e3).toFixed(0)} KB, ${(SRC_LEN * SLOW * 2).toFixed(1)}s looping`)

  // ── upload and attach ────────────────────────────────────────────────────
  const idle = await sql`select id from questions where bank = 'idle' and active limit 1`
  let idleId = idle[0]?.id
  if (!idleId) {
    const made = await sql`
      insert into questions (bank, position_group, sort_order, content, duration_sec)
      values ('idle','idle',98,'(silent listening loop)',0) returning id`
    idleId = made[0].id
  }

  const idleKey = `avatars/idle-${idleId}.mp4`
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: idleKey, Body: readFileSync(out), ContentType: 'video/mp4',
  }))
  const idleUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${idleKey}`
  await sql`update questions set avatar_url = ${idleUrl} where id = ${idleId}`

  console.log(`\nuploaded -> ${idleUrl}`)
  console.log('The call view will now loop this instead of freezing on a last frame.')
} finally {
  rmSync(work, { recursive: true, force: true })
}
