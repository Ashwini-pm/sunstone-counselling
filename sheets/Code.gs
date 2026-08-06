/**
 * Sunstone Lead Response Center — analytics sheet.
 *
 * Pulls from the app's /api/analytics/export endpoint and renders it across
 * tabs. Deliberately a dumb renderer: every query lives in the repo, in
 * lib/db/analytics.ts, so the numbers can be reviewed and diffed. Nothing here
 * computes a metric from raw rows except the conversion percentages.
 *
 * Apps Script cannot reach Neon directly. Its JDBC service supports MySQL, SQL
 * Server and Oracle only, not Postgres, which is why this goes through the app.
 *
 * ── Setup ─────────────────────────────────────────────────────────────────
 *   1. Extensions ▸ Apps Script, paste this file, save.
 *   2. Run `setup()` once. It will prompt for the base URL and the API key.
 *      The key goes into Script Properties, NOT a cell: anyone with view access
 *      to the sheet can read cells, and that key returns every lead's phone
 *      number and a playable link to their video.
 *   3. Reload the sheet. A "Sunstone" menu appears.
 *
 * Refresh runs every 15 minutes once setup() has installed the trigger.
 */

var PROP_URL = 'ANALYTICS_BASE_URL'
var PROP_KEY = 'ANALYTICS_API_KEY'
var PROP_SHEET = 'ANALYTICS_SHEET_ID'

var TAB = {
  summary: 'Summary',
  cohorts: 'Cohorts',
  funnel: 'Funnel',
  delivery: 'Campaign Delivery',
  students: 'Students',
  events: 'Analytics Data',
  answers: 'Recordings',
}

var BRAND = '#0b1220'      // header background
var BRAND_TEXT = '#ffffff'
var MUTED = '#64748b'
var WARN_BG = '#fef3c7'    // the "we do not have this data" band

// ── menu ─────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Sunstone')
    .addItem('Refresh now', 'refreshAll')
    .addSeparator()
    .addItem('Set API URL and key', 'setup')
    .addItem('Install 15-minute refresh', 'installTrigger')
    .addItem('Remove auto refresh', 'removeTriggers')
    .addToUi()
}

function setup() {
  var ui = SpreadsheetApp.getUi()
  var props = PropertiesService.getScriptProperties()

  var urlAnswer = ui.prompt(
    'App URL',
    'Base URL of the app, no trailing slash.\ne.g. https://sunstone-counselling-xi.vercel.app',
    ui.ButtonSet.OK_CANCEL)
  if (urlAnswer.getSelectedButton() !== ui.Button.OK) return

  var keyAnswer = ui.prompt(
    'API key',
    'The ANALYTICS_API_KEY value from the app environment.\n' +
    'Stored in Script Properties, never in a cell.',
    ui.ButtonSet.OK_CANCEL)
  if (keyAnswer.getSelectedButton() !== ui.Button.OK) return

  props.setProperty(PROP_URL, urlAnswer.getResponseText().trim().replace(/\/+$/, ''))
  props.setProperty(PROP_KEY, keyAnswer.getResponseText().trim())
  props.setProperty(PROP_SHEET, SpreadsheetApp.getActiveSpreadsheet().getId())

  installTrigger()
  refreshAll()
  ui.alert('Connected. Tabs built and a 15-minute refresh is installed.')
}

function installTrigger() {
  removeTriggers()
  ScriptApp.newTrigger('refreshAll').timeBased().everyMinutes(15).create()
}

function removeTriggers() {
  var all = ScriptApp.getProjectTriggers()
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'refreshAll') ScriptApp.deleteTrigger(all[i])
  }
}

// ── fetch ────────────────────────────────────────────────────────────────────

/**
 * The spreadsheet to write to.
 *
 * getActiveSpreadsheet() only works when a human has the sheet open. Fired from
 * the 15 minute trigger it returns null, which is why the scheduled refresh
 * failed while the menu one worked. The id is recorded on every interactive
 * run, so the trigger can resolve the same file.
 */
function book() {
  var active = SpreadsheetApp.getActiveSpreadsheet()
  if (active) {
    PropertiesService.getScriptProperties().setProperty(PROP_SHEET, active.getId())
    return active
  }
  var id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET)
  if (id) return SpreadsheetApp.openById(id)
  throw new Error('No spreadsheet. Open the sheet and run Sunstone > Refresh now once.')
}

function fetchPart(part) {
  var props = PropertiesService.getScriptProperties()
  var base = props.getProperty(PROP_URL)
  var key = props.getProperty(PROP_KEY)
  if (!base || !key) throw new Error('Not configured. Run Sunstone ▸ Set API URL and key.')

  var res = UrlFetchApp.fetch(base + '/api/analytics/export?part=' + encodeURIComponent(part), {
    method: 'get',
    headers: { 'x-analytics-key': key },
    muteHttpExceptions: true,
  })

  var code = res.getResponseCode()
  if (code === 401) throw new Error('Rejected (401). The API key does not match the app.')
  if (code !== 200) throw new Error('Export failed (' + code + '): ' + res.getContentText().slice(0, 300))

  return JSON.parse(res.getContentText())
}

/**
 * Pulled tab by tab rather than in one response. Apps Script caps a script run
 * at 6 minutes and a single fetch response at 50 MB, and the events tab alone
 * will outgrow that long before the leads tab does.
 */
function refreshAll() {
  Logger.log('refreshAll starting')
  var ss = book()
  var stamp = new Date()

  buildSummary(ss, fetchPart('summary').summary, stamp)
  buildFunnel(ss, fetchPart('funnel').funnel)
  buildCohorts(ss, fetchPart('cohorts').cohorts)
  buildDelivery(ss)
  buildStudents(ss, fetchPart('leads').leads)
  buildAnswers(ss, fetchPart('answers').answers)
  buildEvents(ss, fetchPart('events').events)

  orderTabs(ss)
}

// ── tabs ─────────────────────────────────────────────────────────────────────

function buildSummary(ss, s, stamp) {
  ss = ss || book()
  var sh = resetSheet(ss, TAB.summary)

  var openRate = pct(s.opened, s.links_sent)
  var completeOfOpened = pct(s.completed, s.opened)
  var completeOfSent = pct(s.completed, s.links_sent)

  var rows = [
    ['Sunstone Lead Response Center', ''],
    ['Last refreshed', Utilities.formatDate(stamp, 'Asia/Kolkata', 'd MMM yyyy, HH:mm') + ' IST'],
    ['', ''],
    ['REACH', ''],
    ['Leads in the system', s.leads],
    ['Links issued', s.links_sent],
    ['Opened their link', s.opened],
    ['Open rate (of links issued)', openRate],
    ['', ''],
    ['COMPLETION', ''],
    ['Started (past the intro)', s.started],
    ['Completed all questions', s.completed],
    ['Completion rate (of those who opened)', completeOfOpened],
    ['Completion rate (of links issued)', completeOfSent],
    ['Answers recorded', s.answers],
    ['Median time to complete', s.median_completion_sec ? mmss(s.median_completion_sec) : 'n/a'],
    ['', ''],
    ['FRICTION', ''],
    ['Blocked at the camera prompt', s.camera_denied],
    ['Failed uploads', s.failed_uploads],
    ['', ''],
    ['DEVICE', ''],
    ['On a phone', s.mobile],
    ['On a desktop', s.desktop],
    ['', ''],
    ['NOT MEASURED HERE', ''],
    ['Sent / received / read', 'Lives in the sending tool. See Campaign Delivery.'],
    ['Analysed', 'Answer analysis is not built yet.'],
  ]

  sh.getRange(1, 1, rows.length, 2).setValues(rows)

  sh.getRange('A1:B1').merge().setBackground(BRAND).setFontColor(BRAND_TEXT)
    .setFontSize(14).setFontWeight('bold').setVerticalAlignment('middle')
  sh.setRowHeight(1, 36)
  sh.getRange('A2:B2').setFontColor(MUTED).setFontStyle('italic')

  // Section headers
  var sections = [4, 10, 18, 22, 26]
  for (var i = 0; i < sections.length; i++) {
    sh.getRange(sections[i], 1, 1, 2).setFontWeight('bold').setBackground('#f1f5f9')
  }
  sh.getRange(27, 1, 2, 2).setBackground(WARN_BG)

  sh.getRange('A1:A').setFontWeight('bold')
  sh.getRange('B5:B7').setNumberFormat('#,##0')
  sh.getRange('B11:B12').setNumberFormat('#,##0')
  sh.getRange('B15').setNumberFormat('#,##0')
  sh.setColumnWidth(1, 300)
  sh.setColumnWidth(2, 320)
  sh.setFrozenRows(2)
}

function buildFunnel(ss, funnel) {
  ss = ss || book()
  var sh = resetSheet(ss, TAB.funnel)

  var header = ['Stage', 'Leads', '% of those who opened', '% of previous step',
                'Lost here', 'Measured from']
  var rows = []

  // Delivery half. We hold none of it, so it is shown as an explicit gap
  // rather than omitted, otherwise the funnel silently starts halfway down.
  rows.push(['Sent', '', '', '', '', 'Not measured, see Campaign Delivery'])
  rows.push(['Received', '', '', '', '', 'Not measured, see Campaign Delivery'])
  rows.push(['Read', '', '', '', '', 'Not measured, see Campaign Delivery'])

  var opened = funnel.length ? funnel[0].leads : 0
  for (var i = 0; i < funnel.length; i++) {
    var cur = funnel[i].leads
    var prev = i === 0 ? cur : funnel[i - 1].leads
    rows.push([
      funnel[i].label,
      cur,
      pct(cur, opened),
      i === 0 ? '' : pct(cur, prev),
      i === 0 ? '' : Math.max(0, prev - cur),
      funnel[i].source === 'table'
        ? 'Database, full history'
        : 'Browser event, from 5 Aug 2026',
    ])
  }
  rows.push(['Analysed', '', '', '', '', 'Not built yet'])

  sh.getRange(1, 1, 1, header.length).setValues([header])
  sh.getRange(2, 1, rows.length, header.length).setValues(rows)

  styleHeader(sh, header.length)
  sh.getRange(2, 1, 3, header.length).setBackground(WARN_BG)
  sh.getRange(rows.length + 1, 1, 1, header.length).setBackground(WARN_BG)
  sh.getRange(2, 2, rows.length, 1).setNumberFormat('#,##0')
  sh.getRange(2, 5, rows.length, 1).setNumberFormat('#,##0')
  sh.getRange(2, 6, rows.length, 1).setFontColor(MUTED).setFontSize(9)

  note(sh, rows.length + 3,
    'Sent, Received, Read and Analysed are blank because this system does not ' +
    'hold that data. Sending happens in another tool and answer analysis is not ' +
    'built yet. "Opened the link" is the same moment a campaign tool calls a click. ' +
    'Stages measured from browser events only cover leads since 5 Aug 2026, when ' +
    'tracking was added; database-backed stages cover everything.')

  sh.setColumnWidth(1, 220)
  sh.setColumnWidth(6, 240)
  sh.setFrozenRows(1)
}

/**
 * One row per student: how far they got and when they stopped.
 *
 * The operational tab. "Stopped at" is the last thing they did, which for
 * anyone who did not complete is exactly where they dropped out.
 */
function buildStudents(ss, leads) {
  ss = ss || book()
  var sh = resetSheet(ss, TAB.students)

  var header = ['Student', 'Email', 'Phone', 'Cohort', 'Link issued', 'Opened',
                'Device', 'Answers', 'Furthest Q', 'Stopped at', 'Last seen',
                'Status', 'Time taken']
  var rows = []
  for (var i = 0; i < leads.length; i++) {
    var d = leads[i]
    rows.push([
      d.name, d.email, d.phone10 || '', labelCohort(d.cohort || d.source),
      istDate(d.link_created),
      d.opened_at ? istDate(d.opened_at) : (d.attempt_id ? 'Yes' : 'Not opened'),
      d.device || '', d.answers, d.furthest_question || '',
      stageLabel(d.last_stage), istDate(d.last_stage_at),
      d.status === 'submitted' ? 'Completed'
        : d.attempt_id ? 'Dropped off' : 'Never opened',
      d.total_duration_sec ? mmss(d.total_duration_sec) : '',
    ])
  }
  if (!rows.length) rows.push(['No leads yet', '', '', '', '', '', '', '', '', '', '', '', ''])

  sh.getRange(1, 1, 1, header.length).setValues([header])
  sh.getRange(2, 1, rows.length, header.length).setValues(rows)

  styleHeader(sh, header.length)

  // Colour the status column so a scan finds the drop-offs.
  var statusCol = sh.getRange(2, 12, rows.length, 1)
  var rules = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Completed')
      .setBackground('#dcfce7').setRanges([statusCol]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Dropped off')
      .setBackground('#fee2e2').setRanges([statusCol]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Never opened')
      .setBackground('#f1f5f9').setRanges([statusCol]).build(),
  ]
  sh.setConditionalFormatRules(rules)

  sh.setColumnWidth(2, 220)
  sh.setColumnWidth(4, 230)
  sh.setColumnWidth(10, 190)
  sh.setFrozenRows(1)
  sh.setFrozenColumns(1)
  // Guarded too: one exception here aborts the whole refresh, and a filter
  // added by hand would not have gone through resetSheet.
  if (rows.length > 1 && !sh.getFilter()) {
    sh.getRange(1, 1, rows.length + 1, header.length).createFilter()
  }
}

function buildCohorts(ss, cohorts) {
  ss = ss || book()
  var sh = resetSheet(ss, TAB.cohorts)

  var header = ['Cohort', 'Leads', 'Links issued', 'Opened', 'Started',
                'Allowed camera', 'Answered', 'Completed',
                'Open rate', 'Completion (of opened)', 'Completion (of issued)']
  var rows = []
  for (var i = 0; i < cohorts.length; i++) {
    var c = cohorts[i]
    rows.push([
      labelCohort(c.cohort), c.leads, c.links_sent, c.opened, c.started,
      c.camera_ok, c.answered, c.completed,
      pct(c.opened, c.links_sent),
      pct(c.completed, c.opened),
      pct(c.completed, c.links_sent),
    ])
  }
  if (!rows.length) rows.push(['No data yet', '', '', '', '', '', '', '', '', '', ''])

  sh.getRange(1, 1, 1, header.length).setValues([header])
  sh.getRange(2, 1, rows.length, header.length).setValues(rows)

  styleHeader(sh, header.length)
  sh.getRange(2, 2, rows.length, 7).setNumberFormat('#,##0')
  sh.setColumnWidth(1, 250)
  sh.setFrozenRows(1)
  sh.setFrozenColumns(1)
}

/**
 * The one tab nothing feeds.
 *
 * Structure and formulas are live; the numbers are yours to paste from
 * whatever sends the messages. The conversion column computes itself the
 * moment column B has values, so nothing needs rebuilding later.
 */
function buildDelivery(ss) {
  ss = ss || book()
  var sh = ss.getSheetByName(TAB.delivery)

  // Never wipe this one on refresh: it holds hand-entered numbers. Build it
  // once, then leave it alone.
  if (sh) return
  sh = ss.insertSheet(TAB.delivery)

  var header = ['Stage', 'Count', '% of sent', '% of previous', 'Where this number comes from']
  var rows = [
    ['Sent', '', '', '', 'Your sending tool (WhatsApp / email / MoEngage)'],
    ['Received', '', '', '', 'Delivery receipts from the sending tool'],
    ['Read', '', '', '', 'Read receipts, WhatsApp only'],
    ['Clicked', '', '', '', 'Same moment as "Opened the link" on the Funnel tab'],
    ['Completed', '', '', '', 'Pulled automatically, see Summary'],
    ['Analysed', '', '', '', 'Not built yet'],
  ]

  sh.getRange(1, 1, 1, header.length).setValues([header])
  sh.getRange(2, 1, rows.length, header.length).setValues(rows)

  // Formulas rather than values, so they fill in as soon as counts are pasted.
  for (var r = 2; r <= rows.length + 1; r++) {
    sh.getRange(r, 3).setFormula('=IF(OR($B$2="",B' + r + '=""),"",B' + r + '/$B$2)')
    if (r > 2) {
      sh.getRange(r, 4).setFormula(
        '=IF(OR(B' + (r - 1) + '="",B' + r + '=""),"",B' + r + '/B' + (r - 1) + ')')
    }
  }

  styleHeader(sh, header.length)
  sh.getRange(2, 2, rows.length, 1).setBackground('#ecfdf5').setNumberFormat('#,##0')
  sh.getRange(2, 3, rows.length, 2).setNumberFormat('0.0%')

  note(sh, rows.length + 3,
    'Type counts into column B (green). Percentages calculate themselves. ' +
    'This tab is never overwritten by a refresh, so anything entered here is safe.')

  sh.setColumnWidth(1, 140)
  sh.setColumnWidth(5, 360)
  sh.setFrozenRows(1)
}

function buildAnswers(ss, answers) {
  ss = ss || book()
  var sh = resetSheet(ss, TAB.answers)

  var header = ['Student', 'Email', 'Phone', 'Cohort', 'Q#', 'Question',
                'Length', 'Recorded at', 'Video']
  var rows = []
  for (var i = 0; i < answers.length; i++) {
    var a = answers[i]
    rows.push([
      a.lead_name, a.lead_email, a.phone10 || '', labelCohort(a.cohort || a.source),
      a.position || '', a.question,
      a.duration_sec ? mmss(a.duration_sec) : '',
      istDate(a.uploaded_at),
      a.playUrl ? '=HYPERLINK("' + a.playUrl + '","▶ Watch")' : '',
    ])
  }
  if (!rows.length) rows.push(['No recordings yet', '', '', '', '', '', '', '', ''])

  sh.getRange(1, 1, 1, header.length).setValues([header])
  sh.getRange(2, 1, rows.length, header.length).setValues(rows)

  styleHeader(sh, header.length)
  sh.getRange(2, 6, rows.length, 1).setWrap(true)
  sh.setColumnWidth(6, 380)
  sh.setColumnWidth(2, 220)
  sh.setFrozenRows(1)

  note(sh, rows.length + 3,
    'Video links are signed and expire after 7 days, but every refresh issues ' +
    'fresh ones. Anyone holding a link can watch that student without logging ' +
    'in, so share this sheet with that in mind.')
}

function buildEvents(ss, events) {
  ss = ss || book()
  var sh = resetSheet(ss, TAB.events)

  var header = ['When (IST)', 'Email', 'Cohort', 'Event', 'Q#', 'Detail']
  var rows = []
  for (var i = 0; i < events.length; i++) {
    var e = events[i]
    rows.push([
      istDate(e.at), e.lead_email, labelCohort(e.cohort), e.event,
      e.position || '', e.meta ? JSON.stringify(e.meta) : '',
    ])
  }
  if (!rows.length) rows.push(['No events yet', '', '', '', '', ''])

  sh.getRange(1, 1, 1, header.length).setValues([header])
  sh.getRange(2, 1, rows.length, header.length).setValues(rows)

  styleHeader(sh, header.length)
  sh.setColumnWidth(1, 150)
  sh.setColumnWidth(2, 220)
  sh.setColumnWidth(6, 320)
  sh.setFrozenRows(1)
}

// ── helpers ──────────────────────────────────────────────────────────────────

function resetSheet(ss, name) {
  // Defended because the editor's Run button calls whatever function is
  // selected with no arguments, which is how this got called with no
  // spreadsheet and failed on every attempt.
  ss = ss || book()
  var sh = ss.getSheetByName(name)
  if (!sh) return ss.insertSheet(name)

  // clear() wipes contents and formatting but NOT a filter, and Sheets throws
  // rather than replacing one, so every refresh after the first died here.
  var existing = sh.getFilter()
  if (existing) existing.remove()

  sh.clear()
  sh.clearConditionalFormatRules()
  // Leave row/column count alone: clearing content is enough and resizing a
  // large sheet every 15 minutes is slow.
  return sh
}

function styleHeader(sh, cols) {
  sh.getRange(1, 1, 1, cols)
    .setBackground(BRAND).setFontColor(BRAND_TEXT).setFontWeight('bold')
  sh.setRowHeight(1, 30)
}

function note(sh, row, text) {
  sh.getRange(row, 1).setValue(text).setFontColor(MUTED).setFontStyle('italic').setWrap(true)
  sh.getRange(row, 1, 1, 5).merge()
}

/** Blank rather than a divide-by-zero, and never "Infinity" or "NaN". */
function pct(part, whole) {
  if (!whole) return ''
  return Math.round((part / whole) * 1000) / 10 + '%'
}

function mmss(sec) {
  var m = Math.floor(sec / 60), s = Math.round(sec % 60)
  return m + ':' + (s < 10 ? '0' : '') + s
}

function istDate(iso) {
  if (!iso) return ''
  return Utilities.formatDate(new Date(iso), 'Asia/Kolkata', 'd MMM, HH:mm')
}

/** Turn a raw event name into something readable in the Stopped at column. */
function stageLabel(event) {
  if (!event) return 'Never started'
  var map = {
    link_opened: 'Opened the link',
    intro_viewed: 'Saw the intro',
    intro_accepted: 'Started',
    camera_requested: 'Camera prompt shown',
    camera_granted: 'Allowed camera',
    camera_denied: 'Blocked the camera',
    wizard_completed: 'Entered the call',
    question_started: 'Reached a question',
    question_heard: 'Heard the question',
    recording_started: 'Started recording',
    recording_stopped: 'Stopped recording',
    upload_started: 'Uploading',
    upload_succeeded: 'Answer saved',
    upload_failed: 'Upload failed',
    attempt_submitted: 'Completed',
    closing_played: 'Watched the sign off',
  }
  return map[event] || event
}

/**
 * Cohort names arrive with a numeric prefix, "1 Passed, slot not booked", which
 * is what orders them by funnel stage rather than alphabetically. Strip it for
 * display and keep the ordering the query already applied.
 *
 * Also handles the old nsat/csat source values, for leads created one at a
 * time from the admin screen rather than imported.
 */
function labelCohort(value) {
  if (!value) return 'Unassigned'
  var map = {
    nsat1: 'NSAT R1', nsat2: 'NSAT R2', nsat3: 'NSAT R3', nsat4: 'NSAT R4',
    csat: 'CSAT', unknown: 'Unassigned',
  }
  if (map[value]) return map[value]
  return String(value).replace(/^\s*\d+\s+/, '')
}

function orderTabs(ss) {
  ss = ss || book()
  var order = [TAB.summary, TAB.cohorts, TAB.funnel, TAB.delivery,
               TAB.students, TAB.answers, TAB.events]
  for (var i = 0; i < order.length; i++) {
    var sh = ss.getSheetByName(order[i])
    if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1) }
  }
  ss.setActiveSheet(ss.getSheetByName(TAB.summary))
}
