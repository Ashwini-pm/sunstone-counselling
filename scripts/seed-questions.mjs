// Load db/seed/questions.sql into the Neon database.
//   node scripts/seed-questions.mjs
import { readFileSync } from 'node:fs'
import { Client } from '@neondatabase/serverless'

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
const url = process.env.DATABASE_URL || env.DATABASE_URL
if (!url || url.startsWith('NEEDS_')) {
  console.error('DATABASE_URL is not set in .env.local')
  process.exit(1)
}

const client = new Client(url)
await client.connect()

try {
  await client.query(readFileSync('db/seed/questions.sql', 'utf8'))

  const { rows } = await client.query(`
    select bank, position_group, sort_order, duration_sec,
           left(content, 58) as preview,
           (avatar_url is not null) as has_video
    from questions
    where bank in ('behavioral','closing')
    order by sort_order, position_group
  `)
  console.log(`\nloaded ${rows.length} rows:\n`)
  for (const r of rows) {
    const tag = r.bank === 'closing' ? 'CLOSING' : `Q${r.sort_order}`
    console.log(`  ${tag.padEnd(8)} ${r.position_group.padEnd(14)} ${String(r.duration_sec).padStart(3)}s  video:${r.has_video ? 'yes' : 'NO '}  ${r.preview}…`)
  }
  const missing = rows.filter(r => !r.has_video).length
  console.log(`\n${missing} of ${rows.length} still need an avatar video.`)
} catch (err) {
  console.error('SEED FAILED:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
