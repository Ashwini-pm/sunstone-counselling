'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { currentAdmin } from '@/lib/auth'
import { createLeadAndSet, recentSets, bankStatus, type AdminSetRow } from '@/lib/db/adminAccess'

// NOTE: this file is 'use server'. Every export must be an async function.
// Types and constants live in ./labels.ts and @/lib/db/adminAccess.

/** Last 10 digits — the canonical join key across the NSAT and CSAT pipelines. */
function toPhone10(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits || null
}

/**
 * The origin of the request being served.
 *
 * Derived from headers rather than NEXT_PUBLIC_APP_URL so a link generated on
 * localhost points at localhost and one generated on Vercel points at Vercel,
 * with no env var to set wrongly. Vercel sets x-forwarded-*; local dev sets host.
 */
async function requestOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!host) return process.env.NEXT_PUBLIC_APP_URL ?? ''
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export async function createLeadLink(formData: FormData) {
  const admin = await currentAdmin()
  if (!admin) return { error: 'Not authorised' }

  const name = (formData.get('leadName') as string)?.trim()
  const email = (formData.get('leadEmail') as string)?.trim().toLowerCase()
  const phone = formData.get('leadPhone') as string | null
  const source = (formData.get('source') as string) || null
  const city = (formData.get('city') as string | null)?.trim() || null

  if (!name || !email) return { error: 'Name and email are required' }

  try {
    const { leadId, setId } = await createLeadAndSet({
      name,
      email,
      phone10: toPhone10(phone),
      source,
      city,
      createdBy: admin.id || null,
    })

    const link = `${await requestOrigin()}/q/${setId}/${leadId}/1`
    revalidatePath('/admin')
    return { link, leadName: name }
  } catch (err) {
    console.error('[createLeadLink]', err)
    return { error: 'Could not create the link' }
  }
}

export async function getRecentSets(): Promise<AdminSetRow[]> {
  const admin = await currentAdmin()
  if (!admin) return []
  return recentSets()
}

export async function getBankStatus() {
  const admin = await currentAdmin()
  if (!admin) return { total: 0, groups: 0, missingAvatar: 0 }
  return bankStatus()
}
