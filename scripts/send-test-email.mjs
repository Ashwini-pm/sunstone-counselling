// Send the completion email to yourself, without touching a student's record.
//
//   node scripts/send-test-email.mjs you@sunstone.in
//
// Useful for checking how it renders in Gmail, Outlook and on a phone before
// it goes anywhere near a real lead.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import nodemailer from 'nodemailer'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

const to = process.argv[2]
if (!to) { console.error('Usage: node scripts/send-test-email.mjs you@sunstone.in'); process.exit(1) }
if (!env.SMTP_PASS || env.SMTP_PASS.startsWith('NEEDS_')) {
  console.error('SMTP_PASS is not set in .env.local yet.'); process.exit(1)
}

const port = Number(env.SMTP_PORT ?? 587)
const tx = nodemailer.createTransport({
  host: env.SMTP_HOST, port, secure: port === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
})

console.log('verifying SMTP …')
await tx.verify()
console.log('connection ok')

// The very same templates the app sends, so this cannot drift from reality.
const { plainText, html } = await import(resolve(ROOT, 'lib/emailTemplates.mjs'))
const name = process.argv[3] || 'Aarav'

await tx.sendMail({
  from: env.SMTP_FROM || env.SMTP_USER,
  to,
  subject: `Your counselling session is complete, ${name}`,
  text: plainText(name),
  html: html(name),
  replyTo: env.SMTP_REPLY_TO || env.SMTP_USER,
})
console.log('sent to', to)
