/**
 * The completion email, sent once a student finishes their counselling.
 *
 * Two rules govern everything here.
 *
 * It must never block a submission. A student who has just recorded five
 * answers should see their completion screen whether or not our mail server is
 * reachable, so every failure is caught and logged rather than thrown.
 *
 * It must never send twice. `/api/attempt/submit` is retried by the browser and
 * hit again by anyone who reopens a finished link, so the send is gated on
 * `attempts.completion_email_sent_at` being claimed first.
 */

import nodemailer, { type Transporter } from 'nodemailer'
import { sql } from '@/lib/db'
import { plainText, html, firstName } from './emailTemplates.mjs'

let cached: Transporter | null = null

/**
 * Built lazily and reused. Created at import time it would break every page in
 * an environment without mail configured.
 */
function transporter(): Transporter | null {
  if (cached) return cached

  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return null

  const port = Number(process.env.SMTP_PORT ?? 587)
  cached = nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS. 587 starts plain and upgrades via STARTTLS, which is
    // what Gmail expects and what `secure: true` would break.
    secure: port === 465,
    auth: { user, pass },
  })
  return cached
}

/**
 * Send it, once, for a completed attempt.
 *
 * Claims the send in the database BEFORE talking to SMTP. Two concurrent submits
 * would otherwise both read "not sent" and both send. The update returns a row
 * only to whichever call gets there first; the loser stops.
 *
 * Never throws.
 */
export async function sendCompletionEmail(attemptId: string): Promise<void> {
  try {
    const tx = transporter()
    if (!tx) {
      console.warn('[email] SMTP is not configured; skipping completion email')
      return
    }

    const claimed = await sql`
      update attempts
         set completion_email_sent_at = now()
       where id = ${attemptId}
         and status = 'submitted'
         and completion_email_sent_at is null
      returning lead_id
    ` as { lead_id: string }[]

    if (!claimed.length) return   // already sent, or not actually submitted

    const rows = await sql`
      select name, email from leads where id = ${claimed[0].lead_id} limit 1
    ` as { name: string; email: string | null }[]

    const lead = rows[0]
    if (!lead?.email) {
      console.warn('[email] no address for lead', claimed[0].lead_id)
      return
    }

    const name = firstName(lead.name)
    await tx.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: lead.email,
      subject: `Your counselling session is complete, ${name}`,
      text: plainText(name),
      html: html(name),
      replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER,
    })

    console.log('[email] completion email sent to', lead.email)
  } catch (err) {
    // Release the claim so a retry can pick it up, then swallow. A mail fault
    // must never reach the student who just finished recording.
    console.error('[email] completion email failed', err)
    try {
      await sql`update attempts set completion_email_sent_at = null where id = ${attemptId}`
    } catch { /* nothing sensible left to do */ }
  }
}
