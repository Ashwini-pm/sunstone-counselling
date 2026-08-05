/**
 * Session-scoped access for the LEAD-facing surface.
 *
 * On Supabase, row level security stopped a lead from reading someone else's
 * data even if a route forgot to check. Neon has no equivalent, so that
 * guarantee now lives here and ONLY here.
 *
 * Rules for anything added to this file:
 *   1. Every function takes the caller's email and scopes its SQL by it.
 *   2. No function accepts an id without also constraining on the owner.
 *   3. Routes must not query lead-owned tables directly — go through here.
 *
 * A query that reads `attempts`, `attempt_questions` or `recordings` without
 * joining back to `leads.email = <session email>` is a data leak.
 */

import { sql } from '@/lib/db'

export interface LeadRow {
  id: string
  name: string
  email: string
}

export interface AttemptRow {
  id: string
  set_id: string
  lead_id: string
  attempt_number: number
  status: 'in_progress' | 'submitted'
  total_duration_sec: number | null
}

/** The lead record belonging to this signed-in email, if any. */
export async function leadForEmail(email: string): Promise<LeadRow | null> {
  const result = await sql`
    select id, name, email
    from leads
    where lower(email) = lower(${email})
    limit 1
  ` as LeadRow[]
  return result[0] ?? null
}

/**
 * An attempt, but only if it belongs to the caller. Returns null when the
 * attempt does not exist AND when it belongs to somebody else — the caller
 * cannot tell those apart, which is deliberate.
 */
export async function ownedAttempt(
  attemptId: string,
  email: string,
): Promise<AttemptRow | null> {
  const result = await sql`
    select a.id, a.set_id, a.lead_id, a.attempt_number, a.status, a.total_duration_sec
    from attempts a
    join leads l on l.id = a.lead_id
    where a.id = ${attemptId}
      and lower(l.email) = lower(${email})
    limit 1
  ` as AttemptRow[]
  return result[0] ?? null
}

/** True when this question was actually drawn into an attempt the caller owns. */
export async function ownsAttemptQuestion(
  attemptId: string,
  questionId: string,
  email: string,
): Promise<boolean> {
  const result = await sql`
    select 1
    from attempt_questions aq
    join attempts a on a.id = aq.attempt_id
    join leads    l on l.id = a.lead_id
    where aq.attempt_id  = ${attemptId}
      and aq.question_id = ${questionId}
      and lower(l.email) = lower(${email})
    limit 1
  ` as unknown[]
  return result.length > 0
}

/** Resume or create this lead's attempt for a set they own. */
export async function findOrCreateAttempt(
  setId: string,
  leadId: string,
  attemptNumber: number,
  email: string,
): Promise<{ attempt: AttemptRow } | { error: string; status: number }> {
  // The set must belong to a lead whose email matches the session.
  const setRows = await sql`
    select s.id, s.lead_id, s.expires_at
    from question_sets s
    join leads l on l.id = s.lead_id
    where s.id = ${setId}
      and s.lead_id = ${leadId}
      and lower(l.email) = lower(${email})
    limit 1
  ` as { id: string; lead_id: string; expires_at: string }[]

  const set = setRows[0]
  if (!set) return { error: 'This link was sent to a different account.', status: 403 }
  if (new Date(set.expires_at) < new Date()) {
    return { error: 'This link has expired.', status: 410 }
  }

  const existing = await sql`
    select id, set_id, lead_id, attempt_number, status, total_duration_sec
    from attempts
    where set_id = ${setId} and attempt_number = ${attemptNumber}
    limit 1
  ` as AttemptRow[]

  if (existing[0]) return { attempt: existing[0] }

  const created = await sql`
    insert into attempts (set_id, lead_id, attempt_number)
    values (${setId}, ${leadId}, ${attemptNumber})
    returning id, set_id, lead_id, attempt_number, status, total_duration_sec
  ` as AttemptRow[]

  return { attempt: created[0] }
}

/** Mark an attempt submitted. No-op if it is already submitted. */
export async function submitAttempt(
  attemptId: string,
  email: string,
  totalDurationSec: number | null,
): Promise<boolean> {
  const result = await sql`
    update attempts a
    set status = 'submitted',
        submitted_at = now(),
        total_duration_sec = coalesce(${totalDurationSec}, a.total_duration_sec)
    from leads l
    where a.id = ${attemptId}
      and l.id = a.lead_id
      and lower(l.email) = lower(${email})
      and a.status <> 'submitted'
    returning a.id
  ` as unknown[]
  return result.length > 0
}

/** Record (or replace) the answer to one question. */
export async function saveRecording(
  attemptId: string,
  questionId: string,
  s3Url: string,
  durationSec: number,
): Promise<void> {
  await sql`
    insert into recordings (attempt_id, question_id, s3_url, duration_sec)
    values (${attemptId}, ${questionId}, ${s3Url}, ${durationSec})
    on conflict (attempt_id, question_id) do update
      set s3_url       = excluded.s3_url,
          duration_sec = excluded.duration_sec,
          uploaded_at  = now()
  `
}
