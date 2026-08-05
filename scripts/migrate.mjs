// Apply db/migrations/*.sql to the Neon database in DATABASE_URL.
//   node scripts/migrate.mjs
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
  for (const f of files) {
    process.stdout.write(`applying ${f} … `)
    await client.query(readFileSync(`db/migrations/${f}`, 'utf8'))
    console.log('ok')
  }

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
