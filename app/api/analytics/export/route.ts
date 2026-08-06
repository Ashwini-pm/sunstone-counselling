import { timingSafeEqual } from 'node:crypto'
import { getS3SignedUrl } from '@/lib/s3'
import {
  summary, funnel, cohorts, leadRows, answerRows, eventRows, FUNNEL_STAGES,
} from '@/lib/db/analytics'

/**
 * GET /api/analytics/export  — everything the Google Sheet renders, as JSON.
 *
 * Read-only, and authenticated by a shared secret rather than by Google login,
 * because the caller is an Apps Script trigger with no human at the keyboard.
 * Send it as `x-analytics-key`, or as `?key=` when a header is inconvenient.
 *
 * This returns every lead's name, email, phone and a playable link to their
 * recorded video. It is the most sensitive endpoint in the app. The key is the
 * only thing protecting it, so it belongs in Apps Script's Script Properties,
 * never in a sheet cell, and the sheet itself should be shared as carefully as
 * the data in it.
 *
 * `?part=` fetches one dataset at a time. Apps Script has a 6 minute execution
 * limit and a 50 MB URL Fetch response cap, so once there are thousands of
 * leads the sheet pulls tab by tab rather than in one response.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorised(request: Request): boolean {
  const expected = process.env.ANALYTICS_API_KEY
  if (!expected) return false

  const url = new URL(request.url)
  const given = request.headers.get('x-analytics-key') ?? url.searchParams.get('key') ?? ''

  // Length must match before timingSafeEqual, which throws on a mismatch.
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Turn a stored object URL into one that will actually play.
 *
 * The bucket is private, so the plain https URL in `recordings.s3_url` returns
 * AccessDenied in a browser. Seven days is the maximum a SigV4 presigned URL
 * can live, and the sheet refreshes every 15 minutes, so links in the sheet
 * stay fresh. They remain playable by anyone holding the URL until they expire.
 */
async function playableUrl(s3Url: string): Promise<string> {
  try {
    const key = s3Url.split('.amazonaws.com/')[1]
    if (!key) return s3Url
    return await getS3SignedUrl(decodeURIComponent(key), 7 * 24 * 60 * 60)
  } catch {
    return s3Url
  }
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const part = new URL(request.url).searchParams.get('part') ?? 'all'
  const want = (name: string) => part === 'all' || part === name

  const payload: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    stages: FUNNEL_STAGES,
  }

  if (want('summary')) payload.summary = await summary()
  if (want('funnel')) payload.funnel = await funnel()
  if (want('cohorts')) payload.cohorts = await cohorts()
  if (want('leads')) payload.leads = await leadRows()
  if (want('events')) payload.events = await eventRows()

  if (want('answers')) {
    const answers = await answerRows()
    // Presigning is local signing, not an S3 round trip, so doing every row is
    // cheap even at a few thousand answers.
    payload.answers = await Promise.all(
      answers.map(async a => ({ ...a, playUrl: await playableUrl(a.s3_url) })),
    )
  }

  return Response.json(payload, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
