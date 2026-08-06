# Analytics sheet

Google Sheet that mirrors the lead response funnel. `Code.gs` is the Apps Script
that fills it.

## Why it goes through the app

Apps Script cannot connect to Neon. Its JDBC service supports MySQL, SQL Server
and Oracle only, not Postgres. So the sheet pulls from
`GET /api/analytics/export` instead, which has three side benefits:

- the SQL lives in `lib/db/analytics.ts`, version-controlled and reviewable,
  rather than buried in a script attached to a spreadsheet
- the database password never goes near a Google Sheet
- one endpoint serves any other consumer later, not just this sheet

## Setup

1. **Add the key to Vercel.** Copy `ANALYTICS_API_KEY` from `.env.local` into
   the Vercel project's environment variables and redeploy. Without it the
   endpoint returns 401 to everyone, which is the intended default.
2. New Google Sheet ▸ Extensions ▸ Apps Script. Replace the contents with
   `Code.gs`. Save.
3. Run `setup()`. It prompts for the app URL and the key, then builds every tab
   and installs a 15 minute refresh trigger.
4. Reload the sheet. A **Sunstone** menu appears with a manual refresh.

The key is held in Script Properties, not in a cell. Anyone with view access to
a sheet can read its cells, and this key returns every lead's phone number plus
a playable link to their recorded video.

## Tabs

| Tab | What it holds |
|---|---|
| Summary | Headline numbers, open rate, completion rate, friction, device split |
| Cohorts | The funnel split by lead source (NSAT R1-R4, CSAT) |
| Funnel | Every stage with step conversion and how many were lost at each |
| Campaign Delivery | Manual entry. Sent / received / read, with conversions that self-calculate |
| Students | One row per lead: how far they got, where they stopped, status |
| Recordings | Every answer with a signed, playable video link |
| Analytics Data | The raw event log behind all of the above |

**Campaign Delivery is never overwritten by a refresh.** It holds hand-entered
numbers, so anything typed there survives.

## Two things the sheet will not tell you

**Delivery.** Nothing in this system knows whether a message was sent, received
or read. That lives in whatever tool does the sending. `link_opened` is the
first thing we can see, and it is the same moment a campaign tool calls a click.

**Analysis.** Answers are recorded, not analysed. The stage exists in the funnel
as a blank row so the gap is visible rather than forgotten.

## History

Stages measured from browser events only cover leads from **5 Aug 2026**, when
tracking was added. Stages measured from the database (opened, answered,
completed) cover everything. The Funnel tab labels which is which per row, so a
low number on an event-backed stage is not mistaken for a drop-off.
