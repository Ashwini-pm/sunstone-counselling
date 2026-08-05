import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { currentAdmin } from '@/lib/auth'
import { leadProfile } from '@/lib/db/adminAccess'
import { SOURCE_LABELS } from '@/app/admin/labels'
import styles from './lead.module.css'

function fmt(secs: number) {
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function LeadProfilePage({
  params,
}: {
  params: Promise<{ leadId: string }>
}) {
  const admin = await currentAdmin()
  if (!admin) redirect('/login')

  const { leadId } = await params
  const data = await leadProfile(leadId)
  if (!data) notFound()

  const { lead, sets } = data

  const initials = lead.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const completed = sets.filter(s => s.status === 'submitted').length
  const totalAnswers = sets.reduce((sum, s) => sum + s.answer_count, 0)

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.navLogo} />
        <span className={styles.navSep}>/</span>
        <span className={styles.navCrumb}>Lead Profile</span>
      </header>

      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.avatarBlock}>
            <div className={styles.avatarGlow} />
            <div className={styles.heroAvatar}>{initials}</div>
          </div>

          <div className={styles.heroText}>
            <h1 className={styles.heroName}>{lead.name}</h1>
            <p className={styles.heroEmail}>{lead.email}</p>
            <div className={styles.heroBadges}>
              {lead.source && (
                <span className={styles.heroBadge}>
                  <span className={styles.heroBadgeDot} />
                  {SOURCE_LABELS[lead.source] ?? lead.source}
                </span>
              )}
              {lead.city && (
                <span className={styles.heroBadge}>
                  <span className={styles.heroBadgeDot} />
                  {lead.city}
                </span>
              )}
              {lead.phone10 && (
                <span className={styles.heroBadge}>
                  <span className={styles.heroBadgeDot} />
                  {lead.phone10}
                </span>
              )}
            </div>
            <div className={styles.heroStats}>
              <div className={styles.heroStat}>
                <div className={styles.heroStatNum}>{sets.length}</div>
                <div className={styles.heroStatLbl}>Links</div>
              </div>
              <div className={styles.heroStat}>
                <div className={styles.heroStatNum}>{completed}</div>
                <div className={styles.heroStatLbl}>Completed</div>
              </div>
              <div className={styles.heroStat}>
                <div className={styles.heroStatNum}>{totalAnswers}</div>
                <div className={styles.heroStatLbl}>Answers</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.body}>
        <div>
          <div className={styles.sectionLabel}>Link History</div>
          {sets.length === 0 ? (
            <div className={styles.emptyState}>No links sent yet.</div>
          ) : sets.map(s => {
            const statusClass = s.status !== 'submitted' ? styles.statusProgress : styles.statusSubmitted
            const statusLabel = !s.attempt_id
              ? 'NOT STARTED'
              : s.status !== 'submitted' ? 'IN PROGRESS' : 'COMPLETED'

            return (
              <div key={s.id} className={styles.assessmentCard}>
                <div className={styles.assessmentTop}>
                  <div>
                    <div className={styles.assessmentRole}>
                      {s.attempt_id
                        ? <Link href={`/admin/attempt/${s.attempt_id}`}>View answers →</Link>
                        : 'Awaiting response'}
                    </div>
                    <div className={styles.assessmentMeta}>
                      <span>Sent {fmtDate(s.created_at)}</span>
                      <span className={styles.metaDot}>·</span>
                      <span>{s.answer_count} answer{s.answer_count !== 1 ? 's' : ''}</span>
                      {s.total_duration_sec != null && (
                        <>
                          <span className={styles.metaDot}>·</span>
                          <span>⏱ {fmt(s.total_duration_sec)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`${styles.statusBadge} ${statusClass}`}>{statusLabel}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className={styles.sidebar}>
          <div className={styles.sideCard}>
            <div className={styles.sideCardTitle}>Overview</div>
            <div className={styles.statGrid}>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{sets.length}</div>
                <div className={styles.statLbl}>Links</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{completed}</div>
                <div className={styles.statLbl}>Completed</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{totalAnswers}</div>
                <div className={styles.statLbl}>Answers</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{fmtDate(lead.created_at).split(' ')[0]}</div>
                <div className={styles.statLbl}>Added</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
