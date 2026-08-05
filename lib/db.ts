import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

let client: NeonQueryFunction<false, false> | null = null

function getClient(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL
    if (!url || url.startsWith('NEEDS_')) {
      throw new Error(
        'DATABASE_URL is not set. Add your Neon connection string to .env.local.',
      )
    }
    client = neon(url)
  }
  return client
}

/**
 * Neon HTTP client. Use it as a tagged template — interpolations are sent as
 * bound parameters, never string-concatenated:
 *
 *   const rows = await sql`select * from leads where id = ${id}`
 *
 * Do NOT build query strings by hand; that path is not parameterised.
 *
 * Resolved lazily so a missing DATABASE_URL fails on the first query rather
 * than crashing every page (including the login screen) at import time.
 */
export const sql: NeonQueryFunction<false, false> = ((
  strings: TemplateStringsArray,
  ...values: unknown[]
) => getClient()(strings, ...values)) as NeonQueryFunction<false, false>
