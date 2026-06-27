'use client'

'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { createTestLink, type FacultyRole } from './actions'
import styles from './admin.module.css'

const ROLES = [
  { key: 'java', label: 'B.Tech CS · Java', sub: 'Programming in Java', icon: '⌨️' },
  { key: 'marketing', label: 'MBA · Marketing', sub: 'Marketing Management', icon: '📈' },
]

type Test = {
  id: string
  role: string
  created_at: string
  candidates: { id: string; name: string; email: string } | null
  attempts: { id: string; status: string; attempt_number: number }[]
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

  const [role, setRole] = useState<FacultyRole | null>(null)
  const [candidateName, setCandidateName] = useState('')
  const [candidateEmail, setCandidateEmail] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [generatedFor, setGeneratedFor] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role) { setError('Please select a faculty type.'); return }
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
        setRole(null)
      }
    })
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(generatedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function statusPill(attempts: Test['attempts']) {
    if (!attempts || attempts.length === 0) return <span className={`${styles.pill} ${styles.grey}`}>Pending</span>
    const latest = attempts.reduce((a, b) => a.attempt_number > b.attempt_number ? a : b)
    if (latest.status === 'submitted') return <span className={`${styles.pill} ${styles.green}`}>Submitted</span>
    return <span className={`${styles.pill} ${styles.amber}`}>In progress</span>
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

      <div className={styles.content}>
        <h2 className={styles.heading}>Create test link</h2>
        <p className={styles.sub}>Select the faculty type, enter the candidate&apos;s details, and generate a unique test link to share.</p>

        <div className={styles.card}>
          <form onSubmit={handleSubmit}>
            {/* Step 1: Role */}
            <div className={styles.stepLabel}>1 · Faculty type</div>
            <div className={styles.rolePicker}>
              {ROLES.map(r => (
                <div
                  key={r.key}
                  className={`${styles.roleCard} ${role === r.key ? styles.roleCardSel : ''}`}
                  role="radio"
                  tabIndex={0}
                  aria-checked={role === r.key}
                  onClick={() => setRole(r.key as FacultyRole)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setRole(r.key as FacultyRole) }}
                >
                  <div className={styles.roleIcon}>{r.icon}</div>
                  <div className={styles.roleTitle}>{r.label}</div>
                  <div className={styles.roleSub}>{r.sub}</div>
                </div>
              ))}
            </div>

            {/* Step 2: Name */}
            <div className={styles.stepLabel} style={{ marginTop: 20 }}>2 · Candidate name</div>
            <input
              type="text"
              className={styles.input}
              placeholder="e.g. Dr. Suresh Iyer"
              value={candidateName}
              onChange={e => setCandidateName(e.target.value)}
              required
            />

            {/* Step 3: Email */}
            <div className={styles.stepLabel} style={{ marginTop: 16 }}>3 · Candidate email</div>
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

          {/* Generated link */}
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

        {/* Recent tests */}
        {recentTests.length > 0 && (
          <>
            <h2 className={styles.heading} style={{ marginTop: 36 }}>Recent test links</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recentTests.map(t => (
                    <tr key={t.id}>
                      <td>
                        <div className={styles.candName}>{t.candidates?.name || '—'}</div>
                        <div className={styles.candEmail}>{t.candidates?.email || ''}</div>
                      </td>
                      <td>
                        <span className={`${styles.pill} ${styles.grey}`}>
                          {t.role === 'java' ? 'B.Tech CS · Java' : 'MBA · Marketing'}
                        </span>
                      </td>
                      <td>{statusPill(t.attempts)}</td>
                      <td className={styles.attempts}>{t.attempts?.length || 0}</td>
                      <td className={styles.date}>{new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td>
                        {t.attempts?.filter((a: { status: string }) => a.status === 'submitted').map((a: { id: string }) => (
                          <Link key={a.id} href={`/admin/evaluate/${a.id}`} className={styles.reviewLink}>
                            Review →
                          </Link>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
