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

export const SOURCE_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All Leads' },
  { key: 'nsat1', label: 'NSAT 1' },
  { key: 'nsat2', label: 'NSAT 2' },
  { key: 'nsat3', label: 'NSAT 3' },
  { key: 'nsat4', label: 'NSAT 4' },
  { key: 'csat', label: 'CSAT' },
]
