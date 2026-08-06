// Bulk-create leads from a CSV and write each one's link back into the file.
//
//   node scripts/import-leads.mjs leads.csv --source nsat3 --dry-run
//   node scripts/import-leads.mjs leads.csv --source nsat3
//   node scripts/import-leads.mjs a.csv b.csv c.csv --source csat
//
// Writes a new "counselling_link" column IN PLACE, after saving <file>.bak.
// A crash halfway through a rewrite would otherwise cost you the list.
//
// Identity is the phone number, reduced to its last 10 digits, which is the
// join key the NSAT and CSAT pipelines already use. Re-running over the same
// file is therefore safe: an existing lead is updated, not duplicated, and
// keeps the link it already has rather than being issued a second one.
//
// Column names are detected, not assumed. Anything spelled like a phone, name,
// email or city is found regardless of case, spacing or punctuation.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

// Resolved from this file, not the working directory: the CSVs live in
// Downloads and you should be able to run this from wherever they are.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ── env ──────────────────────────────────────────────────────────────────────

function loadEnv() {
  const env = {}
  for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}
const env = loadEnv()
const sql = neon(env.DATABASE_URL)

// ── args ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const sourceArg = argv.includes('--source') ? argv[argv.indexOf('--source') + 1] : null
const baseArg = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : null
// The table defaults to 14 days, which suits a link issued one at a time from
// the admin screen. A backlog send is different: the list goes out over weeks
// and an expired link is a lead lost in silence. Explicit here, not implicit.
const expiresDays = argv.includes('--expires-days')
  ? Number(argv[argv.indexOf('--expires-days') + 1]) : 60
const files = argv.filter((a, i) =>
  !a.startsWith('--') && argv[i - 1] !== '--source' && argv[i - 1] !== '--base'
  && argv[i - 1] !== '--expires-days')

const VALID_SOURCES = ['nsat1', 'nsat2', 'nsat3', 'nsat4', 'csat']

if (!files.length) {
  console.error('Usage: node scripts/import-leads.mjs <file.csv...> --source nsat3 [--dry-run]')
  process.exit(1)
}
if (sourceArg && !VALID_SOURCES.includes(sourceArg)) {
  console.error(`--source must be one of: ${VALID_SOURCES.join(', ')}`)
  process.exit(1)
}

const BASE = (baseArg ?? env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
if (!BASE) {
  console.error('No base URL. Pass --base https://... or set NEXT_PUBLIC_APP_URL in .env.local')
  process.exit(1)
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Parses quoted fields, escaped quotes and embedded newlines.
 *
 * Splitting on commas is the usual shortcut and it corrupts exactly the rows
 * you cannot afford to lose: "Sharma, Manish" becomes two fields and every
 * column after it shifts by one, silently.
 */
function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }   // "" is a literal quote
        else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }

  return rows.filter(r => r.some(cell => cell.trim() !== ''))
}

const needsQuoting = v => /[",\n\r]/.test(v)
const csvCell = v => (needsQuoting(v) ? `"${v.replace(/"/g, '""')}"` : v)
const toCsv = rows => rows.map(r => r.map(c => csvCell(c ?? '')).join(',')).join('\n') + '\n'

/** Loose header matching: "Mobile No.", "mobile_no", "MOBILE NO" all match. */
const normalise = h => h.toLowerCase().replace(/[^a-z0-9]/g, '')

function findColumn(headers, candidates) {
  const norm = headers.map(normalise)
  for (const want of candidates) {
    const exact = norm.indexOf(want)
    if (exact !== -1) return exact
  }
  for (const want of candidates) {
    const partial = norm.findIndex(h => h.includes(want))
    if (partial !== -1) return partial
  }
  return -1
}

const PHONE_COLS = ['phone10', 'phone', 'mobile', 'mobileno', 'contact', 'number', 'whatsapp']
const NAME_COLS  = ['name', 'studentname', 'leadname', 'fullname', 'candidatename']
const EMAIL_COLS = ['email', 'emailid', 'mail']
const CITY_COLS   = ['city', 'location', 'town']
const COHORT_COLS = ['cohort', 'segment', 'group']
const EXTID_COLS  = ['leadid', 'externalleadid', 'crmid']
const LINK_COL    = 'counselling_link'

/**
 * Last 10 digits.
 *
 * Handles +91, leading 0, spaces, dashes and brackets, all of which appear in
 * exported lead lists.
 *
 * Deliberately does NOT require a leading 6-9. That rule tells you whether a
 * number can receive a WhatsApp message, and this script does not send
 * anything: it identifies a person and mints a link. Enforcing it dropped 14
 * real students from these files over landline-looking numbers, every one of
 * whom had a working email address. They are flagged in the report instead.
 */
function toPhone10(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length < 10) return null
  return digits.slice(-10)
}

/** Looks like a mobile that could actually be messaged. */
const isMobile = p => /^[6-9]\d{9}$/.test(p)

// ── import ───────────────────────────────────────────────────────────────────

async function importFile(path) {
  console.log(`\n${'─'.repeat(64)}\n${path}`)

  if (!existsSync(path)) { console.error('  File not found.'); return null }

  const rows = parseCsv(readFileSync(path, 'utf8'))
  if (rows.length < 2) { console.error('  No data rows.'); return null }

  const headers = rows[0]
  const iPhone = findColumn(headers, PHONE_COLS)
  const iName  = findColumn(headers, NAME_COLS)
  const iEmail = findColumn(headers, EMAIL_COLS)
  const iCity   = findColumn(headers, CITY_COLS)
  const iCohort = findColumn(headers, COHORT_COLS)
  const iExtId  = findColumn(headers, EXTID_COLS)

  if (iPhone === -1) {
    console.error(`  No phone column found. Headers: ${headers.join(', ')}`)
    return null
  }
  console.log(`  phone: "${headers[iPhone]}"` +
    (iName  !== -1 ? `   name: "${headers[iName]}"` : '   name: (none)') +
    (iEmail !== -1 ? `   email: "${headers[iEmail]}"` : '') +
    (iCity   !== -1 ? `   city: "${headers[iCity]}"` : '') +
    (iCohort !== -1 ? `   cohort: "${headers[iCohort]}"` : '') +
    (iExtId  !== -1 ? `   lead id: "${headers[iExtId]}"` : ''))

  // Reuse the link column if the file has already been through this.
  let iLink = headers.findIndex(h => normalise(h) === normalise(LINK_COL))
  const addingColumn = iLink === -1
  if (addingColumn) { iLink = headers.length; headers.push(LINK_COL) }

  const seen = new Set()
  const pending = []
  const stats = { created: 0, existing: 0, skipped: 0, duplicate: 0, nonMobile: 0 }
  const skipped = []
  const notMobile = []

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    while (row.length <= iLink) row.push('')

    const phone10 = toPhone10(row[iPhone])
    if (!phone10) {
      stats.skipped++
      skipped.push(`row ${r + 1}: unusable phone "${row[iPhone] ?? ''}"`)
      row[iLink] = ''
      continue
    }

    // Two rows with the same number in one file are the same person. Issuing
    // two links would mean two attempts and a split record.
    if (seen.has(phone10)) {
      stats.duplicate++
      skipped.push(`row ${r + 1}: ${phone10} repeats an earlier row`)
      row[iLink] = ''
      continue
    }
    seen.add(phone10)

    // Imported, but worth knowing about: these cannot receive a WhatsApp.
    if (!isMobile(phone10)) {
      stats.nonMobile++
      notMobile.push(`row ${r + 1}: ${phone10}`)
    }

    const name   = (iName   !== -1 ? row[iName]   : '').trim() || 'Student'
    const email  = (iEmail  !== -1 ? row[iEmail]  : '').trim() || null
    const city   = (iCity   !== -1 ? row[iCity]   : '').trim() || null
    const cohort = (iCohort !== -1 ? row[iCohort] : '').trim() || null
    const extId  = (iExtId  !== -1 ? row[iExtId]  : '').trim() || null

    pending.push({ row, phone10, name, email, city, cohort, extId })
    if (dryRun) { row[iLink] = '(dry run)'; stats.created++ }
  }

  if (!dryRun) {
    // Batched, not row by row.
    //
    // The first version issued three HTTP calls to Neon per row. Over 1,723
    // rows that is ~5,000 sequential round trips, and it died partway through
    // the first file having written nothing to disk. Three queries per chunk
    // of 200 turns the same work into about 30 calls.
    const CHUNK = 200
    for (let c = 0; c < pending.length; c += CHUNK) {
      const chunk = pending.slice(c, c + CHUNK)

      // 1. Upsert the leads. unnest turns parallel arrays into rows, which is
      //    how you send a multi-row insert through a parameterised query.
      const upserted = await sql.query(`
        insert into leads (name, email, phone10, source, city, cohort, external_lead_id)
        select * from unnest(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
        on conflict (phone10) do update
          set name             = coalesce(nullif(excluded.name, 'Student'), leads.name),
              email            = coalesce(excluded.email,  leads.email),
              source           = coalesce(excluded.source, leads.source),
              city             = coalesce(excluded.city,   leads.city),
              -- First cohort wins. Someone in two files belongs to the earlier
              -- stage of the funnel; overwriting would silently move them.
              cohort           = coalesce(leads.cohort, excluded.cohort),
              external_lead_id = coalesce(leads.external_lead_id, excluded.external_lead_id)
        returning id, phone10`,
        [
          chunk.map(x => x.name),
          chunk.map(x => x.email),
          chunk.map(x => x.phone10),
          chunk.map(() => sourceArg),
          chunk.map(x => x.city),
          chunk.map(x => x.cohort),
          chunk.map(x => x.extId),
        ])

      const leadIdByPhone = new Map(upserted.map(r => [r.phone10, r.id]))
      const leadIds = chunk.map(x => leadIdByPhone.get(x.phone10)).filter(Boolean)

      // 2. Any link they already hold that is still usable. Re-running a file
      //    must not hand one student a second link.
      const open = await sql.query(`
        select distinct on (s.lead_id) s.lead_id, s.access_token
        from question_sets s
        left join attempts a on a.set_id = s.id
        where s.lead_id = any($1::uuid[]) and s.expires_at > now()
          and (a.status is null or a.status <> 'submitted')
        order by s.lead_id, s.created_at desc`, [leadIds])

      const tokenByLead = new Map(open.map(r => [r.lead_id, r.access_token]))
      stats.existing += tokenByLead.size

      // 3. One link each for whoever has none.
      const need = leadIds.filter(id => !tokenByLead.has(id))
      if (need.length) {
        const made = await sql.query(`
          insert into question_sets (lead_id, expires_at)
          select unnest($1::uuid[]), now() + ($2 || ' days')::interval
          returning lead_id, access_token`, [need, expiresDays])
        for (const r of made) tokenByLead.set(r.lead_id, r.access_token)
        stats.created += made.length
      }

      for (const x of chunk) {
        const token = tokenByLead.get(leadIdByPhone.get(x.phone10))
        x.row[iLink] = token ? `${BASE}/q/${token}` : ''
      }
      process.stdout.write(`\r  ${Math.min(c + CHUNK, pending.length)}/${pending.length}`)
    }
    process.stdout.write('\r' + ' '.repeat(30) + '\r')
  }

  if (!dryRun) {
    // Back up before touching the original. This is somebody's lead list.
    copyFileSync(path, `${path}.bak`)
    writeFileSync(path, toCsv(rows))
  }

  console.log(`  new links: ${stats.created}   reused: ${stats.existing}` +
              `   no phone: ${stats.skipped}   repeats: ${stats.duplicate}` +
              `   not a mobile: ${stats.nonMobile}`)
  if (skipped.length) {
    console.log(`  skipped rows (link column left blank):`)
    for (const s of skipped.slice(0, 15)) console.log(`    ${s}`)
    if (skipped.length > 15) console.log(`    … and ${skipped.length - 15} more`)
  }
  if (notMobile.length) {
    console.log(`  imported but cannot receive WhatsApp (email only):`)
    for (const n of notMobile.slice(0, 15)) console.log(`    ${n}`)
    if (notMobile.length > 15) console.log(`    … and ${notMobile.length - 15} more`)
  }
  if (!dryRun) console.log(`  written in place, original saved as ${path}.bak`)

  return stats
}

// ── run ──────────────────────────────────────────────────────────────────────

console.log(`base URL: ${BASE}`)
console.log(`source  : ${sourceArg ?? '(none; reporting groups by the cohort column instead)'}`)
console.log(`expiry  : ${expiresDays} days`)
if (dryRun) console.log('DRY RUN: nothing is written to the database or to disk')

const totals = { created: 0, existing: 0, skipped: 0, duplicate: 0, nonMobile: 0 }
for (const f of files) {
  const s = await importFile(f)
  if (s) for (const k of Object.keys(totals)) totals[k] += s[k]
}

console.log(`\n${'─'.repeat(64)}`)
console.log(`total  new links: ${totals.created}   reused: ${totals.existing}` +
            `   no phone: ${totals.skipped}   repeats: ${totals.duplicate}` +
            `   not a mobile: ${totals.nonMobile}`)
