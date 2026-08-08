'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { AttemptQuestion } from '@/lib/questions'
import type { EventName } from '@/lib/events'
import { RECENT_ADMITS, TICKER_MAIN, TICKER_SECOND } from '@/lib/socialProof'
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

/**
 * Log one funnel event. Fire and forget, by design.
 *
 * Never awaited on any path a lead can feel, never allowed to throw, and its
 * response is ignored. An analytics ping must not be able to interrupt somebody
 * recording an answer, so every failure mode here is silence.
 *
 * sendBeacon first, because several of these fire as the page is going away and
 * a normal fetch gets cancelled when that happens. It also does not block the
 * unload. Falls back to fetch with keepalive where sendBeacon is unavailable.
 */
function track(
  event: EventName,
  detail?: { questionId?: string; position?: number; meta?: Record<string, unknown> },
) {
  try {
    const body = JSON.stringify({ event, ...detail })
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const ok = navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }))
      if (ok) return
    }
    void fetch('/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Analytics is never worth an exception on the recording path.
  }
}

function fmt(s: number) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60), x = Math.floor(s % 60)
  return String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0')
}

/**
 * Urgency strip across the top of the first screen.
 *
 * Lifted from the C-SAT landing page so the two surfaces read as the same
 * brand: gold accent over dark, masked edges, 30s linear scroll.
 *
 * Six copies and a -50% translate. The track resets after travelling exactly
 * three copies, landing on an identical frame, so the loop has no seam. Two
 * copies would work on a phone and leave a gap on a wide desktop.
 */
function UrgencyTicker() {
  const line = (i: number) => (
    <p className={styles.tickerLine} key={i} aria-hidden={i > 0 ? 'true' : undefined}>
      <span className={styles.tickerIcon}>🚀</span>
      <span className={styles.tickerMain}>{TICKER_MAIN}</span>
      <span className={styles.tickerSep}>|</span>
      <span>{TICKER_SECOND}</span>
    </p>
  )
  return (
    <div className={styles.ticker} role="status">
      <div className={styles.tickerMask}>
        <div className={styles.tickerTrack}>
          {[0, 1, 2, 3, 4, 5].map(line)}
        </div>
      </div>
    </div>
  )
}

/**
 * Rotating "someone just enrolled" card.
 *
 * Deliberately small and in the corner. It is meant to be noticed on the second
 * glance, not to sit in front of the button the student came to press.
 */
function ProofCard() {
  const [i, setI] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    // Fade out, swap while invisible, fade back in. Swapping the text mid-fade
    // is what stops it reading as a jump cut.
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setI(prev => (prev + 1) % RECENT_ADMITS.length)
        setVisible(true)
      }, 420)
    }, 4200)
    return () => clearInterval(id)
  }, [])

  const admit = RECENT_ADMITS[i]
  return (
    <div className={`${styles.proof} ${visible ? styles.proofIn : styles.proofOut}`}>
      <span className={styles.proofAvatar}>
        {admit.name.charAt(0)}
        <span className={styles.proofDot} />
      </span>
      <div className={styles.proofBody}>
        <span className={styles.proofTop}>
          <strong>{admit.name}</strong>
          <span className={styles.proofCity}>{admit.city}</span>
        </span>
        <span className={styles.proofWhen}>{admit.when}</span>
      </div>
    </div>
  )
}

function DemoLoop() {
  return (
    <div className={styles.demo} aria-hidden="true">
      <div className={styles.demoBar}>
        <div className={styles.demoRec}>
          <span className={styles.demoRecInner} />
          <span className={styles.demoTapRing} />
        </div>
        <div className={styles.demoTimer}>0:0<span className={styles.demoDigit} /></div>
        <div className={styles.demoNext}>
          Next
          <span className={styles.demoTapRingNext} />
        </div>
      </div>
      <div className={styles.demoCaptions}>
        <span className={styles.demoCap1}>Tap the red button to answer</span>
        <span className={styles.demoCap2}>Tap again when you finish</span>
        <span className={styles.demoCap3}>Then move to the next question</span>
      </div>
    </div>
  )
}

function IconClipboard() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/>
    </svg>
  )
}


export default function AnswerFlow({ leadName, attemptId }: Props) {
  const [questions, setQuestions] = useState<AttemptQuestion[]>([])
  // Spoken closing, played after submit. Null until generated.
  const [closingUrl, setClosingUrl] = useState<string | null>(null)
  const [closingDone, setClosingDone] = useState(false)
  const [idx, setIdx] = useState(0)
  const [stage, setStage] = useState<'welcome' | 'ready' | 'question' | 'done'>('welcome')
  const [recordings, setRecordings] = useState<Record<string, RecordingState>>({})

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [camError, setCamError] = useState('')
  // True when the camera was refused and we fell back to recording audio.
  const [audioOnly, setAudioOnly] = useState(false)
  // Set when the browser refuses to autoplay the counsellor clip. See below.
  const [playBlocked, setPlayBlocked] = useState(false)
  const [overlayMsg, setOverlayMsg] = useState('')

  // Which questions have finished playing their avatar video. Recording stays
  // locked until the lead has actually heard the question.
  const [avatarDone, setAvatarDone] = useState<Record<string, boolean>>({})

  // The counsellor holds the main tile for the whole question and the lead stays
  // in the corner. An earlier version handed the main tile over once the clip
  // ended, which left the counsellor frozen on a last frame in a thumbnail.
  const [captionOpen, setCaptionOpen] = useState(true)
  // Looping clip of the counsellor listening. Null until one is generated, in
  // which case the frozen last frame plus a CSS drift is used instead.
  const [idleUrls, setIdleUrls] = useState<string[]>([])

  const [globalElapsed, setGlobalElapsed] = useState(0)
  const globalElapsedRef = useRef(0)
  const globalTickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Setup wizard: camera/mic, then instructions. No fullscreen step — this is
  // not a proctored exam.
  const [micLevel, setMicLevel] = useState(0)
  const [micEverDetected, setMicEverDetected] = useState(false)
  const animFrameRef = useRef<number | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const clipRef = useRef<HTMLVideoElement>(null)
  const camPreviewRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // Set when a recording came back implausibly small, so the next question
  // rebuilds the capture stream instead of reusing one that is not producing.
  const forceReacquireRef = useRef(false)
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

  const startedQuestions = useRef<Set<string>>(new Set())
  const current = questions[idx]
  useEffect(() => {
    if (stage !== 'question' || !current) return
    if (startedQuestions.current.has(current.questionId)) return
    startedQuestions.current.add(current.questionId)
    track('question_started', { questionId: current.questionId, position: idx + 1 })
  }, [stage, current, idx])

  // Fires once per page load. A ref guard rather than state, both because
  // StrictMode double-invokes effects in development and because
  // react-hooks/set-state-in-effect has already failed a build in this file.
  const introLogged = useRef(false)
  useEffect(() => {
    if (introLogged.current) return
    introLogged.current = true
    track('intro_viewed')
  }, [])

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

  /**
   * Get a stream, without a screen of our own asking for one.
   *
   * The browser's prompt is the only permission gate there is, and it cannot be
   * bypassed, so putting our own "check your camera" step in front of it just
   * added a screen to abandon. 15% left at that screen and it verified nothing
   * the call itself would not.
   *
   * Camera blocked is not the end: 9 of 21 people tapped Block, and asking for
   * the microphone alone is a much smaller request that most of them accept. An
   * audio answer is worth far more than a lost lead.
   *
   * Returns true if we have something to record with.
   */
  async function ensureMedia(force = false): Promise<MediaStream | null> {
    // Returns the stream rather than a boolean because setStream is a state
    // update: a caller that re-acquires and then records in the same tick would
    // otherwise still be holding the dead one.
    if (stream && !force) return stream

    // A MediaStream object outlives its tracks. When Android reclaims the
    // camera (the tab is backgrounded, a call arrives, another app grabs it)
    // every track flips to 'ended' and stays there, but `stream` is still a
    // perfectly good object, so the old `if (stream) return true` handed back a
    // corpse. MediaRecorder then recorded it happily and produced almost no
    // data while the wall-clock timer kept counting, which is how a 3 second
    // answer was stored as 23 seconds. Forced re-acquisition is the recovery.
    if (force && stream) {
      stream.getTracks().forEach(t => t.stop())
    }
    setCamError('')
    track('camera_requested')

    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setStream(s)
      streamRef.current = s
      track('camera_granted')
      return s
    } catch (e: unknown) {
      const name = (e as Error)?.name ?? 'unknown'
      track('camera_denied', { meta: { reason: name } })

      // Second chance, audio only.
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true })
        setStream(s)
        streamRef.current = s
        setAudioOnly(true)
        track('camera_granted', { meta: { audioOnly: true, cameraReason: name } })
        return s
      } catch (e2: unknown) {
        const n2 = (e2 as Error)?.name ?? 'unknown'
        track('camera_denied', { meta: { reason: n2, stage: 'audio_fallback' } })
        // A blocked origin is remembered, so calling getUserMedia again does
        // nothing at all. Telling them to "try again" would be a lie.
        setCamError(
          n2 === 'NotAllowedError'
            ? 'Your browser is blocking the microphone for this page. Tap the lock or ⓘ icon next to the web address, allow Microphone, then reload.'
            : `Could not reach your microphone (${n2}). Please check no other app is using it, then reload.`,
        )
        return null
      }
    }
  }

  /** Kept for the in-call "turn on camera" control. */
  async function enableCamera() {
    await ensureMedia()
  }

  async function begin() {
    // The permission prompt belongs on a deliberate tap, not on a screen of its
    // own. If everything is refused we stop here rather than dropping someone
    // into a call they have no way to answer.
    setOverlayMsg('Starting…')
    const ok = await ensureMedia()
    if (!ok) { setOverlayMsg(''); return }

    setOverlayMsg('Loading your questions…')
    let drawnCount = 0
    try {
      const res = await fetch('/api/attempt/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId }),
      })
      const { questions: drawn, closingUrl: closing, idleUrls: idles, idleUrl: idle, error } = await res.json()
      if (error) throw new Error(error)
      drawnCount = (drawn as AttemptQuestion[]).length
      setQuestions(drawn as AttemptQuestion[])
      setClosingUrl(closing ?? null)
      setIdleUrls(idles ?? (idle ? [idle] : []))
    } catch {
      setOverlayMsg('')
      alert('Could not load your questions. Please refresh and try again.')
      return
    }
    setOverlayMsg('')
    track('wizard_completed', { meta: { questions: drawnCount } })
    setStage('question')
  }

  const stopRec = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    setRecording(false)
  }, [])

  /** Are all of this stream's tracks still actually producing? */
  function streamIsLive(s: MediaStream | null): boolean {
    if (!s) return false
    const tracks = s.getTracks()
    return tracks.length > 0 && tracks.every(t => t.readyState === 'live')
  }

  async function startRec() {
    if (!question) return
    const questionId = question.questionId
    const maxSec = question.durationSec

    // Recording onto ended tracks is the bug that stored a 3 second answer as
    // 23 seconds: MediaRecorder accepts a dead stream without complaint and
    // simply emits nothing. One student's session decayed Q1 good, Q2 3s, Q3
    // 2s, Q4 0.1s, Q5 zero bytes, because nothing ever re-acquired the camera.
    let live = streamRef.current ?? stream
    if (!streamIsLive(live) || forceReacquireRef.current) {
      forceReacquireRef.current = false
      track('camera_recovered', { questionId, position: idx + 1 })
      live = await ensureMedia(true)
      if (!live) return
    }

    presignRef.current = null
    fetch('/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId, questionId }),
    }).then(r => r.json()).then(d => { presignRef.current = d }).catch(() => {})

    // Per-recording, not a shared ref. The old code reset chunksRef.current in
    // startRec while the previous recorder's onstop could still be pending, so
    // auto-record on the next question could empty the array the previous
    // answer was about to be built from.
    const chunks: Blob[] = []
    // Declared before the recorder because onstop closes over it.
    let secs = 0

    const recorder = new MediaRecorder(live, {
      videoBitsPerSecond: 400_000,
      audioBitsPerSecond: 48_000,
    })
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    recorder.onstop = () => {
      pendingUploads.current.set(questionId, handleRecordingStop(questionId, chunks, secs))
    }
    recorder.start(5000)
    recorderRef.current = recorder
    track('recording_started', { questionId, position: idx + 1 })
    setRecording(true)
    setElapsed(0)
    elapsedRef.current = 0

    tickRef.current = setInterval(() => {
      secs++
      elapsedRef.current = secs
      setElapsed(secs)
      if (secs >= maxSec) stopRec()
    }, 1000)
  }

  async function handleRecordingStop(questionId: string, chunks: Blob[], elapsedAtStop: number) {
    const blob = new Blob(chunks, { type: 'video/webm' })
    const url = URL.createObjectURL(blob)
    const position = questions.findIndex(q => q.questionId === questionId) + 1

    // The wall-clock timer is how long the student sat there, which is not the
    // same as how much was captured, and storing the first as if it were the
    // second is what made the sheet unreadable. Trust the smaller of the two so
    // a thin file reports its honest length rather than a flattering one.
    //
    // The expected rate follows the bitrates set on the recorder: video plus
    // audio is ~55 KB/s, audio alone ~6 KB/s. A flat threshold would flag every
    // audio-only answer as broken, so both are derived from the same figure.
    // Two thresholds, because they answer different questions. Encoders vary a
    // lot: one student's VP8 recorded a perfectly good answer at 26 KB/s where
    // another's H.264 used 86 KB/s for the same thing. So "suspicious" only
    // flags for investigation, while "rewrite the duration" needs the file to
    // be so far below any plausible encode that nothing was captured at all.
    const expectedKbPerSec = audioOnly ? 6 : 55
    const kbPerSec = elapsedAtStop > 0 ? blob.size / 1000 / elapsedAtStop : 0
    const thin = elapsedAtStop >= 2 && kbPerSec < expectedKbPerSec * 0.15
    const empty = elapsedAtStop >= 2 && kbPerSec < expectedKbPerSec * 0.05
    const durationSec = empty
      ? Math.max(0, Math.round((blob.size / 1000) / expectedKbPerSec))
      : elapsedAtStop

    if (thin) {
      track('recording_thin', {
        questionId, position,
        meta: { elapsedSec: elapsedAtStop, bytes: blob.size, kbPerSec: Math.round(kbPerSec * 10) / 10, audioOnly, empty },
      })
      // Whatever killed the capture is still broken for the next question. The
      // tracks can read 'live' while producing nothing, so liveness alone would
      // not catch it. Flag it and let startRec rebuild, rather than calling
      // getUserMedia here and racing the next question's own re-acquire.
      forceReacquireRef.current = true
    }

    track('recording_stopped', {
      questionId, position,
      meta: { durationSec, bytes: blob.size, audioOnly, micHeard: micEverDetected },
    })
    if (!micEverDetected) track('mic_not_detected', { questionId, position })

    setRecordings(prev => ({
      ...prev,
      [questionId]: { url, durationSec, uploadStatus: 'uploading' },
    }))

    track('upload_started', { questionId, position, meta: { bytes: blob.size } })

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

      track('upload_succeeded', { questionId, position, meta: { durationSec } })

      setRecordings(prev => ({
        ...prev,
        [questionId]: { ...prev[questionId], uploadStatus: 'done', uploadProgress: 100, s3Url: finalUrl },
      }))
    } catch (e: unknown) {
      // The error text is the valuable part. An upload that fails silently on a
      // lead's phone is otherwise unknowable from here.
      track('upload_failed', {
        questionId, position,
        meta: { error: (e as Error)?.message ?? 'unknown', bytes: blob.size },
      })

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

  /**
   * Stop, and resolve only once the recorder has actually stopped.
   *
   * MediaRecorder.stop() returns immediately; `onstop` fires later, and that is
   * where the upload promise is registered. Now that Next can be pressed while
   * still recording, awaiting this is the only thing stopping the last question
   * from being submitted before its answer has been queued for upload.
   */
  function stopRecAndWait(): Promise<void> {
    return new Promise(resolve => {
      const r = recorderRef.current
      if (!r || r.state === 'inactive') { stopRec(); resolve(); return }
      const previous = r.onstop
      r.onstop = function (this: MediaRecorder, e: Event) {
        previous?.call(this, e)
        resolve()
      }
      stopRec()
    })
  }

  async function next() {
    if (recording) await stopRecAndWait()

    if (idx < questions.length - 1) {
      // Reset transient state here rather than in an effect keyed on idx.
      if (tickRef.current) clearInterval(tickRef.current)
      setRecording(false)
      setElapsed(0)
      setCaptionOpen(true)
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
      <div className={styles.gateSplitWrap}>
        <UrgencyTicker />
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
            <ProofCard />
          </div>
        </div>

        <div className={styles.gateSplitRight}>
          <div className={styles.gateRightInner}>
            <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.gateRightLogo} />
            <div className={styles.gateEyebrow}>
              <span className={styles.gateEyebrowPill}>6 minutes</span>
              Finish your counselling now. Our team reviews it within 24 hours.
            </div>
            <h2 className={styles.gateRightTitle}>Hi {leadName.split(' ')[0]}</h2>
            <p className={styles.gateRightSub}>
              Your counsellor will ask a few questions. Answer them in your own words.
            </p>
            <button className={styles.gateGoogleBtn} onClick={() => { track('intro_accepted'); setStage('ready') }}>
              Proceed →
            </button>
            <div className={styles.gateTrustRow}>
              <span className={styles.gateTrustItem}>⏱ ~6 minutes</span>
              <span className={styles.gateTrustItem}>🎥 Video recorded</span>
              <span className={styles.gateTrustItem}>🔒 Secure</span>
            </div>

            {/* On a phone the dark left panel is hidden, so the proof card
                would vanish with it. Repeated here, shown only on narrow. */}
            <div className={styles.proofMobile}>
              <ProofCard />
            </div>
          </div>
        </div>
        </div>
      </div>
    )
  }

  // ── SETUP WIZARD ──
  if (stage === 'ready') {
    const instRows = [
      {
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
        title: 'About 6 minutes',
        desc: 'A short video answer to each question. Time limit screen par dikhegi.',
      },
      {
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
        title: 'Listen to the question first',
        desc: 'Counsellor pehle question poochenge. Sun lijiye, then record your answer.',
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
          <div className={styles.wizardNavSpacer} />
        </div>

        <div className={styles.wizardBody}>
          {(
            <div className={styles.wizardPane}>
              <div className={styles.wizardIconWrap}><IconClipboard /></div>
              <h2 className={styles.wizardTitle}>How this works</h2>
              <p className={styles.wizardDesc}>
                Have a quick read, then start. Your browser will ask for the camera
                and microphone once, so that your answers can be recorded.
              </p>

              {/* Plays while they read the list below, so learning the two
                  controls costs no extra time and does not happen during a
                  real question. */}
              <DemoLoop />

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
              {/* Pinned, so it is reachable without scrolling past the
                  instructions on a phone. */}
              {camError && <p className={styles.camError}>{camError}</p>}

              <div className={styles.wizardStickyBar}>
                <button className={styles.wizardBtnSuccess} onClick={begin}>Start</button>
              </div>
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
    // Deliberately NOT a video player. No controls, no frame, no media chrome:
    // the counsellor simply stays on the call and signs off, so the last thing
    // the lead sees is a person talking to them. When the clip ends the idle
    // loop takes over, exactly as it does between questions, so the call never
    // resolves into a frozen frame.
    if (closingUrl) {
      return (
        <div className={styles.callStage}>
          <div className={styles.callMain}>
            <video
              src={closingUrl}
              autoPlay
              playsInline
              style={closingDone && idleUrls.length > 0 ? { display: 'none' } : undefined}
              onEnded={() => {
                track('closing_played')
                setClosingDone(true)
              }}
            />
            {closingDone && idleUrls.length > 0 && (
              <video src={idleUrls[0]} autoPlay loop muted playsInline />
            )}
          </div>

          <div className={styles.callTop}>
            <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.callTopLogo} />
          </div>

          <div className={styles.callCaption}>
            <div className={styles.callCaptionInner}>
              <div className={styles.callCaptionLabel}>
                All {questions.length} answers saved
              </div>
              <p className={styles.callCaptionText}>
                Thanks {leadName.split(' ')[0]}. Our team will go through your answers
                and get back to you soon.
              </p>
            </div>
          </div>
        </div>
      )
    }

    // No closing clip generated: fall back to the plain card.
    return (
      <div className={styles.donePage}>
        <div className={styles.doneCard}>
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
  // Recording unlocks when the clip ends, when there is no clip, or when the
  // clip could not be played at all. Without that last case a refused autoplay
  // leaves the student with a frozen counsellor and a dead record button.
  const heard = !!avatarDone[questionId] || !question.avatarUrl || playBlocked
  // A question whose video has not been generated has nothing to watch, so the
  // lead takes the main tile and the counsellor tile is not rendered at all.
  const hasAvatar = !!question.avatarUrl
  // The clip is finite: once it ends the element holds its final frame, which
  // reads as a dead photo. Prefer a looping idle clip, else a CSS drift.
  const clipEnded = !!avatarDone[questionId]
  // A different clip per question, walked in order rather than picked at
  // random: random repeats itself roughly one question in three across five,
  // which is the exact effect the extra clips were rendered to avoid.
  const idleUrl = idleUrls.length ? idleUrls[idx % idleUrls.length] : null
  const showIdle = clipEnded && !!idleUrl

  return (
    <div className={styles.callStage}>
      {overlayMsg && (
        <div className={styles.overlay}>
          <div className={styles.ovCard}>
            <div className={styles.spinner} />
            <div className={styles.ovMsg}>{overlayMsg}</div>
          </div>
        </div>
      )}

      {/*
        Two tiles that swap roles rather than remount. Swapping the wrapper
        class keeps both <video> elements mounted, so the avatar clip is never
        restarted by React tearing it down and rebuilding it.
      */}

      {/* Counsellor tile. Always the main tile while a clip exists. */}
      {hasAvatar && (
        <div className={`${styles.callMain} ${clipEnded && !idleUrl ? styles.callIdle : ''}`}>
          {/* Hidden rather than unmounted once the idle loop takes over, so
              the browser does not discard a clip it has already fetched. */}
          <video
            ref={clipRef}
            key={questionId}
            src={question.avatarUrl!}
            autoPlay
            playsInline
            style={showIdle ? { display: 'none' } : undefined}
            onPlay={() => setPlayBlocked(false)}
            // A browser only permits video WITH SOUND inside a user gesture.
            // begin() awaits the permission prompt before showing the call, and
            // that await ends the gesture, so autoPlay alone is refused: the
            // counsellor sits frozen, question_heard never fires, and there is
            // no way forward. Ask explicitly, and if it is still refused, say
            // so and let them tap.
            onCanPlay={e => {
              const v = e.currentTarget
              v.play().catch(() => setPlayBlocked(true))
            }}
            onEnded={() => {
              track('question_heard', { questionId, position: idx + 1 })
              setAvatarDone(prev => ({ ...prev, [questionId]: true }))
              // Start recording the moment the question finishes. Pressing a
              // record button was an extra step in a conversation that is
              // meant to feel like a call, and it is one more place to stall.
              if (stream && !recordings[questionId] && !recording) startRec()
            }}
          />
          {/* Muted: a repeating voice would be maddening. */}
          {showIdle && <video src={idleUrl!} autoPlay loop muted playsInline />}

          {playBlocked && !clipEnded && (
            <button
              className={styles.callTapPlay}
              onClick={() => {
                clipRef.current?.play().then(() => setPlayBlocked(false)).catch(() => {})
              }}
            >
              ▶ Tap to hear the question
            </button>
          )}

        </div>
      )}

      {/* Lead tile. Always the corner tile, so the lead can see their framing. */}
      <div className={`${hasAvatar ? styles.callPip : styles.callMain} ${styles.callSelfMirror}`}>
        <video ref={videoRef} autoPlay muted playsInline />

        {/* Camera refused, microphone allowed. The tile would otherwise be a
            black rectangle that looks like a fault. */}
        {audioOnly && stream && (
          <div className={styles.callAudioOnly}>
            <span className={styles.callAudioOnlyIcon}>🎙</span>
            <span>Audio only</span>
          </div>
        )}

        {!stream && (
          <div className={styles.callCamOff}>
            <span style={{ fontSize: 28 }}>📷</span>
            <span>Camera is off</span>
            {!camError && (
              <button className={styles.callBtnNext} onClick={enableCamera}>
                Turn on camera
              </button>
            )}
            {camError && <span style={{ color: '#fca5a5' }}>{camError}</span>}
          </div>
        )}
        {hasAvatar && <span className={styles.callPipLabel}>You</span>}
      </div>

      {/* Top bar */}
      <div className={styles.callTop}>
        <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.callTopLogo} />
        <div className={styles.callTopMeta}>
          <span className={styles.callProgress}>{idx + 1} / {questions.length}</span>
          <span className={styles.callTimer}>{fmt(globalElapsed)}</span>
        </div>
      </div>

      {recording && (
        <div className={styles.callRecPill}>
          <span className={styles.callRecDot} />
          REC {fmt(elapsed)} / {fmt(question.durationSec)}
        </div>
      )}

      {/* Question caption */}
      {(captionOpen || !hasAvatar) ? (
        <div className={styles.callCaption}>
          {hasAvatar && (
            <button className={styles.callCaptionToggle} onClick={() => setCaptionOpen(false)}>
              Hide question
            </button>
          )}
          <div className={styles.callCaptionInner}>
            <div className={styles.callCaptionLabel}>Question {idx + 1}</div>
            <p className={styles.callCaptionText}>{question.content}</p>
          </div>
        </div>
      ) : (
        <div className={styles.callCaption}>
          <button className={styles.callCaptionToggle} onClick={() => setCaptionOpen(true)}>
            Show question
          </button>
        </div>
      )}

      {/* Mic level while recording */}
      {recording && (
        <div className={styles.callMic}>
          {[8, 20, 38, 58, 78].map((threshold, i) => (
            <div
              key={i}
              className={`${styles.callMicBar} ${micLevel >= threshold ? styles.callMicBarOn : ''}`}
              style={{ height: `${7 + i * 3}px` }}
            />
          ))}
        </div>
      )}

      {/* Upload state */}
      {uploadStatus === 'uploading' && (
        <div className={styles.callUpload}>
          <div className={styles.callUploadTrack}>
            <div className={styles.callUploadFill} style={{ width: `${rec?.uploadProgress ?? 0}%` }} />
          </div>
          <div className={styles.callUploadNote}>Saving your answer… {rec?.uploadProgress ?? 0}%</div>
        </div>
      )}
      {uploadStatus === 'error' && (
        <div className={styles.callUpload}>
          <div className={styles.callUploadError}>Could not save. Retake your answer.</div>
        </div>
      )}

      {/* Hint line */}
      {!recording && !rec && stream && (
        <div className={styles.callHint}>
          {!hasAvatar
            ? 'Tap the red button to record your question, or carry on'
            : heard ? 'Recording starts automatically. Tap Next when you finish.' : 'Listen to the question…'}
        </div>
      )}
      {recording && micEverDetected && (
        <div className={styles.callHint}>Answer away. Tap Next when you are done.</div>
      )}

      {/* The mic check you asked for, as a warning rather than a gate. It is
          checked while they answer instead of on a screen beforehand, so a
          quiet meter costs them a nudge and not the whole session. */}
      {recording && !micEverDetected && elapsed >= 4 && (
        <div className={styles.callHintWarn}>
          We cannot hear you yet. Speak up, or check your microphone.
        </div>
      )}
      {rec && !recording && uploadStatus === 'done' && (
        <div className={styles.callHint}>Answer saved. Retake it, or continue.</div>
      )}

      {/* Controls */}
      <div className={styles.callControls}>

        {!recording && !rec && (
          <button
            className={styles.callBtnRec}
            onClick={startRec}
            disabled={!stream || !heard}
            aria-label="Start recording"
          >
            <span className={styles.callBtnRecInner} />
          </button>
        )}

        {recording && (
          <button className={styles.callBtnStop} onClick={stopRec} aria-label="Stop recording">
            <span className={styles.callBtnStopInner} />
          </button>
        )}

        {rec && !recording && (
          <button className={styles.callBtnGhost} onClick={redo} aria-label="Retake your answer">
            🗑
          </button>
        )}

        {/* Enabled while recording too: Next is how you finish an answer.
            next() stops the recorder and the upload continues in the background
            while the following question plays.

            A question with no clip is optional, and station six is one: it asks
            whether the student has anything to ask US. Left gated on a
            recording it would strand anyone with no questions on the final
            screen, unable to submit, because Next is Finish there. The label
            stays plain: "No questions, finish" put words in their mouth before
            they had decided. */}
        <button
          className={styles.callBtnNext}
          onClick={next}
          disabled={!answered && !recording && hasAvatar}
        >
          {last ? 'Finish' : 'Next'} →
        </button>
      </div>
    </div>
  )
}
