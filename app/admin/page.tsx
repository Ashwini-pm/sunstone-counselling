import { redirect } from 'next/navigation'
import { currentAdmin, auth } from '@/lib/auth'
import { getRecentSets, getBankStatus } from './actions'
import AdminDashboard from './AdminDashboard'

export default async function AdminPage() {
  const admin = await currentAdmin()
  if (!admin) redirect('/login')

  const session = await auth()
  const [recentSets, bank] = await Promise.all([getRecentSets(), getBankStatus()])

  return (
    <AdminDashboard
      adminName={session?.user?.name || admin.email}
      recentSets={recentSets}
      bank={bank}
    />
  )
}
