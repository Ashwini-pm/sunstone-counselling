// Plain module, deliberately NOT 'use server'.
//
// A 'use server' file may only export async functions: Turbopack rewrites every
// export into a server-action reference, so a type or constant exported from
// actions.ts fails the production build even though tsc and ESLint pass.
// Anything shared that is not an action belongs here.

export type LeadSource = 'nsat1' | 'nsat2' | 'nsat3' | 'nsat4' | 'csat'

export const SOURCE_LABELS: Record<string, string> = {
  nsat1: 'NSAT 1',
  nsat2: 'NSAT 2',
  nsat3: 'NSAT 3',
  nsat4: 'NSAT 4',
  csat: 'CSAT',
}

/**
 * Display name for a cohort or a source.
 *
 * Imported cohorts carry a numeric prefix, "1 Passed, slot not booked", which
 * is what sorts them into funnel order rather than alphabetical. Strip it for
 * display, keep it for sorting.
 */
export function groupLabel(key: string): string {
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key]
  if (key === 'unassigned') return 'Unassigned'
  return key.replace(/^\s*\d+\s+/, '')
}
