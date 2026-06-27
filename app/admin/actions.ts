'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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
    .limit(20)

  if (error) return []
  return data
}
