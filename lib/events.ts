/**
 * Funnel event logging.
 *
 * NOT a 'use server' file. Such a file may only export async functions, because
 * Turbopack rewrites every export into a server-action reference, so the const
 * array below would fail the production build even though tsc and ESLint pass.
 * That mistake has already broken three deploys here. The client imports only
 * the type and the name list; `logEvent` runs server-side.
 */

import { sql } from '@/lib/db'

/**
 * The allowed events, in rough funnel order. Must stay in step with the CHECK
 * constraint in db/migrations/004_attempt_events.sql: the database is the real
 * gate, this list is what stops a typo reaching it.
 */
export const EVENTS = [
  // Server-side. These two are the trustworthy spine of the funnel, because
  // they are written by our own code, not reported by a browser that may be
  // offline, backgrounded or closed.
  'link_opened',
  'attempt_submitted',

  // Client-side. A good signal, not an audit trail: a tab killed mid-flow
  // simply stops emitting, which is exactly what makes drop-off visible.
  'intro_viewed',
  'intro_accepted',
  'camera_requested',
  'camera_autostart',
  'camera_granted',
  'camera_denied',
  'mic_not_detected',
  'wizard_completed',
  'question_started',
  'question_heard',
  'recording_started',
  'recording_stopped',
  'upload_started',
  'upload_succeeded',
  'upload_failed',
  'closing_played',
] as const

export type EventName = (typeof EVENTS)[number]

export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && (EVENTS as readonly string[]).includes(value)
}

/**
 * Per-attempt row cap. Any real sitting emits well under a hundred events, so
 * this only ever catches a loop or someone hammering the endpoint. Without it a
 * public write path can grow the table without bound.
 */
export const MAX_EVENTS_PER_ATTEMPT = 400

/** Cap on serialised meta, so the column cannot be used as free storage. */
const MAX_META_BYTES = 2000

export function trimMeta(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const json = JSON.stringify(meta)
  if (json.length > MAX_META_BYTES) return { truncated: true }
  return meta as Record<string, unknown>
}

/**
 * Classify the device from the User-Agent header.
 *
 * Deliberately crude. The only question this needs to answer is whether the
 * funnel behaves differently on a phone than on a desktop, and a rough bucket
 * answers it. Nothing here fingerprints anyone.
 */
export function deviceFromUserAgent(ua: string | null): Record<string, string> {
  if (!ua) return { device: 'unknown' }

  const isTablet = /iPad|Tablet/i.test(ua)
  const isMobile = !isTablet && /Mobi|Android|iPhone/i.test(ua)

  const browser =
    /EdgA?\//.test(ua) ? 'edge'
    : /OPR\/|Opera/.test(ua) ? 'opera'
    // Chrome must be tested before Safari: Chrome's UA also contains "Safari".
    : /Chrome\//.test(ua) ? 'chrome'
    : /Firefox\//.test(ua) ? 'firefox'
    : /Safari\//.test(ua) ? 'safari'
    : 'other'

  const os =
    /Android/.test(ua) ? 'android'
    : /iPhone|iPad|iPod/.test(ua) ? 'ios'
    : /Windows/.test(ua) ? 'windows'
    : /Mac OS X/.test(ua) ? 'macos'
    : /Linux/.test(ua) ? 'linux'
    : 'other'

  return { device: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop', browser, os }
}

interface LogInput {
  attemptId: string
  leadId: string
  event: EventName
  questionId?: string | null
  position?: number | null
  meta?: unknown
}

/**
 * Write one event.
 *
 * Never throws. Analytics is not worth failing a lead's recording over, so a
 * logging fault is swallowed and reported to the server console rather than
 * propagated to the caller. Every call site treats this as fire and forget.
 */
export async function logEvent(input: LogInput): Promise<void> {
  try {
    await sql`
      insert into attempt_events (attempt_id, lead_id, event, question_id, position, meta)
      select ${input.attemptId}, ${input.leadId}, ${input.event},
             ${input.questionId ?? null}, ${input.position ?? null},
             ${JSON.stringify(trimMeta(input.meta))}::jsonb
      where (
        select count(*) from attempt_events where attempt_id = ${input.attemptId}
      ) < ${MAX_EVENTS_PER_ATTEMPT}
    `
  } catch (err) {
    console.error('[events] failed to log', input.event, err)
  }
}
