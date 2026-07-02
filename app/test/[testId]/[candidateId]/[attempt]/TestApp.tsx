'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ROLES, type Step } from '@/lib/assessment-data'
import styles from './test.module.css'

interface Props {
  testId: string
  candidateId: string
  candidateName: string
  attemptId: string
  role: string
  attemptNumber: number
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

interface RecordingState {
  url: string
  durationSec: number
  uploadStatus: UploadStatus
  uploadProgress?: number
  r2Url?: string
}

function fmt(s: number) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60), x = Math.floor(s % 60)
  return String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0')
}

const SOUNDWAVE_DELAYS = [0.1, 0.3, 0.2, 0.4, 0.15, 0.35, 0.05]

const ROLE_LABELS: Record<string, string> = {
  java: 'B.Tech CS · Java',
  marketing: 'MBA · Marketing',
}

const AVATAR_STATIONS: Record<string, string[]> = {
  java: ['intro','teach','twoway','doubt','wrong','difficult','dilemma','relevance','silent'],
}

function avatarSrc(role: string, stationId: string): string | null {
  if (AVATAR_STATIONS[role]?.includes(stationId))
    return `/api/avatar?role=${role}&station=${stationId}`
  return null
}

export default function TestApp({ candidateName, attemptId, role, attemptNumber }: Props) {
  const steps = ROLES[role as keyof typeof ROLES]?.steps || []
  const [idx, setIdx] = useState(0)
  const [stage, setStage] = useState<'ready' | 'station' | 'done'>('ready')
  const [recordings, setRecordings] = useState<Record<string, RecordingState>>({})
  const [planNotes, setPlanNotes] = useState<Record<string, string>>({})
  const [planOpen, setPlanOpen] = useState(false)

  const [violationCount, setViolationCount] = useState(0)
  const [showViolationWarning, setShowViolationWarning] = useState(false)
  const [violationReason, setViolationReason] = useState('')

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [recording, setRecording] = useState(false)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [camError, setCamError] = useState('')

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarReady, setAvatarReady] = useState(false)
  const prefetchedRef = useRef<{ station: string; url: string } | null>(null)

  const [firedQueries, setFiredQueries] = useState<Set<number>>(new Set())
  const [liveQueries, setLiveQueries] = useState<Array<{ who: string; text: string }>>([])
  const [flashQuery, setFlashQuery] = useState<{ who: string; text: string } | null>(null)
  const [overlayMsg, setOverlayMsg] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elapsedRef = useRef(0)
  const presignRef = useRef<{ uploadUrl: string; finalUrl: string } | null>(null)

  const step: Step = steps[idx]
  const done = !!recordings[step?.id]

  useEffect(() => {
    const v = videoRef.current
    if (stream && v) {
      v.srcObject = stream
      v.play().catch(() => {})
    }
  }, [stream, idx, stage])

  useEffect(() => {
    if (stage !== 'station') return
    async function logViolation(reason: string) {
      setViolationReason(reason)
      setShowViolationWarning(true)
      const res = await fetch('/api/attempt/violation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId }),
      })
      const data = await res.json()
      setViolationCount(data.violationCount)
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') logViolation('You switched tabs or minimised the window.')
    }
    function onFullscreenChange() {
      if (!document.fullscreenElement) logViolation('You exited fullscreen mode.')
    }
    function onBlur() { logViolation('The assessment window lost focus.') }
    document.addEventListener('visibilitychange', onVisibilityChange)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('blur', onBlur)
    }
  }, [stage, attemptId])

  async function enterFullscreen() {
    try { await document.documentElement.requestFullscreen() } catch { /* user denied */ }
  }

  async function beginAssessment() {
    await enterFullscreen()
    setStage('station')
  }

  async function reenterFullscreen() {
    setShowViolationWarning(false)
    await enterFullscreen()
  }

  useEffect(() => {
    setRecording(false)
    setPaused(false)
    setElapsed(0)
    setFiredQueries(new Set())
    setLiveQueries([])
    setFlashQuery(null)
    setPlanOpen(false)
    if (tickRef.current) clearInterval(tickRef.current)
  }, [idx])

  useEffect(() => {
    if (stage !== 'station') return
    const currentStep = steps[idx]
    if (!currentStep || !avatarSrc(role, currentStep.id)) {
      setAvatarUrl(null)
      setAvatarReady(false)
      return
    }

    setAvatarReady(false)

    // use prefetched URL if available
    if (prefetchedRef.current?.station === currentStep.id) {
      setAvatarUrl(prefetchedRef.current.url)
      prefetchedRef.current = null
    } else {
      setAvatarUrl(null)
      fetch(`/api/avatar?role=${role}&station=${currentStep.id}&json=1`)
        .then(r => r.json())
        .then(({ url }: { url: string }) => setAvatarUrl(url))
        .catch(() => {})
    }

    // prefetch next station in background
    const nextStep = steps[idx + 1]
    if (nextStep && avatarSrc(role, nextStep.id)) {
      fetch(`/api/avatar?role=${role}&station=${nextStep.id}&json=1`)
        .then(r => r.json())
        .then(({ url }: { url: string }) => {
          prefetchedRef.current = { station: nextStep.id, url }
        })
        .catch(() => {})
    }
  }, [idx, stage])

  async function enableCamera() {
    setCamError('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setStream(s)
    } catch (e: unknown) {
      const err = e as Error
      setCamError(`Could not access camera: ${err.name}`)
    }
  }

  function startRec() {
    if (!stream) return
    chunksRef.current = []
    presignRef.current = null
    fetch('/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId, stationId: step.id }),
    }).then(r => r.json()).then(d => { presignRef.current = d })

    const recorder = new MediaRecorder(stream, { videoBitsPerSecond: 400_000, audioBitsPerSecond: 48_000 })
    recorder.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data) }
    recorder.onstop = () => handleRecordingStop()
    recorder.start(5000)
    recorderRef.current = recorder
    setRecording(true)
    setPaused(false)
    setElapsed(0)
    elapsedRef.current = 0

    let secs = 0
    tickRef.current = setInterval(() => {
      secs++
      elapsedRef.current = secs
      setElapsed(secs)
      if (step.type === 'teach' && step.queries) {
        step.queries.forEach(q => {
          if (secs === q.at && !firedQueries.has(q.at)) {
            setFiredQueries(prev => new Set([...prev, q.at]))
            setLiveQueries(prev => [...prev, { who: q.who, text: q.text }])
            setFlashQuery({ who: q.who, text: q.text })
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
            flashTimeoutRef.current = setTimeout(() => setFlashQuery(null), 9000)
          }
        })
      }
      if (secs >= step.durationSec) stopRec()
    }, 1000)
  }

  function togglePause() {
    const recorder = recorderRef.current
    if (!recorder) return
    if (paused) {
      recorder.resume()
      setPaused(false)
    } else {
      recorder.pause()
      setPaused(true)
    }
  }

  function stopRec() {
    if (tickRef.current) clearInterval(tickRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    setRecording(false)
    setPaused(false)
  }

  async function handleRecordingStop() {
    const blob = new Blob(chunksRef.current, { type: 'video/webm' })
    const url = URL.createObjectURL(blob)
    const durationSec = elapsedRef.current
    const stationId = step.id

    setRecordings(prev => ({
      ...prev,
      [stationId]: { url, durationSec, uploadStatus: 'uploading' }
    }))

    try {
      let presign = presignRef.current
      if (!presign) {
        const r = await fetch('/api/upload/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId, stationId }),
        })
        presign = await r.json()
      }
      const { uploadUrl, finalUrl } = presign!

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', 'video/webm')
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100)
            setRecordings(prev => ({ ...prev, [stationId]: { ...prev[stationId], uploadProgress: pct } }))
          }
        }
        xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`S3 ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(blob)
      })

      await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, stationId, s3Url: finalUrl, durationSec, planNotes: planNotes[stationId] || null }),
      })

      setRecordings(prev => ({
        ...prev,
        [stationId]: { ...prev[stationId], uploadStatus: 'done', uploadProgress: 100, r2Url: finalUrl }
      }))
    } catch {
      setRecordings(prev => ({
        ...prev,
        [stationId]: { ...prev[stationId], uploadStatus: 'error' }
      }))
    }
  }

  function redo() {
    setRecordings(prev => {
      const next = { ...prev }
      delete next[step.id]
      return next
    })
  }

  const transition = useCallback((msg: string, cb: () => void) => {
    setOverlayMsg(msg)
    setTimeout(() => { cb(); setOverlayMsg('') }, 1100)
  }, [])

  async function nextStation() {
    if (recording) stopRec()
    if (idx < steps.length - 1) {
      transition('Saving response…', () => setIdx(i => i + 1))
    } else {
      transition('Submitting assessment…', async () => {
        await fetch('/api/attempt/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId }),
        })
        if (stream) stream.getTracks().forEach(t => t.stop())
        setStage('done')
      })
    }
  }

  // ── READY ──
  if (stage === 'ready') {
    return (
      <div className={styles.readyPage}>
        <div className={styles.readyCard}>
          <div className={styles.gateLogo}>S</div>
          <h2 className={styles.gateTitle}>Ready to begin?</h2>
          <p className={styles.gateSub}>
            The assessment will open in <b>fullscreen</b>. Switching tabs or exiting fullscreen will be logged as a violation.
          </p>
          <ul className={styles.readyList}>
            <li>12 stations · ~40 minutes</li>
            <li>Camera and microphone required</li>
            <li>Stay on this window throughout</li>
            <li>Do not refresh the page</li>
          </ul>
          {!stream && !camError && (
            <button className={styles.permBtn} onClick={enableCamera}>
              Allow camera &amp; microphone →
            </button>
          )}
          {camError && <p className={styles.camError}>{camError}</p>}
          {stream && (
            <>
              <div className={styles.camPreview}>
                <video ref={videoRef} autoPlay muted playsInline className={styles.camPreviewVid} />
                <div className={styles.camReady}>Camera ready</div>
              </div>
              <button className={styles.gateBtn} onClick={beginAssessment}>
                Begin assessment →
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── DONE ──
  if (stage === 'done') {
    return (
      <div className={styles.donePage}>
        <div className={styles.doneCard}>
          <div className={styles.doneCheck}>✓</div>
          <h2>Assessment submitted</h2>
          <p>Thank you, {candidateName}. All {steps.length} stations are recorded. Our panel will review your responses and get back to you.</p>
          {attemptNumber === 1 && <p className={styles.doneNote}>Attempt 1 of 2 used.</p>}
        </div>
      </div>
    )
  }

  if (!step) return null

  const isTeach = step.type === 'teach'
  const isPlan = !!step.notes
  const last = idx === steps.length - 1
  const rec = recordings[step.id]
  const uploadStatus = rec?.uploadStatus
  const remaining = Math.max(0, step.durationSec - elapsed)
  const remainingLow = remaining < 30 && recording
  const pct = Math.round(((idx + 1) / steps.length) * 100)

  return (
    <div className={styles.stationWrap}>
      {/* Overlays */}
      {showViolationWarning && (
        <div className={styles.overlay}>
          <div className={styles.violationCard}>
            <div className={styles.violationIcon}>⚠️</div>
            <h3 className={styles.violationTitle}>Stay on this window</h3>
            <p className={styles.violationMsg}>{violationReason} Switching tabs or exiting fullscreen is not allowed. Violation {violationCount} recorded.</p>
            <button className={styles.gateBtn} style={{ marginTop: 16 }} onClick={reenterFullscreen}>
              Return to assessment
            </button>
          </div>
        </div>
      )}
      {overlayMsg && (
        <div className={styles.overlay}>
          <div className={styles.ovCard}>
            <div className={styles.spinner} />
            <div className={styles.ovMsg}>{overlayMsg}</div>
          </div>
        </div>
      )}

      {/* Top nav */}
      <header className={styles.topNav}>
        <div className={styles.topLeft}>
          <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.sunstoneLogo} />
        </div>
        <span className={styles.topCenter}>{ROLE_LABELS[role] || role}</span>
        <div className={styles.topRight}>
          <div className={`${styles.timerPill} ${remainingLow ? styles.timerPillLow : ''}`}>
            <span className={styles.timerIcon}>⏱</span>
            {recording ? fmt(remaining) : fmt(step.durationSec)}
          </div>
        </div>
      </header>

      {/* Main two-panel content */}
      <main className={styles.mainContent}>
        {/* Left: AI Interviewer */}
        <div className={styles.interviewerPanel}>
          <div className={styles.avatarCard}>
            {avatarSrc(role, step.id) ? (
              <div className={styles.avatarVideoWrap}>
                {avatarUrl && (
                  <video
                    key={step.id}
                    className={styles.avatarVideo}
                    src={avatarUrl}
                    autoPlay
                    playsInline
                    preload="auto"
                    onCanPlay={() => setAvatarReady(true)}
                    onEnded={e => (e.currentTarget.currentTime = e.currentTarget.duration - 0.01)}
                  />
                )}
                {!avatarReady && (
                  <div className={styles.avatarLoader}>
                    <div className={styles.avatarSpinner} />
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className={styles.avatarCircle}>🎓</div>
                <div className={styles.avatarName}>Amber — AI Interviewer</div>
                <div className={styles.soundwave}>
                  {SOUNDWAVE_DELAYS.map((delay, i) => (
                    <div key={i} className={styles.swBar} style={{ animationDelay: `${delay}s` }} />
                  ))}
                </div>
              </>
            )}
          </div>

          <div className={styles.questionBox}>
            <p className={styles.questionText} dangerouslySetInnerHTML={{ __html: step.topic }} />
          </div>

          {isTeach && (
            <div className={styles.qFeed}>
              <div className={styles.qFeedLabel}>Live student doubts</div>
              {liveQueries.length === 0
                ? <div className={styles.qEmpty}>Doubts will appear as you teach.</div>
                : liveQueries.map((q, i) => (
                  <div key={i} className={styles.qi}><b>{q.who}:</b> {q.text}</div>
                ))
              }
            </div>
          )}
        </div>

        {/* Right: Camera + controls */}
        <div className={styles.cameraPanel}>
          {/* Video */}
          <div className={`${styles.vidWrap} ${recording ? styles.vidWrapRecording : ''}`}>
            <video ref={videoRef} autoPlay muted playsInline className={styles.video} />

            {!stream && (
              <div className={styles.vidOff}>
                <span style={{ fontSize: 40 }}>📷</span>
                <span>Camera not enabled</span>
              </div>
            )}

            {/* Start recording overlay */}
            {stream && !recording && !rec && (
              <div className={styles.startOverlay}>
                <button className={styles.startRecBtn} onClick={startRec}>⏺</button>
                <span className={styles.startRecLabel}>Click to start recording</span>
              </div>
            )}

            {/* Recording overlays */}
            {recording && (
              <>
                <div className={styles.recBadge}>
                  <span className={styles.recDot} />
                  {paused ? 'PAUSED' : 'RECORDING'}
                </div>
                <div className={styles.elapsedBadge}>{fmt(elapsed)}</div>
                <div className={styles.floatingControls}>
                  <button className={styles.floatPauseBtn} onClick={togglePause}>
                    {paused ? '▶' : '⏸'}
                  </button>
                  <button className={styles.floatStopBtn} onClick={stopRec}>⏹</button>
                </div>
              </>
            )}

            {/* Recorded state */}
            {rec && !recording && (
              <div className={styles.recDoneBadge}>
                <div className={styles.recDoneCheck}>✓</div>
                <span className={styles.recDoneLabel}>Recorded · {fmt(rec.durationSec)}</span>
              </div>
            )}

            {/* Live doubt flash */}
            {flashQuery && (
              <div className={styles.qFlash}>
                <div className={styles.qWho}>✋ {flashQuery.who} asks</div>
                <div className={styles.qTx}>{flashQuery.text}</div>
              </div>
            )}
          </div>

          {/* Attempts + delete */}
          <div className={styles.attemptsRow}>
            <div className={styles.attemptsLeft}>
              <span className={styles.attemptsLabel}>Attempts:</span>
              <div className={styles.attemptDots}>
                <span className={`${styles.attemptDot} ${rec ? styles.attemptDotFilled : ''}`} />
                <span className={styles.attemptDot} />
                <span className={styles.attemptDot} />
              </div>
            </div>
            {rec && !recording && (
              <button className={styles.deleteBtn} onClick={redo}>
                🗑 Delete
              </button>
            )}
          </div>

          {/* Upload status */}
          {uploadStatus === 'uploading' && (
            <div className={styles.uploadProgress}>
              <div className={styles.uploadProgressBar} style={{ width: `${rec?.uploadProgress ?? 0}%` }} />
              <span className={styles.uploadNote}>Uploading {rec?.uploadProgress ?? 0}%…</span>
            </div>
          )}
          {uploadStatus === 'error' && <div className={styles.uploadError}>Upload failed — delete and re-record</div>}
          {uploadStatus === 'done' && !recording && (
            <div className={styles.savedNote}>✓ Recording saved · {fmt(rec.durationSec)}</div>
          )}

          {/* Camera enable */}
          {!stream && !camError && (
            <button className={styles.enableCamBtn} onClick={enableCamera}>
              Enable camera &amp; microphone
            </button>
          )}
          {camError && <div className={styles.camErr}>{camError}</div>}

          {/* Written plan (plan stations) or optional notes */}
          {(isPlan || true) && (
            <div className={styles.planToggle}>
              <button
                className={styles.planToggleHeader}
                onClick={() => setPlanOpen(o => !o)}
              >
                <span className={styles.planToggleLabel}>
                  📝 Written Plan {isPlan ? '' : '(optional)'}
                </span>
                <span className={`${styles.planChevron} ${planOpen ? styles.planChevronOpen : ''}`}>▾</span>
              </button>
              {planOpen && (
                <div className={styles.planBody}>
                  <textarea
                    className={styles.planArea}
                    placeholder="Jot down key points before you start…"
                    value={planNotes[step.id] || ''}
                    onChange={e => setPlanNotes(prev => ({ ...prev, [step.id]: e.target.value }))}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Bottom bar */}
      <footer className={styles.bottomBar}>
        <div className={styles.progressSection}>
          <div className={styles.progressLabel}>
            <span className={styles.stepLabel}>Step {idx + 1} of {steps.length}</span>
            <span className={styles.pctLabel}>{pct}% completed</span>
          </div>
          <div className={styles.pbar}>
            <div className={styles.pfill} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className={styles.bottomActions}>
          <button className={styles.nextBtn} onClick={nextStation} disabled={!done}>
            {last ? 'Finish & submit' : 'Next Station'} →
          </button>
        </div>
      </footer>
    </div>
  )
}
