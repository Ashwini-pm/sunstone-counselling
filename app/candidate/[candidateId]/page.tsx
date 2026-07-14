import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ROLES, NEW_ROLE_LABELS } from '@/lib/assessment-data'

function roleLabel(role: string): string {
  if (ROLES[role as keyof typeof ROLES]) return ROLES[role as keyof typeof ROLES].label
  if (NEW_ROLE_LABELS[role as keyof typeof NEW_ROLE_LABELS]) return NEW_ROLE_LABELS[role as keyof typeof NEW_ROLE_LABELS]
  return role
}

function fmt(secs: number) {
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
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

  // For each submitted attempt, fetch reviewer scores
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

  return (
    <div style={{ minHeight: '100vh', background: '#f7f9fb', fontFamily: "'Hanken Grotesk', system-ui, sans-serif" }}>
      <header style={{ background: '#fff', borderBottom: '1px solid rgba(198,198,205,0.3)', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', gap: 16 }}>
        <img src="/sunstone-logo.svg" alt="Sunstone" style={{ height: 20 }} />
        <span style={{ fontSize: 13, color: '#76777d' }}>Candidate Profile</span>
      </header>

      <main style={{ maxWidth: 720, margin: '40px auto', padding: '0 24px' }}>
        {/* Candidate header */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '32px', marginBottom: 20, border: '1px solid rgba(198,198,205,0.2)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#191c1e' }}>{candidate.name}</div>
            <div style={{ fontSize: 14, color: '#76777d', marginTop: 4 }}>{candidate.email}</div>
          </div>
        </div>

        {/* Assessment history */}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#76777d', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
          Assessment History
        </div>
        {(tests ?? []).length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#76777d', border: '1px solid rgba(198,198,205,0.2)' }}>
            No assessments yet.
          </div>
        ) : (tests ?? []).map((t: any) => {
          const latestAttempt = (t.attempts as any[]).length > 0
            ? (t.attempts as any[]).reduce((a: any, b: any) => a.attempt_number > b.attempt_number ? a : b)
            : null
          const submitted = (t.attempts as any[]).filter(a => a.status === 'submitted')
          const latestSubmitted = submitted.length > 0 ? submitted.reduce((a: any, b: any) => a.attempt_number > b.attempt_number ? a : b) : null
          const totalInvites = latestSubmitted ? (inviteMap[latestSubmitted.id] ?? 0) : 0
          const verdicts = latestSubmitted ? (verdictMap[latestSubmitted.id] ?? {}) : {}
          const vc = { yes: 0, no: 0, maybe: 0 }
          for (const v of Object.values(verdicts)) {
            if (v === 'yes' || v === 'no' || v === 'maybe') vc[v]++
          }
          const avgScore = latestSubmitted ? avgScoreMap[latestSubmitted.id] : null
          const reviewed = totalInvites > 0 && Object.keys(verdicts).length >= totalInvites

          return (
            <div key={t.id} style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', marginBottom: 12, border: '1px solid rgba(198,198,205,0.2)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#191c1e' }}>{roleLabel(t.role)}</div>
                  <div style={{ fontSize: 13, color: '#76777d', marginTop: 4 }}>
                    Created {new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}{(t.attempts as any[]).length} attempt{(t.attempts as any[]).length !== 1 ? 's' : ''}
                    {latestSubmitted?.total_duration_sec && <> · ⏱ {fmt(latestSubmitted.total_duration_sec)}</>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {!latestAttempt || latestAttempt.status !== 'submitted' ? (
                    <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', background: '#fef3c7', color: '#b45309' }}>
                      {latestAttempt ? 'IN PROGRESS' : 'PENDING'}
                    </span>
                  ) : (
                    <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', background: '#dcfce7', color: '#15803d' }}>
                      SUBMITTED
                    </span>
                  )}
                  {latestSubmitted && (
                    reviewed ? (
                      <>
                        {avgScore !== null && (
                          <span style={{ padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: 700, background: 'rgba(201,230,255,0.3)', color: '#006591', border: '1px solid #c9e6ff' }}>
                            {avgScore}/10
                          </span>
                        )}
                        <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#f2f4f6', color: '#45464d' }}>
                          {vc.yes > 0 && `✓${vc.yes} `}{vc.no > 0 && `✗${vc.no} `}{vc.maybe > 0 && `~${vc.maybe}`}
                        </span>
                      </>
                    ) : (
                      <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: '#f2f4f6', color: '#76777d' }}>
                        {totalInvites > 0 ? 'REVIEW PENDING' : 'NO REVIEWERS'}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </main>
    </div>
  )
}
