'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './login.module.css'

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

function SunstoneLogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="1" y="1" width="8" height="8" rx="1.5" fill="#fff"/>
      <rect x="11" y="1" width="8" height="8" rx="1.5" fill="#fff" opacity="0.5"/>
      <rect x="1" y="11" width="8" height="8" rx="1.5" fill="#fff" opacity="0.5"/>
      <rect x="11" y="11" width="8" height="8" rx="1.5" fill="#f59e0b"/>
    </svg>
  )
}

export default function LoginPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isReviewerFlow =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('next')?.startsWith('/review/')

  async function handleGoogleLogin() {
    setError('')
    setLoading(true)
    const params = new URLSearchParams(window.location.search)
    const next = params.get('next') || '/'
    const reviewer = next.startsWith('/review/')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: reviewer ? {} : { hd: 'sunstone.in' },
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>

      {/* ── LEFT PANEL ── */}
      <div className={styles.left}>
        <div className={styles.leftBrand}>
          <span className={styles.leftBrandName}>Sunstone</span>
          <span className={styles.leftBrandSub}>Faculty Assessment</span>
          <span className={styles.leftTagline}>Hiring Platform</span>
        </div>

        <div className={styles.leftHero}>
          <h1 className={styles.leftHeadline}>
            Teach it live.<br />
            <span className={styles.leftHeadlineAccent}>We'll see what you've got.</span>
          </h1>
          <p className={styles.leftBody}>
            A 30-minute multi-station assessment built to surface real teaching ability — not rehearsed answers.
          </p>

          <div className={styles.leftFeatures}>
            <div className={styles.leftFeature}>
              <span className={styles.leftFeatureIcon}>🎯</span>
              9 stations across teaching, communication &amp; domain
            </div>
            <div className={styles.leftFeature}>
              <span className={styles.leftFeatureIcon}>✋</span>
              Live student doubts during micro-teaching
            </div>
            <div className={styles.leftFeature}>
              <span className={styles.leftFeatureIcon}>🔍</span>
              Reviewed by Sunstone's expert panel
            </div>
          </div>
        </div>

        <div className={styles.leftFooter}>
          <span className={styles.leftFooterStatus}>
            <span className={styles.statusDot} />
            All systems operational
          </span>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className={styles.right}>
        <div className={styles.rightInner}>

          <div className={styles.rightLogo}>
            <div className={styles.rightLogoMark}>
              <SunstoneLogoMark />
            </div>
            <span className={styles.rightLogoName}>Sunstone</span>
          </div>

          <h2 className={styles.rightTitle}>
            {isReviewerFlow ? 'Review portal' : 'Welcome back'}
          </h2>
          <p className={styles.rightSub}>
            {isReviewerFlow
              ? 'Sign in with the Google account this review link was sent to.'
              : 'Sign in with your Sunstone Google account to access the assessment.'}
          </p>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.dividerRow}>
            <span className={styles.dividerLine} />
            <span className={styles.dividerLabel}>Sign in with</span>
            <span className={styles.dividerLine} />
          </div>

          <button className={styles.btn} onClick={handleGoogleLogin} disabled={loading}>
            <GoogleIcon />
            {loading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          {!isReviewerFlow && (
            <p className={styles.restriction}>
              Access restricted to <strong>@sunstone.in</strong> accounts only
            </p>
          )}

          <div className={styles.trustRow}>
            <span className={styles.trustItem}>🔒 256-bit SSL</span>
            <span className={styles.trustItem}>🛡 SSO Secured</span>
            <span className={styles.trustItem}>✅ Role-based</span>
          </div>
        </div>
      </div>

    </div>
  )
}
