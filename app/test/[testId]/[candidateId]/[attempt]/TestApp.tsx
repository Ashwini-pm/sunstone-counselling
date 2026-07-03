'use client'

import { useState, useRef, useEffect } from 'react'
import { NEW_ROLE_LABELS, buildSteps, type Step, type StationResult } from '@/lib/assessment-data'
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

const ROLE_LABELS: Record<string, string> = {
  java: 'B.Tech CS · Java',
  marketing: 'MBA · Marketing',
  ...NEW_ROLE_LABELS,
}

export default function TestApp({ candidateName, attemptId, role, attemptNumber }: Props) {
  const [steps, setSteps] = useState<Step[]>([])
  const [idx, setIdx] = useState(0)
  const [stage, setStage] = useState<'ready' | 'station' | 'done'>('ready')
  const [recordings, setRecordings] = useState<Record<string, RecordingState>>({})
  const [planNotes, setPlanNotes] = useState<Record<string, string>>({})
  const [planOpen, setPlanOpen] = useState(true)

  const [violationCount, setViolationCount] = useState(0)
  const [showViolationWarning, setShowViolationWarning] = useState(false)
  const [violationReason, setViolationReason] = useState('')

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [recording, setRecording] = useState(false)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [camError, setCamError] = useState('')

  const [firedQueries, setFiredQueries] = useState<Set<number>>(new Set())
  const [liveQueries, setLiveQueries] = useState<Array<{ who: string; text: string }>>([])
  const [flashQuery, setFlashQuery] = useState<{ who: string; text: string } | null>(null)
  const [overlayMsg, setOverlayMsg] = useState('')

  const [globalElapsed, setGlobalElapsed] = useState(0)
  const globalElapsedRef = useRef(0)
  const globalTickRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
    setOverlayMsg('Starting assessment…')
    await enterFullscreen()
    try {
      const res = await fetch('/api/attempt/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, role }),
      })
      const { stations, error } = await res.json()
      if (error) throw new Error(error)
      setSteps(buildSteps(stations as StationResult[]))
    } catch (e) {
      setOverlayMsg('')
      alert('Could not load assessment questions. Please refresh and try again.')
      return
    }
    setOverlayMsg('')
    setStage('station')
  }

  useEffect(() => {
    if (stage !== 'station') return
    globalElapsedRef.current = 0
    setGlobalElapsed(0)
    globalTickRef.current = setInterval(() => {
      globalElapsedRef.current++
      setGlobalElapsed(globalElapsedRef.current)
    }, 1000)
    return () => { if (globalTickRef.current) clearInterval(globalTickRef.current) }
  }, [stage])

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

  async function nextStation() {
    if (recording) stopRec()
    if (idx < steps.length - 1) {
      setIdx(i => i + 1)
    } else {
      setOverlayMsg('Submitting assessment…')
      if (globalTickRef.current) clearInterval(globalTickRef.current)
      await fetch('/api/attempt/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, totalDurationSec: globalElapsedRef.current }),
      })
      if (stream) stream.getTracks().forEach(t => t.stop())
      setOverlayMsg('')
      setStage('done')
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
            <li>9 stations · ~30 minutes</li>
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
  const pct = Math.round(((idx + 1) / steps.length) * 100)

  return (
    <div className={styles.stationWrap}>
      {/* Overlays */}
      {showViolationWarning && (
        <div className={styles.overlay}>
          <div className={styles.violationCard}>
            <div className={styles.violationIcon}>⚠️</div>
            <h3 className={styles.violationTitle}>Stay on this window</h3>
            <p className={styles.violationMsg}>{violationReason} Switching tabs or exiting fullscreen is not allowed.</p>
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
          <div className={styles.timerPill}>
            <span className={styles.timerIcon}>⏱</span>
            {fmt(globalElapsed)}
          </div>
        </div>
      </header>

      {/* 2-pane main */}
      <main className={styles.twoPaneMain}>

        {/* LEFT: Question + Notepad */}
        <div className={styles.leftPane}>
          <div className={styles.questionBlock}>
            <div className={styles.questionLabel}>Question</div>
            <p className={styles.questionText} dangerouslySetInnerHTML={{ __html: step.topic }} />
            {isTeach && liveQueries.length > 0 && (
              <div className={styles.qFeed}>
                <div className={styles.qFeedLabel}>Live student doubts</div>
                {liveQueries.map((q, i) => (
                  <div key={i} className={styles.qi}><b>{q.who}:</b> {q.text}</div>
                ))}
              </div>
            )}
          </div>
          <div className={styles.notepadBlock}>
            <div className={styles.notepadLabel}>📝 Notes {isPlan ? '' : '(optional)'}</div>
            <textarea
              className={styles.notepadArea}
              placeholder="Jot down key points before you start…"
              value={planNotes[step.id] || ''}
              onChange={e => setPlanNotes(prev => ({ ...prev, [step.id]: e.target.value }))}
            />
          </div>
        </div>

        {/* RIGHT: Candidate video */}
        <div className={styles.rightPane}>
          <div className={styles.tileHeader}>
            <span className={styles.tileLabel}>You</span>
            {rec && !recording && (
              <button className={styles.deleteBtn} onClick={redo}>🗑 Delete</button>
            )}
          </div>
          <div className={`${styles.vidWrap} ${recording ? styles.vidWrapRecording : ''}`}>
            <video ref={videoRef} autoPlay muted playsInline className={styles.video} />
            {!stream && (
              <div className={styles.vidOff}>
                <span style={{ fontSize: 40 }}>📷</span>
                <span>Camera not enabled</span>
              </div>
            )}
            {stream && !recording && !rec && (
              <div className={styles.startOverlay}>
                <button className={styles.startRecBtn} onClick={startRec}>⏺</button>
                <span className={styles.startRecLabel}>Click to start recording</span>
              </div>
            )}
            {recording && (
              <>
                <div className={styles.recBadge}>
                  <span className={styles.recDot} />
                  RECORDING
                </div>
                <div className={styles.elapsedBadge}>{fmt(elapsed)}</div>
                <div className={styles.floatingControls}>
                  <button className={styles.floatStopBtn} onClick={stopRec}>⏹</button>
                </div>
              </>
            )}
            {rec && !recording && (
              <div className={styles.recDoneBadge}>
                <div className={styles.recDoneCheck}>✓</div>
                <span className={styles.recDoneLabel}>Recorded · {fmt(rec.durationSec)}</span>
              </div>
            )}
            {flashQuery && (
              <div className={styles.qFlash}>
                <div className={styles.qWho}>✋ {flashQuery.who} asks</div>
                <div className={styles.qTx}>{flashQuery.text}</div>
              </div>
            )}
          </div>
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
          {!stream && !camError && (
            <button className={styles.enableCamBtn} onClick={enableCamera}>
              Enable camera &amp; microphone
            </button>
          )}
          {camError && <div className={styles.camErr}>{camError}</div>}
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
