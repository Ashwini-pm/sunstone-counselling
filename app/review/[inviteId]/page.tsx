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
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui', background: '#f5f5f5' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: '40px 48px', maxWidth: 420, textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Wrong account</h2>
          <p style={{ color: '#666', margin: '0 0 24px', lineHeight: 1.5 }}>
            This review link was sent to <strong>{invite.email}</strong>.<br />
            You are signed in as <strong>{user?.email}</strong>.
          </p>
          <a href={`/login?next=/review/${inviteId}`} style={{ display: 'inline-block', background: '#111', color: '#fff', borderRadius: 8, padding: '10px 24px', textDecoration: 'none', fontSize: 14 }}>
            Sign in with the correct account
          </a>
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
