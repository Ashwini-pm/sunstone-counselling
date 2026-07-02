import { createClient } from '@/lib/supabase/server'
import { ROLES } from '@/lib/assessment-data'
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

  const { data: invite } = await supabase
    .from('reviewer_invites')
    .select('id, name, email, attempt_id')
    .eq('id', inviteId)
    .single()

  if (!invite) notFound()

  const [
    { data: attempt },
    { data: recordings },
    { data: existingScores },
  ] = await Promise.all([
    supabase
      .from('attempts')
      .select('id, attempt_number, test_id, candidate_id')
      .eq('id', invite.attempt_id)
      .single(),
    supabase
      .from('recordings')
      .select('station_id, r2_url, duration_sec')
      .eq('attempt_id', invite.attempt_id),
    supabase
      .from('scores')
      .select('station_id, verdict')
      .eq('reviewer_invite_id', inviteId),
  ])

  if (!attempt) notFound()

  const [{ data: candidate }, { data: test }] = await Promise.all([
    supabase.from('candidates').select('name').eq('id', attempt.candidate_id).single(),
    supabase.from('tests').select('role').eq('id', attempt.test_id).single(),
  ])

  const role = test?.role ? ROLES[test.role as keyof typeof ROLES] : null
  if (!role) notFound()

  const signedRecordings = await Promise.all(
    (recordings || []).map(async r => {
      const key = r.r2_url.split('.amazonaws.com/')[1]
      const signedUrl = key ? await getS3SignedUrl(key) : r.r2_url
      return { ...r, r2_url: signedUrl }
    })
  )

  const verdictMap: Record<string, string> = {}
  for (const s of (existingScores || [])) {
    if (s.verdict) verdictMap[s.station_id] = s.verdict
  }

  return (
    <ReviewerView
      inviteId={inviteId}
      reviewerName={invite.name}
      candidateName={candidate?.name || 'Candidate'}
      roleName={role.label}
      attemptNumber={attempt.attempt_number}
      steps={role.steps}
      recordings={signedRecordings}
      initialVerdicts={verdictMap}
    />
  )
}
