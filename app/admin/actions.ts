'use server'

import { revalidatePath } from 'next/cache'
import { currentAdmin } from '@/lib/auth'
import { createLeadAndSet, recentSets, bankStatus, type AdminSetRow } from '@/lib/db/adminAccess'

export const SOURCE_LABELS: Record<string, string> = {
  nsat1: 'NSAT 1',
  nsat2: 'NSAT 2',
  nsat3: 'NSAT 3',
  nsat4: 'NSAT 4',
  csat: 'CSAT',
}

/** Last 10 digits — the canonical join key across the NSAT and CSAT pipelines. */
function toPhone10(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits || null
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

    const link = `${process.env.NEXT_PUBLIC_APP_URL}/q/${setId}/${leadId}/1`
    revalidatePath('/admin')
    return { link, leadName: name }
  } catch (err) {
    console.error('[createLeadLink]', err)
    return { error: 'Could not create the link' }
  }
}

export type { AdminSetRow }

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
