'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { AttemptQuestion } from '@/lib/questions'
import styles from './flow.module.css'

interface Props {
  leadName: string
  attemptId: string
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

interface RecordingState {
  url: string
  durationSec: number
  uploadStatus: UploadStatus
  uploadProgress?: number
  s3Url?: string
}

function fmt(s: number) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60), x = Math.floor(s % 60)
  return String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0')
}

function IconCamera() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
    </svg>
  )
}
function IconMic() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  )
}
function IconClipboard() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/>
    </svg>
  )
}
function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}


export default function AnswerFlow({ leadName, attemptId }: Props) {
  const [questions, setQuestions] = useState<AttemptQuestion[]>([])
  // Spoken closing, played after submit. Null until generated.
  const [closingUrl, setClosingUrl] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [stage, setStage] = useState<'welcome' | 'ready' | 'question' | 'done'>('welcome')
  const [recordings, setRecordings] = useState<Record<string, RecordingState>>({})

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [camError, setCamError] = useState('')
  const [overlayMsg, setOverlayMsg] = useState('')

  // Which questions have finished playing their avatar video. Recording stays
  // locked until the lead has actually heard the question.
  const [avatarDone, setAvatarDone] = useState<Record<string, boolean>>({})

  const [globalElapsed, setGlobalElapsed] = useState(0)
  const globalElapsedRef = useRef(0)
  const globalTickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Setup wizard: camera/mic, then instructions. No fullscreen step — this is
  // not a proctored exam.
  const [checkStep, setCheckStep] = useState<1 | 2>(1)
  const [micLevel, setMicLevel] = useState(0)
  const [micEverDetected, setMicEverDetected] = useState(false)
  const animFrameRef = useRef<number | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const camPreviewRef = useRef<HTMLVideoElement>(null)
  const avatarRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedRef = useRef(0)
  const presignRef = useRef<{ uploadUrl: string; finalUrl: string } | null>(null)

  // Every in-flight upload, so submit can wait for them. The old app marked the
  // attempt submitted while the last upload was still running, and lost that
  // answer if the tab closed.
  const pendingUploads = useRef<Map<string, Promise<void>>>(new Map())

  const question: AttemptQuestion | undefined = questions[idx]
  const answered = !!(question && recordings[question.questionId])

  useEffect(() => {
    const v = videoRef.current
    if (stream && v) {
      v.srcObject = stream
      v.play().catch(() => {})
    }
  }, [stream, idx, stage])

  useEffect(() => {
    const v = camPreviewRef.current
    if (stream && v) {
      v.srcObject = stream
      v.play().catch(() => {})
    }
  }, [stream])

  // Mic level meter
  useEffect(() => {
    if (!stream) return
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    ctx.createMediaStreamSource(stream).connect(analyser)
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

  // Session timer
  useEffect(() => {
    if (stage !== 'question') return
    globalElapsedRef.current = 0
    const id = setInterval(() => {
      globalElapsedRef.current++
      setGlobalElapsed(globalElapsedRef.current)
    }, 1000)
    globalTickRef.current = id
    return () => clearInterval(id)
  }, [stage])

  async function enableCamera() {
    setCamError('')
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: true, audio: true }))
    } catch (e: unknown) {
      setCamError(`Could not access camera: ${(e as Error).name}`)
    }
  }

  async function begin() {
    setOverlayMsg('Loading your questions…')
    try {
      const res = await fetch('/api/attempt/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId }),
      })
      const { questions: drawn, closingUrl: closing, error } = await res.json()
      if (error) throw new Error(error)
      setQuestions(drawn as AttemptQuestion[])
      setClosingUrl(closing ?? null)
    } catch {
      setOverlayMsg('')
      alert('Could not load your questions. Please refresh and try again.')
      return
    }
    setOverlayMsg('')
    setStage('question')
  }

  const stopRec = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    setRecording(false)
  }, [])

  function startRec() {
    if (!stream || !question) return
    const questionId = question.questionId
    const maxSec = question.durationSec

    chunksRef.current = []
    presignRef.current = null
    fetch('/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId, questionId }),
    }).then(r => r.json()).then(d => { presignRef.current = d }).catch(() => {})

    const recorder = new MediaRecorder(stream, {
      videoBitsPerSecond: 400_000,
      audioBitsPerSecond: 48_000,
    })
    recorder.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      pendingUploads.current.set(questionId, handleRecordingStop(questionId))
    }
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
      if (secs >= maxSec) stopRec()
    }, 1000)
  }

  async function handleRecordingStop(questionId: string) {
    const blob = new Blob(chunksRef.current, { type: 'video/webm' })
    const url = URL.createObjectURL(blob)
    const durationSec = elapsedRef.current

    setRecordings(prev => ({
      ...prev,
      [questionId]: { url, durationSec, uploadStatus: 'uploading' },
    }))

    try {
      let presign = presignRef.current
      if (!presign) {
        const r = await fetch('/api/upload/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId, questionId }),
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
            setRecordings(prev => ({
              ...prev,
              [questionId]: { ...prev[questionId], uploadProgress: pct },
            }))
          }
        }
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`S3 ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(blob)
      })

      await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, questionId, s3Url: finalUrl, durationSec }),
      })

      setRecordings(prev => ({
        ...prev,
        [questionId]: { ...prev[questionId], uploadStatus: 'done', uploadProgress: 100, s3Url: finalUrl },
      }))
    } catch {
      setRecordings(prev => ({
        ...prev,
        [questionId]: { ...prev[questionId], uploadStatus: 'error' },
      }))
    }
  }

  function redo() {
    if (!question) return
    const questionId = question.questionId
    pendingUploads.current.delete(questionId)
    setRecordings(prev => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
  }

  function replayAvatar() {
    const v = avatarRef.current
    if (!v) return
    v.currentTime = 0
    v.play().catch(() => {})
  }

  async function next() {
    if (recording) stopRec()

    if (idx < questions.length - 1) {
      // Reset transient state here rather than in an effect keyed on idx.
      if (tickRef.current) clearInterval(tickRef.current)
      setRecording(false)
      setElapsed(0)
      setIdx(i => i + 1)
      return
    }

    // Wait for every upload to settle before marking the attempt submitted.
    setOverlayMsg('Saving your answers…')
    if (globalTickRef.current) clearInterval(globalTickRef.current)
    await Promise.allSettled([...pendingUploads.current.values()])

    setOverlayMsg('Submitting…')
    await fetch('/api/attempt/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId, totalDurationSec: globalElapsedRef.current }),
    })

    if (stream) stream.getTracks().forEach(t => t.stop())
    setOverlayMsg('')
    setStage('done')
  }

  // ── WELCOME ──
  if (stage === 'welcome') {
    return (
      <div className={styles.gateSplit}>
        <div className={styles.gateSplitLeft}>
          <div className={styles.gateSplitBrand}>
            <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.gateSplitLogo} />
            <span className={styles.gateSplitSub}>Sunstone</span>
            <span className={styles.gateSplitTag}>Admissions</span>
          </div>

          <div className={styles.gateSplitHero}>
            <h1 className={styles.gateSplitHeadline}>
              Your turn.<br />
              <span className={styles.gateSplitAccent}>Just a few questions.</span>
            </h1>
            <p className={styles.gateSplitBody}>
              A short video conversation. Our counsellor asks a few questions, and you record your
              answers. There are no right or wrong answers here.
            </p>
            <div className={styles.gateSplitFeatures}>
              <div className={styles.gateSplitFeature}>
                <span className={styles.gateSplitFeatureIcon}>🎥</span>
                A short video answer to each question
              </div>
              <div className={styles.gateSplitFeature}>
                <span className={styles.gateSplitFeatureIcon}>⏱</span>
                About 6 minutes
              </div>
              <div className={styles.gateSplitFeature}>
                <span className={styles.gateSplitFeatureIcon}>💬</span>
                Answer however you are comfortable
              </div>
            </div>
          </div>

          <div className={styles.gateSplitFooter}>
            <span className={styles.gateSplitStatus}>
              <span className={styles.gateSplitDot} />
              All systems operational
            </span>
          </div>
        </div>

        <div className={styles.gateSplitRight}>
          <div className={styles.gateRightInner}>
            <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.gateRightLogo} />
            <h2 className={styles.gateRightTitle}>Hi {leadName.split(' ')[0]}</h2>
            <p className={styles.gateRightSub}>
              Before we start, let us quickly check your camera and microphone.
            </p>
            <button className={styles.gateGoogleBtn} onClick={() => setStage('ready')}>
              Check setup →
            </button>
            <div className={styles.gateTrustRow}>
              <span className={styles.gateTrustItem}>⏱ ~6 minutes</span>
              <span className={styles.gateTrustItem}>🎥 Video recorded</span>
              <span className={styles.gateTrustItem}>🔒 Secure</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── SETUP WIZARD ──
  if (stage === 'ready') {
    const STEPS = ['Camera & Microphone', 'Instructions']

    const instRows = [
      {
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
        title: 'About 6 minutes',
        desc: 'A short video answer to each question. Time limit screen par dikhegi.',
      },
      {
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
        title: 'Listen to the question first',
        desc: 'The counsellor video plays first. Replay it if you like, then record.',
      },
      {
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>,
        title: 'Take your time',
        desc: 'Speak the way you normally would. No need to sound formal.',
      },
      {
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9"/><polyline points="3 3 3 8 8 8"/></svg>,
        title: 'You can re-record',
        desc: 'Not happy with an answer? Delete it and record again.',
      },
    ]

    return (
      <div className={styles.wizardPage}>
        <div className={styles.wizardNav}>
          <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.wizardNavLogo} />
          <div className={styles.wizardSteps}>
            {STEPS.map((label, i) => (
              <div key={i} className={`${styles.wizardStep} ${checkStep === i + 1 ? styles.wizardStepActive : checkStep > i + 1 ? styles.wizardStepDone : ''}`}>
                <div className={styles.wizardStepDot}>
                  {checkStep > i + 1 ? <IconCheck /> : i + 1}
                </div>
                <span className={styles.wizardStepLabel}>{label}</span>
                {i < STEPS.length - 1 && <div className={styles.wizardStepLine} />}
              </div>
            ))}
          </div>
          <div className={styles.wizardNavSpacer} />
        </div>

        <div className={styles.wizardBody}>
          {checkStep === 1 && (
            <div className={styles.wizardPane}>
              <div className={styles.wizardIconWrap}><IconCamera /></div>
              <h2 className={styles.wizardTitle}>Camera &amp; Microphone</h2>
              <p className={styles.wizardDesc}>
                We need access to record your answers. Click below and accept the browser prompt.
              </p>
              <div className={styles.wizardPreviewWrap}>
                {stream
                  ? <>
                      <video ref={camPreviewRef} autoPlay muted playsInline className={styles.wizardPreviewVid} />
                      <div className={styles.camLiveBadge}><span className={styles.camLiveDot} />LIVE</div>
                    </>
                  : <div className={styles.wizardPreviewPlaceholder}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                      <span>Camera preview will appear here</span>
                    </div>
                }
              </div>

              {stream && (
                <div className={styles.wizardMicTest}>
                  <div className={styles.wizardMicBarRow}>
                    <div className={styles.wizardMicBarIcon}><IconMic /></div>
                    <div className={styles.wizardMicBarTrack}>
                      <div
                        className={`${styles.wizardMicBarFill} ${micLevel > 0 ? styles.wizardMicBarFillActive : ''}`}
                        style={{ width: `${micLevel}%` }}
                      />
                    </div>
                    <div className={`${styles.wizardMicLabel} ${micEverDetected ? styles.wizardMicLabelOk : ''}`}>
                      {micEverDetected ? 'Detected' : 'Speak'}
                    </div>
                  </div>
                </div>
              )}

              {camError && <p className={styles.camError}>{camError}</p>}
              {!stream
                ? <button className={styles.wizardBtn} onClick={enableCamera}>Allow camera &amp; microphone</button>
                : <button
                    className={micEverDetected ? styles.wizardBtnSuccess : styles.wizardBtnDisabled}
                    onClick={() => { if (micEverDetected) setCheckStep(2) }}
                    disabled={!micEverDetected}
                  >
                    {micEverDetected ? 'Camera and mic confirmed. Continue' : 'Say something to confirm your mic'}
                  </button>
              }
            </div>
          )}

          {checkStep === 2 && (
            <div className={styles.wizardPane}>
              <div className={styles.wizardIconWrap}><IconClipboard /></div>
              <h2 className={styles.wizardTitle}>You are all set</h2>
              <p className={styles.wizardDesc}>Have a quick read, then start when you are ready.</p>
              <div className={styles.wizardInstructions}>
                {instRows.map((row, i) => (
                  <div key={i} className={styles.wizardInstRow}>
                    <span className={styles.wizardInstIcon}>{row.icon}</span>
                    <div>
                      <div className={styles.wizardInstTitle}>{row.title}</div>
                      <div className={styles.wizardInstDesc}>{row.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button className={styles.wizardBtnSuccess} onClick={begin}>Start</button>
            </div>
          )}
        </div>

        {overlayMsg && (
          <div className={styles.overlay}>
            <div className={styles.ovCard}>
              <div className={styles.spinner} />
              <div className={styles.ovMsg}>{overlayMsg}</div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── DONE ──
  if (stage === 'done') {
    return (
      <div className={styles.donePage}>
        <div className={styles.doneCard}>
          {closingUrl && (
            <div className={styles.avatarVideoWrap} style={{ marginBottom: 20 }}>
              <video
                src={closingUrl}
                className={styles.avatarVideo}
                autoPlay
                playsInline
                controls
              />
            </div>
          )}
          <div className={styles.doneCheck}>✓</div>
          <h2>All done, thank you</h2>
          <p>
            Thanks {leadName.split(' ')[0]}. All {questions.length} of your answers are recorded.
            Our team will go through them and get back to you soon.
          </p>
        </div>
      </div>
    )
  }

  if (!question) return null

  const questionId = question.questionId
  const rec = recordings[questionId]
  const uploadStatus = rec?.uploadStatus
  const last = idx === questions.length - 1
  const pct = Math.round(((idx + 1) / questions.length) * 100)
  const heard = !!avatarDone[questionId] || !question.avatarUrl

  return (
    <div className={styles.stationWrap}>
      {overlayMsg && (
        <div className={styles.overlay}>
          <div className={styles.ovCard}>
            <div className={styles.spinner} />
            <div className={styles.ovMsg}>{overlayMsg}</div>
          </div>
        </div>
      )}

      <header className={styles.topNav}>
        <div className={styles.topLeft}>
          <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.sunstoneLogo} />
        </div>
        <span className={styles.topCenter}>Sunstone Admissions</span>
        <div className={styles.topRight}>
          <div className={styles.timerPill}>
            <span className={styles.timerIcon}>⏱</span>
            {fmt(globalElapsed)}
          </div>
        </div>
      </header>

      <main className={styles.twoPaneMain}>
        {/* LEFT: the counsellor avatar asking the question */}
        <div className={styles.leftPane}>
          <div className={styles.avatarCard}>
            <div className={styles.tileHeader}>
              <span className={styles.tileLabel}>Counsellor</span>
              {question.avatarUrl && (
                <button className={styles.deleteBtn} onClick={replayAvatar}>↻ Replay</button>
              )}
            </div>
            <div className={styles.avatarVideoWrap}>
              {question.avatarUrl ? (
                <video
                  ref={avatarRef}
                  key={questionId}
                  src={question.avatarUrl}
                  className={styles.avatarVideo}
                  autoPlay
                  playsInline
                  onEnded={() => setAvatarDone(prev => ({ ...prev, [questionId]: true }))}
                />
              ) : (
                <div className={styles.avatarFallback}>
                  <div className={styles.avatarCircle}>S</div>
                  <div className={styles.avatarName}>Question is below</div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.questionBlock}>
            <div className={styles.questionLabel}>Question {idx + 1}</div>
            <p className={styles.questionText}>{question.content}</p>
          </div>
        </div>

        {/* RIGHT: the lead recording their answer */}
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
                <button
                  className={styles.startRecBtn}
                  onClick={startRec}
                  disabled={!heard}
                  title={heard ? '' : 'Listen to the question first'}
                >
                  ⏺
                </button>
                <span className={styles.startRecLabel}>
                  {heard ? 'Click to start recording' : 'Listen to the question first…'}
                </span>
              </div>
            )}
            {recording && (
              <>
                <div className={styles.recBadge}>
                  <span className={styles.recDot} />
                  RECORDING
                </div>
                <div className={styles.elapsedBadge}>{fmt(elapsed)} / {fmt(question.durationSec)}</div>
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
          </div>
          {uploadStatus === 'uploading' && (
            <div className={styles.uploadProgress}>
              <div className={styles.uploadProgressBar} style={{ width: `${rec?.uploadProgress ?? 0}%` }} />
              <span className={styles.uploadNote}>Uploading {rec?.uploadProgress ?? 0}%…</span>
            </div>
          )}
          {uploadStatus === 'error' && (
            <div className={styles.uploadError}>Upload failed. Delete and record again.</div>
          )}
          {uploadStatus === 'done' && !recording && (
            <div className={styles.savedNote}>✓ Answer saved · {fmt(rec.durationSec)}</div>
          )}
          {!stream && !camError && (
            <button className={styles.enableCamBtn} onClick={enableCamera}>
              Enable camera &amp; microphone
            </button>
          )}
          {camError && <div className={styles.camErr}>{camError}</div>}
        </div>
      </main>

      <footer className={styles.bottomBar}>
        <div className={styles.progressSection}>
          <div className={styles.progressLabel}>
            <span className={styles.stepLabel}>Question {idx + 1} of {questions.length}</span>
            <span className={styles.pctLabel}>{pct}% complete</span>
          </div>
          <div className={styles.pbar}>
            <div className={styles.pfill} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className={styles.bottomActions}>
          <button className={styles.nextBtn} onClick={next} disabled={!answered}>
            {last ? 'Finish & submit' : 'Next question'} →
          </button>
        </div>
      </footer>
    </div>
  )
}
