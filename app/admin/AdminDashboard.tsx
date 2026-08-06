'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { createLeadLink } from './actions'
import { groupLabel } from './labels'
import type { AdminSetRow } from '@/lib/db/adminAccess'
import styles from './admin.module.css'


function copyText(text: string, onDone?: () => void) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(onDone).catch(() => fallbackCopy(text, onDone))
  } else {
    fallbackCopy(text, onDone)
  }
}
function fallbackCopy(text: string, onDone?: () => void) {
  const ta = document.createElement('textarea')
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.focus(); ta.select()
  document.execCommand('copy'); document.body.removeChild(ta)
  onDone?.()
}

type BankStatus = { total: number; groups: number; missingAvatar: number }

export default function AdminDashboard({
  adminName,
  recentSets,
  stats,
  cohorts,
  bank,
}: {
  adminName: string
  recentSets: AdminSetRow[]
  stats: { sent: number; completed: number; in_progress: number; not_opened: number }
  cohorts: { key: string; label: string; total: number; open: number }[]
  bank: BankStatus
}) {
  const [isPending, startTransition] = useTransition()

  const [activeTab, setActiveTab] = useState<string>('all')

  // Built from the data. Hardcoding NSAT 1-4 / CSAT left every tab empty once
  // leads started arriving with a cohort and no source.
  const TABS = useMemo(
    () => [{ key: 'all', label: 'All Leads', total: 0, open: 0 }, ...cohorts],
    [cohorts],
  )
  const groupOf = (s: AdminSetRow) => s.lead_cohort ?? s.lead_source ?? 'unassigned'
  const [leadName, setLeadName] = useState('')
  const [leadEmail, setLeadEmail] = useState('')
  const [leadPhone, setLeadPhone] = useState('')
  const [city, setCity] = useState('')
  const [source, setSource] = useState<string>('nsat4')
  const [generatedLink, setGeneratedLink] = useState('')
  const [generatedFor, setGeneratedFor] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const formData = new FormData()
    formData.set('leadName', leadName)
    formData.set('leadEmail', leadEmail)
    formData.set('leadPhone', leadPhone)
    formData.set('city', city)
    formData.set('source', source)
    startTransition(async () => {
      const result = await createLeadLink(formData)
      if (result.error) {
        setError(result.error)
      } else {
        setGeneratedLink(result.link!)
        setGeneratedFor(result.leadName!)
        setLeadName('')
        setLeadEmail('')
        setLeadPhone('')
        setCity('')
      }
    })
  }

  function handleCopy() {
    copyText(generatedLink, () => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  function statusPill(row: AdminSetRow) {
    if (!row.attempt_id) return <span className={`${styles.pill} ${styles.grey}`}>NOT STARTED</span>
    if (row.status === 'submitted') return <span className={`${styles.pill} ${styles.green}`}>COMPLETED</span>
    return <span className={`${styles.pill} ${styles.amber}`}>IN PROGRESS</span>
  }

  const filteredSets = useMemo(() => {
    return recentSets.filter(s => {
      if (activeTab !== 'all' && groupOf(s) !== activeTab) return false
      const d = new Date(s.created_at)
      if (dateFrom && d < new Date(dateFrom)) return false
      if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false
      return true
    })
  }, [recentSets, activeTab, dateFrom, dateTo])


  // Counted by the database, not by looping the list below. That list is
  // capped at 200 rows, so deriving totals from it made "Links Sent" report
  // the page size and "Completed" miss everything outside the slice.

  function downloadCSV() {
    const rows = [
      ['Name', 'Email', 'Source', 'Status', 'Answers', 'Created'],
      ...filteredSets.map(s => [
        s.lead_name || '',
        s.lead_email || '',
        groupLabel(groupOf(s)),
        !s.attempt_id ? 'Not started' : s.status === 'submitted' ? 'Completed' : 'In progress',
        String(s.answer_count),
        new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      ]),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.top}>
        <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.sunstoneLogo} />
        <div className={styles.tabPillGroup}>
          {TABS.map(t => {
            // Counted across every lead by the database. The previous badge
            // was derived from the 200 rows loaded below, so it under-reported.
            const badge = t.key === 'all' ? 0 : t.open
            return (
              <button
                key={t.key}
                className={`${styles.pageTab} ${activeTab === t.key ? styles.pageTabActive : ''}`}
                onClick={() => setActiveTab(t.key)}
                style={badge > 0 ? { paddingRight: 22 } : undefined}
              >
                {t.key === 'all' ? 'All Leads' : groupLabel(t.key)}
                {badge > 0 && (
                  <span className={`${styles.tabBadge} ${activeTab === t.key ? styles.tabBadgeActive : ''}`}>
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className={styles.topRight}>
          <span className={styles.adminName}>{adminName}</span>
          <button className={styles.logoutBtn} onClick={() => signOut({ callbackUrl: '/login' })}>
            Sign out
          </button>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <div className={styles.statNum}>{stats.sent.toLocaleString('en-IN')}</div>
            <div className={styles.statLabel}>Links Sent</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statNum}>{stats.completed.toLocaleString('en-IN')}</div>
            <div className={styles.statLabel}>Completed</div>
          </div>
          <div className={`${styles.statCard} ${stats.in_progress > 0 ? styles.statCardAmber : ''}`}>
            <div className={styles.statNum}>{stats.in_progress.toLocaleString('en-IN')}</div>
            <div className={styles.statLabel}>In Progress</div>
          </div>
        </div>

        {(bank.total === 0 || bank.missingAvatar > 0) && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.heading}>
                <span className={styles.headingIcon}>⚠️</span> Question bank
              </div>
            </div>
            {bank.total === 0 ? (
              <p className={styles.linkNote}>
                No questions loaded yet. Leads who open a link will see an error. Load the
                behavioral questions into the <code>questions</code> table first.
              </p>
            ) : (
              <p className={styles.linkNote}>
                {bank.total} question{bank.total !== 1 ? 's' : ''} across {bank.groups} group
                {bank.groups !== 1 ? 's' : ''}, but <strong>{bank.missingAvatar}</strong> still have no
                avatar video. Run <code>scripts/heygen_generate.py</code> before sending links, or
                those questions will appear as text only.
              </p>
            )}
          </div>
        )}

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.heading}><span className={styles.headingIcon}>🔗</span> Create Lead Link</div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Lead name</label>
                <input
                  type="text" className={styles.input} placeholder="e.g. Ananya Sharma"
                  value={leadName} onChange={e => setLeadName(e.target.value)} required
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Lead email (optional)</label>
                <input
                  type="email" className={styles.input} placeholder="lead@example.com"
                  value={leadEmail} onChange={e => setLeadEmail(e.target.value)}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Phone</label>
                <input
                  type="tel" className={styles.input} placeholder="98765 43210"
                  value={leadPhone} onChange={e => setLeadPhone(e.target.value)} required
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Source</label>
                <select className={styles.input} value={source} onChange={e => setSource(e.target.value)}>
                  {TABS.filter(t => t.key !== 'all').map(t => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>City</label>
                <input
                  type="text" className={styles.input} placeholder="Optional"
                  value={city} onChange={e => setCity(e.target.value)}
                />
              </div>
              <button type="submit" className={styles.btn} disabled={isPending}>
                {isPending ? 'Generating…' : 'Generate link →'}
              </button>
            </div>
            {error && <p className={styles.error}>{error}</p>}
          </form>

          {generatedLink && (
            <div className={styles.linkBox}>
              <div className={styles.linkBoxLabel}>✓ Link for {generatedFor}</div>
              <div className={styles.linkRow}>
                <code className={styles.linkText}>{generatedLink}</code>
                <button type="button" className={styles.copyBtn} onClick={handleCopy}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className={styles.linkNote}>
                Send this to the lead. They sign in with Google using this same email address, then
                answer each question on video. The link is valid for 14 days.
              </p>
            </div>
          )}
        </div>

        <div className={styles.tableSection}>
          <div className={styles.tabRow}>
            <div>
              <div className={styles.sectionHeading}>Recent Links</div>
              <div className={styles.sectionSub}>
                {activeTab === 'all'
                  ? 'All leads across NSAT and CSAT'
                  : groupLabel(activeTab)}
              </div>
            </div>
            <div className={styles.tableActions}>
              <div className={styles.dateFilters}>
                <span className={styles.calIcon}>📅</span>
                <input type="date" className={styles.dateInput} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                <span className={styles.dateSep}>—</span>
                <input type="date" className={styles.dateInput} value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
              <button className={styles.csvBtn} onClick={downloadCSV}>↓ Download CSV</button>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th className={styles.center}>Source</th>
                    <th className={styles.center}>Status</th>
                    <th className={styles.center}>Answers</th>
                    <th>Created</th>
                    <th className={styles.center}>Link</th>
                    <th className={styles.right}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSets.length === 0 ? (
                    <tr><td colSpan={7} className={styles.emptyRow}>No leads found</td></tr>
                  ) : filteredSets.map(s => {
                    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/q/${s.access_token}`
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className={styles.candName}>{s.lead_name || '—'}</div>
                          <div className={styles.candEmail}>{s.lead_email || ''}</div>
                        </td>
                        <td className={styles.tdCenter} data-label="Source">
                          {(s.lead_cohort ?? s.lead_source)
                            ? <span className={`${styles.pill} ${styles.grey}`}>{groupLabel(groupOf(s))}</span>
                            : <span className={styles.scoreDash}>—</span>}
                        </td>
                        <td className={styles.tdCenter} data-label="Status">{statusPill(s)}</td>
                        <td className={styles.tdCenter} data-label="Answers">
                          <span className={styles.attemptsNum}>{s.answer_count}</span>
                        </td>
                        <td data-label="Created">
                          {new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className={styles.tdCenter} data-label="Link">
                          <button
                            type="button"
                            className={styles.copyTestBtn}
                            onClick={() => copyText(url, () => {
                              setCopiedRowId(s.id)
                              setTimeout(() => setCopiedRowId(id => (id === s.id ? null : id)), 2000)
                            })}
                          >
                            {copiedRowId === s.id ? '✓ Copied' : 'Copy link'}
                          </button>
                        </td>
                        <td className={styles.tdRight}>
                          {s.lead_id && (
                            <Link href={`/admin/lead/${s.lead_id}`} className={styles.profileLink}>Profile</Link>
                          )}
                          {s.attempt_id && s.answer_count > 0 && (
                            <Link href={`/admin/attempt/${s.attempt_id}`} className={styles.reviewLink}>
                              View answers →
                            </Link>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className={styles.tableFooter}>
              <span className={styles.tableFooterText}>
                Showing {filteredSets.length} of {stats.sent.toLocaleString('en-IN')} link
                {stats.sent !== 1 ? 's' : ''}{recentSets.length >= 200 ? ' (most recent 200 loaded)' : ''}
              </span>
              <div className={styles.paginationBtns}>
                <button className={styles.pageBtn} disabled>‹</button>
                <button className={styles.pageBtn}>›</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
