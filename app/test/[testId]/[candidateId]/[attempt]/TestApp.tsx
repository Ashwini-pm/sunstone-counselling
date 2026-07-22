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
  const [stage, setStage] = useState<'welcome' | 'ready' | 'station' | 'done'>('welcome')
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

  // Media check state
  const [checkStep, setCheckStep] = useState<1|2|3|4>(1)
  const [micLevel, setMicLevel] = useState(0)       // 0-100
  const [micEverDetected, setMicEverDetected] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const camPreviewRef = useRef<HTMLVideoElement>(null)
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

  // Camera preview on ready screen
  useEffect(() => {
    const v = camPreviewRef.current
    if (stream && v) {
      v.srcObject = stream
      v.play().catch(() => {})
    }
  }, [stream])

  // Mic level analyser
  useEffect(() => {
    if (!stream) return
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser)
    audioCtxRef.current = ctx
    analyserRef.current = analyser
    const data = new Uint8Array(analyser.frequencyBinCount)
    function tick() {
      analyser.getByteFrequencyData(data)
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length)
      const level = Math.min(100, Math.round(rms * 2.5))
      setMicLevel(level)
      if (level > 8) setMicEverDetected(true)
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      ctx.close()
    }
  }, [stream])

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

  // ── WELCOME ──
  if (stage === 'welcome') {
    return (
      <div className={styles.gateSplit}>
        {/* Left dark panel */}
        <div className={styles.gateSplitLeft}>
          <div className={styles.gateSplitBrand}>
            <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.gateSplitLogo} />
            <span className={styles.gateSplitSub}>Faculty Assessment</span>
            <span className={styles.gateSplitTag}>Hiring Platform</span>
          </div>
          <div className={styles.gateSplitHero}>
            <h1 className={styles.gateSplitHeadline}>
              Your stage.<br />
              <span className={styles.gateSplitAccent}>Show us how you teach.</span>
            </h1>
            <p className={styles.gateSplitBody}>
              A 30-minute multi-station assessment designed to surface real teaching ability — not rehearsed answers.
            </p>
            <div className={styles.gateSplitFeatures}>
              <div className={styles.gateSplitFeature}><span className={styles.gateSplitFeatureIcon}>🎯</span>9 stations across teaching, communication &amp; domain</div>
              <div className={styles.gateSplitFeature}><span className={styles.gateSplitFeatureIcon}>✋</span>Live student doubts during micro-teaching</div>
              <div className={styles.gateSplitFeature}><span className={styles.gateSplitFeatureIcon}>🔍</span>Reviewed by Sunstone's expert panel</div>
            </div>
          </div>
          <div className={styles.gateSplitFooter}>
            <span className={styles.gateSplitStatus}>
              <span className={styles.gateSplitDot} />
              All systems operational
            </span>
          </div>
        </div>

        {/* Right white panel */}
        <div className={styles.gateSplitRight}>
          <div className={styles.gateRightInner}>
            <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.gateRightLogo} />
            <h2 className={styles.gateRightTitle}>Welcome, {candidateName.split(' ')[0]}</h2>
            <p className={styles.gateRightSub}>
              You're about to begin your faculty assessment for <strong>{ROLE_LABELS[role] || role}</strong>. Attempt #{attemptNumber}.
            </p>
            <button className={styles.gateGoogleBtn} onClick={() => setStage('ready')}>
              Check setup &amp; begin →
            </button>
            <div className={styles.gateTrustRow}>
              <span className={styles.gateTrustItem}>⏱ ~30 minutes</span>
              <span className={styles.gateTrustItem}>🎥 Video recorded</span>
              <span className={styles.gateTrustItem}>🔒 Secure</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── READY ──
  if (stage === 'ready') {
    const STEPS = ['Camera', 'Microphone', 'Fullscreen', 'Instructions']

    return (
      <div className={styles.wizardPage}>
        {/* Top progress bar */}
        <div className={styles.wizardNav}>
          <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.wizardNavLogo} />
          <div className={styles.wizardSteps}>
            {STEPS.map((label, i) => (
              <div key={i} className={`${styles.wizardStep} ${checkStep === i+1 ? styles.wizardStepActive : checkStep > i+1 ? styles.wizardStepDone : ''}`}>
                <div className={styles.wizardStepDot}>
                  {checkStep > i+1 ? '✓' : i+1}
                </div>
                <span className={styles.wizardStepLabel}>{label}</span>
                {i < STEPS.length-1 && <div className={styles.wizardStepLine} />}
              </div>
            ))}
          </div>
          <div className={styles.wizardNavSpacer} />
        </div>

        {/* Step content */}
        <div className={styles.wizardBody}>

          {/* ── STEP 1: Camera ── */}
          {checkStep === 1 && (
            <div className={styles.wizardPane}>
              <div className={styles.wizardIcon}>📷</div>
              <h2 className={styles.wizardTitle}>Allow your camera</h2>
              <p className={styles.wizardDesc}>We need camera access to record your teaching session. Click below and allow when your browser asks.</p>
              <div className={styles.wizardPreviewWrap}>
                {stream
                  ? <>
                      <video ref={camPreviewRef} autoPlay muted playsInline className={styles.wizardPreviewVid} />
                      <div className={styles.camLiveBadge}><span className={styles.camLiveDot} />LIVE</div>
                    </>
                  : <div className={styles.wizardPreviewPlaceholder}>
                      <span style={{ fontSize: 48 }}>📷</span>
                      <span>Camera preview will appear here</span>
                    </div>
                }
              </div>
              {camError && <p className={styles.camError}>{camError}</p>}
              {!stream
                ? <button className={styles.wizardBtn} onClick={enableCamera}>Allow camera &amp; microphone →</button>
                : <button className={styles.wizardBtnSuccess} onClick={() => setCheckStep(2)}>Camera working ✓ — Next →</button>
              }
            </div>
          )}

          {/* ── STEP 2: Microphone ── */}
          {checkStep === 2 && (
            <div className={styles.wizardPane}>
              <div className={styles.wizardIcon}>🎤</div>
              <h2 className={styles.wizardTitle}>Test your microphone</h2>
              <p className={styles.wizardDesc}>Say something out loud. The bars below should move when you speak.</p>
              <div className={styles.wizardMicTest}>
                <div className={styles.wizardMicBars}>
                  {[8,18,30,44,60,76,88].map((threshold, i) => (
                    <div
                      key={i}
                      className={`${styles.wizardMicBar} ${micLevel >= threshold ? styles.wizardMicBarOn : ''}`}
                      style={{ height: `${20 + i * 8}px` }}
                    />
                  ))}
                </div>
                <div className={styles.wizardMicLabel}>
                  {micEverDetected ? '🟢 Mic detected' : '🔴 Speak to test your mic'}
                </div>
              </div>
              <button
                className={micEverDetected ? styles.wizardBtnSuccess : styles.wizardBtnDisabled}
                onClick={() => { if (micEverDetected) setCheckStep(3) }}
                disabled={!micEverDetected}
              >
                {micEverDetected ? 'Microphone working ✓ — Next →' : 'Waiting for mic input…'}
              </button>
            </div>
          )}

          {/* ── STEP 3: Fullscreen ── */}
          {checkStep === 3 && (
            <div className={styles.wizardPane}>
              <div className={styles.wizardIcon}>⛶</div>
              <h2 className={styles.wizardTitle}>Enable fullscreen</h2>
              <p className={styles.wizardDesc}>Your assessment must run in fullscreen mode. Switching tabs or exiting fullscreen will be logged as a violation.</p>
              <div className={styles.wizardInfoBox}>
                <div className={styles.wizardInfoRow}><span>⚠️</span> Tab switching is recorded</div>
                <div className={styles.wizardInfoRow}><span>⚠️</span> Exiting fullscreen is recorded</div>
                <div className={styles.wizardInfoRow}><span>⚠️</span> Do not refresh the page</div>
              </div>
              <button className={styles.wizardBtn} onClick={async () => {
                await document.documentElement.requestFullscreen?.()
                setCheckStep(4)
              }}>
                Enter fullscreen →
              </button>
            </div>
          )}

          {/* ── STEP 4: Instructions ── */}
          {checkStep === 4 && (
            <div className={styles.wizardPane}>
              <div className={styles.wizardIcon}>📋</div>
              <h2 className={styles.wizardTitle}>You're all set</h2>
              <p className={styles.wizardDesc}>Read the instructions below before you begin your assessment.</p>
              <div className={styles.wizardInstructions}>
                {[
                  ['🎯', '9 stations', '~30 minutes total. Each station is timed.'],
                  ['🎤', 'Speak clearly', 'Each station requires a video recording.'],
                  ['✋', 'Live doubts', 'Student doubts appear on screen during micro-teaching — treat them as real.'],
                  ['🔒', 'Stay focused', 'Don\'t switch tabs, minimize, or refresh. Each violation is logged.'],
                ].map(([icon, title, desc], i) => (
                  <div key={i} className={styles.wizardInstRow}>
                    <span className={styles.wizardInstIcon}>{icon}</span>
                    <div>
                      <div className={styles.wizardInstTitle}>{title}</div>
                      <div className={styles.wizardInstDesc}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button className={styles.wizardBtnSuccess} onClick={beginAssessment}>
                Begin assessment →
              </button>
            </div>
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
            {isTeach && (
              <div className={styles.qFeed}>
                <div className={styles.qFeedLabel}>✋ Live student doubts</div>
                {liveQueries.length === 0
                  ? <div className={styles.qEmpty}>Student doubts will appear here as the session progresses — address them naturally.</div>
                  : liveQueries.map((q, i) => (
                    <div key={i} className={`${styles.qi} ${i === liveQueries.length - 1 ? styles.qiNew : ''}`}>
                      <b>{q.who}:</b> {q.text}
                    </div>
                  ))
                }
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
                <div className={styles.elapsedBadge}>{fmt(elapsed)} / {fmt(step.durationSec)}</div>
                {/* Live mic indicator */}
                <div className={styles.liveMicBadge}>
                  🎤
                  {[8, 20, 38, 58, 78].map((threshold, i) => (
                    <div
                      key={i}
                      className={`${styles.liveMicBar} ${micLevel >= threshold ? styles.liveMicBarOn : ''}`}
                      style={{ height: `${6 + i * 3}px` }}
                    />
                  ))}
                </div>
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
