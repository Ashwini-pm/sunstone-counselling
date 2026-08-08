'use client'

import { useState } from 'react'
import Link from 'next/link'
import styles from './review.module.css'

export interface AnswerRow {
  questionId: string
  position: number
  content: string
  durationSec: number | null
  /** Signed S3 playback URL. Null when the lead skipped or never got here. */
  videoUrl: string | null
}

interface Props {
  leadId: string
  leadName: string
  leadEmail: string
  sourceLabel: string
  attemptNumber: number
  status: string
  totalDurationSec: number | null
  answers: AnswerRow[]
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function fmtDuration(sec: number | null) {
  if (sec == null) return '--'
  const m = Math.floor(sec / 60), s = sec % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
function RadioFilledIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="currentColor" />
    </svg>
  )
}
function RadioEmptyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

export default function AnswerReview(props: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  const active = props.answers[activeIdx]
  const answeredCount = props.answers.filter(a => a.videoUrl).length

  return (
    <div className={styles.wrap}>
      <header className={styles.topNav}>
        <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.navLogo} />
        <nav className={styles.navBreadcrumb}>
          <Link href="/admin" className={styles.navBreadcrumbLink}>Admin</Link>
          <span className={styles.navBreadcrumbSep}>&rsaquo;</span>
          <span className={styles.navBreadcrumbCurrent}>Answers</span>
        </nav>
        <div className={styles.navRight}>
          <div className={styles.navEvaluatorAvatar}>{initials(props.leadName).slice(0, 2)}</div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.shell}>
          {/* Lead info bar */}
          <div className={styles.candBar}>
            <div className={styles.candLeft}>
              <div className={styles.candAvatarWrap}>
                <div className={styles.candAvatar}>{initials(props.leadName)}</div>
                <div className={styles.candNameBlock}>
                  <div className={styles.candName}>{props.leadName}</div>
                  <div className={styles.candEmail}>{props.leadEmail}</div>
                </div>
              </div>
              <div className={styles.candDivider} />
              <div className={styles.candMeta}>
                <span className={styles.candMetaLabel}>Source</span>
                <span className={styles.candMetaVal}>{props.sourceLabel}</span>
              </div>
              <div className={styles.candDivider} />
              <div className={styles.candMeta}>
                <span className={styles.candMetaLabel}>Attempt</span>
                <span className={styles.candMetaVal}>#{props.attemptNumber}</span>
              </div>
            </div>
            <div className={styles.badges}>
              <Link href={`/admin/lead/${props.leadId}`} className={`${styles.badge} ${styles.badgeGrey}`}>
                ↗ Lead profile
              </Link>
              <span className={`${styles.badge} ${styles.badgeGrey}`}>
                {answeredCount}/{props.answers.length} Answered
              </span>
              {props.totalDurationSec != null && (
                <span className={`${styles.badge} ${styles.badgeGrey}`}>
                  ⏱ {fmtDuration(props.totalDurationSec)}
                </span>
              )}
              <span className={`${styles.badge} ${props.status === 'submitted' ? styles.badgeBlue : styles.badgeAmber}`}>
                {props.status === 'submitted' ? 'Completed' : 'In progress'}
              </span>
            </div>
          </div>

          <div className={styles.content}>
            {/* Left: question list */}
            <aside className={styles.sidebar}>
              <div className={styles.sidebarHeading}>Questions</div>
              <nav className={styles.sidebarNav}>
                {props.answers.map((a, i) => (
                  <button
                    key={a.questionId}
                    className={`${styles.sideItem} ${i === activeIdx ? styles.sideItemActive : ''}`}
                    onClick={() => setActiveIdx(i)}
                  >
                    {a.videoUrl ? <CheckIcon /> : i === activeIdx ? <RadioFilledIcon /> : <RadioEmptyIcon />}
                    Q{a.position}
                  </button>
                ))}
              </nav>
            </aside>

            {/* Right: the answer */}
            {active && (
              <section className={styles.mainPanel}>
                <div className={styles.stationHead}>
                  <div>
                    <h2 className={styles.stationTitle}>Question {active.position}</h2>
                    <p className={styles.stationBlurb}>
                      {active.videoUrl
                        ? `Answered · ${fmtDuration(active.durationSec)}`
                        : 'No answer recorded'}
                    </p>
                  </div>
                </div>

                <div className={styles.videoArea}>
                  {active.videoUrl
                    ? (
                      <div className={styles.answerStage}>
                        <video
                          key={active.questionId}
                          src={active.videoUrl}
                          controls
                          playsInline
                          className={styles.answerPlayer}
                        />
                      </div>
                    )
                    : <div className={styles.noVideo}>No recording for this question</div>
                  }
                </div>

                <div className={styles.questionBox}>
                  <div className={styles.questionLabel}>Question asked</div>
                  <p className={styles.questionText}>{active.content}</p>
                </div>

                <div className={styles.panelFooter}>
                  <div className={styles.footerNav}>
                    <button
                      className={styles.navBtn}
                      onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
                      disabled={activeIdx === 0}
                    >
                      ← Previous
                    </button>
                    <button
                      className={styles.navBtn}
                      onClick={() => setActiveIdx(i => Math.min(props.answers.length - 1, i + 1))}
                      disabled={activeIdx === props.answers.length - 1}
                    >
                      Next →
                    </button>
                  </div>
                  <div className={styles.footerActions} />
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
