import { createClient } from '@/lib/supabase/server'
import { ROLES } from '@/lib/assessment-data'
import { getS3SignedUrl } from '@/lib/s3'
import { notFound, redirect } from 'next/navigation'
import EvaluatorView from './EvaluatorView'

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
    .select('id, status, violation_count, is_flagged, attempt_number, test_id, candidate_id')
    .eq('id', attemptId)
    .single()

  if (!attempt) notFound()

  const [{ data: candidate }, { data: test }, { data: recordings }, { data: existingScores }] = await Promise.all([
    supabase.from('candidates').select('name, email').eq('id', attempt.candidate_id).single(),
    supabase.from('tests').select('role').eq('id', attempt.test_id).single(),
    supabase.from('recordings').select('station_id, r2_url, duration_sec, plan_notes').eq('attempt_id', attemptId),
    supabase.from('scores').select('station_id, rubric_key, human_score, evaluator_notes').eq('attempt_id', attemptId),
  ])

  const role = test?.role ? ROLES[test.role as keyof typeof ROLES] : null
  if (!role) notFound()

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
      candidateName={candidate?.name || 'Unknown'}
      candidateEmail={candidate?.email || ''}
      roleName={role.label}
      roleKey={test!.role}
      attemptNumber={attempt.attempt_number}
      status={attempt.status}
      violationCount={attempt.violation_count || 0}
      isFlagged={attempt.is_flagged || false}
      steps={role.steps}
      recordings={signedRecordings}
      existingScores={existingScores || []}
    />
  )
}
