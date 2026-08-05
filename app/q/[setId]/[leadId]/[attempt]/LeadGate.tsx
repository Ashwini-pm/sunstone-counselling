'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import AnswerFlow from './AnswerFlow'
import styles from './flow.module.css'

interface Props {
  setId: string
  leadId: string
  leadName: string
  leadEmail: string
  attemptNumber: number
  existingAttemptId: string | null
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.706 17.64 9.2z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

function GateSplit({ right }: { right: React.ReactNode }) {
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
            Aapki baari.<br />
            <span className={styles.gateSplitAccent}>Bas kuch sawaal.</span>
          </h1>
          <p className={styles.gateSplitBody}>
            Ek chhoti si video conversation. Hamari counsellor kuch sawaal poochhengi aur aap apne
            jawab record karenge. Koi sahi ya galat jawab nahi hai.
          </p>
          <div className={styles.gateSplitFeatures}>
            <div className={styles.gateSplitFeature}>
              <span className={styles.gateSplitFeatureIcon}>🎥</span>
              Har sawaal ka ek chhota video jawab
            </div>
            <div className={styles.gateSplitFeature}>
              <span className={styles.gateSplitFeatureIcon}>⏱</span>
              Lagbhag 10 minute
            </div>
            <div className={styles.gateSplitFeature}>
              <span className={styles.gateSplitFeatureIcon}>💬</span>
              Hindi, English ya dono — jaise comfortable ho
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

      <div className={styles.gateSplitRight}>{right}</div>
    </div>
  )
}

export default function LeadGate(props: Props) {
  const { data: session, status } = useSession()
  const [attemptId, setAttemptId] = useState<string | null>(props.existingAttemptId)
  const [resolving, setResolving] = useState(false)
  const [authError, setAuthError] = useState('')

  const sessionEmail = session?.user?.email?.toLowerCase() ?? null
  const emailMatches = sessionEmail === props.leadEmail.toLowerCase()

  useEffect(() => {
    if (status !== 'authenticated' || !emailMatches || attemptId || resolving) return

    setResolving(true)
    fetch('/api/attempt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setId: props.setId,
        leadId: props.leadId,
        attemptNumber: props.attemptNumber,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) setAuthError(data.error)
        else setAttemptId(data.attempt.id)
      })
      .catch(() => setAuthError('Kuch galat ho gaya. Page refresh karein.'))
      .finally(() => setResolving(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, emailMatches])

  if (status === 'loading' || resolving) {
    return (
      <div className={styles.gate}>
        <div className={styles.spinner} />
      </div>
    )
  }

  if (status === 'authenticated' && !emailMatches) {
    return (
      <GateSplit right={
        <div className={styles.gateRightInner}>
          <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.gateRightLogo} />
          <h2 className={styles.gateRightTitle}>Galat account</h2>
          <p className={styles.gateRightSub}>
            Yeh link <strong>{props.leadEmail}</strong> par bheja gaya tha. Aap abhi{' '}
            <strong>{sessionEmail}</strong> se signed in hain.
          </p>
          <button
            className={styles.gateGoogleBtn}
            onClick={() => signOut({ redirect: false }).then(() => signIn('google'))}
          >
            Sahi account se sign in karein
          </button>
        </div>
      } />
    )
  }

  if (status !== 'authenticated') {
    return (
      <GateSplit right={
        <div className={styles.gateRightInner}>
          <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.gateRightLogo} />
          <h2 className={styles.gateRightTitle}>Namaste, {props.leadName.split(' ')[0]}</h2>
          <p className={styles.gateRightSub}>
            Shuru karne ke liye apne Google account se sign in karein.
          </p>

          {authError && <p className={styles.gateError}>{authError}</p>}

          <div className={styles.gateDivider}>
            <span className={styles.gateDividerLine} />
            <span className={styles.gateDividerLabel}>Sign in with</span>
            <span className={styles.gateDividerLine} />
          </div>

          <button
            className={styles.gateGoogleBtn}
            onClick={() => signIn('google', { callbackUrl: window.location.pathname })}
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <p className={styles.gateHintNew}>
            Wahi account use karein jispar link aaya: <strong>{props.leadEmail}</strong>
          </p>

          <div className={styles.gateTrustRow}>
            <span className={styles.gateTrustItem}>🔒 256-bit SSL</span>
            <span className={styles.gateTrustItem}>🛡 SSO Secured</span>
          </div>
        </div>
      } />
    )
  }

  if (authError) {
    return (
      <GateSplit right={
        <div className={styles.gateRightInner}>
          <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.gateRightLogo} />
          <h2 className={styles.gateRightTitle}>Link nahi khul paaya</h2>
          <p className={styles.gateRightSub}>{authError}</p>
        </div>
      } />
    )
  }

  if (!attemptId) {
    return (
      <div className={styles.gate}>
        <div className={styles.spinner} />
      </div>
    )
  }

  return <AnswerFlow leadName={props.leadName} attemptId={attemptId} />
}
