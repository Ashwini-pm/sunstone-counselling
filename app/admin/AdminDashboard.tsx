'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { createTestLink, type FacultyRole } from './actions'
import styles from './admin.module.css'

const ROLES = [
  { key: 'java', label: 'B.Tech CS · Java', sub: 'Programming in Java', icon: '⌨️' },
  { key: 'marketing', label: 'MBA · Marketing', sub: 'Marketing Management', icon: '📈' },
]

type Attempt = {
  id: string
  status: string
  attempt_number: number
  avgScore: number | null
  reviewed: boolean
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

  const [role, setRole] = useState<FacultyRole>('java')
  const [candidateName, setCandidateName] = useState('')
  const [candidateEmail, setCandidateEmail] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [generatedFor, setGeneratedFor] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const [activeTab, setActiveTab] = useState<'java' | 'marketing'>('java')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
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
    if (!attempts || attempts.length === 0) return <span className={`${styles.pill} ${styles.grey}`}>Pending</span>
    const latest = attempts.reduce((a, b) => a.attempt_number > b.attempt_number ? a : b)
    if (latest.status === 'submitted') return <span className={`${styles.pill} ${styles.green}`}>Submitted</span>
    return <span className={`${styles.pill} ${styles.amber}`}>In progress</span>
  }

  function getReviewStatus(attempts: Attempt[]) {
    const submitted = attempts.filter(a => a.status === 'submitted')
    if (submitted.length === 0) return null
    const done = submitted.some(a => a.reviewed)
    return done
      ? <span className={`${styles.pill} ${styles.green}`}>Done</span>
      : <span className={`${styles.pill} ${styles.grey}`}>Pending</span>
  }

  function getAvgScore(attempts: Attempt[]) {
    const scored = attempts.filter(a => a.avgScore !== null)
    if (scored.length === 0) return null
    const best = scored.reduce((a, b) => (b.avgScore! > a.avgScore! ? b : a))
    return best.avgScore
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

  function switchTab(tab: 'java' | 'marketing') {
    setActiveTab(tab)
    setRole(tab as FacultyRole)
  }

  function downloadCSV() {
    const rows = [
      ['Name', 'Email', 'Role', 'Status', 'Score', 'Review Status', 'Attempts', 'Created'],
      ...filteredTests.map(t => {
        const submitted = (t.attempts || []).filter(a => a.status === 'submitted')
        const status = submitted.length > 0 ? 'Submitted' : (t.attempts?.length > 0 ? 'In progress' : 'Pending')
        const avgScore = getAvgScore(t.attempts || [])
        const reviewed = submitted.some(a => a.reviewed)
        const reviewStatus = submitted.length > 0 ? (reviewed ? 'Done' : 'Pending') : ''
        return [
          t.candidates?.name || '',
          t.candidates?.email || '',
          t.role === 'java' ? 'B.Tech CS · Java' : 'MBA · Marketing',
          status,
          avgScore !== null ? String(avgScore) : '',
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
      {/* Top nav */}
      <div className={styles.top}>
        <div className={styles.logo}>S</div>
        <div>
          <div className={styles.topTitle}>Faculty Assessment Center</div>
          <div className={styles.topTag}>SUNSTONE · ELEVATE</div>
        </div>
        <div className={styles.spacer} />
        <span className={styles.adminName}>{adminName}</span>
        <button className={styles.logoutBtn} onClick={handleLogout}>Sign out</button>
      </div>

      {/* Role tabs */}
      <div className={styles.pageTabs}>
        {ROLES.map(r => (
          <button
            key={r.key}
            className={`${styles.pageTab} ${activeTab === r.key ? styles.pageTabActive : ''}`}
            onClick={() => switchTab(r.key as 'java' | 'marketing')}
          >
            {r.icon} {r.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        <h2 className={styles.heading}>Create test link</h2>
        <p className={styles.sub}>Enter the candidate&apos;s details and generate a unique test link to share.</p>

        <div className={styles.card}>
          <form onSubmit={handleSubmit}>
            <div className={styles.stepLabel}>1 · Candidate name</div>
            <input
              type="text"
              className={styles.input}
              placeholder="e.g. Dr. Suresh Iyer"
              value={candidateName}
              onChange={e => setCandidateName(e.target.value)}
              required
            />

            <div className={styles.stepLabel} style={{ marginTop: 16 }}>2 · Candidate email</div>
            <input
              type="email"
              className={styles.input}
              placeholder="candidate@example.com"
              value={candidateEmail}
              onChange={e => setCandidateEmail(e.target.value)}
              required
            />

            {error && <p className={styles.error} role="alert">{error}</p>}

            <button type="submit" className={styles.btn} disabled={isPending} style={{ marginTop: 20 }}>
              {isPending ? 'Generating…' : 'Generate test link →'}
            </button>
          </form>

          {generatedLink && (
            <div className={styles.linkBox}>
              <div className={styles.linkBoxLabel}>Test link for {generatedFor}</div>
              <div className={styles.linkRow}>
                <code className={styles.linkText}>{generatedLink}</code>
                <button className={styles.copyBtn} onClick={handleCopy}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className={styles.linkNote}>Send this link to the candidate. They will be asked to sign in before starting.</p>
            </div>
          )}
        </div>

        {/* Candidates table */}
        <div className={styles.tableSection}>
          <div className={styles.tabRow}>
            <div className={styles.tableActions}>
              <div className={styles.dateFilters}>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  title="From"
                />
                <span className={styles.dateSep}>to</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  title="To"
                />
              </div>
              <button className={styles.csvBtn} onClick={downloadCSV}>
                Download CSV
              </button>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Review Status</th>
                  <th>Attempts</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredTests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.emptyRow}>No candidates found</td>
                  </tr>
                ) : filteredTests.map(t => {
                  const avgScore = getAvgScore(t.attempts || [])
                  const reviewStatus = getReviewStatus(t.attempts || [])
                  return (
                    <tr key={t.id}>
                      <td>
                        <div className={styles.candName}>{t.candidates?.name || '—'}</div>
                        <div className={styles.candEmail}>{t.candidates?.email || ''}</div>
                      </td>
                      <td>{statusPill(t.attempts || [])}</td>
                      <td className={styles.scoreCell}>
                        {avgScore !== null ? (
                          <span className={styles.scoreVal}>{avgScore}/10</span>
                        ) : '—'}
                      </td>
                      <td>{reviewStatus || '—'}</td>
                      <td className={styles.attempts}>{t.attempts?.length || 0}</td>
                      <td className={styles.date}>
                        {new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td>
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
        </div>
      </div>
    </div>
  )
}
