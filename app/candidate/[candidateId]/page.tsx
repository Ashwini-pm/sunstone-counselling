import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ROLES, NEW_ROLE_LABELS } from '@/lib/assessment-data'
import styles from './candidate.module.css'

function roleLabel(role: string): string {
  if (ROLES[role as keyof typeof ROLES]) return ROLES[role as keyof typeof ROLES].label
  if (NEW_ROLE_LABELS[role as keyof typeof NEW_ROLE_LABELS]) return NEW_ROLE_LABELS[role as keyof typeof NEW_ROLE_LABELS]
  return role
}

function fmt(secs: number) {
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function CandidateProfilePage({
  params,
}: {
  params: Promise<{ candidateId: string }>
}) {
  const { candidateId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/candidate/${candidateId}`)

  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, name, email')
    .eq('id', candidateId)
    .single()

  if (!candidate) notFound()

  const { data: tests } = await supabase
    .from('tests')
    .select('id, role, created_at, attempts(id, status, attempt_number, total_duration_sec)')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })

  const submittedAttemptIds = (tests ?? []).flatMap(t =>
    (t.attempts as any[]).filter(a => a.status === 'submitted').map((a: any) => a.id)
  )

  let inviteMap: Record<string, number> = {}
  let verdictMap: Record<string, Record<string, string>> = {}
  let avgScoreMap: Record<string, number | null> = {}

  if (submittedAttemptIds.length > 0) {
    const [{ data: invites }, { data: scores }] = await Promise.all([
      supabase.from('reviewer_invites').select('id, attempt_id').in('attempt_id', submittedAttemptIds),
      supabase.from('scores')
        .select('attempt_id, station_id, reviewer_invite_id, evaluator_notes, verdict')
        .in('attempt_id', submittedAttemptIds)
        .not('reviewer_invite_id', 'is', null),
    ])
    for (const inv of (invites ?? [])) {
      inviteMap[inv.attempt_id] = (inviteMap[inv.attempt_id] || 0) + 1
    }
    const reviewerScoreVals: Record<string, Record<string, number[]>> = {}
    for (const s of (scores ?? [])) {
      const aid = s.attempt_id as string
      const rid = s.reviewer_invite_id as string
      if (s.station_id === 'overall' && s.verdict) {
        if (!verdictMap[aid]) verdictMap[aid] = {}
        verdictMap[aid][rid] = s.verdict
      } else if (s.evaluator_notes) {
        try {
          const parsed = JSON.parse(s.evaluator_notes) as Record<string, number>
          const vals = Object.values(parsed).filter(v => typeof v === 'number')
          if (!reviewerScoreVals[aid]) reviewerScoreVals[aid] = {}
          if (!reviewerScoreVals[aid][rid]) reviewerScoreVals[aid][rid] = []
          reviewerScoreVals[aid][rid].push(...vals)
        } catch {}
      }
    }
    for (const aid of submittedAttemptIds) {
      const totalInvites = inviteMap[aid] ?? 0
      const verdicts = verdictMap[aid] ?? {}
      const verdictsDone = Object.keys(verdicts).length
      if (totalInvites > 0 && verdictsDone >= totalInvites) {
        const avgs: number[] = []
        for (const [rid, vals] of Object.entries(reviewerScoreVals[aid] ?? {})) {
          if (vals.length > 0 && verdicts[rid]) avgs.push(vals.reduce((x, y) => x + y, 0) / vals.length)
        }
        avgScoreMap[aid] = avgs.length > 0 ? Math.round((avgs.reduce((x, y) => x + y, 0) / avgs.length) * 10) / 10 : null
      } else {
        avgScoreMap[aid] = null
      }
    }
  }

  const initials = candidate.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
  const allTests = tests ?? []
  const totalSubmitted = submittedAttemptIds.length
  const reviewedScores = Object.values(avgScoreMap).filter(v => v !== null) as number[]
  const overallAvg = reviewedScores.length > 0
    ? Math.round((reviewedScores.reduce((a, b) => a + b, 0) / reviewedScores.length) * 10) / 10
    : null

  // Count all verdicts across all attempts
  const globalVerdicts = { yes: 0, no: 0, maybe: 0 }
  for (const vMap of Object.values(verdictMap)) {
    for (const v of Object.values(vMap)) {
      if (v === 'yes' || v === 'no' || v === 'maybe') globalVerdicts[v]++
    }
  }

  return (
    <div className={styles.page}>
      {/* Nav */}
      <header className={styles.nav}>
        <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.navLogo} />
        <span className={styles.navSep}>/</span>
        <span className={styles.navCrumb}>Candidate Profile</span>
      </header>

      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          {/* Avatar */}
          <div className={styles.avatarBlock}>
            <div className={styles.avatarGlow} />
            <div className={styles.heroAvatar}>{initials}</div>
          </div>

          {/* Text */}
          <div className={styles.heroText}>
            <h1 className={styles.heroName}>{candidate.name}</h1>
            <p className={styles.heroEmail}>{candidate.email}</p>
            <div className={styles.heroBadges}>
              {allTests.map(t => (
                <span key={t.id} className={styles.heroBadge}>
                  <span className={styles.heroBadgeDot} />
                  {roleLabel(t.role)}
                </span>
              ))}
            </div>
            <div className={styles.heroStats}>
              <div className={styles.heroStat}>
                <div className={styles.heroStatNum}>{allTests.length}</div>
                <div className={styles.heroStatLbl}>Roles</div>
              </div>
              <div className={styles.heroStat}>
                <div className={styles.heroStatNum}>{totalSubmitted}</div>
                <div className={styles.heroStatLbl}>Submitted</div>
              </div>
              {overallAvg !== null && (
                <div className={styles.heroStat}>
                  <div className={styles.heroStatNum}>{overallAvg}</div>
                  <div className={styles.heroStatLbl}>Avg Score</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className={styles.body}>
        {/* Left: assessment cards */}
        <div>
          <div className={styles.sectionLabel}>Assessment History</div>
          {allTests.length === 0 ? (
            <div className={styles.emptyState}>No assessments yet.</div>
          ) : allTests.map((t: any) => {
            const attempts = t.attempts as any[]
            const latestAttempt = attempts.length > 0
              ? attempts.reduce((a: any, b: any) => a.attempt_number > b.attempt_number ? a : b)
              : null
            const submitted = attempts.filter(a => a.status === 'submitted')
            const latestSubmitted = submitted.length > 0
              ? submitted.reduce((a: any, b: any) => a.attempt_number > b.attempt_number ? a : b)
              : null
            const totalInvites = latestSubmitted ? (inviteMap[latestSubmitted.id] ?? 0) : 0
            const verdicts = latestSubmitted ? (verdictMap[latestSubmitted.id] ?? {}) : {}
            const vc = { yes: 0, no: 0, maybe: 0 }
            for (const v of Object.values(verdicts)) {
              if (v === 'yes' || v === 'no' || v === 'maybe') vc[v]++
            }
            const avgScore = latestSubmitted ? avgScoreMap[latestSubmitted.id] : null
            const reviewed = totalInvites > 0 && Object.keys(verdicts).length >= totalInvites

            const statusClass = !latestAttempt || latestAttempt.status !== 'submitted'
              ? styles.statusProgress
              : styles.statusSubmitted

            const statusLabel = !latestAttempt
              ? 'PENDING'
              : latestAttempt.status !== 'submitted' ? 'IN PROGRESS' : 'SUBMITTED'

            return (
              <div key={t.id} className={styles.assessmentCard}>
                <div className={styles.assessmentTop}>
                  <div>
                    <div className={styles.assessmentRole}>{roleLabel(t.role)}</div>
                    <div className={styles.assessmentMeta}>
                      <span>{fmtDate(t.created_at)}</span>
                      <span className={styles.metaDot}>·</span>
                      <span>{attempts.length} attempt{attempts.length !== 1 ? 's' : ''}</span>
                      {latestSubmitted?.total_duration_sec && (
                        <>
                          <span className={styles.metaDot}>·</span>
                          <span>⏱ {fmt(latestSubmitted.total_duration_sec)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`${styles.statusBadge} ${statusClass}`}>{statusLabel}</span>
                </div>

                {avgScore !== null && (
                  <div className={styles.scoreSection}>
                    <div className={styles.scoreRow}>
                      <span className={styles.scoreLabel}>Reviewer score</span>
                      <div className={styles.scoreBar}>
                        <div className={styles.scoreBarFill} style={{ width: `${(avgScore / 10) * 100}%` }} />
                      </div>
                      <span className={styles.scoreVal}>{avgScore}/10</span>
                    </div>
                  </div>
                )}

                {latestSubmitted && (
                  <div className={styles.verdictRow}>
                    {reviewed ? (
                      <>
                        {vc.yes > 0 && <span className={`${styles.verdictChip} ${styles.vc_yes}`}>✓ Yes ×{vc.yes}</span>}
                        {vc.no > 0 && <span className={`${styles.verdictChip} ${styles.vc_no}`}>✗ No ×{vc.no}</span>}
                        {vc.maybe > 0 && <span className={`${styles.verdictChip} ${styles.vc_maybe}`}>~ Maybe ×{vc.maybe}</span>}
                      </>
                    ) : (
                      <span className={`${styles.verdictChip} ${styles.vc_pending}`}>
                        {totalInvites > 0 ? 'Review pending' : 'No reviewers assigned'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Right: summary sidebar */}
        <div className={styles.sidebar}>
          <div className={styles.sideCard}>
            <div className={styles.sideCardTitle}>Overview</div>
            <div className={styles.statGrid}>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{allTests.length}</div>
                <div className={styles.statLbl}>Roles</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{totalSubmitted}</div>
                <div className={styles.statLbl}>Submitted</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{overallAvg ?? '—'}</div>
                <div className={styles.statLbl}>Avg Score</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{globalVerdicts.yes + globalVerdicts.no + globalVerdicts.maybe}</div>
                <div className={styles.statLbl}>Reviews</div>
              </div>
            </div>
          </div>

          {(globalVerdicts.yes + globalVerdicts.no + globalVerdicts.maybe) > 0 && (
            <div className={styles.sideCard}>
              <div className={styles.sideCardTitle}>Verdicts</div>
              {globalVerdicts.yes > 0 && (
                <div className={styles.verdictSummaryRow}>
                  <span className={styles.verdictSummaryLabel}>✓ Selected</span>
                  <span className={styles.verdictSummaryVal}>{globalVerdicts.yes}</span>
                </div>
              )}
              {globalVerdicts.maybe > 0 && (
                <div className={styles.verdictSummaryRow}>
                  <span className={styles.verdictSummaryLabel}>~ Maybe</span>
                  <span className={styles.verdictSummaryVal}>{globalVerdicts.maybe}</span>
                </div>
              )}
              {globalVerdicts.no > 0 && (
                <div className={styles.verdictSummaryRow}>
                  <span className={styles.verdictSummaryLabel}>✗ Not selected</span>
                  <span className={styles.verdictSummaryVal}>{globalVerdicts.no}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
