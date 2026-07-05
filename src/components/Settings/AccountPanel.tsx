import { useEffect, useState } from 'react'
import { KeyRound, Loader, LogOut, Mail, RefreshCw, UserCircle } from 'lucide-react'
import type { AccountStatus } from '../../types'

type Step = 'email' | 'code'

// Settings → Account: NoteFlow account (Supabase email + OTP) and plan badges.
// All session/token handling lives in the main process — this panel only ever
// sees the public AccountStatus.
export function AccountPanel() {
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.noteflow.getAccountStatus().then(setStatus)
    return window.noteflow.onAccountStatusChanged(setStatus)
  }, [])

  async function handleSendCode() {
    const trimmed = email.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    const result = await window.noteflow.accountRequestOtp(trimmed)
    setBusy(false)
    if (result.ok) {
      setStep('code')
      setCode('')
    } else {
      setError(result.error ?? 'Could not send the sign-in code.')
    }
  }

  async function handleVerify() {
    const trimmed = code.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    const result = await window.noteflow.accountVerifyOtp(email.trim(), trimmed)
    setBusy(false)
    if (result.ok) {
      // Status arrives via onAccountStatusChanged; reset the form for next time.
      setStep('email')
      setCode('')
      setEmail('')
    } else {
      setError(result.error ?? 'Could not verify the code.')
    }
  }

  function handleUseDifferentEmail() {
    setStep('email')
    setCode('')
    setError(null)
  }

  async function handleRefresh() {
    setBusy(true)
    setError(null)
    const result = await window.noteflow.accountRefreshEntitlements()
    setBusy(false)
    if (!result.ok) setError(result.error ?? 'Could not refresh subscription status.')
  }

  async function handleSignOut() {
    setBusy(true)
    setError(null)
    await window.noteflow.accountSignOut()
    setBusy(false)
    setStep('email')
    setEmail('')
    setCode('')
  }

  // ── Initial status fetch ──
  if (!status) {
    return (
      <div className="flex items-center gap-2 text-text-muted">
        <Loader size={12} className="animate-spin" />
        <span className="text-xs font-mono">Loading...</span>
      </div>
    )
  }

  // ── Not configured (no Supabase project in this build) ──
  if (!status.configured) {
    return (
      <p className="text-[11px] font-mono text-text-muted leading-relaxed">
        NoteFlow account services aren&apos;t available in this build yet.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs font-mono text-red-400">
          {error}
        </div>
      )}

      {/* ── Signed in ── */}
      {status.signedIn && (
        <>
          <div className="flex items-center gap-2">
            <UserCircle size={13} className="text-green-400" />
            <span className="text-xs font-mono text-text">{status.email}</span>
          </div>

          <div className="space-y-2">
            <PlanBadge name="NoteFlow AI" active={status.entitlements.ai} />
            <PlanBadge name="NoteFlow Cloud" active={status.entitlements.cloud} />
          </div>

          {status.entitlementsFetchedAt && (
            <p className="text-[11px] font-mono text-text-muted/60">
              Last checked: {new Date(status.entitlementsFetchedAt).toLocaleString()}
            </p>
          )}

          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            Subscriptions are coming soon.
          </p>

          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text transition-colors disabled:opacity-40"
            >
              {busy ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Refresh
            </button>
            <button
              onClick={handleSignOut}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
            >
              <LogOut size={11} />
              Sign out
            </button>
          </div>
        </>
      )}

      {/* ── Signed out: step 1 — email ── */}
      {!status.signedIn && step === 'email' && (
        <div className="space-y-3 pt-1">
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            Sign in with your email to access your NoteFlow account.
            We&apos;ll send you a one-time code — no password needed.
          </p>
          <div>
            <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendCode() }}
              placeholder="you@example.com"
              disabled={busy}
              className="w-full px-3 py-1.5 rounded text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
            />
          </div>
          <button
            onClick={handleSendCode}
            disabled={busy || !email.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? <Loader size={11} className="animate-spin" /> : <Mail size={11} />}
            Send code
          </button>
        </div>
      )}

      {/* ── Signed out: step 2 — verification code ── */}
      {!status.signedIn && step === 'code' && (
        <div className="space-y-3 pt-1">
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            We sent a 6-digit code to <span className="text-text">{email.trim()}</span>.
            Enter it below to sign in.
          </p>
          <div>
            <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
              Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerify() }}
              placeholder="123456"
              disabled={busy}
              className="w-full px-3 py-1.5 rounded text-xs font-mono tracking-widest bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleVerify}
              disabled={busy || !code.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? <Loader size={11} className="animate-spin" /> : <KeyRound size={11} />}
              Verify &amp; sign in
            </button>
            <button
              onClick={handleUseDifferentEmail}
              disabled={busy}
              className="px-3 py-1.5 rounded text-xs font-mono text-text-muted hover:text-text transition-colors disabled:opacity-40"
            >
              Use a different email
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PlanBadge({ name, active }: { name: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded bg-surface-0 border border-border">
      <span className="text-xs font-mono text-text">{name}</span>
      {active ? (
        <span className="text-[11px] font-mono text-green-400 bg-green-500/10 border border-green-500/30 rounded px-2 py-0.5">
          Active
        </span>
      ) : (
        <span className="text-[11px] font-mono text-text-muted/60">—</span>
      )}
    </div>
  )
}
