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

function VideoPlayer({ src, durationSec }: { src: string; durationSec: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const seekRef = useRef<HTMLInputElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [current, setCurrent] = useState(0)
  const duration = durationSec

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
          style={{ background: `linear-gradient(to right, #fff ${duration ? (current/duration)*100 : 0}%, rgba(255,255,255,0.3) 0%)` }}
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
              ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2"/></svg>
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

  async function saveStation(stationId: string, rubricItems: Step['rubric']) {
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
  }

  const totalScored = props.steps.filter(s => {
    const e = scoreMap[s.id]
    return e && s.rubric.every(r => e.scores[r.key])
  }).length

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link href="/admin" className={styles.backLink}>← Dashboard</Link>
        <div className={styles.topInfo}>
          <span className={styles.topName}>{props.candidateName}</span>
          <span className={styles.topMeta}>{props.candidateEmail} · {props.roleName} · Attempt {props.attemptNumber}</span>
        </div>
        <div className={styles.topBadges}>
          {props.isFlagged && <span className={styles.flagBadge}>Flagged</span>}
          {props.violationCount > 0 && <span className={styles.violBadge}>{props.violationCount} violation{props.violationCount > 1 ? 's' : ''}</span>}
          <span className={styles.progressBadge}>{totalScored}/{props.steps.length} scored</span>
        </div>
      </div>

      <div className={styles.stationList}>
        {props.steps.map((step, i) => {
          const rec = recMap[step.id]
          const entry = scoreMap[step.id] || { scores: {}, notes: '' }
          const isSaving = saving === step.id
          const isSaved = saved.has(step.id)
          const allScored = step.rubric.every(r => entry.scores[r.key])

          return (
            <div key={step.id} className={styles.stationCard}>
              <div className={styles.stationHeader}>
                <div className={styles.stationNum}>{i + 1}</div>
                <div>
                  <div className={styles.stationTitle}>{step.title}</div>
                  <div className={styles.stationBlurb}>{step.blurb}</div>
                </div>
                {allScored && <span className={styles.doneTag}>Scored</span>}
              </div>

              <div className={styles.stationBody}>
                {/* Video */}
                <div className={styles.videoCol}>
                  {rec ? (
                    <>
                      <VideoPlayer src={rec.r2_url} durationSec={rec.duration_sec} />
                      <div className={styles.vidMeta}>
                        Duration: {fmt(rec.duration_sec)}
                        {rec.plan_notes && (
                          <div className={styles.planNotes}>
                            <strong>Written plan:</strong>
                            <pre>{rec.plan_notes}</pre>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className={styles.noVideo}>No recording</div>
                  )}
                </div>

                {/* Rubric */}
                <div className={styles.rubricCol}>
                  <div className={styles.rubricTitle}>Rubric</div>
                  {step.rubric.map(r => (
                    <div key={r.key} className={styles.rubricRow}>
                      <div className={styles.rubricLabel}>
                        <span className={styles.rubricName}>{r.name}</span>
                        <span className={styles.rubricHint}>{r.hint}</span>
                      </div>
                      <div className={styles.scoreRow}>
                        {[1,2,3,4,5,6,7,8,9,10].map(n => (
                          <button
                            key={n}
                            className={`${styles.scoreBtn} ${entry.scores[r.key] === n ? styles.scoreBtnSel : ''}`}
                            onClick={() => setScore(step.id, r.key, n)}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className={styles.notesRow}>
                    <textarea
                      className={styles.notes}
                      placeholder="Evaluator notes (optional)"
                      rows={3}
                      value={entry.notes}
                      onChange={e => setNotes(step.id, e.target.value)}
                    />
                  </div>

                  <div className={styles.saveRow}>
                    {isSaved && <span className={styles.savedTick}>Saved</span>}
                    <button
                      className={styles.saveBtn}
                      onClick={() => saveStation(step.id, step.rubric)}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving…' : 'Save scores'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
