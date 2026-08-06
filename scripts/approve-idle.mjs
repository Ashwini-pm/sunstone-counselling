// Make a rendered idle clip live, after a human has actually watched it.
//
// scripts/make-idle-heygen.mjs deliberately leaves every clip inactive. Nothing
// in that pipeline can see its own output: the prompt asks for a movement, the
// model produces whatever it produces, and the script only ever checks a file
// size. A clip that went live unwatched read as sexual. So approval is a
// separate, deliberate, human step.
//
//   node scripts/approve-idle.mjs             list clips and their state
//   node scripts/approve-idle.mjs --link KEY  signed URL to watch one
//   node scripts/approve-idle.mjs KEY         make it live
//   node scripts/approve-idle.mjs --off KEY   pull it back

import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

const sql = neon(env.DATABASE_URL)
const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
})

const args = process.argv.slice(2)
const flag = args.find(a => a.startsWith('--'))
const key = args.find(a => !a.startsWith('--'))

// distinct on: one row per key, the newest. Re-rendering used to leave a stale
// duplicate behind, and showing the old clip while approving the new one is
// exactly the failure this script exists to prevent.
const rows = await sql`
  select distinct on (position_group) position_group, id, active, avatar_url, created_at
  from questions where bank = 'idle'
  order by position_group, created_at desc`

if (!key) {
  console.log('idle clips:\n')
  for (const r of rows) {
    const state = !r.avatar_url ? 'not rendered'
      : r.active ? 'LIVE'
      : 'rendered, awaiting review'
    console.log(`  ${r.position_group.padEnd(14)} ${state}`)
  }
  console.log('\nWatch one:  node scripts/approve-idle.mjs --link <key>')
  process.exit(0)
}

const row = rows.find(r => r.position_group === key)
if (!row) { console.error(`No idle clip named "${key}".`); process.exit(1) }

if (flag === '--link') {
  if (!row.avatar_url) { console.error('Not rendered yet.'); process.exit(1) }
  const objectKey = row.avatar_url.split('.amazonaws.com/')[1]
  console.log(await getSignedUrl(
    s3, new GetObjectCommand({ Bucket: env.S3_BUCKET_NAME, Key: objectKey }), { expiresIn: 21600 }))
  process.exit(0)
}

const live = flag !== '--off'
if (live && !row.avatar_url) { console.error('Nothing rendered to approve.'); process.exit(1) }

// Only the newest row for this key goes live; any stale duplicate stays off.
await sql`update questions set active = ${live} where id = ${row.id}`
console.log(`${key} is now ${live ? 'LIVE' : 'inactive'}.`)
