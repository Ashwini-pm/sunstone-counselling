'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { createTestLink, type FacultyRole } from './actions'
import styles from './admin.module.css'

const ROLES: { key: FacultyRole; label: string }[] = [
  { key: 'java', label: 'B.Tech CS · Java' },
  { key: 'marketing', label: 'MBA · Marketing' },
  { key: 'tech', label: 'Tech Faculty' },
  { key: 'management', label: 'Management Faculty' },
  { key: 'coding', label: 'Coding Trainer' },
  { key: 'aptitude', label: 'Aptitude Trainer' },
  { key: 'comms', label: 'Comms Trainer' },
]

type Attempt = {
  id: string
  status: string
  attempt_number: number
  avgScore: number | null
  reviewed: boolean
  totalInvites: number
  verdictCounts: { yes: number; no: number; maybe: number }
}

type Test = {
  id: string
  role: string
  created_at: string
  candidates: { id: string; name: string; email: string } | null
  attempts: Attempt[]
}

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

export default function AdminDashboard({
  adminName,
  recentTests,
}: {
  adminName: string
  recentTests: Test[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()

  const [activeTab, setActiveTab] = useState<FacultyRole>('java')
  const [role, setRole] = useState<FacultyRole>('java')
  const [candidateName, setCandidateName] = useState('')
  const [candidateEmail, setCandidateEmail] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [generatedFor, setGeneratedFor] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function switchTab(tab: FacultyRole) {
    setActiveTab(tab)
    setRole(tab)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const formData = new FormData()
    formData.set('candidateName', candidateName)
    formData.set('candidateEmail', candidateEmail)
    formData.set('role', role)
    startTransition(async () => {
      const result = await createTestLink(formData)
      if (result.error) {
        setError(result.error)
      } else {
        setGeneratedLink(result.testUrl!)
        setGeneratedFor(result.candidateName!)
        setCandidateName('')
        setCandidateEmail('')
        setRole(activeTab)
      }
    })
  }

  function handleCopy() {
    copyText(generatedLink, () => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  function statusPill(attempts: Attempt[]) {
    if (!attempts || attempts.length === 0) return <span className={`${styles.pill} ${styles.grey}`}>PENDING</span>
    const latest = attempts.reduce((a, b) => a.attempt_number > b.attempt_number ? a : b)
    if (latest.status === 'submitted') return <span className={`${styles.pill} ${styles.green}`}>SUBMITTED</span>
    return <span className={`${styles.pill} ${styles.amber}`}>IN PROGRESS</span>
  }

  function getReviewStatus(attempts: Attempt[]) {
    const submitted = attempts.filter(a => a.status === 'submitted')
    if (submitted.length === 0) return null
    const latest = submitted.reduce((a, b) => a.attempt_number > b.attempt_number ? a : b)
    if (latest.totalInvites === 0) return <span className={`${styles.pill} ${styles.grey}`}>NO REVIEWERS</span>
    return latest.reviewed
      ? <span className={`${styles.pill} ${styles.green}`}>DONE</span>
      : <span className={`${styles.pill} ${styles.grey}`}>PENDING</span>
  }

  function getLatestSubmitted(attempts: Attempt[]): Attempt | null {
    const submitted = attempts.filter(a => a.status === 'submitted')
    if (submitted.length === 0) return null
    return submitted.reduce((a, b) => a.attempt_number > b.attempt_number ? a : b)
  }

  const filteredTests = useMemo(() => {
    return recentTests.filter(t => {
      if (t.role !== activeTab) return false
      const d = new Date(t.created_at)
      if (dateFrom && d < new Date(dateFrom)) return false
      if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false
      return true
    })
  }, [recentTests, activeTab, dateFrom, dateTo])

  // Badge counts: submitted but not yet fully reviewed, per role
  const pendingReviewByRole = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of recentTests) {
      const latest = getLatestSubmitted(t.attempts || [])
      if (latest && !latest.reviewed) {
        counts[t.role] = (counts[t.role] || 0) + 1
      }
    }
    return counts
  }, [recentTests])

  // Top-level stats across all roles
  const stats = useMemo(() => {
    let scheduled = 0, completed = 0, pendingReview = 0
    for (const t of recentTests) {
      const submitted = (t.attempts || []).filter(a => a.status === 'submitted')
      if (submitted.length === 0) {
        scheduled++
      } else {
        completed++
        const latest = getLatestSubmitted(t.attempts || [])
        if (latest && !latest.reviewed) pendingReview++
      }
    }
    return { scheduled, completed, pendingReview }
  }, [recentTests])

  function downloadCSV() {
    const rows = [
      ['Name', 'Email', 'Role', 'Status', 'Score', 'Verdict', 'Review Status', 'Attempts', 'Created'],
      ...filteredTests.map(t => {
        const submitted = (t.attempts || []).filter(a => a.status === 'submitted')
        const status = submitted.length > 0 ? 'Submitted' : (t.attempts?.length > 0 ? 'In progress' : 'Pending')
        const latest = submitted.length > 0 ? submitted.reduce((a, b) => a.attempt_number > b.attempt_number ? a : b) : null
        const score = latest?.reviewed && latest?.avgScore !== null ? String(latest.avgScore) : ((latest?.totalInvites ?? 0) > 0 ? 'Pending' : '')
        const reviewStatus = latest ? (latest.reviewed ? 'Done' : 'Pending') : ''
        const vc = latest?.verdictCounts
        const verdict = vc ? `✓${vc.yes} ✗${vc.no} ~${vc.maybe}` : ''
        return [
          t.candidates?.name || '',
          t.candidates?.email || '',
          ROLES.find(r => r.key === t.role)?.label || t.role,
          status,
          score,
          verdict,
          reviewStatus,
          String(t.attempts?.length || 0),
          new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        ]
      }),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `candidates-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <header className={styles.top}>
        <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.sunstoneLogo} />
        <div className={styles.tabPillGroup}>
          {ROLES.map(r => {
            const badge = pendingReviewByRole[r.key] || 0
            return (
              <button
                key={r.key}
                className={`${styles.pageTab} ${activeTab === r.key ? styles.pageTabActive : ''}`}
                onClick={() => switchTab(r.key)}
              >
                {r.label}
                {badge > 0 && (
                  <span className={`${styles.tabBadge} ${activeTab === r.key ? styles.tabBadgeActive : ''}`}>
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className={styles.topRight}>
          <span className={styles.adminName}>{adminName}</span>
          <button className={styles.logoutBtn} onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <div className={styles.content}>
        {/* Top-level stats */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <div className={styles.statNum}>{stats.scheduled}</div>
            <div className={styles.statLabel}>Scheduled</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statNum}>{stats.completed}</div>
            <div className={styles.statLabel}>Completed</div>
          </div>
          <div className={`${styles.statCard} ${stats.pendingReview > 0 ? styles.statCardAmber : ''}`}>
            <div className={styles.statNum}>{stats.pendingReview}</div>
            <div className={styles.statLabel}>Pending Review</div>
          </div>
        </div>

        {/* Create test link */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.heading}><span className={styles.headingIcon}>🔗</span> Create Assessment Link</div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Candidate name</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="e.g. Dr. Suresh Iyer"
                  value={candidateName}
                  onChange={e => setCandidateName(e.target.value)}
                  required
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Candidate email</label>
                <input
                  type="email"
                  className={styles.input}
                  placeholder="candidate@example.com"
                  value={candidateEmail}
                  onChange={e => setCandidateEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className={styles.btn} disabled={isPending}>
                {isPending ? 'Generating…' : 'Generate test link →'}
              </button>
            </div>
            {error && <p className={styles.error}>{error}</p>}
          </form>

          {generatedLink && (
            <div className={styles.linkBox}>
              <div className={styles.linkBoxLabel}>✓ Test link for {generatedFor}</div>
              <div className={styles.linkRow}>
                <code className={styles.linkText}>{generatedLink}</code>
                <button type="button" className={styles.copyBtn} onClick={handleCopy}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className={styles.linkNote}>Send this link to the candidate. They will be asked to sign in with Google before starting the assessment.</p>
            </div>
          )}
        </div>

        {/* Candidates table */}
        <div className={styles.tableSection}>
          <div className={styles.tabRow}>
            <div>
              <div className={styles.sectionHeading}>Recent Assessments</div>
              <div className={styles.sectionSub}>Managing candidate evaluations for {ROLES.find(r => r.key === activeTab)?.label}</div>
            </div>
            <div className={styles.tableActions}>
              <div className={styles.dateFilters}>
                <span className={styles.calIcon}>📅</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                />
                <span className={styles.dateSep}>—</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                />
              </div>
              <button className={styles.csvBtn} onClick={downloadCSV}>
                ↓ Download CSV
              </button>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th className={styles.center}>Status</th>
                    <th className={styles.center}>Score</th>
                    <th className={styles.center}>Verdict</th>
                    <th className={styles.center}>Review Status</th>
                    <th className={styles.center}>Attempts</th>
                    <th>Created</th>
                    <th className={styles.center}>Test Link</th>
                    <th className={styles.right}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTests.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={styles.emptyRow}>No candidates found</td>
                    </tr>
                  ) : filteredTests.map(t => {
                    const latest = getLatestSubmitted(t.attempts || [])
                    const reviewStatus = getReviewStatus(t.attempts || [])
                    const testUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/test/${t.id}/${t.candidates?.id}/1`
                    return (
                      <tr key={t.id}>
                        <td>
                          <div className={styles.candName}>{t.candidates?.name || '—'}</div>
                          <div className={styles.candEmail}>{t.candidates?.email || ''}</div>
                        </td>
                        <td className={styles.tdCenter}>{statusPill(t.attempts || [])}</td>
                        <td className={styles.tdCenter}>
                          {latest?.reviewed && latest?.avgScore !== null
                            ? <span className={styles.scoreVal}>{latest.avgScore}<span className={styles.scoreSub}>/10</span></span>
                            : (latest?.totalInvites ?? 0) > 0
                              ? <span className={`${styles.pill} ${styles.grey}`}>Pending</span>
                              : <span className={styles.scoreDash}>—</span>}
                        </td>
                        <td className={styles.tdCenter}>
                          {latest && latest.totalInvites > 0
                            ? <span className={styles.verdictText}>
                                Yes: {latest.verdictCounts.yes}, No: {latest.verdictCounts.no}, Maybe: {latest.verdictCounts.maybe}
                              </span>
                            : <span className={styles.scoreDash}>—</span>}
                        </td>
                        <td className={styles.tdCenter}>{reviewStatus || <span className={styles.scoreDash}>—</span>}</td>
                        <td className={styles.tdCenter}>
                          <span className={styles.attemptsNum}>{t.attempts?.length || 0}</span>
                        </td>
                        <td>
                          {new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className={styles.tdCenter}>
                          <button
                            type="button"
                            className={styles.copyTestBtn}
                            onClick={() => copyText(testUrl, () => { setCopiedRowId(t.id); setTimeout(() => setCopiedRowId(id => id === t.id ? null : id), 2000) })}
                          >
                            {copiedRowId === t.id ? '✓ Copied' : 'Copy link'}
                          </button>
                        </td>
                        <td className={styles.tdRight}>
                          {t.candidates?.id && (
                            <Link href={`/candidate/${t.candidates.id}`} className={styles.profileLink} target="_blank">
                              Profile
                            </Link>
                          )}
                          {(t.attempts || []).filter(a => a.status === 'submitted').map(a => (
                            <Link key={a.id} href={`/admin/evaluate/${a.id}`} className={styles.reviewLink}>
                              Review →
                            </Link>
                          ))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className={styles.tableFooter}>
              <span className={styles.tableFooterText}>Showing {filteredTests.length} candidate{filteredTests.length !== 1 ? 's' : ''}</span>
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
