/**
 * Data access for the ADMIN surface.
 *
 * Every function here assumes the caller has already been proven to be an ops
 * admin via `currentAdmin()`. These are unscoped reads across all leads, so
 * calling one without that check exposes the whole table.
 */

import { sql } from '@/lib/db'

export interface AdminSetRow {
  id: string
  access_token: string
  created_at: string
  expires_at: string
  lead_id: string | null
  lead_name: string | null
  lead_email: string | null
  lead_source: string | null
  attempt_id: string | null
  attempt_number: number | null
  status: string | null
  answer_count: number
}

/** Recent links, newest first, with how far each lead got. */
export async function recentSets(limit = 200): Promise<AdminSetRow[]> {
  return await sql`
    select
      s.id,
      s.access_token,
      s.created_at,
      s.expires_at,
      l.id    as lead_id,
      l.name  as lead_name,
      l.email as lead_email,
      l.source as lead_source,
      a.id    as attempt_id,
      a.attempt_number,
      a.status,
      coalesce(r.cnt, 0)::int as answer_count
    from question_sets s
    left join leads l on l.id = s.lead_id
    left join lateral (
      select * from attempts
      where set_id = s.id
      order by attempt_number desc
      limit 1
    ) a on true
    left join lateral (
      select count(*) as cnt from recordings where attempt_id = a.id
    ) r on true
    order by s.created_at desc
    limit ${limit}
  ` as AdminSetRow[]
}

export async function bankStatus() {
  const result = await sql`
    select
      count(*)::int                                    as total,
      count(distinct position_group)::int              as groups,
      count(*) filter (where avatar_url is null)::int  as missing_avatar
    from questions
    where active
  ` as { total: number; groups: number; missing_avatar: number }[]

  const row = result[0]
  return {
    total: row?.total ?? 0,
    groups: row?.groups ?? 0,
    missingAvatar: row?.missing_avatar ?? 0,
  }
}

/** Create or update a lead, then issue them a question set. */
export async function createLeadAndSet(input: {
  name: string
  email: string
  phone10: string | null
  source: string | null
  city: string | null
  createdBy: string | null
}): Promise<{ leadId: string; setId: string; accessToken: string }> {
  const leadRows = await sql`
    insert into leads (name, email, phone10, source, city, created_by)
    values (
      ${input.name}, ${input.email}, ${input.phone10},
      ${input.source}, ${input.city}, ${input.createdBy}
    )
    on conflict (email) do update
      set name    = excluded.name,
          phone10 = coalesce(excluded.phone10, leads.phone10),
          source  = coalesce(excluded.source, leads.source),
          city    = coalesce(excluded.city, leads.city)
    returning id
  ` as { id: string }[]

  const leadId = leadRows[0].id

  const setRows = await sql`
    insert into question_sets (lead_id, created_by)
    values (${leadId}, ${input.createdBy})
    returning id, access_token
  ` as { id: string; access_token: string }[]

  return { leadId, setId: setRows[0].id, accessToken: setRows[0].access_token }
}

export interface AdminAnswerRow {
  question_id: string
  position: number
  content: string
  s3_url: string | null
  duration_sec: number | null
}

export async function attemptDetail(attemptId: string) {
  const attemptRows = await sql`
    select a.id, a.status, a.attempt_number, a.total_duration_sec, a.lead_id,
           l.name as lead_name, l.email as lead_email, l.source as lead_source
    from attempts a
    join leads l on l.id = a.lead_id
    where a.id = ${attemptId}
    limit 1
  ` as {
    id: string; status: string; attempt_number: number
    total_duration_sec: number | null; lead_id: string
    lead_name: string; lead_email: string; lead_source: string | null
  }[]

  const attempt = attemptRows[0]
  if (!attempt) return null

  const answers = await sql`
    select aq.question_id, aq.position, q.content,
           r.s3_url, r.duration_sec
    from attempt_questions aq
    join questions q on q.id = aq.question_id
    left join recordings r
      on r.attempt_id = aq.attempt_id and r.question_id = aq.question_id
    where aq.attempt_id = ${attemptId}
    order by aq.position asc
  ` as AdminAnswerRow[]

  return { attempt, answers }
}

export async function leadProfile(leadId: string) {
  const leadRows = await sql`
    select id, name, email, phone10, source, city, created_at
    from leads where id = ${leadId} limit 1
  ` as {
    id: string; name: string; email: string; phone10: string | null
    source: string | null; city: string | null; created_at: string
  }[]

  const lead = leadRows[0]
  if (!lead) return null

  const sets = await sql`
    select
      s.id, s.created_at, s.expires_at,
      a.id as attempt_id, a.status, a.total_duration_sec,
      coalesce(r.cnt, 0)::int as answer_count
    from question_sets s
    left join lateral (
      select * from attempts where set_id = s.id
      order by attempt_number desc limit 1
    ) a on true
    left join lateral (
      select count(*) as cnt from recordings where attempt_id = a.id
    ) r on true
    where s.lead_id = ${leadId}
    order by s.created_at desc
  ` as {
    id: string; created_at: string; expires_at: string
    attempt_id: string | null; status: string | null
    total_duration_sec: number | null; answer_count: number
  }[]

  return { lead, sets }
}
