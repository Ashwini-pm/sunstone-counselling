import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { currentLead } from '@/lib/leadSession'
import AnswerFlow from '../q/[token]/AnswerFlow'
import styles from '../q/[token]/flow.module.css'

/**
 * The lead's answering screen. Reached only via /q/{token}, which verifies the
 * link and issues the session cookie. Reading a cookie in a Server Component
 * is allowed; setting one is not, which is why entry is a Route Handler.
 */
export default async function AnswerPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>
}) {
  const { e } = await searchParams

  const messages: Record<string, { title: string; body: string }> = {
    invalid: {
      title: 'This link is not valid',
      body: 'Please check the link, or contact the Sunstone team for a new one.',
    },
    expired: {
      title: 'This link has expired',
      body: 'Please contact the Sunstone team for a new one.',
    },
    done: {
      title: 'We have your answers',
      body: 'Thank you. Our team will review them and get back to you soon.',
    },
  }

  if (e && messages[e]) {
    const m = messages[e]
    return (
      <div className={styles.donePage}>
        <div className={styles.doneCard}>
          {e === 'done' && <div className={styles.doneCheck}>✓</div>}
          <h2>{m.title}</h2>
          <p>{m.body}</p>
        </div>
      </div>
    )
  }

  const lead = await currentLead()
  if (!lead) redirect('/answer?e=invalid')

  const rows = await sql`
    select a.id as attempt_id, a.status, l.name
    from attempts a
    join leads l on l.id = a.lead_id
    where a.set_id = ${lead.setId} and a.lead_id = ${lead.leadId}
      and a.attempt_number = 1
    limit 1
  ` as { attempt_id: string; status: string; name: string }[]

  const row = rows[0]
  if (!row) redirect('/answer?e=invalid')
  if (row.status === 'submitted') redirect('/answer?e=done')

  return <AnswerFlow leadName={row.name} attemptId={row.attempt_id} />
}
