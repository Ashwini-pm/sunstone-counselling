'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { createTestLink, type FacultyRole } from './actions'
import styles from './admin.module.css'

const ROLES = [
  { key: 'java', label: 'B.Tech CS · Java' },
  { key: 'marketing', label: 'MBA · Marketing' },
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

  const [activeTab, setActiveTab] = useState<'java' | 'marketing'>('java')
  const [role, setRole] = useState<FacultyRole>('java')
  const [candidateName, setCandidateName] = useState('')
  const [candidateEmail, setCandidateEmail] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [generatedFor, setGeneratedFor] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function switchTab(tab: 'java' | 'marketing') {
    setActiveTab(tab)
    setRole(tab as FacultyRole)
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

  async function handleCopy() {
    await navigator.clipboard.writeText(generatedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

  function downloadCSV() {
    const rows = [
      ['Name', 'Email', 'Role', 'Status', 'Score', 'Verdict', 'Review Status', 'Attempts', 'Created'],
      ...filteredTests.map(t => {
        const submitted = (t.attempts || []).filter(a => a.status === 'submitted')
        const status = submitted.length > 0 ? 'Submitted' : (t.attempts?.length > 0 ? 'In progress' : 'Pending')
        const latest = submitted.length > 0 ? submitted.reduce((a, b) => a.attempt_number > b.attempt_number ? a : b) : null
        const score = latest?.reviewed && latest?.avgScore !== null ? String(latest.avgScore) : (latest?.totalInvites > 0 ? 'Pending' : '')
        const reviewStatus = latest ? (latest.reviewed ? 'Done' : 'Pending') : ''
        const vc = latest?.verdictCounts
        const verdict = vc ? `✓${vc.yes} ✗${vc.no} ~${vc.maybe}` : ''
        return [
          t.candidates?.name || '',
          t.candidates?.email || '',
          t.role === 'java' ? 'B.Tech CS · Java' : 'MBA · Marketing',
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
          {ROLES.map(r => (
            <button
              key={r.key}
              className={`${styles.pageTab} ${activeTab === r.key ? styles.pageTabActive : ''}`}
              onClick={() => switchTab(r.key as 'java' | 'marketing')}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className={styles.topRight}>
          <span className={styles.adminName}>{adminName}</span>
          <button className={styles.logoutBtn} onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <div className={styles.content}>
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
                <button className={styles.copyBtn} onClick={handleCopy}>
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
              <div className={styles.sectionSub}>Managing candidate evaluations for {activeTab === 'java' ? 'Java Specialization' : 'Marketing'}</div>
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
                    <th className={styles.right}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={styles.emptyRow}>No candidates found</td>
                    </tr>
                  ) : filteredTests.map(t => {
                    const latest = getLatestSubmitted(t.attempts || [])
                    const reviewStatus = getReviewStatus(t.attempts || [])
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
                            : latest?.totalInvites > 0
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
                        <td className={styles.tdRight}>
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
