// Export a cohort to CSV for a reminder send, minus anyone already finished.
//
//   node scripts/export-cohort.mjs                     list the cohorts
//   node scripts/export-cohort.mjs 1                   export cohort 1
//   node scripts/export-cohort.mjs 1 --include-done    keep the completed too
//   node scripts/export-cohort.mjs 1 --out ~/Desktop/x.csv
//
// Carries each lead's own counselling link, so the reminder can point straight
// back at the same session. Reusing the original link matters: it resumes the
// attempt rather than starting a new one, so anyone who answered two questions
// and stopped picks up where they left off instead of beginning again.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

const sql = neon(env.DATABASE_URL)
const args = process.argv.slice(2)
const includeDone = args.includes('--include-done')
const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null
const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : null
const which = args.find(a => !a.startsWith('--') && a !== outArg && a !== baseArg)

// NOT NEXT_PUBLIC_APP_URL by default: locally that is a localhost address, and
// a reminder carrying localhost links is worse than no reminder at all.
const BASE = (baseArg || 'https://sunstone-counselling-xi.vercel.app').replace(/\/+$/, '')
if (!/^https:\/\//.test(BASE)) {
  console.error(`Refusing to write links for "${BASE}". Pass --base https://...`)
  process.exit(1)
}
console.log(`links   : ${BASE}/q/…`)

const cohorts = await sql`
  select cohort, count(*)::int n from leads
  where cohort is not null group by cohort order by cohort`

if (!which) {
  console.log('Cohorts:\n')
  for (const c of cohorts) console.log(`  ${c.cohort}   (${c.n} leads)`)
  console.log('\nPass the leading number, e.g. node scripts/export-cohort.mjs 1')
  process.exit(0)
}

// Match on the numeric prefix the import gave them, so "1" is enough.
const target = cohorts.find(c => c.cohort.trim().startsWith(which))
if (!target) { console.error(`No cohort starting "${which}".`); process.exit(1) }
console.log(`cohort: ${target.cohort}`)

const rows = await sql`
  select
    l.name, l.phone10, l.email, l.external_lead_id,
    s.access_token,
    a.id as attempt_id, a.status,
    coalesce(r.cnt, 0)::int as answers,
    last_ev.at as last_seen
  from leads l
  join question_sets s on s.lead_id = l.id
  left join lateral (
    select id, status from attempts where set_id = s.id
    order by attempt_number desc limit 1
  ) a on true
  left join lateral (
    select count(*) as cnt from recordings where attempt_id = a.id
  ) r on true
  left join lateral (
    select at from attempt_events where attempt_id = a.id
    order by at desc limit 1
  ) last_ev on true
  where l.cohort = ${target.cohort}
    and (${includeDone} or a.status is distinct from 'submitted')
  order by
    -- Warmest first: people who started and stopped are the likeliest to
    -- finish on a nudge, and they deserve different wording from someone who
    -- never opened the link at all.
    (a.id is null),
    coalesce(r.cnt, 0) desc,
    l.name asc
`

const q = v => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const ist = d => d ? new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ') : ''

const header = ['name', 'phone', 'email', 'lead_id', 'status', 'answers_given', 'last_seen_ist', 'counselling_link']
const lines = [header.join(',')]
let notOpened = 0, started = 0

for (const r of rows) {
  const status = !r.attempt_id ? 'Never opened'
    : r.answers > 0 ? `Started, ${r.answers} of 5 answered`
    : 'Opened, no answers'
  if (!r.attempt_id) notOpened++; else started++

  lines.push([
    r.name, r.phone10, r.email, r.external_lead_id,
    status, r.answers, ist(r.last_seen),
    r.access_token ? `${BASE}/q/${r.access_token}` : '',
  ].map(q).join(','))
}

const out = outArg
  ? outArg.replace(/^~/, homedir())
  : resolve(homedir(), 'Downloads', `reminder-cohort-${which}-${new Date().toISOString().slice(0, 10)}.csv`)
writeFileSync(out, lines.join('\n') + '\n')

const done = await sql`
  select count(*)::int n from leads l
  join question_sets s on s.lead_id = l.id
  join attempts a on a.set_id = s.id
  where l.cohort = ${target.cohort} and a.status = 'submitted'`

console.log(`\n  ${rows.length} to remind`)
console.log(`    never opened      ${notOpened}`)
console.log(`    started, unfinished ${started}`)
console.log(`  ${done[0].n} completed${includeDone ? ' (included)' : ' (excluded)'}`)
console.log(`\nwritten to ${out}`)
