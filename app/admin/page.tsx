import { redirect } from 'next/navigation'
import { currentAdmin, auth } from '@/lib/auth'
import { getRecentSets, getBankStatus, getDashboardStats, getCohortOptions } from './actions'
import AdminDashboard from './AdminDashboard'

export default async function AdminPage() {
  const admin = await currentAdmin()
  if (!admin) redirect('/login')

  const session = await auth()
  const [recentSets, bank, stats, cohorts] = await Promise.all([
    getRecentSets(), getBankStatus(), getDashboardStats(), getCohortOptions(),
  ])

  return (
    <AdminDashboard
      adminName={session?.user?.name || admin.email}
      recentSets={recentSets}
      stats={stats}
      cohorts={cohorts}
      bank={bank}
    />
  )
}
