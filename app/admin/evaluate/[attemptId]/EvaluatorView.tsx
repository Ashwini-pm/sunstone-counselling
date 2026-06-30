'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import type { Step } from '@/lib/assessment-data'
import styles from './evaluate.module.css'

interface Recording { station_id: string; r2_url: string; duration_sec: number; plan_notes: string | null }
interface ExistingScore { station_id: string; rubric_key: string; human_score: number | null; evaluator_notes: string | null }

interface Props {
  attemptId: string
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
}

type ScoreMap = Record<string, { scores: Record<string, number>; notes: string }>

function fmt(secs: number) {
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function StarRating({ value }: { value: number | null }) {
  const stars = value !== null ? Math.round(value / 2) : 0
  return (
    <div className={styles.stars}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={`${styles.star} ${i <= stars ? styles.starFilled : styles.starEmpty}`}>★</span>
      ))}
    </div>
  )
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

function VideoPlayer({ src, durationSec }: { src: string; durationSec: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const seekRef = useRef<HTMLInputElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    setPlaying(false)
    setCurrent(0)
    v.pause()
    v.load()
  }, [src])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => {
      setCurrent(v.currentTime)
      if (seekRef.current) seekRef.current.value = String(v.currentTime)
    }
    const onEnded = () => setPlaying(false)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('ended', onEnded)
    return () => { v.removeEventListener('timeupdate', onTime); v.removeEventListener('ended', onEnded) }
  }, [])

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

  function stationAvg(stationId: string, rubric: Step['rubric']): number | null {
    const e = scoreMap[stationId]
    if (!e) return null
    const vals = rubric.map(r => e.scores[r.key]).filter(v => v != null) as number[]
    if (vals.length === 0) return null
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
  }

  function overallAvg(): number | null {
    const allVals: number[] = []
    for (const step of props.steps) {
      const e = scoreMap[step.id]
      if (!e) continue
      for (const r of step.rubric) {
        if (e.scores[r.key] != null) allVals.push(e.scores[r.key])
      }
    }
    if (allVals.length === 0) return null
    return Math.round((allVals.reduce((a, b) => a + b, 0) / allVals.length) * 10) / 10
  }

  const totalScored = props.steps.filter(s => {
    const e = scoreMap[s.id]
    return e && s.rubric.every(r => e.scores[r.key])
  }).length

  const displayViolations = Math.min(props.violationCount, 3)
  const overall = overallAvg()

  const activeStep = props.steps[activeIdx]
  const activeRec = activeStep ? recMap[activeStep.id] : null
  const activeEntry = activeStep ? (scoreMap[activeStep.id] || { scores: {}, notes: '' }) : { scores: {}, notes: '' }
  const isSaving = activeStep ? saving === activeStep.id : false
  const isSaved = activeStep ? saved.has(activeStep.id) : false
  const sAvg = activeStep ? stationAvg(activeStep.id, activeStep.rubric) : null

  return (
    <div className={styles.wrap}>
      {/* Top nav */}
      <header className={styles.topNav}>
        <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.navLogo} />
        <Link href="/admin" className={styles.navLink}>← Back to Dashboard</Link>
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
              {props.isFlagged && (
                <span className={`${styles.badge} ${styles.badgeAmber}`}>Flagged</span>
              )}
              <span className={`${styles.badge} ${styles.badgeAmber}`}>
                {displayViolations} Violation{displayViolations !== 1 ? 's' : ''}
              </span>
              <span className={`${styles.badge} ${styles.badgeGrey}`}>
                {totalScored}/{props.steps.length} Scored
              </span>
              {overall !== null && (
                <span className={`${styles.badge} ${styles.badgeBlue}`}>
                  Running Avg: {overall}
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
                {/* Station header */}
                <div className={styles.stationHead}>
                  <div>
                    <h2 className={styles.stationTitle}>{activeStep.title}</h2>
                    <p className={styles.stationBlurb}>{activeStep.blurb}</p>
                  </div>
                  <div className={styles.starBlock}>
                    <span className={styles.starLabel}>Overall Rating</span>
                    <StarRating value={sAvg} />
                  </div>
                </div>

                {/* Video */}
                <div className={styles.videoArea}>
                  {activeRec
                    ? <VideoPlayer src={activeRec.r2_url} durationSec={activeRec.duration_sec} />
                    : <div className={styles.noVideo}>No recording for this station</div>
                  }
                </div>

                {/* Rubric + Notes */}
                <div className={styles.rubricArea}>
                  <div>
                    <div className={styles.rubricSectionTitle}>Rubric Evaluation</div>
                    {activeStep.rubric.map(r => (
                      <div key={r.key} className={styles.rubricItem}>
                        <div className={styles.rubricItemHead}>
                          <span className={styles.rubricName}>{r.name}</span>
                          <span className={styles.rubricScore}>
                            {activeEntry.scores[r.key] ? `${activeEntry.scores[r.key]}/10` : '--'}
                          </span>
                        </div>
                        <div className={styles.scoreRow}>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                            <button
                              key={n}
                              className={`${styles.scoreBtn} ${activeEntry.scores[r.key] === n ? styles.scoreBtnSel : ''}`}
                              onClick={() => setScore(activeStep.id, r.key, n)}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className={styles.notesCol}>
                    <label className={styles.notesLabel}>Evaluator Notes</label>
                    <textarea
                      className={styles.notes}
                      placeholder="Capture specific observations about clarity, pace, and expertise..."
                      value={activeEntry.notes}
                      onChange={e => setNotes(activeStep.id, e.target.value)}
                    />
                  </div>
                </div>

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
                    {isSaved && <span className={styles.savedTick}>Saved</span>}
                    <button
                      className={styles.saveDraftBtn}
                      onClick={() => saveStation(activeStep.id, activeStep.rubric)}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving…' : 'Save Draft'}
                    </button>
                    <button
                      className={styles.submitBtn}
                      onClick={() => saveStation(activeStep.id, activeStep.rubric, true)}
                      disabled={isSaving}
                    >
                      Submit Evaluation
                    </button>
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
