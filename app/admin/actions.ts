'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ROLES } from '@/lib/assessment-data'

export type FacultyRole = 'marketing' | 'java'

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

  // fetch scores for all submitted attempts
  const submittedIds = data.flatMap(t =>
    (t.attempts as { id: string; status: string }[])
      .filter(a => a.status === 'submitted')
      .map(a => a.id)
  )

  // Map attemptId -> role so we can check completion per role
  const attemptRoleMap: Record<string, string> = {}
  for (const t of data) {
    for (const a of (t.attempts as { id: string; status: string }[])) {
      attemptRoleMap[a.id] = t.role
    }
  }
  const totalRubricForRole: Record<string, number> = Object.fromEntries(
    Object.entries(ROLES).map(([key, role]) => [key, role.steps.flatMap(s => s.rubric).length])
  )

  const scoresByAttempt: Record<string, { avg: number; reviewed: boolean }> = {}
  if (submittedIds.length > 0) {
    const { data: scores } = await supabase
      .from('scores')
      .select('attempt_id, human_score')
      .in('attempt_id', submittedIds)
      .not('human_score', 'is', null)

    if (scores) {
      const grouped: Record<string, number[]> = {}
      for (const s of scores) {
        if (!grouped[s.attempt_id]) grouped[s.attempt_id] = []
        grouped[s.attempt_id].push(s.human_score)
      }
      for (const [id, vals] of Object.entries(grouped)) {
        const role = attemptRoleMap[id]
        const totalRubric = totalRubricForRole[role] ?? 0
        scoresByAttempt[id] = {
          avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
          reviewed: totalRubric > 0 && vals.length >= totalRubric,
        }
      }
    }
  }

  return data.map(t => ({
    ...t,
    attempts: (t.attempts as { id: string; status: string; attempt_number: number }[]).map(a => ({
      ...a,
      avgScore: scoresByAttempt[a.id]?.avg ?? null,
      reviewed: scoresByAttempt[a.id]?.reviewed ?? false,
    })),
  }))
}
