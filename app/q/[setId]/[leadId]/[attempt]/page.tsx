import { notFound } from 'next/navigation'
import { sql } from '@/lib/db'
import LeadGate from './LeadGate'

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ setId: string; leadId: string; attempt: string }>
}) {
  const { setId, leadId, attempt } = await params
  const attemptNumber = parseInt(attempt) || 1

  // Public read: the link itself is the claim. Nothing sensitive is exposed
  // beyond the invited name and email, and the gate below still requires the
  // visitor to prove they own that email before any answer can be recorded.
  const setRows = await sql`
    select s.id, s.lead_id, s.expires_at, l.name, l.email
    from question_sets s
    join leads l on l.id = s.lead_id
    where s.id = ${setId} and s.lead_id = ${leadId}
    limit 1
  ` as { id: string; lead_id: string; expires_at: string; name: string; email: string }[]

  const set = setRows[0]
  if (!set) notFound()

  if (new Date(set.expires_at) < new Date()) {
    return (
      <div style={{ padding: 40, fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h2>Yeh link expire ho chuka hai.</h2>
        <p style={{ color: '#556070', marginTop: 8 }}>
          Naye link ke liye kripya Sunstone team se sampark karein.
        </p>
      </div>
    )
  }

  const attemptRows = await sql`
    select id, status from attempts
    where set_id = ${setId} and attempt_number = ${attemptNumber}
    limit 1
  ` as { id: string; status: string }[]

  if (attemptRows[0]?.status === 'submitted') {
    return (
      <div style={{ padding: 40, fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h2>Aapke jawab mil gaye hain.</h2>
        <p style={{ color: '#556070', marginTop: 8 }}>
          Shukriya. Hamari team inhe dekhkar jaldi hi aapse sampark karegi.
        </p>
      </div>
    )
  }

  return (
    <LeadGate
      setId={setId}
      leadId={leadId}
      leadName={set.name}
      leadEmail={set.email}
      attemptNumber={attemptNumber}
      existingAttemptId={attemptRows[0]?.id ?? null}
    />
  )
}
