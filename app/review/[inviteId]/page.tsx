import { createClient } from '@/lib/supabase/server'
import { ROLES, NEW_ROLE_LABELS, buildSteps } from '@/lib/assessment-data'
import type { Step } from '@/lib/assessment-data'
import { getS3SignedUrl } from '@/lib/s3'
import { notFound } from 'next/navigation'
import ReviewerView from './ReviewerView'

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ inviteId: string }>
}) {
  const { inviteId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Use SECURITY DEFINER RPC so wrong-email users get the "wrong account" screen
  const { data: inviteRows } = await supabase.rpc('get_reviewer_invite', { invite_id: inviteId })
  const invite = inviteRows?.[0] ?? null

  if (!invite) notFound()

  if (user?.email?.toLowerCase() !== invite.email.toLowerCase()) {
    const isWrongAccount = !!user
    return (
      <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {/* Left dark panel */}
        <div style={{
          background: '#0d1b3e',
          backgroundImage: 'radial-gradient(ellipse 60% 50% at 20% 30%, rgba(59,130,246,0.12) 0%, transparent 70%)',
          padding: '52px 56px 40px',
          display: 'flex', flexDirection: 'column', color: '#fff', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <img src="/sunstone-logo.svg" alt="Sunstone" style={{ height: 26, width: 'auto', maxWidth: 180, filter: 'brightness(0) invert(1)', display: 'block', marginBottom: 4 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: '#f59e0b', textTransform: 'uppercase' }}>Review Portal</span>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Faculty Assessment</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1, padding: '32px 0' }}>
            <h1 style={{ fontSize: 44, fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 20px' }}>
              Review.<br /><span style={{ color: '#f59e0b' }}>Shape what teaching looks like.</span>
            </h1>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.65, maxWidth: 340, margin: '0 0 36px' }}>
              You've been invited to assess a faculty candidate. Your evaluation helps Sunstone hire better teachers.
            </p>
            {['Watch candidate recordings', 'Score across 5 teaching dimensions', 'Give a final hire/no-hire verdict'].map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 18px', fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: 500, marginBottom: 10 }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
                  {['▶️','✏️','✅'][i]}
                </span>
                {f}
              </div>
            ))}
          </div>
          <div style={{ position: 'relative', zIndex: 1, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0, display: 'inline-block' }} />
            All systems operational
          </div>
        </div>

        {/* Right white panel */}
        <div style={{ background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 64px' }}>
          <div style={{ width: '100%', maxWidth: 360 }}>
            <img src="/sunstone-logo.svg" alt="Sunstone" style={{ height: 28, width: 'auto', display: 'block', marginBottom: 40 }} />
            <h2 style={{ fontSize: 28, fontWeight: 800, color: '#0d1b3e', letterSpacing: '-0.02em', margin: '0 0 8px' }}>
              {isWrongAccount ? 'Wrong account' : 'Sign in to review'}
            </h2>
            <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 32px' }}>
              {isWrongAccount
                ? <>This review link was sent to <strong style={{ color: '#0d1b3e' }}>{invite.email}</strong>. You're signed in as <strong style={{ color: '#b91c1c' }}>{user?.email}</strong>.</>
                : <>This review link was sent to <strong style={{ color: '#0d1b3e' }}>{invite.email}</strong>. Please sign in with that Google account to continue.</>
              }
            </p>
            <a
              href={`/login?next=/review/${inviteId}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', padding: '14px 20px', background: '#0d1b3e', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 16px rgba(13,27,62,0.25)' }}
            >
              {isWrongAccount ? 'Sign in with correct account' : 'Continue with Google'}
            </a>
            <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 14 }}>
              Use <strong style={{ color: '#0d1b3e' }}>{invite.email}</strong>
            </p>
          </div>
        </div>
      </div>
    )
  }

  const [
    { data: attempt },
    { data: recordings },
    { data: existingScores },
  ] = await Promise.all([
    supabase
      .from('attempts')
      .select('id, attempt_number, test_id, candidate_id, total_duration_sec')
      .eq('id', invite.attempt_id)
      .single(),
    supabase
      .from('recordings')
      .select('station_id, r2_url, duration_sec')
      .eq('attempt_id', invite.attempt_id),
    supabase
      .from('scores')
      .select('station_id, evaluator_notes, verdict')
      .eq('reviewer_invite_id', inviteId),
  ])

  if (!attempt) notFound()

  const [{ data: candidate }, { data: test }] = await Promise.all([
    supabase.from('candidates').select('name').eq('id', attempt.candidate_id).single(),
    supabase.from('tests').select('role').eq('id', attempt.test_id).single(),
  ])

  const rawRole = test?.role ?? ''

  const { data: aqRows } = await supabase
    .from('attempt_questions')
    .select('station_id, position, question_id, questions(content, doubts)')
    .eq('attempt_id', invite.attempt_id)
    .order('position', { ascending: true })

  const legacyRole = ROLES[rawRole as keyof typeof ROLES]
  const newRoleLabel = NEW_ROLE_LABELS[rawRole as keyof typeof NEW_ROLE_LABELS]

  if (!legacyRole && !newRoleLabel) { notFound(); return null as never }

  const roleLabel: string = legacyRole ? legacyRole.label : newRoleLabel

  let steps: Step[]
  if (aqRows && aqRows.length > 0) {
    steps = buildSteps(aqRows.map((r: any) => {
      const q = Array.isArray(r.questions) ? r.questions[0] : r.questions
      return {
        stationId: r.station_id,
        position: r.position,
        questionId: r.question_id,
        content: q?.content ?? null,
        doubts: q?.doubts ?? null,
      }
    }))
  } else {
    steps = legacyRole ? legacyRole.steps : []
  }

  const signedRecordings = await Promise.all(
    (recordings || []).map(async r => {
      const key = r.r2_url.split('.amazonaws.com/')[1]
      const signedUrl = key ? await getS3SignedUrl(key) : r.r2_url
      return { ...r, r2_url: signedUrl }
    })
  )

  const verdictMap: Record<string, string> = {}
  const scoresMap: Record<string, Record<string, number>> = {}
  for (const s of (existingScores || [])) {
    if (s.verdict) verdictMap[s.station_id] = s.verdict
    if (s.evaluator_notes) {
      try { scoresMap[s.station_id] = JSON.parse(s.evaluator_notes) } catch {}
    }
  }

  return (
    <ReviewerView
      inviteId={inviteId}
      reviewerName={invite.name}
      candidateName={candidate?.name || 'Candidate'}
      roleName={roleLabel}
      attemptNumber={attempt.attempt_number}
      steps={steps}
      recordings={signedRecordings}
      initialVerdicts={verdictMap}
      initialScores={scoresMap}
      totalDurationSec={attempt.total_duration_sec || null}
    />
  )
}
