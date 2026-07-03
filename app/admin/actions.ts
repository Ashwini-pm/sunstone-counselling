'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ROLES } from '@/lib/assessment-data'

export type FacultyRole = 'marketing' | 'java' | 'tech' | 'management' | 'coding' | 'aptitude' | 'comms'

export async function createTestLink(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const candidateName = formData.get('candidateName') as string
  const candidateEmail = formData.get('candidateEmail') as string
  const role = formData.get('role') as FacultyRole

  if (!candidateName || !candidateEmail || !role) {
    return { error: 'All fields are required' }
  }

  // upsert candidate profile (no auth account yet — created when they sign up)
  const { data: candidate, error: candidateError } = await supabase
    .from('candidates')
    .upsert({ name: candidateName, email: candidateEmail, created_by: user.id }, { onConflict: 'email' })
    .select()
    .single()

  if (candidateError) return { error: candidateError.message }

  // create test
  const { data: test, error: testError } = await supabase
    .from('tests')
    .insert({ role, created_by: user.id, candidate_id: candidate.id })
    .select()
    .single()

  if (testError) return { error: testError.message }

  const testUrl = `${process.env.NEXT_PUBLIC_APP_URL}/test/${test.id}/${candidate.id}/1`

  revalidatePath('/admin')
  return { testUrl, candidateName }
}

export async function getRecentTests() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('tests')
    .select(`
      id,
      role,
      created_at,
      candidates ( id, name, email ),
      attempts ( id, status, attempt_number )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return []

  const submittedIds = data.flatMap(t =>
    (t.attempts as { id: string; status: string }[])
      .filter(a => a.status === 'submitted')
      .map(a => a.id)
  )

  // reviewer invite counts per attempt
  const inviteCountByAttempt: Record<string, number> = {}
  // reviewer overall verdicts: attemptId -> { inviteId -> verdict }
  const reviewerVerdicts: Record<string, Record<string, string>> = {}
  // reviewer rubric scores: attemptId -> inviteId -> flat number[]
  const reviewerScoreVals: Record<string, Record<string, number[]>> = {}

  if (submittedIds.length > 0) {
    const [{ data: invites }, { data: scores }] = await Promise.all([
      supabase
        .from('reviewer_invites')
        .select('id, attempt_id')
        .in('attempt_id', submittedIds),
      supabase
        .from('scores')
        .select('attempt_id, station_id, reviewer_invite_id, evaluator_notes, verdict')
        .in('attempt_id', submittedIds)
        .not('reviewer_invite_id', 'is', null),
    ])

    if (invites) {
      for (const inv of invites) {
        inviteCountByAttempt[inv.attempt_id] = (inviteCountByAttempt[inv.attempt_id] || 0) + 1
      }
    }

    if (scores) {
      for (const s of scores) {
        const aid = s.attempt_id
        const rid = s.reviewer_invite_id as string
        if (s.station_id === 'overall' && s.verdict) {
          if (!reviewerVerdicts[aid]) reviewerVerdicts[aid] = {}
          reviewerVerdicts[aid][rid] = s.verdict
        } else if (s.evaluator_notes) {
          try {
            const parsed = JSON.parse(s.evaluator_notes) as Record<string, number>
            const vals = Object.values(parsed).filter(v => typeof v === 'number')
            if (!reviewerScoreVals[aid]) reviewerScoreVals[aid] = {}
            if (!reviewerScoreVals[aid][rid]) reviewerScoreVals[aid][rid] = []
            reviewerScoreVals[aid][rid].push(...vals)
          } catch { /* skip */ }
        }
      }
    }
  }

  return data.map(t => ({
    ...t,
    attempts: (t.attempts as { id: string; status: string; attempt_number: number }[]).map(a => {
      const totalInvites = inviteCountByAttempt[a.id] ?? 0
      const verdictMap = reviewerVerdicts[a.id] ?? {}
      const verdictsDone = Object.keys(verdictMap).length
      const allDone = totalInvites > 0 && verdictsDone >= totalInvites

      // avg per reviewer then avg of avgs
      let finalScore: number | null = null
      if (allDone) {
        const avgs: number[] = []
        for (const [rid, vals] of Object.entries(reviewerScoreVals[a.id] ?? {})) {
          if (vals.length > 0 && verdictMap[rid]) {
            avgs.push(vals.reduce((x, y) => x + y, 0) / vals.length)
          }
        }
        if (avgs.length > 0) {
          finalScore = Math.round((avgs.reduce((x, y) => x + y, 0) / avgs.length) * 10) / 10
        }
      }

      const verdictCounts = { yes: 0, no: 0, maybe: 0 }
      for (const v of Object.values(verdictMap)) {
        if (v === 'yes' || v === 'no' || v === 'maybe') verdictCounts[v]++
      }

      return {
        ...a,
        avgScore: finalScore,
        reviewed: allDone,
        totalInvites,
        verdictCounts,
      }
    }),
  }))
}

export async function inviteReviewer(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const attemptId   = formData.get('attemptId') as string
  const reviewerName  = formData.get('reviewerName') as string
  const reviewerEmail = formData.get('reviewerEmail') as string

  if (!attemptId || !reviewerName || !reviewerEmail) return { error: 'All fields required' }

  const { data: invite, error } = await supabase
    .from('reviewer_invites')
    .insert({ attempt_id: attemptId, name: reviewerName, email: reviewerEmail, created_by: user.id })
    .select()
    .single()

  if (error) return { error: error.message }

  const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/review/${invite.id}`
  revalidatePath(`/admin/evaluate/${attemptId}`)
  return { reviewUrl, reviewerName }
}

export async function getReviewerInvites(attemptId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('reviewer_invites')
    .select('id, name, email, created_at')
    .eq('attempt_id', attemptId)
    .order('created_at', { ascending: true })
  return data || []
}
