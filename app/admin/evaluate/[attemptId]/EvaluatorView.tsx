'use client'

import { useState, useRef, useEffect, useTransition, forwardRef, useImperativeHandle } from 'react'
import type { Query } from '@/lib/assessment-data'
import Link from 'next/link'
import type { Step } from '@/lib/assessment-data'
import { inviteReviewer } from '@/app/admin/actions'
import styles from './evaluate.module.css'

interface Recording { station_id: string; r2_url: string; duration_sec: number; plan_notes: string | null }
interface ExistingScore { station_id: string; rubric_key: string; human_score: number | null; evaluator_notes: string | null }
interface ReviewerInvite { id: string; name: string; email: string; created_at: string }
interface ReviewerScore { reviewer_invite_id: string; station_id: string; evaluator_notes: string | null; verdict: string | null }

interface Props {
  attemptId: string
  candidateId: string
  candidateName: string
  candidateEmail: string
  roleName: string
  roleKey: string
  attemptNumber: number
  status: string
  violationCount: number
  isFlagged: boolean
  steps: Step[]
  recordings: Recording[]
  existingScores: ExistingScore[]
  reviewerInvites: ReviewerInvite[]
  reviewerScores: ReviewerScore[]
  totalDurationSec: number | null
}

type ScoreMap = Record<string, { scores: Record<string, number>; notes: string }>

function fmt(secs: number) {
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}


function CheckIcon() {
  return (
    <svg className={styles.sideIcon} viewBox="0 0 24 24" fill="#006591">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5l-4.5-4.5 1.41-1.41L10 13.67l7.09-7.09 1.41 1.41L10 16.5z"/>
    </svg>
  )
}

function RadioFilledIcon() {
  return (
    <svg className={styles.sideIcon} viewBox="0 0 24 24" fill="#006591">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
      <circle cx="12" cy="12" r="5" fill="#006591"/>
    </svg>
  )
}

function RadioEmptyIcon() {
  return (
    <svg className={styles.sideIcon} viewBox="0 0 24 24" fill="#c6c6cd">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
    </svg>
  )
}

const POPUP_DURATION = 6000

const VideoPlayer = forwardRef<{ seekTo: (t: number) => void }, { src: string; durationSec: number; queries?: Query[] }>(
  function VideoPlayer({ src, durationSec, queries }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const seekRef = useRef<HTMLInputElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [current, setCurrent] = useState(0)
  const [visiblePopups, setVisiblePopups] = useState<Query[]>([])
  const shownAt = useRef<Set<number>>(new Set())

  useImperativeHandle(ref, () => ({
    seekTo(t: number) {
      const v = videoRef.current
      if (!v) return
      v.currentTime = t
      if (seekRef.current) seekRef.current.value = String(t)
      setCurrent(t)
    }
  }))

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    setPlaying(false)
    setCurrent(0)
    v.pause()
    v.load()
    shownAt.current = new Set()
    setVisiblePopups([])
  }, [src])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => {
      const t = v.currentTime
      setCurrent(t)
      if (seekRef.current) seekRef.current.value = String(t)
      if (queries) {
        for (const q of queries) {
          if (t >= q.at && !shownAt.current.has(q.at)) {
            shownAt.current.add(q.at)
            setVisiblePopups(prev => [...prev, q])
            setTimeout(() => {
              setVisiblePopups(prev => prev.filter(p => p.at !== q.at))
            }, POPUP_DURATION)
          }
        }
      }
    }
    const onEnded = () => setPlaying(false)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('ended', onEnded)
    return () => { v.removeEventListener('timeupdate', onTime); v.removeEventListener('ended', onEnded) }
  }, [queries])

  function togglePlay() {
    const v = videoRef.current!
    if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
  }
  function toggleMute() { const v = videoRef.current!; v.muted = !v.muted; setMuted(v.muted) }
  function onSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current!
    v.currentTime = Number(e.target.value)
    setCurrent(v.currentTime)
  }

  const duration = durationSec

  return (
    <div className={styles.videoWrap}>
      <video ref={videoRef} className={styles.video} src={src} preload="none" />
      {visiblePopups.length > 0 && (
        <div className={styles.doubtOverlay}>
          {visiblePopups.map((q, i) => (
            <div key={i} className={styles.doubtPopup}>
              <span className={styles.doubtPopupWho}>{q.who}</span>{q.text}
            </div>
          ))}
        </div>
      )}
      <div className={styles.playerControls}>
        <input
          ref={seekRef}
          className={styles.seekBar}
          type="range"
          min={0}
          max={duration > 0 ? duration : 100}
          step={0.1}
          defaultValue={0}
          onChange={onSeek}
          style={{ background: `linear-gradient(to right, #fff ${duration ? (current / duration) * 100 : 0}%, rgba(255,255,255,0.3) 0%)` }}
        />
        <div className={styles.playerRow}>
          <button className={styles.playBtn} onClick={togglePlay}>
            {playing
              ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            }
          </button>
          <span className={styles.timeDisplay}>{fmt(current)}{duration > 0 ? ` / ${fmt(duration)}` : ''}</span>
          <button className={styles.muteBtn} onClick={toggleMute}>
            {muted
              ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            }
          </button>
        </div>
      </div>
    </div>
  )
})

function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

export default function EvaluatorView(props: Props) {
  const recMap = Object.fromEntries(props.recordings.map(r => [r.station_id, r]))

  const initScores: ScoreMap = {}
  for (const s of props.existingScores) {
    if (!initScores[s.station_id]) initScores[s.station_id] = { scores: {}, notes: '' }
    if (s.human_score) initScores[s.station_id].scores[s.rubric_key] = s.human_score
    if (s.evaluator_notes) initScores[s.station_id].notes = s.evaluator_notes
  }

  const [activeIdx, setActiveIdx] = useState(0)
  const [scoreMap, setScoreMap] = useState<ScoreMap>(initScores)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())

  function copyText(text: string, onDone?: () => void) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(onDone).catch(() => fallbackCopy(text, onDone))
    } else {
      fallbackCopy(text, onDone)
    }
  }
  function fallbackCopy(text: string, onDone?: () => void) {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.focus(); ta.select()
    document.execCommand('copy'); document.body.removeChild(ta)
    onDone?.()
  }

  // Reviewer invite state
  const [invites, setInvites] = useState<ReviewerInvite[]>(props.reviewerInvites)
  const [reviewerName, setReviewerName] = useState('')
  const [reviewerEmail, setReviewerEmail] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)
  const [copiedProfile, setCopiedProfile] = useState(false)
  const [isPendingInvite, startInviteTransition] = useTransition()
  const [selectedReviewerId, setSelectedReviewerId] = useState<string | null>(null)

  // overall verdict per reviewer
  const reviewerOverallVerdict: Record<string, string> = {}
  // all rubric scores per reviewer: inviteId -> flat list of numbers
  const reviewerAllScores: Record<string, number[]> = {}
  for (const s of props.reviewerScores) {
    if (s.station_id === 'overall' && s.verdict) {
      reviewerOverallVerdict[s.reviewer_invite_id] = s.verdict
    } else {
      if (s.verdict) reviewerOverallVerdict[s.reviewer_invite_id] = s.verdict
      if (s.evaluator_notes) {
        try {
          const parsed = JSON.parse(s.evaluator_notes) as Record<string, number>
          const vals = Object.values(parsed).filter(v => typeof v === 'number')
          if (!reviewerAllScores[s.reviewer_invite_id]) reviewerAllScores[s.reviewer_invite_id] = []
          reviewerAllScores[s.reviewer_invite_id].push(...vals)
        } catch {}
      }
    }
  }

  // avg per reviewer
  const reviewerAvg: Record<string, number> = {}
  for (const [id, vals] of Object.entries(reviewerAllScores)) {
    if (vals.length > 0) reviewerAvg[id] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
  }

  // final score = avg of reviewer avgs
  const reviewerAvgVals = Object.values(reviewerAvg)
  const finalScore = reviewerAvgVals.length > 0
    ? Math.round((reviewerAvgVals.reduce((a, b) => a + b, 0) / reviewerAvgVals.length) * 10) / 10
    : null

  // verdict counts
  const verdictCounts = { yes: 0, no: 0, maybe: 0 }
  for (const v of Object.values(reviewerOverallVerdict)) {
    if (v === 'yes' || v === 'no' || v === 'maybe') verdictCounts[v]++
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteError('')
    const formData = new FormData()
    formData.set('attemptId', props.attemptId)
    formData.set('reviewerName', reviewerName)
    formData.set('reviewerEmail', reviewerEmail)
    startInviteTransition(async () => {
      const result = await inviteReviewer(formData)
      if (result.error) { setInviteError(result.error); return }
      setInviteLink(result.reviewUrl!)
      setReviewerName('')
      setReviewerEmail('')
      setInvites(prev => [...prev, {
        id: result.reviewUrl!.split('/review/')[1],
        name: result.reviewerName!,
        email: reviewerEmail,
        created_at: new Date().toISOString(),
      }])
    })
  }

  function copyInvite() {
    copyText(inviteLink, () => { setCopiedInvite(true); setTimeout(() => setCopiedInvite(false), 2000) })
  }

  function setScore(stationId: string, rubricKey: string, val: number) {
    setScoreMap(prev => ({
      ...prev,
      [stationId]: { ...prev[stationId], scores: { ...(prev[stationId]?.scores || {}), [rubricKey]: val } }
    }))
    setSaved(prev => { const n = new Set(prev); n.delete(stationId); return n })
  }

  function setNotes(stationId: string, val: string) {
    setScoreMap(prev => ({
      ...prev,
      [stationId]: { ...prev[stationId], notes: val }
    }))
    setSaved(prev => { const n = new Set(prev); n.delete(stationId); return n })
  }

  async function saveStation(stationId: string, rubricItems: Step['rubric'], andAdvance = false) {
    setSaving(stationId)
    const entry = scoreMap[stationId] || { scores: {}, notes: '' }
    const rows = rubricItems.map(r => ({
      attempt_id: props.attemptId,
      station_id: stationId,
      rubric_key: r.key,
      human_score: entry.scores[r.key] || null,
      evaluator_notes: entry.notes || null,
    }))
    await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    })
    setSaving(null)
    setSaved(prev => new Set([...prev, stationId]))
    if (andAdvance) {
      setActiveIdx(i => Math.min(props.steps.length - 1, i + 1))
    }
  }

function overallAvg(): number | null {
    const allFullyScored = props.steps.every(step => {
      const e = scoreMap[step.id]
      return e && step.rubric.every(r => e.scores[r.key])
    })
    if (!allFullyScored) return null
    const allVals: number[] = []
    for (const step of props.steps) {
      const e = scoreMap[step.id]!
      for (const r of step.rubric) allVals.push(e.scores[r.key])
    }
    return Math.round((allVals.reduce((a, b) => a + b, 0) / allVals.length) * 10) / 10
  }

  const totalScored = props.steps.filter(s => {
    const e = scoreMap[s.id]
    return e && s.rubric.every(r => e.scores[r.key])
  }).length

  const displayViolations = Math.min(props.violationCount, 3)
  const overall = overallAvg()

  const videoPlayerRef = useRef<{ seekTo: (t: number) => void }>(null)
  const activeStep = props.steps[activeIdx]
  const activeRec = activeStep ? recMap[activeStep.id] : null
  const activeEntry = activeStep ? (scoreMap[activeStep.id] || { scores: {}, notes: '' }) : { scores: {}, notes: '' }
  const isSaving = activeStep ? saving === activeStep.id : false
  const isSaved = activeStep ? saved.has(activeStep.id) : false

  return (
    <div className={styles.wrap}>
      {/* Top nav */}
      <header className={styles.topNav}>
        <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.navLogo} />
        <nav className={styles.navBreadcrumb}>
          <Link href="/admin" className={styles.navBreadcrumbLink}>Admin</Link>
          <span className={styles.navBreadcrumbSep}>&rsaquo;</span>
          <span className={styles.navBreadcrumbCurrent}>Dashboard</span>
        </nav>
        <div className={styles.navRight}>
          <div className={styles.navEvaluatorAvatar}>{initials(props.candidateName).slice(0, 2)}</div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.shell}>
          {/* Candidate info bar */}
          <div className={styles.candBar}>
            <div className={styles.candLeft}>
              <div className={styles.candAvatarWrap}>
                <div className={styles.candAvatar}>{initials(props.candidateName)}</div>
                <div className={styles.candNameBlock}>
                  <div className={styles.candName}>{props.candidateName}</div>
                  <div className={styles.candEmail}>{props.candidateEmail}</div>
                </div>
              </div>
              <div className={styles.candDivider} />
              <div className={styles.candMeta}>
                <span className={styles.candMetaLabel}>Position</span>
                <span className={styles.candMetaVal}>{props.roleName}</span>
              </div>
              <div className={styles.candDivider} />
              <div className={styles.candMeta}>
                <span className={styles.candMetaLabel}>Attempt</span>
                <span className={styles.candMetaVal}>#{props.attemptNumber}</span>
              </div>
            </div>
            <div className={styles.badges}>
              <button
                type="button"
                className={`${styles.badge} ${styles.badgeGrey}`}
                style={{ cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}
                onClick={() => {
                  const url = `${window.location.origin}/candidate/${props.candidateId}`
                  copyText(url, () => { setCopiedProfile(true); setTimeout(() => setCopiedProfile(false), 2000) })
                }}
              >
                {copiedProfile ? '✓ Profile link copied' : '↗ Share profile'}
              </button>
              {props.isFlagged && (
                <span className={`${styles.badge} ${styles.badgeAmber}`}>Flagged</span>
              )}
              <span className={`${styles.badge} ${styles.badgeAmber}`}>
                {displayViolations} Violation{displayViolations !== 1 ? 's' : ''}
              </span>
              <span className={`${styles.badge} ${styles.badgeGrey}`}>
                {totalScored}/{props.steps.length} Scored
              </span>
              {props.totalDurationSec != null && (
                <span className={`${styles.badge} ${styles.badgeGrey}`}>
                  ⏱ {fmtDuration(props.totalDurationSec)}
                </span>
              )}
              {finalScore !== null && (
                <span className={`${styles.badge} ${styles.badgeBlue}`}>
                  Final Score: {finalScore}
                </span>
              )}
              {(verdictCounts.yes > 0 || verdictCounts.no > 0 || verdictCounts.maybe > 0) && (
                <span className={`${styles.badge} ${styles.badgeGrey}`}>
                  {verdictCounts.yes > 0 && `✓${verdictCounts.yes} `}{verdictCounts.no > 0 && `✗${verdictCounts.no} `}{verdictCounts.maybe > 0 && `~${verdictCounts.maybe}`}
                </span>
              )}
            </div>
          </div>

          {/* Two-panel content */}
          <div className={styles.content}>
            {/* Left sidebar: station list */}
            <aside className={styles.sidebar}>
              <div className={styles.sidebarHeading}>Assessments</div>
              <nav className={styles.sidebarNav}>
                {props.steps.map((step, i) => {
                  const isActive = i === activeIdx
                  const isDone = (scoreMap[step.id] && step.rubric.every(r => scoreMap[step.id]?.scores[r.key]))
                  return (
                    <button
                      key={step.id}
                      className={`${styles.sideItem} ${isActive ? styles.sideItemActive : ''}`}
                      onClick={() => setActiveIdx(i)}
                    >
                      {isDone ? <CheckIcon /> : isActive ? <RadioFilledIcon /> : <RadioEmptyIcon />}
                      {step.title}
                    </button>
                  )
                })}
              </nav>
            </aside>

            {/* Main panel */}
            {activeStep && (
              <section className={styles.mainPanel}>
                {/* Reviewer invite section */}
                <div className={styles.reviewerSection}>
                  <div className={styles.reviewerSectionTitle}>Invite Reviewers</div>
                  <form className={styles.inviteForm} onSubmit={handleInvite}>
                    <input
                      className={styles.inviteInput}
                      placeholder="Reviewer name"
                      value={reviewerName}
                      onChange={e => setReviewerName(e.target.value)}
                      required
                    />
                    <input
                      className={styles.inviteInput}
                      type="email"
                      placeholder="Reviewer email"
                      value={reviewerEmail}
                      onChange={e => setReviewerEmail(e.target.value)}
                      required
                    />
                    <button className={styles.inviteBtn} type="submit" disabled={isPendingInvite}>
                      {isPendingInvite ? 'Creating…' : 'Generate link →'}
                    </button>
                  </form>
                  {inviteError && <div className={styles.inviteError}>{inviteError}</div>}
                  {inviteLink && (
                    <div className={styles.inviteLinkBox}>
                      <code className={styles.inviteLinkText}>{inviteLink}</code>
                      <button type="button" className={styles.inviteCopyBtn} onClick={copyInvite}>
                        {copiedInvite ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                  {invites.length > 0 && (
                    <div className={styles.inviteList}>
                      {invites.map(inv => {
                        const v = reviewerOverallVerdict[inv.id]
                        const link = typeof window !== 'undefined' ? `${window.location.origin}/review/${inv.id}` : `/review/${inv.id}`
                        return (
                          <div key={inv.id} className={styles.inviteRow}>
                            <div className={styles.inviteRowMeta}>
                              <span className={styles.inviteRowName}>{inv.name}</span>
                              <span className={styles.inviteRowEmail}>{inv.email}</span>
                            </div>
                            <div className={styles.inviteLinkBox}>
                              <code className={styles.inviteLinkText}>{link}</code>
                              <button type="button" className={styles.inviteCopyBtn} onClick={() => copyText(link, () => { setCopiedInviteId(inv.id); setTimeout(() => setCopiedInviteId(id => id === inv.id ? null : id), 2000) })}>
                                {copiedInviteId === inv.id ? '✓ Copied' : 'Copy'}
                              </button>
                            </div>
                            <span className={`${styles.verdictChip} ${v ? styles[`vc_${v}`] : styles.vc_pending}`}>
                              {v || 'pending'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Station header */}
                <div className={styles.stationHead}>
                  <div>
                    <h2 className={styles.stationTitle}>{activeStep.title}</h2>
                    <p className={styles.stationBlurb}>{activeStep.blurb}</p>
                  </div>
                </div>

                {/* Video */}
                <div className={styles.videoArea}>
                  {activeRec
                    ? <VideoPlayer ref={videoPlayerRef} src={activeRec.r2_url} durationSec={activeRec.duration_sec} queries={activeStep.queries} />
                    : <div className={styles.noVideo}>No recording for this station</div>
                  }
                </div>

                {/* Question + live doubts */}
                <div className={styles.questionBox}>
                  <div className={styles.questionLabel}>Question asked</div>
                  <p className={styles.questionText} dangerouslySetInnerHTML={{ __html: activeStep.topic }} />
                  {activeStep.queries && activeStep.queries.length > 0 && (
                    <div className={styles.doubtsList}>
                      <div className={styles.doubtsLabel}>Live doubts during session</div>
                      {activeStep.queries.map((q, i) => (
                        <button
                          key={i}
                          type="button"
                          className={styles.doubtChip}
                          onClick={() => videoPlayerRef.current?.seekTo(q.at)}
                        >
                          <span className={styles.doubtTime}>{fmt(q.at)}</span>
                          <span className={styles.doubtWho}>{q.who}:</span>
                          <span className={styles.doubtText}>{q.text}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Reviewer overall verdicts */}
                {invites.length > 0 && (
                  <div className={styles.stationVerdicts}>
                    <div className={styles.stationVerdictsLabel}>Reviewer verdicts (click to view scores)</div>
                    <div className={styles.stationVerdictsList}>
                      {invites.map(inv => {
                        const v = reviewerOverallVerdict[inv.id]
                        const isSelected = selectedReviewerId === inv.id
                        return (
                          <button
                            key={inv.id}
                            className={`${styles.verdictChip} ${v ? styles[`vc_${v}`] : styles.vc_pending} ${isSelected ? styles.verdictChipSel : ''}`}
                            onClick={() => setSelectedReviewerId(isSelected ? null : inv.id)}
                          >
                            {inv.name.split(' ')[0]}: {v || 'pending'}
                            {reviewerAvg[inv.id] != null && ` · ${reviewerAvg[inv.id]}`}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Reviewer scores panel — shown when chip clicked */}
                {selectedReviewerId && (() => {
                  const inv = invites.find(i => i.id === selectedReviewerId)
                  const stScores = (() => {
                    try {
                      const row = props.reviewerScores.find(s => s.reviewer_invite_id === selectedReviewerId && s.station_id === activeStep.id)
                      return row?.evaluator_notes ? JSON.parse(row.evaluator_notes) as Record<string, number> : {}
                    } catch { return {} }
                  })()
                  return (
                    <div className={styles.reviewerScoresPanel}>
                      <div className={styles.reviewerScoresPanelTitle}>
                        {inv?.name}&apos;s scores — {activeStep.title}
                        <span className={styles.reviewerScoresPanelVerdict}>
                          Overall verdict: {reviewerOverallVerdict[selectedReviewerId] || 'pending'} · Avg: {reviewerAvg[selectedReviewerId] ?? '--'}
                        </span>
                      </div>
                      {activeStep.rubric.map(r => (
                        <div key={r.key} className={styles.reviewerScoreRow}>
                          <span className={styles.reviewerScoreName}>{r.name}</span>
                          <div className={styles.scoreRow}>
                            {[1,2,3,4,5,6,7,8,9,10].map(n => (
                              <span key={n} className={`${styles.scoreBtn} ${stScores[r.key] === n ? styles.scoreBtnReadSel : ''}`}>
                                {n}
                              </span>
                            ))}
                          </div>
                          <span className={styles.reviewerScoreVal}>{stScores[r.key] ? `${stScores[r.key]}/10` : '--'}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Footer */}
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
                      onClick={() => setActiveIdx(i => Math.min(props.steps.length - 1, i + 1))}
                      disabled={activeIdx === props.steps.length - 1}
                    >
                      Next →
                    </button>
                  </div>
                  <div className={styles.footerActions}>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
