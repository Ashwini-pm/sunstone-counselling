// Move the counsellor clips out of S3 and into the app, re-encoded smaller.
//
//   node scripts/localise-avatars.mjs --dry-run
//   node scripts/localise-avatars.mjs
//
// Why: the bucket is in ap-southeast-2 and the students are in India, so every
// byte crossed the Indian Ocean, 1.2s before any video data moved. Worse, the
// clips were served through presigned URLs, which are unique per request and
// expire hourly, so no browser and no CDN could ever cache one. They are the
// same six files for all 1,720 students and nothing about them is private.
//
// Served from public/ they go out over Vercel's edge, which has a Mumbai
// presence, with a stable URL that caches forever.
//
// Filenames carry a content hash, so "immutable" is honest: a re-render
// produces a new name rather than a stale cache. The S3 originals are left
// alone as the archive.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, statSync, readdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'
import { neon } from '@neondatabase/serverless'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

const dryRun = process.argv.includes('--dry-run')
const sql = neon(env.DATABASE_URL)
const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
})

const OUT_DIR = resolve(ROOT, 'public', 'avatars')
const work = mkdtempSync(join(tmpdir(), 'loc-'))

try {
  const rows = await sql`
    select id, bank, position_group, sort_order, avatar_url
    from questions
    where active and avatar_url like '%amazonaws.com%'
    order by bank, sort_order
  `
  if (!rows.length) { console.log('Nothing left in S3. Already local.'); process.exit(0) }

  mkdirSync(OUT_DIR, { recursive: true })
  let before = 0, after = 0
  const keep = new Set()

  for (const q of rows) {
    const key = q.avatar_url.split('.amazonaws.com/')[1]
    const src = join(work, 'in.mp4')
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET_NAME, Key: key }), { expiresIn: 900 })
    writeFileSync(src, Buffer.from(await (await fetch(url)).arrayBuffer()))
    const inSize = statSync(src).size
    before += inSize

    const dst = join(work, 'out.mp4')
    execFileSync(ffmpegPath, [
      '-y', '-i', src,
      // 720p is plenty for a head and shoulders on a phone, which is where
      // nearly all of these are watched.
      '-vf', "scale='min(1280,iw)':-2",
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-profile:v', 'main',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-ac', '1',
      // Moves the index to the front so playback can start before the whole
      // file has arrived. On a slow connection this is the difference between
      // playing immediately and waiting for the last byte.
      '-movflags', '+faststart',
      dst,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    const bytes = readFileSync(dst)
    after += bytes.length
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 10)
    const name = `${q.position_group}-${digest}.mp4`
    keep.add(name)

    const pct = Math.round((1 - bytes.length / inSize) * 100)
    console.log(`  ${q.position_group.padEnd(16)} ${(inSize / 1e6).toFixed(2)} MB -> ${(bytes.length / 1e6).toFixed(2)} MB  (${pct}% smaller)`)

    if (!dryRun) {
      writeFileSync(join(OUT_DIR, name), bytes)
      await sql`update questions set avatar_url = ${'/avatars/' + name} where id = ${q.id}`
    }
  }

  console.log(`\n  total ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`)

  if (dryRun) { console.log('\nDry run. Nothing written, nothing changed.'); process.exit(0) }

  // Drop any previous encode that nothing points at, so re-running does not
  // quietly grow the repository.
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith('.mp4') && !keep.has(f)) {
      unlinkSync(join(OUT_DIR, f))
      console.log(`  removed stale ${f}`)
    }
  }
  console.log(`\nwritten to public/avatars, database now points at /avatars/…`)
  console.log('S3 originals left untouched as the archive.')
} finally {
  rmSync(work, { recursive: true, force: true })
}
