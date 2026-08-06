// Apply db/migrations/*.sql to the Neon database in DATABASE_URL.
//   node scripts/migrate.mjs
//
// Each file runs ONCE and is recorded in schema_migrations.
//
// It used to re-run every file on every invocation, which worked only while the
// migrations happened to be idempotent. It stopped working the moment one
// migration undid another: 005 creates a unique index on email, 007 drops it
// because two real students share an address, and re-running 005 afterwards
// fails against the very data 007 was written to allow.
import { readFileSync, readdirSync } from 'node:fs'
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

const files = readdirSync('db/migrations').filter(f => f.endsWith('.sql')).sort()
const client = new Client(url)
await client.connect()
console.log('connected to Neon')

try {
  await client.query(`
    create table if not exists schema_migrations (
      filename    text primary key,
      applied_at  timestamptz not null default now()
    )
  `)

  // Anything already present in the database counts as applied. Without this,
  // the first run after adding the tracking table would try to replay history
  // against a schema that has moved on.
  const { rows: existing } = await client.query('select filename from schema_migrations')
  const applied = new Set(existing.map(r => r.filename))

  if (applied.size === 0) {
    const { rows: t } = await client.query(`
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'attempt_events'
    `)
    if (t.length) {
      // The schema predates this tracking table. Everything up to and including
      // the newest file already reflected in the database is treated as done.
      const seed = files.filter(f => f <= '007_email_not_unique.sql')
      for (const f of seed) {
        await client.query('insert into schema_migrations (filename) values ($1)', [f])
        applied.add(f)
      }
      console.log(`recorded ${seed.length} pre-existing migrations as applied`)
    }
  }

  let ran = 0
  for (const f of files) {
    if (applied.has(f)) { console.log(`skipping ${f} (already applied)`); continue }
    process.stdout.write(`applying ${f} … `)
    await client.query(readFileSync(`db/migrations/${f}`, 'utf8'))
    await client.query('insert into schema_migrations (filename) values ($1)', [f])
    console.log('ok')
    ran++
  }
  if (!ran) console.log('nothing new to apply')

  const { rows } = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `)
  console.log('tables:', rows.map(r => r.table_name).join(', '))
} catch (err) {
  console.error('\nMIGRATION FAILED:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
