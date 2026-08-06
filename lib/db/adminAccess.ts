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
  lead_cohort: string | null
  attempt_id: string | null
  attempt_number: number | null
  status: string | null
  answer_count: number
}

/**
 * Every link, for the dashboard table.
 *
 * There used to be a 200-row cap. The backlog import wrote its three cohorts in
 * file order, so the newest 200 rows were all one cohort and the other two tabs
 * read "No leads found" against a badge saying 36. A cap that silently changes
 * what a filter means is worse than no filter.
 *
 * The table paginates client-side, so the cost is the payload, not rendering:
 * roughly 250 bytes a row, so about 450 KB at 1,727 leads. Fine for an internal
 * page used by a handful of people, and the ceiling below stops it becoming a
 * surprise. Past that this needs server-side filtering per tab, not a bigger
 * number.
 */
export async function recentSets(limit = 5000): Promise<AdminSetRow[]> {
  return await sql`
    select
      s.id, s.access_token, s.created_at, s.expires_at,
      l.id as lead_id, l.name as lead_name, l.email as lead_email,
      l.source as lead_source, l.cohort as lead_cohort,
      a.id as attempt_id, a.attempt_number, a.status,
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
    order by
      -- Anyone who has started comes first: those are the rows worth reading.
      (a.id is null),
      s.created_at desc
    limit ${limit}
  ` as AdminSetRow[]
}

export interface DashboardStats {
  sent: number
  completed: number
  in_progress: number
  not_opened: number
}

/**
 * Real totals, counted by the database.
 *
 * The dashboard used to derive these by looping the recent-links list, so
 * "Links Sent" reported the page size and "Completed" only counted what
 * happened to fall inside that slice. A number that silently equals the page
 * size is worse than no number, because it looks plausible.
 */
export async function dashboardStats(): Promise<DashboardStats> {
  const rows = await sql`
    select
      count(*)::int as sent,
      count(*) filter (where a.status = 'submitted')::int   as completed,
      count(*) filter (where a.id is not null
                         and a.status <> 'submitted')::int  as in_progress,
      count(*) filter (where a.id is null)::int             as not_opened
    from question_sets s
    left join lateral (
      select id, status from attempts
      where set_id = s.id order by attempt_number desc limit 1
    ) a on true
  ` as DashboardStats[]
  return rows[0]
}

export interface CohortOption {
  key: string
  label: string
  total: number
  open: number
}

/**
 * The tabs, derived from the data instead of hardcoded.
 *
 * The bar used to list NSAT 1-4 and CSAT, which are `source` values. The
 * backlog import keys on `cohort` instead and leaves source null, so every one
 * of those tabs was empty for 1,720 leads while the only usable view was "All".
 * Building the list from what is actually in the table means it cannot drift
 * again the next time a campaign defines its own groups.
 *
 * Counted over every lead, not the 200 rows the table below loads.
 */
export async function cohortOptions(): Promise<CohortOption[]> {
  const rows = await sql`
    select
      coalesce(l.cohort, l.source, 'unassigned') as key,
      count(distinct s.id)::int as total,
      count(distinct s.id) filter (
        where a.id is not null and a.status <> 'submitted'
      )::int as open
    from leads l
    join question_sets s on s.lead_id = l.id
    left join lateral (
      select id, status from attempts
      where set_id = s.id order by attempt_number desc limit 1
    ) a on true
    group by coalesce(l.cohort, l.source, 'unassigned')
    order by key asc
  ` as { key: string; total: number; open: number }[]

  return rows.map(r => ({ ...r, label: r.key }))
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
  email: string | null
  phone10: string | null
  source: string | null
  city: string | null
  createdBy: string | null
}): Promise<{ leadId: string; setId: string; accessToken: string }> {
  // Conflicts on phone10, not email. 005 made the phone the identity of a lead
  // and 007 dropped the unique index on email, so the old ON CONFLICT (email)
  // now fails outright: Postgres needs a matching unique constraint and there
  // is none. Two students sharing one email address is ordinary in this data.
  const leadRows = await sql`
    insert into leads (name, email, phone10, source, city, created_by)
    values (
      ${input.name}, ${input.email}, ${input.phone10},
      ${input.source}, ${input.city}, ${input.createdBy}
    )
    on conflict (phone10) do update
      set name   = excluded.name,
          email  = coalesce(excluded.email,  leads.email),
          source = coalesce(excluded.source, leads.source),
          city   = coalesce(excluded.city,   leads.city)
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
