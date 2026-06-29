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

export default function TestApp({ candidateName, attemptId, role, attemptNumber }: Props) {
  const steps = ROLES[role as keyof typeof ROLES]?.steps || []
  const [idx, setIdx] = useState(0)
  const [stage, setStage] = useState<'ready' | 'station' | 'done'>('ready')
  const [recordings, setRecordings] = useState<Record<string, RecordingState>>({})
  const [planNotes, setPlanNotes] = useState<Record<string, string>>({})

  // proctoring
  const [violationCount, setViolationCount] = useState(0)
  const [showViolationWarning, setShowViolationWarning] = useState(false)
  const [violationReason, setViolationReason] = useState('')

  // camera + recording
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [camError, setCamError] = useState('')

  // live doubts
  const [firedQueries, setFiredQueries] = useState<Set<number>>(new Set())
  const [liveQueries, setLiveQueries] = useState<Array<{ who: string; text: string }>>([])
  const [flashQuery, setFlashQuery] = useState<{ who: string; text: string } | null>(null)

  // overlay
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

  // attach stream to video
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream
    }
  }, [stream, idx])

  // proctoring: detect tab switch + fullscreen exit
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
    function onBlur() {
      logViolation('The assessment window lost focus.')
    }

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

  // reset per-station state on idx change
  useEffect(() => {
    setRecording(false)
    setElapsed(0)
    setFiredQueries(new Set())
    setLiveQueries([])
    setFlashQuery(null)
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
    // pre-fetch presigned URL while candidate is recording
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
    setElapsed(0)
    elapsedRef.current = 0

    let secs = 0
    tickRef.current = setInterval(() => {
      secs++
      elapsedRef.current = secs
      setElapsed(secs)

      // fire live doubts
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

  function stopRec() {
    if (tickRef.current) clearInterval(tickRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    setRecording(false)
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
      // use pre-fetched presign if ready, otherwise fetch now
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

      // upload directly to S3 with progress tracking via XHR
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

      // save URL to DB
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

  if (stage === 'ready') {
    return (
      <div className={styles.readyPage}>
        <div className={styles.readyCard}>
          <div className={styles.gateLogo}>S</div>
          <h2 className={styles.gateTitle}>Ready to begin?</h2>
          <p className={styles.gateSub}>
            The assessment will open in <b>fullscreen</b>. Switching tabs or exiting fullscreen will be logged as a violation. 3 violations flag your attempt.
          </p>
          <ul className={styles.readyList}>
            <li>12 stations · ~40 minutes</li>
            <li>Camera and microphone required</li>
            <li>Stay on this window throughout</li>
            <li>Do not refresh the page</li>
          </ul>

          {!stream && !camError && (
            <button className={styles.permBtn} onClick={enableCamera}>
              Allow camera & microphone →
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

  if (stage === 'done') {
    return (
      <div className={styles.donePage}>
        <div className={styles.doneCard}>
          <div className={styles.doneCheck}>✓</div>
          <h2>Assessment submitted</h2>
          <p>Thank you, {candidateName}. All {steps.length} stations are recorded. Our panel will review your responses and get back to you with the next step.</p>
          {attemptNumber === 1 && <p className={styles.doneNote}>Attempt 1 of 2 used.</p>}
        </div>
      </div>
    )
  }

  if (!step) return null

  const isTeach = step.type === 'teach'
  const isPlan = !!step.notes
  const last = idx === steps.length - 1
  const left = steps.length - idx - 1
  const rec = recordings[step.id]
  const uploadStatus = rec?.uploadStatus

  return (
    <div className={styles.stationWrap}>
      {/* Violation warning */}
      {showViolationWarning && (
        <div className={styles.overlay}>
          <div className={styles.violationCard}>
            <div className={styles.violationIcon}>⚠️</div>
            <h3 className={styles.violationTitle}>Please stay on this window</h3>
            <p className={styles.violationMsg}>Switching tabs or exiting fullscreen is not allowed during the assessment.</p>
            <button className={styles.gateBtn} style={{ marginTop: 16 }} onClick={reenterFullscreen}>
              Return to assessment
            </button>
          </div>
        </div>
      )}

      {/* Overlay */}
      {overlayMsg && (
        <div className={styles.overlay}>
          <div className={styles.ovCard}>
            <div className={styles.spinner} />
            <div className={styles.ovMsg}>{overlayMsg}</div>
          </div>
        </div>
      )}

      {/* Top nav */}
      <div className={styles.top}>
        <div className={styles.logo}>S</div>
        <div>
          <div className={styles.topTitle}>Faculty Assessment Center</div>
          <div className={styles.topTag}>SUNSTONE · ELEVATE</div>
        </div>
        <div className={styles.spacer} />
        <span className={styles.topName}>{candidateName}</span>
      </div>

      <div className={styles.stationContent}>
        {/* Progress */}
        <div className={styles.progress}>
          <div className={styles.pmeta}>Station {idx + 1} of {steps.length}{left > 0 ? ` · ${left} to go` : ' · final station'}</div>
          <div className={styles.pbar}><div className={styles.pfill} style={{ width: `${Math.round((idx + 1) / steps.length * 100)}%` }} /></div>
          <p className={styles.blurb}>{step.blurb}</p>
        </div>

        <div className={styles.stMain}>
          {/* Brief */}
          <div className={styles.brief}>
            {step.image && (
              <div className={styles.scnImg}>
                <img src={`/images/${step.image}`} alt="Scenario" onError={e => (e.currentTarget.style.display = 'none')} />
              </div>
            )}
            <div className={styles.stationKind}>{isTeach ? 'Your topic' : isPlan ? 'Your task' : 'The situation'}</div>
            <div className={styles.stationTopic} dangerouslySetInnerHTML={{ __html: step.topic }} />
            {isPlan && (
              <>
                <label className={styles.planLabel}>Your lesson plan</label>
                <textarea
                  className={styles.planArea}
                  placeholder="Write your lesson plan here…"
                  value={planNotes[step.id] || ''}
                  onChange={e => setPlanNotes(prev => ({ ...prev, [step.id]: e.target.value }))}
                />
              </>
            )}
            <div className={styles.metaLine}>
              {isTeach ? 'Student doubts will appear as you teach.' : isPlan ? 'When done writing, record a short spoken explanation.' : 'Respond as if the student is in front of you.'} · Limit {fmt(step.durationSec)}.
            </div>
            {isTeach && (
              <div className={styles.qFeed}>
                <div className={styles.qFeedLabel}>Live student doubts</div>
                {liveQueries.length === 0
                  ? <div className={styles.qEmpty}>No doubts yet — they'll appear as you teach.</div>
                  : liveQueries.map((q, i) => <div key={i} className={styles.qi}><b>{q.who}:</b> {q.text}</div>)
                }
              </div>
            )}
          </div>

          {/* Recorder */}
          <div className={styles.recSide}>
            <div className={styles.vidWrap}>
              <video ref={videoRef} autoPlay muted playsInline className={styles.video} />
              {!stream && <div className={styles.vidOff}>Camera off — click &quot;Enable camera&quot;.</div>}
              {recording && <div className={styles.recLamp}><span className={styles.dot} />REC</div>}
              {recording && <div className={styles.vidTimer}>{fmt(elapsed)} / {fmt(step.durationSec)}</div>}
              {flashQuery && (
                <div className={styles.qFlash}>
                  <div className={styles.qWho}>✋ {flashQuery.who} asks</div>
                  <div className={styles.qTx}>{flashQuery.text}</div>
                </div>
              )}
            </div>

            <div className={styles.controls}>
              {!stream && <button className={styles.btnGhost} onClick={enableCamera}>Enable camera</button>}
              {stream && !rec && (
                <button
                  className={recording ? styles.btnDark : styles.btnPrimary}
                  onClick={recording ? stopRec : startRec}
                >
                  {recording ? '⏹ Stop recording' : '⏺ Start recording'}
                </button>
              )}
              {rec && !recording && (
                <button className={styles.btnGhost} onClick={redo}>Re-record</button>
              )}
              <div style={{ flex: 1 }} />
              {uploadStatus === 'uploading' && (
                <div className={styles.uploadProgress}>
                  <div className={styles.uploadProgressBar} style={{ width: `${rec?.uploadProgress ?? 0}%` }} />
                  <span className={styles.uploadNote}>Uploading {rec?.uploadProgress ?? 0}%</span>
                </div>
              )}
              {uploadStatus === 'error' && <span className={styles.uploadError}>Upload failed — re-record</span>}
              <button
                className={styles.btnDark}
                onClick={nextStation}
                disabled={!done}
              >
                {last ? 'Finish & submit →' : 'Save & next →'}
              </button>
            </div>

            {camError && <div className={styles.camErr}>{camError}</div>}
            {rec && uploadStatus === 'done' && (
              <div className={styles.savedNote}>✓ Recorded ({fmt(rec.durationSec)}) · saved. Re-record or continue.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
