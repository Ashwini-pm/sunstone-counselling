import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Candidate/reviewer flows: always go back to their URL, never to /admin or /login
  const isCandidateFlow = next.startsWith('/test/') || next.startsWith('/review/')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)

    if (isCandidateFlow) {
      return NextResponse.redirect(new URL(next, request.url))
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'admin') {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
    }
    return NextResponse.redirect(new URL(next, request.url))
  }

  // No code — send candidates back to their URL to try again; others to login
  return NextResponse.redirect(new URL(isCandidateFlow ? next : '/login', request.url))
}
