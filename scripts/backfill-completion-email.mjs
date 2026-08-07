// Email students who completed before the trigger existed.
//
//   node scripts/backfill-completion-email.mjs            list them, send nothing
//   node scripts/backfill-completion-email.mjs --send     actually send
//
// Uses the same claim-then-send order as the live path, writing
// completion_email_sent_at before contacting SMTP, so a student can never be
// emailed twice even if this is run again by mistake.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import nodemailer from 'nodemailer'
import { neon } from '@neondatabase/serverless'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

const send = process.argv.includes('--send')
// Test rows have no cohort. They should not receive a real admissions email,
// and "Asdfghjkl" receiving one would be worse than merely pointless.
const includeTests = process.argv.includes('--include-tests')
const sql = neon(env.DATABASE_URL)
const { plainText, html, firstName } = await import(resolve(ROOT, 'lib/emailTemplates.mjs'))

const pending = await sql`
  select a.id, l.name, l.email, l.cohort, a.submitted_at
  from attempts a
  join leads l on l.id = a.lead_id
  where a.status = 'submitted'
    and a.completion_email_sent_at is null
    and l.email is not null
    and (${includeTests} or l.cohort is not null)
  order by a.submitted_at
`

console.log(`${pending.length} student${pending.length === 1 ? '' : 's'} to email\n`)
for (const p of pending) {
  const ist = new Date(p.submitted_at.getTime() + 5.5 * 3600 * 1000)
  console.log(`  ${firstName(p.name).padEnd(12)} ${(p.email ?? '').padEnd(34)}` +
    `${ist.toISOString().slice(5, 16).replace('T', ' ')}  ${p.cohort ?? '(test lead)'}`)
}

const noEmail = await sql`
  select count(*)::int c from attempts a join leads l on l.id = a.lead_id
  where a.status = 'submitted' and a.completion_email_sent_at is null and l.email is null`
if (noEmail[0].c) console.log(`\n  ${noEmail[0].c} completed with no address on file, skipped`)

if (!send) { console.log('\nDry run. Nothing sent. Add --send to go.'); process.exit(0) }
if (!pending.length) process.exit(0)

const port = Number(env.SMTP_PORT ?? 587)
const tx = nodemailer.createTransport({
  host: env.SMTP_HOST, port, secure: port === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
})
await tx.verify()
console.log('\nSMTP ok, sending…\n')

let ok = 0, failed = 0
for (const p of pending) {
  // Claim first. Identical to the live path, and it makes a second run safe.
  const claimed = await sql`
    update attempts set completion_email_sent_at = now()
     where id = ${p.id} and completion_email_sent_at is null
    returning 1`
  if (!claimed.length) { console.log(`  skip   ${p.email} (claimed elsewhere)`); continue }

  const name = firstName(p.name)
  try {
    await tx.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: p.email,
      subject: `Your counselling session is complete, ${name}`,
      text: plainText(name),
      html: html(name),
      replyTo: env.SMTP_REPLY_TO || env.SMTP_USER,
    })
    ok++
    console.log(`  sent   ${p.email}`)
  } catch (e) {
    failed++
    await sql`update attempts set completion_email_sent_at = null where id = ${p.id}`
    console.log(`  FAILED ${p.email}: ${e.message}`)
  }
  // Gentle on Gmail, which throttles bursts from a single account.
  await new Promise(r => setTimeout(r, 1200))
}
console.log(`\nsent ${ok}, failed ${failed}`)
