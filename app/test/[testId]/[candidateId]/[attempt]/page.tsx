import { createClient } from '@/lib/supabase/server'
import { ROLES } from '@/lib/assessment-data'
import { notFound } from 'next/navigation'
import TestGate from './TestGate'

export default async function TestPage({
  params,
}: {
  params: Promise<{ testId: string; candidateId: string; attempt: string }>
}) {
  const { testId, candidateId, attempt } = await params
  const attemptNumber = parseInt(attempt)
  const supabase = await createClient()

  // validate test exists
  const { data: test } = await supabase
    .from('tests')
    .select('id, role, expires_at')
    .eq('id', testId)
    .single()

  if (!test) notFound()

  // check expiry
  if (test.expires_at && new Date(test.expires_at) < new Date()) {
    return (
      <div style={{ padding: 40, fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h2>This test link has expired.</h2>
        <p style={{ color: '#556070', marginTop: 8 }}>Please contact your recruiter for a new link.</p>
      </div>
    )
  }

  // validate candidate
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, name, email')
    .eq('id', candidateId)
    .single()

  if (!candidate) notFound()

  const role = ROLES[test.role as keyof typeof ROLES]
  if (!role) notFound()

  // check if already submitted for this attempt number
  const { data: existingAttempt } = await supabase
    .from('attempts')
    .select('id, status, attempt_number')
    .eq('test_id', testId)
    .eq('candidate_id', candidateId)
    .eq('attempt_number', attemptNumber)
    .single()

  if (existingAttempt?.status === 'submitted') {
    return (
      <div style={{ padding: 40, fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h2>Attempt {attemptNumber} already submitted.</h2>
        <p style={{ color: '#556070', marginTop: 8 }}>
          Your responses have been recorded. Our panel will review and get back to you.
        </p>
      </div>
    )
  }

  return (
    <TestGate
      testId={testId}
      candidateId={candidateId}
      candidateName={candidate.name}
      candidateEmail={candidate.email}
      attemptNumber={attemptNumber}
      role={test.role}
      existingAttemptId={existingAttempt?.id || null}
    />
  )
}
