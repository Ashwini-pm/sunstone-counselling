import NextAuth, { type DefaultSession } from 'next-auth'
import Google from 'next-auth/providers/google'
import { sql } from './db'

/** Ops team domain. Anyone else who signs in is treated as a lead. */
const ADMIN_DOMAIN = '@sunstone.in'

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string
      role: 'admin' | 'lead'
    } & DefaultSession['user']
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],

  // JWT sessions: no adapter tables, no database round trip per request.
  session: { strategy: 'jwt' },

  pages: { signIn: '/login' },

  callbacks: {
    /**
     * Runs on sign-in and on every token refresh. We mirror the user into our
     * own `users` table so the admin panel can attribute created leads, and we
     * stamp the role onto the token so middleware can read it without a query.
     */
    async jwt({ token, user }) {
      const email = (user?.email ?? token.email ?? '').toLowerCase()
      if (!email) return token

      const role: 'admin' | 'lead' = email.endsWith(ADMIN_DOMAIN) ? 'admin' : 'lead'
      token.role = role

      // Only touch the database on actual sign-in, not on every refresh.
      if (user) {
        const inserted = await sql`
          insert into users (email, name, image, role, last_seen)
          values (${email}, ${user.name ?? null}, ${user.image ?? null}, ${role}, now())
          on conflict (email) do update
            set name      = coalesce(excluded.name, users.name),
                image     = coalesce(excluded.image, users.image),
                role      = excluded.role,
                last_seen = now()
          returning id
        `
        token.uid = (inserted as { id: string }[])[0]?.id
      }

      return token
    },

    async session({ session, token }) {
      session.user.role = (token.role as 'admin' | 'lead') ?? 'lead'
      if (token.uid) session.user.id = token.uid as string
      return session
    },
  },
})

/** Throw-free helper: the signed-in email, lowercased, or null. */
export async function currentEmail(): Promise<string | null> {
  const session = await auth()
  return session?.user?.email?.toLowerCase() ?? null
}

/** The signed-in user if they are an ops admin, else null. */
export async function currentAdmin(): Promise<{ id: string; email: string } | null> {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()
  if (!email || session?.user?.role !== 'admin') return null
  return { id: (session.user as { id?: string }).id ?? '', email }
}
