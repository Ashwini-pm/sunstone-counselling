import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getRecentTests } from './actions'
import AdminDashboard from './AdminDashboard'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', user.id)
    .single()

  const recentTests = await getRecentTests()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <AdminDashboard adminName={profile?.name || user.email || 'Admin'} recentTests={recentTests as any} />
}
