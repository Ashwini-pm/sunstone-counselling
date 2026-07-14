import { createClient } from '@/lib/supabase/server'
import { ROLES, NEW_ROLE_LABELS, buildSteps } from '@/lib/assessment-data'
import type { Step } from '@/lib/assessment-data'
import { getS3SignedUrl } from '@/lib/s3'
import { notFound, redirect } from 'next/navigation'
import EvaluatorView from './EvaluatorView'
import { getReviewerInvites } from '@/app/admin/actions'

export default async function EvaluatePage({
  params,
}: {
  params: Promise<{ attemptId: string }>
}) {
  const { attemptId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/login')

  const { data: attempt } = await supabase
    .from('attempts')
    .select('id, status, violation_count, is_flagged, attempt_number, test_id, candidate_id, total_duration_sec')
    .eq('id', attemptId)
    .single()

  if (!attempt) notFound()

  const [{ data: candidate }, { data: test }, { data: recordings }, { data: existingScores }, reviewerInvites] = await Promise.all([
    supabase.from('candidates').select('name, email').eq('id', attempt.candidate_id).single(),
    supabase.from('tests').select('role').eq('id', attempt.test_id).single(),
    supabase.from('recordings').select('station_id, r2_url, duration_sec, plan_notes').eq('attempt_id', attemptId),
    supabase.from('scores').select('station_id, rubric_key, human_score, evaluator_notes').eq('attempt_id', attemptId).is('reviewer_invite_id', null),
    getReviewerInvites(attemptId),
  ])

  // fetch all reviewer scores (one row per station: verdict + rubric scores as JSON in evaluator_notes)
  const { data: reviewerScores } = await supabase
    .from('scores')
    .select('reviewer_invite_id, station_id, evaluator_notes, verdict')
    .eq('attempt_id', attemptId)
    .not('reviewer_invite_id', 'is', null)

  const rawRole = test?.role ?? ''

  // Always try attempt_questions first — legacy roles (java/marketing) now use the new question bank too
  const { data: aqRows } = await supabase
    .from('attempt_questions')
    .select('station_id, position, question_id, questions(content, doubts)')
    .eq('attempt_id', attemptId)
    .order('position', { ascending: true })

  let roleLabel: string
  let steps: Step[]

  const legacyRole = ROLES[rawRole as keyof typeof ROLES]
  const newRoleLabel = NEW_ROLE_LABELS[rawRole as keyof typeof NEW_ROLE_LABELS]

  if (!legacyRole && !newRoleLabel) { notFound(); return null as never }

  roleLabel = legacyRole ? legacyRole.label : newRoleLabel

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
    // pure legacy attempt (pre-question-bank)
    steps = legacyRole ? legacyRole.steps : []
  }

  // swap stored S3 URLs for presigned playback URLs (1h expiry)
  const signedRecordings = await Promise.all(
    (recordings || []).map(async r => {
      const key = r.r2_url.split('.amazonaws.com/')[1]
      const signedUrl = key ? await getS3SignedUrl(key) : r.r2_url
      return { ...r, r2_url: signedUrl }
    })
  )

  return (
    <EvaluatorView
      attemptId={attemptId}
      candidateId={attempt.candidate_id}
      candidateName={candidate?.name || 'Unknown'}
      candidateEmail={candidate?.email || ''}
      roleName={roleLabel}
      roleKey={rawRole}
      attemptNumber={attempt.attempt_number}
      status={attempt.status}
      violationCount={attempt.violation_count || 0}
      isFlagged={attempt.is_flagged || false}
      steps={steps}
      recordings={signedRecordings}
      existingScores={existingScores || []}
      reviewerInvites={reviewerInvites}
      reviewerScores={reviewerScores || []}
      totalDurationSec={attempt.total_duration_sec || null}
    />
  )
}
