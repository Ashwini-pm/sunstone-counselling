'use client'

import { useState, useRef, useEffect } from 'react'
import type { Step } from '@/lib/assessment-data'
import styles from './reviewer.module.css'

interface Recording { station_id: string; r2_url: string; duration_sec: number }

interface Props {
  inviteId: string
  reviewerName: string
  candidateName: string
  roleName: string
  attemptNumber: number
  steps: Step[]
  recordings: Recording[]
  initialVerdicts: Record<string, string>
}

type Verdict = 'yes' | 'no' | 'maybe'

function fmt(secs: number) {
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function VideoPlayer({ src, durationSec }: { src: string; durationSec: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const seekRef = useRef<HTMLInputElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    setPlaying(false); setCurrent(0); v.pause(); v.load()
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

  return (
    <div className={styles.videoWrap}>
      <video ref={videoRef} className={styles.video} src={src} preload="none" />
      <div className={styles.playerControls}>
        <input
          ref={seekRef}
          className={styles.seekBar}
          type="range" min={0} max={durationSec || 100} step={0.1} defaultValue={0}
          onChange={e => { if (videoRef.current) videoRef.current.currentTime = Number(e.target.value) }}
          style={{ background: `linear-gradient(to right, #fff ${durationSec ? (current / durationSec) * 100 : 0}%, rgba(255,255,255,0.3) 0%)` }}
        />
        <div className={styles.playerRow}>
          <button className={styles.playBtn} onClick={togglePlay}>
            {playing
              ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            }
          </button>
          <span className={styles.timeDisplay}>{fmt(current)}{durationSec > 0 ? ` / ${fmt(durationSec)}` : ''}</span>
        </div>
      </div>
    </div>
  )
}

export default function ReviewerView({
  inviteId, reviewerName, candidateName, roleName, attemptNumber,
  steps, recordings, initialVerdicts,
}: Props) {
  const recMap = Object.fromEntries(recordings.map(r => [r.station_id, r]))
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>(initialVerdicts as Record<string, Verdict>)
  const [saving, setSaving] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)

  const activeStep = steps[activeIdx]
  const activeRec = activeStep ? recMap[activeStep.id] : null

  async function saveVerdict(stationId: string, verdict: Verdict) {
    setSaving(stationId)
    setVerdicts(prev => ({ ...prev, [stationId]: verdict }))
    await fetch('/api/reviewer/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId, stationId, verdict }),
    })
    setSaving(null)
  }

  const totalDone = steps.filter(s => verdicts[s.id]).length

  return (
    <div className={styles.wrap}>
      <header className={styles.topNav}>
        <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.navLogo} />
        <div className={styles.navMeta}>
          Reviewing: <strong>{candidateName}</strong> · {roleName} · Attempt #{attemptNumber}
        </div>
        <div className={styles.navProgress}>{totalDone}/{steps.length} reviewed</div>
      </header>

      <main className={styles.main}>
        <div className={styles.shell}>
          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeading}>Stations</div>
            <nav className={styles.sidebarNav}>
              {steps.map((step, i) => {
                const v = verdicts[step.id]
                return (
                  <button
                    key={step.id}
                    className={`${styles.sideItem} ${i === activeIdx ? styles.sideItemActive : ''}`}
                    onClick={() => setActiveIdx(i)}
                  >
                    <span className={`${styles.verdictDot} ${v ? styles[`dot_${v}`] : styles.dot_none}`} />
                    {step.title}
                  </button>
                )
              })}
            </nav>
          </aside>

          <section className={styles.mainPanel}>
            {activeStep && (
              <>
                <div className={styles.stationHead}>
                  <h2 className={styles.stationTitle}>{activeStep.title}</h2>
                  <p className={styles.stationBlurb}>{activeStep.blurb}</p>
                </div>

                <div className={styles.videoArea}>
                  {activeRec
                    ? <VideoPlayer src={activeRec.r2_url} durationSec={activeRec.duration_sec} />
                    : <div className={styles.noVideo}>No recording for this station</div>
                  }
                </div>

                <div className={styles.questionBox}>
                  <div className={styles.questionLabel}>Question asked</div>
                  <p className={styles.questionText} dangerouslySetInnerHTML={{ __html: activeStep.topic }} />
                </div>

                <div className={styles.verdictSection}>
                  <div className={styles.verdictLabel}>Should this candidate be selected?</div>
                  <div className={styles.verdictBtns}>
                    {(['yes', 'no', 'maybe'] as Verdict[]).map(v => (
                      <button
                        key={v}
                        className={`${styles.verdictBtn} ${styles[`verdict_${v}`]} ${verdicts[activeStep.id] === v ? styles.verdictBtnSel : ''}`}
                        onClick={() => saveVerdict(activeStep.id, v)}
                        disabled={saving === activeStep.id}
                      >
                        {v === 'yes' ? '✓ Yes' : v === 'no' ? '✗ No' : '~ Maybe'}
                      </button>
                    ))}
                  </div>
                  {saving === activeStep.id && <span className={styles.savingNote}>Saving…</span>}
                  {verdicts[activeStep.id] && saving !== activeStep.id && (
                    <span className={styles.savedNote}>Saved</span>
                  )}
                </div>

                <div className={styles.panelFooter}>
                  <button
                    className={styles.navBtn}
                    onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
                    disabled={activeIdx === 0}
                  >← Previous</button>
                  <button
                    className={styles.navBtn}
                    onClick={() => setActiveIdx(i => Math.min(steps.length - 1, i + 1))}
                    disabled={activeIdx === steps.length - 1}
                  >Next →</button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {totalDone === steps.length && (
        <div className={styles.completeBanner}>
          All {steps.length} stations reviewed. Thank you, {reviewerName}!
        </div>
      )}
    </div>
  )
}
