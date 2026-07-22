'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import TestApp from './TestApp'
import styles from './test.module.css'

interface Props {
  testId: string
  candidateId: string
  candidateName: string
  candidateEmail: string
  attemptNumber: number
  role: string
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
      {/* Left panel */}
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
            <div className={styles.gateSplitFeature}>
              <span className={styles.gateSplitFeatureIcon}>🎯</span>
              9 stations across teaching, communication &amp; domain
            </div>
            <div className={styles.gateSplitFeature}>
              <span className={styles.gateSplitFeatureIcon}>✋</span>
              Live student doubts during micro-teaching
            </div>
            <div className={styles.gateSplitFeature}>
              <span className={styles.gateSplitFeatureIcon}>🔍</span>
              Reviewed by Sunstone's expert panel
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

      {/* Right panel */}
      <div className={styles.gateSplitRight}>
        {right}
      </div>
    </div>
  )
}

export default function TestGate(props: Props) {
  const supabase = createClient()
  const [authStage, setAuthStage] = useState<'checking' | 'needsAuth' | 'wrongAccount' | 'ready'>('checking')
  const [attemptId, setAttemptId] = useState<string | null>(props.existingAttemptId)
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    checkSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function checkSession() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAuthStage('needsAuth'); return }
    await resolveAttempt(user.email!)
  }

  async function resolveAttempt(userEmail: string) {
    if (userEmail !== props.candidateEmail) {
      setAuthStage('wrongAccount')
      return
    }
    if (!attemptId) {
      const res = await fetch('/api/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId: props.testId, candidateId: props.candidateId, attemptNumber: props.attemptNumber }),
      })
      const data = await res.json()
      if (data.error) { setAuthStage('wrongAccount'); return }
      setAttemptId(data.attempt.id)
    }
    setAuthStage('ready')
  }

  async function handleGoogleLogin() {
    setAuthError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${window.location.pathname}`,
      },
    })
    if (error) {
      setAuthError(error.message)
      setLoading(false)
    }
  }

  if (authStage === 'checking') {
    return (
      <div className={styles.gate}>
        <div className={styles.spinner} />
      </div>
    )
  }

  if (authStage === 'wrongAccount') {
    return (
      <GateSplit right={
        <div className={styles.gateRightInner}>
          <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.gateRightLogo} />
          <h2 className={styles.gateRightTitle}>Wrong account</h2>
          <p className={styles.gateRightSub}>
            This assessment link was sent to <strong>{props.candidateEmail}</strong>. Please sign in with that Google account.
          </p>
          <button
            className={styles.gateGoogleBtn}
            onClick={async () => { await supabase.auth.signOut(); setAuthStage('needsAuth') }}
          >
            Sign out and try again
          </button>
        </div>
      } />
    )
  }

  if (authStage === 'needsAuth') {
    return (
      <GateSplit right={
        <div className={styles.gateRightInner}>
          <img src="/sunstone-logo.svg" alt="Sunstone" className={styles.gateRightLogo} />
          <h2 className={styles.gateRightTitle}>Welcome, {props.candidateName.split(' ')[0]}</h2>
          <p className={styles.gateRightSub}>
            Sign in with your Google account to begin your faculty assessment.
          </p>

          {authError && <p className={styles.gateError}>{authError}</p>}

          <div className={styles.gateDivider}>
            <span className={styles.gateDividerLine} />
            <span className={styles.gateDividerLabel}>Sign in with</span>
            <span className={styles.gateDividerLine} />
          </div>

          <button className={styles.gateGoogleBtn} onClick={handleGoogleLogin} disabled={loading}>
            <GoogleIcon />
            {loading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          <p className={styles.gateHintNew}>
            Use the account associated with <strong>{props.candidateEmail}</strong>
          </p>

          <div className={styles.gateTrustRow}>
            <span className={styles.gateTrustItem}>🔒 256-bit SSL</span>
            <span className={styles.gateTrustItem}>🛡 SSO Secured</span>
          </div>
        </div>
      } />
    )
  }

  return (
    <TestApp
      testId={props.testId}
      candidateId={props.candidateId}
      candidateName={props.candidateName}
      attemptId={attemptId!}
      role={props.role}
      attemptNumber={props.attemptNumber}
    />
  )
}
