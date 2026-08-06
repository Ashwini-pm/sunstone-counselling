/**
 * Every query behind the analytics sheet.
 *
 * All of it lives here rather than in Apps Script on purpose. SQL in a Google
 * Sheet is invisible to code review, impossible to diff, and gets edited by
 * whoever has the tab open. Here it is version-controlled and the sheet stays a
 * dumb renderer of whatever this returns.
 *
 * Two halves to the funnel, and the distinction matters when reading it:
 *
 *   Delivery  (sent, received, read)  lives in whatever tool sends the message.
 *                                     We have none of it. Not modelled here.
 *   Response  (opened onwards)        ours, fully instrumented.
 *
 * "Clicked" in campaign language is `link_opened` here. They are the same event
 * seen from two sides, and it is the join between the two halves.
 */

import { sql } from '@/lib/db'

/**
 * The response funnel, in order.
 *
 * `source` matters. Three of these stages are recorded in the core tables and
 * therefore have full history; the rest exist only as client events, which
 * began on 5 Aug 2026. Reading an event-backed stage as if it covered all time
 * understates it, so the sheet shows which is which rather than quietly mixing
 * them. Every stage uses the most reliable source available to it: an attempts
 * row cannot fail to be written, a browser ping can.
 */
export const FUNNEL_STAGES: { key: string; label: string; source: 'table' | 'event' }[] = [
  { key: 'opened',       label: 'Opened the link',       source: 'table' },
  { key: 'intro_viewed', label: 'Saw the intro',         source: 'event' },
  { key: 'started',      label: 'Started',               source: 'event' },
  { key: 'camera_ask',   label: 'Reached camera prompt', source: 'event' },
  { key: 'camera_ok',    label: 'Allowed camera',        source: 'event' },
  { key: 'in_call',      label: 'Entered the call',      source: 'event' },
  { key: 'q1',           label: 'Reached question 1',    source: 'event' },
  { key: 'answered',     label: 'Recorded an answer',    source: 'table' },
  { key: 'completed',    label: 'Completed',             source: 'table' },
]

export interface FunnelRow {
  key: string
  label: string
  source: 'table' | 'event'
  leads: number
}

/**
 * Counts distinct attempts, never rows. link_opened fires on every refresh and
 * recording_started fires once per question, so counting rows would report more
 * people at the bottom of the funnel than at the top.
 */
export async function funnel(): Promise<FunnelRow[]> {
  const rows = await sql`
    select
      (select count(*) from attempts)::int as opened,
      (select count(*) from attempts where status = 'submitted')::int as completed,
      (select count(distinct attempt_id) from recordings)::int as answered,
      (select count(distinct attempt_id) from attempt_events where event = 'intro_viewed')::int      as intro_viewed,
      (select count(distinct attempt_id) from attempt_events where event = 'intro_accepted')::int    as started,
      (select count(distinct attempt_id) from attempt_events where event = 'camera_requested')::int  as camera_ask,
      (select count(distinct attempt_id) from attempt_events where event = 'camera_granted')::int    as camera_ok,
      (select count(distinct attempt_id) from attempt_events where event = 'wizard_completed')::int  as in_call,
      (select count(distinct attempt_id) from attempt_events where event = 'question_started')::int  as q1
  ` as Record<string, number>[]

  const counts = rows[0] ?? {}
  return FUNNEL_STAGES.map(s => ({ ...s, leads: counts[s.key] ?? 0 }))
}

export interface CohortRow {
  source: string
  leads: number
  links_sent: number
  opened: number
  started: number
  camera_ok: number
  answered: number
  completed: number
}

/**
 * The same funnel split by lead source, which is the only cohort dimension
 * asked for. `links_sent` counts issued links, not messages delivered: we do
 * not know whether anything was actually delivered.
 */
export async function cohorts(): Promise<CohortRow[]> {
  return await sql`
    select
      coalesce(l.source, 'unknown') as source,
      count(distinct l.id)::int as leads,
      count(distinct s.id)::int as links_sent,
      -- An attempts row is written when the link is opened, so it needs no
      -- client ping and covers every lead since the app went live.
      count(distinct a.id)::int as opened,
      count(distinct a.id) filter (
        where exists (select 1 from attempt_events e
                      where e.attempt_id = a.id and e.event = 'intro_accepted')
      )::int as started,
      count(distinct a.id) filter (
        where exists (select 1 from attempt_events e
                      where e.attempt_id = a.id and e.event = 'camera_granted')
      )::int as camera_ok,
      count(distinct a.id) filter (
        where exists (select 1 from recordings r where r.attempt_id = a.id)
      )::int as answered,
      count(distinct a.id) filter (where a.status = 'submitted')::int as completed
    from leads l
    left join question_sets s on s.lead_id = l.id
    left join attempts a on a.set_id = s.id
    group by coalesce(l.source, 'unknown')
    order by leads desc
  ` as CohortRow[]
}

export interface LeadRow {
  lead_id: string
  name: string
  email: string
  phone10: string | null
  source: string | null
  city: string | null
  link_created: string | null
  attempt_id: string | null
  status: string | null
  opened_at: string | null
  device: string | null
  browser: string | null
  answers: number
  last_stage: string | null
  last_stage_at: string | null
  furthest_question: number | null
  submitted_at: string | null
  total_duration_sec: number | null
}

/**
 * One row per lead: where they got to and when they stopped.
 *
 * `last_stage` is the whole point. Abandonment is not recorded as an event, it
 * is the absence of the next one, so the last event on an attempt IS the answer
 * to "where did this person drop".
 */
export async function leadRows(limit = 5000): Promise<LeadRow[]> {
  return await sql`
    select
      l.id as lead_id, l.name, l.email, l.phone10, l.source, l.city,
      s.created_at as link_created,
      a.id as attempt_id, a.status, a.submitted_at, a.total_duration_sec,
      o.at   as opened_at,
      o.meta ->> 'device'  as device,
      o.meta ->> 'browser' as browser,
      coalesce(r.cnt, 0)::int as answers,
      last_ev.event as last_stage,
      last_ev.at    as last_stage_at,
      q.furthest::int as furthest_question
    from leads l
    left join lateral (
      select * from question_sets where lead_id = l.id
      order by created_at desc limit 1
    ) s on true
    left join lateral (
      select * from attempts where set_id = s.id
      order by attempt_number desc limit 1
    ) a on true
    left join lateral (
      select at, meta from attempt_events
      where attempt_id = a.id and event = 'link_opened'
      order by at asc limit 1
    ) o on true
    left join lateral (
      select event, at from attempt_events
      where attempt_id = a.id order by at desc limit 1
    ) last_ev on true
    left join lateral (
      select max(position) as furthest from attempt_events
      where attempt_id = a.id and event = 'question_started'
    ) q on true
    left join lateral (
      select count(*) as cnt from recordings where attempt_id = a.id
    ) r on true
    order by s.created_at desc nulls last
    limit ${limit}
  ` as LeadRow[]
}

export interface AnswerRow {
  lead_name: string
  lead_email: string
  phone10: string | null
  source: string | null
  attempt_id: string
  position: number
  question: string
  duration_sec: number | null
  uploaded_at: string
  s3_url: string
}

/** Every recorded answer, for the per-student recordings tab. */
export async function answerRows(limit = 20000): Promise<AnswerRow[]> {
  return await sql`
    select
      l.name as lead_name, l.email as lead_email, l.phone10, l.source,
      r.attempt_id, aq.position, q.content as question,
      r.duration_sec, r.uploaded_at, r.s3_url
    from recordings r
    join attempts a on a.id = r.attempt_id
    join leads l on l.id = a.lead_id
    join questions q on q.id = r.question_id
    left join attempt_questions aq
      on aq.attempt_id = r.attempt_id and aq.question_id = r.question_id
    order by r.uploaded_at desc
    limit ${limit}
  ` as AnswerRow[]
}

export interface EventRow {
  at: string
  lead_email: string
  source: string | null
  event: string
  position: number | null
  meta: Record<string, unknown> | null
}

/** Raw event log, newest first. The audit trail behind every other tab. */
export async function eventRows(limit = 20000): Promise<EventRow[]> {
  return await sql`
    select e.at, l.email as lead_email, l.source, e.event, e.position, e.meta
    from attempt_events e
    join leads l on l.id = e.lead_id
    order by e.at desc
    limit ${limit}
  ` as EventRow[]
}

export interface Summary {
  leads: number
  links_sent: number
  opened: number
  started: number
  completed: number
  answers: number
  failed_uploads: number
  camera_denied: number
  mobile: number
  desktop: number
  median_completion_sec: number | null
}

export async function summary(): Promise<Summary> {
  const rows = await sql`
    select
      (select count(*) from leads)::int                                as leads,
      (select count(*) from question_sets)::int                        as links_sent,
      -- The attempts row, not the link_opened event: it is written server-side
      -- on every open and covers leads from before tracking existed, so it
      -- agrees with the Funnel tab instead of quietly undercounting.
      (select count(*) from attempts)::int                             as opened,
      (select count(distinct attempt_id) from attempt_events
        where event = 'intro_accepted')::int                           as started,
      (select count(*) from attempts where status = 'submitted')::int  as completed,
      (select count(*) from recordings)::int                           as answers,
      (select count(*) from attempt_events
        where event = 'upload_failed')::int                            as failed_uploads,
      (select count(distinct attempt_id) from attempt_events
        where event = 'camera_denied')::int                            as camera_denied,
      (select count(distinct attempt_id) from attempt_events
        where event = 'link_opened' and meta ->> 'device' = 'mobile')::int  as mobile,
      (select count(distinct attempt_id) from attempt_events
        where event = 'link_opened' and meta ->> 'device' = 'desktop')::int as desktop,
      (select percentile_cont(0.5) within group (order by total_duration_sec)
        from attempts where status = 'submitted' and total_duration_sec is not null)
                                                                       as median_completion_sec
  ` as Summary[]
  return rows[0]
}
