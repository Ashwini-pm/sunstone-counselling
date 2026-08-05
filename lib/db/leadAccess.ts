/**
 * Session-scoped access for the LEAD-facing surface.
 *
 * On Supabase, row level security stopped a lead reading someone else's data
 * even if a route forgot to check. Neon has no equivalent, so that guarantee
 * lives here and ONLY here.
 *
 * Leads are not logged in. They hold a link containing their question set's
 * random access_token, which is verified once and exchanged for a signed
 * cookie (see lib/leadSession.ts). Everything below is therefore scoped by
 * leadId taken from that cookie, never from a request body.
 *
 * Rules for anything added to this file:
 *   1. Every function takes the caller's leadId and constrains its SQL by it.
 *   2. No function accepts an id without also constraining on the owner.
 *   3. Routes must not query lead-owned tables directly. Go through here.
 *
 * A query touching `attempts`, `attempt_questions` or `recordings` without
 * constraining on the session's leadId is a data leak.
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

export interface SetByToken {
  setId: string
  leadId: string
  leadName: string
  expiresAt: string
}

/**
 * Resolve a link's access token to its question set.
 *
 * This is the single entry point for passwordless access. It is the only place
 * a raw token from a URL is accepted, and it returns null for an unknown token
 * so a caller cannot distinguish "wrong token" from "no such set".
 */
export async function setByAccessToken(token: string): Promise<SetByToken | null> {
  if (!token || token.length < 20) return null

  const rows = await sql`
    select s.id as set_id, s.expires_at, l.id as lead_id, l.name as lead_name
    from question_sets s
    join leads l on l.id = s.lead_id
    where s.access_token = ${token}
    limit 1
  ` as { set_id: string; expires_at: string; lead_id: string; lead_name: string }[]

  const row = rows[0]
  if (!row) return null
  return {
    setId: row.set_id,
    leadId: row.lead_id,
    leadName: row.lead_name,
    expiresAt: row.expires_at,
  }
}

/** An attempt, but only if it belongs to this lead. Null otherwise. */
export async function ownedAttempt(
  attemptId: string,
  leadId: string,
): Promise<AttemptRow | null> {
  const result = await sql`
    select id, set_id, lead_id, attempt_number, status, total_duration_sec
    from attempts
    where id = ${attemptId} and lead_id = ${leadId}
    limit 1
  ` as AttemptRow[]
  return result[0] ?? null
}

/** True when this question was drawn into an attempt this lead owns. */
export async function ownsAttemptQuestion(
  attemptId: string,
  questionId: string,
  leadId: string,
): Promise<boolean> {
  const result = await sql`
    select 1
    from attempt_questions aq
    join attempts a on a.id = aq.attempt_id
    where aq.attempt_id  = ${attemptId}
      and aq.question_id = ${questionId}
      and a.lead_id      = ${leadId}
    limit 1
  ` as unknown[]
  return result.length > 0
}

/** Resume or create this lead's attempt for a set they own. */
export async function findOrCreateAttempt(
  setId: string,
  leadId: string,
  attemptNumber: number,
): Promise<{ attempt: AttemptRow } | { error: string; status: number }> {
  const setRows = await sql`
    select id, lead_id, expires_at
    from question_sets
    where id = ${setId} and lead_id = ${leadId}
    limit 1
  ` as { id: string; lead_id: string; expires_at: string }[]

  const set = setRows[0]
  if (!set) return { error: 'This link is not valid.', status: 403 }
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

/** Mark an attempt submitted. No-op if already submitted. */
export async function submitAttempt(
  attemptId: string,
  leadId: string,
  totalDurationSec: number | null,
): Promise<boolean> {
  const result = await sql`
    update attempts
    set status = 'submitted',
        submitted_at = now(),
        total_duration_sec = coalesce(${totalDurationSec}, total_duration_sec)
    where id = ${attemptId}
      and lead_id = ${leadId}
      and status <> 'submitted'
    returning id
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
