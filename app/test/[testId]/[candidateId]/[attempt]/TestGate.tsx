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
      <div className={styles.gate}>
        <div className={styles.gateCard}>
          <div className={styles.gateLogo}>S</div>
          <h2 className={styles.gateTitle}>Wrong account</h2>
          <p className={styles.gateSub}>This test link was sent to <b>{props.candidateEmail}</b>. Please sign in with that Google account.</p>
          <button className={styles.gateBtn} onClick={async () => { await supabase.auth.signOut(); setAuthStage('needsAuth') }}>
            Sign out and try again
          </button>
        </div>
      </div>
    )
  }

  if (authStage === 'needsAuth') {
    return (
      <div className={styles.gate}>
        <div className={styles.gateCard}>
          <div className={styles.gateLogo}>S</div>
          <h2 className={styles.gateTitle}>Faculty Assessment Center</h2>
          <p className={styles.gateSub}>Welcome, {props.candidateName}. Sign in with your Google account to begin.</p>

          {authError && <p className={styles.gateError}>{authError}</p>}

          <button className={styles.googleBtn} onClick={handleGoogleLogin} disabled={loading}>
            {loading ? 'Redirecting…' : (
              <>
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </>
            )}
          </button>
          <p className={styles.gateHint}>Use the Google account associated with {props.candidateEmail}</p>
        </div>
      </div>
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
