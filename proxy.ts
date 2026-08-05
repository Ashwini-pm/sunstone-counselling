import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

/**
 * Gate the admin panel. The lead-facing /q routes gate themselves, because a
 * lead needs to see the "wrong account" screen rather than be bounced.
 */
export default auth((request) => {
  const { pathname } = request.nextUrl
  const session = request.auth

  if (pathname.startsWith('/admin')) {
    if (!session?.user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
    if (session.user.role !== 'admin') {
      return NextResponse.redirect(new URL('/login?denied=1', request.url))
    }
  }

  // Signed-in admins have no reason to sit on the login page.
  if (pathname === '/login' && session?.user?.role === 'admin') {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/admin/:path*', '/login'],
}
