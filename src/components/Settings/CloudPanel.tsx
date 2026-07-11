import { useEffect, useState } from 'react'
import { Check, Cloud, CloudOff, Copy, KeyRound, Loader, Lock, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react'
import type { AccountStatus, CloudSyncStatus } from '../../types'
import { useNotesStore } from '../../stores/notesStore'
import { plural, tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'

// UI-only floor (the backend imposes no minimum); the passphrase only wraps
// the DEK so any reasonable floor works.
const MIN_PASSPHRASE_LENGTH = 8

type Busy = 'idle' | 'setup' | 'unlock' | 'pull' | 'toggle'

// Settings → Sync → NoteFlow Cloud (E2EE sync, phase 4.2). Key material never
// reaches this panel: it only exchanges the public CloudSyncStatus plus the
// recovery code, which is held in local state and discarded once confirmed.
export function CloudPanel() {
  const t = useT()
  const loadNotes = useNotesStore((s) => s.loadNotes)

  const [status, setStatus] = useState<CloudSyncStatus | null>(null)
  const [account, setAccount] = useState<AccountStatus | null>(null)
  const [githubConnected, setGithubConnected] = useState(false)
  const [busy, setBusy] = useState<Busy>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pullResult, setPullResult] = useState<{ pulled: number; errors: string[] } | null>(null)

  // Setup form (state: no-keys)
  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  // Unlock form (state: locked)
  const [secret, setSecret] = useState('')
  // Recovery code: local component state ONLY — never persisted anywhere. It is
  // shown once after setup and discarded when the user confirms having saved it.
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    window.noteflow.getCloudStatus().then(setStatus)
    return window.noteflow.onCloudStatusChanged(setStatus)
  }, [])

  useEffect(() => {
    window.noteflow.getAccountStatus().then(setAccount)
    return window.noteflow.onAccountStatusChanged(setAccount)
  }, [])

  // GitHub Sync state, only to warn about the mutual exclusion before enabling.
  useEffect(() => {
    window.noteflow.getSyncStatus().then((s) => setGithubConnected(s.connected))
  }, [])

  async function handleSetup() {
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      setError(tf(t.settings.cloud.passphraseTooShort, { min: MIN_PASSPHRASE_LENGTH }))
      return
    }
    if (passphrase !== confirmPassphrase) {
      setError(t.settings.cloud.passphraseMismatch)
      return
    }
    setBusy('setup')
    setError(null)
    const result = await window.noteflow.cloudSetup(passphrase)
    setBusy('idle')
    if (result.ok && result.recoveryCode) {
      setRecoveryCode(result.recoveryCode)
      setPassphrase('')
      setConfirmPassphrase('')
    } else {
      setError(result.error ?? t.settings.cloud.setupFailed)
    }
  }

  async function handleUnlock() {
    const trimmed = secret.trim()
    if (!trimmed) return
    setBusy('unlock')
    setError(null)
    const result = await window.noteflow.cloudUnlock(trimmed)
    setBusy('idle')
    if (result.ok) {
      setSecret('')
    } else {
      setError(result.error ?? t.settings.cloud.unlockFailed)
    }
  }

  async function handleEnable() {
    setBusy('toggle')
    setError(null)
    const result = await window.noteflow.cloudEnable()
    setBusy('idle')
    if (!result.ok) setError(result.error ?? t.settings.cloud.enableFailed)
  }

  async function handleDisable() {
    setBusy('toggle')
    setError(null)
    await window.noteflow.cloudDisable()
    setBusy('idle')
  }

  async function handlePull() {
    setBusy('pull')
    setError(null)
    const result = await window.noteflow.cloudPull()
    setPullResult({ pulled: result.pulled, errors: result.errors })
    setBusy('idle')
    if (result.pulled > 0) await loadNotes()
  }

  async function handleLock() {
    setError(null)
    await window.noteflow.cloudLock()
  }

  async function handleSubscribe() {
    setError(null)
    const result = await window.noteflow.accountOpenCheckout('cloud')
    if (!result.ok) setError(result.error ?? t.settings.account.couldNotOpenCheckout)
  }

  function handleCopyRecovery() {
    if (!recoveryCode) return
    navigator.clipboard.writeText(recoveryCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const header = (
    <div>
      <p className="text-xs font-mono font-medium text-text">{t.settings.cloud.title}</p>
      <p className="text-[11px] font-mono text-text-muted mt-0.5 max-w-md leading-relaxed">
        {t.settings.cloud.desc}
      </p>
    </div>
  )

  // ── Initial status fetch ──
  if (!status || !account) {
    return (
      <div className="space-y-4">
        {header}
        <div className="flex items-center gap-2 text-text-muted">
          <Loader size={12} className="animate-spin" />
          <span className="text-xs font-mono">{t.common.loading}</span>
        </div>
      </div>
    )
  }

  // ── Not configured (no Supabase project in this build) ──
  if (!status.configured) {
    return (
      <div className="space-y-4">
        {header}
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">
          {t.settings.cloud.notAvailable}
        </p>
      </div>
    )
  }

  // ── Recovery code — shown ONCE, blocks everything else until confirmed ──
  if (recoveryCode) {
    return (
      <div className="space-y-4">
        {header}
        <div className="px-4 py-3 bg-yellow-500/10 border border-yellow-500/40 rounded space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={13} className="text-yellow-400 flex-shrink-0" />
            <span className="text-xs font-mono font-semibold text-yellow-400">
              {t.settings.cloud.recoveryTitle}
            </span>
          </div>
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {t.settings.cloud.recoveryDesc}
          </p>
          <div className="flex items-center justify-center py-2">
            <span className="text-sm font-mono font-bold text-text tracking-wider select-all bg-surface-0 border border-border px-4 py-2.5 rounded-lg break-all text-center">
              {recoveryCode}
            </span>
          </div>
          <p className="text-[11px] font-mono text-red-400 leading-relaxed">
            {t.settings.cloud.recoveryWarning}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCopyRecovery}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors"
            >
              {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
              {copied ? t.settings.cloud.copied : t.settings.cloud.copyCode}
            </button>
            <button
              onClick={() => setRecoveryCode(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono text-text-muted hover:text-text transition-colors"
            >
              {t.settings.cloud.recoverySaved}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Signed out ──
  if (!status.signedIn) {
    return (
      <div className="space-y-4">
        {header}
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">
          {t.settings.cloud.signInFirst}
        </p>
      </div>
    )
  }

  const isLoading = busy !== 'idle'

  return (
    <div className="space-y-4">
      {header}

      {/* Error (local or engine syncError — e.g. an expired subscription) */}
      {(error || status.error) && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs font-mono text-red-400">
          {error ?? status.error}
        </div>
      )}

      {/* ── Key setup (no keys on this account yet) ── */}
      {status.keysState === 'no-keys' && (
        <div className="space-y-3">
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {t.settings.cloud.setupDesc}
          </p>
          <div>
            <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
              {t.settings.cloud.passphrase}
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-1.5 rounded text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
              {t.settings.cloud.confirmPassphrase}
            </label>
            <input
              type="password"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSetup() }}
              disabled={isLoading}
              className="w-full px-3 py-1.5 rounded text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
            />
          </div>
          <button
            onClick={handleSetup}
            disabled={isLoading || !passphrase || !confirmPassphrase}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === 'setup' ? <Loader size={11} className="animate-spin" /> : <KeyRound size={11} />}
            {t.settings.cloud.createPassphrase}
          </button>
        </div>
      )}

      {/* ── Locked: unlock with passphrase or recovery code ── */}
      {status.keysState === 'locked' && (
        <div className="space-y-3">
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {t.settings.cloud.lockedDesc}
          </p>
          <div>
            <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
              {t.settings.cloud.passphraseOrRecovery}
            </label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock() }}
              disabled={isLoading}
              className="w-full px-3 py-1.5 rounded text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
            />
          </div>
          <button
            onClick={handleUnlock}
            disabled={isLoading || !secret.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === 'unlock' ? <Loader size={11} className="animate-spin" /> : <KeyRound size={11} />}
            {t.settings.cloud.unlock}
          </button>
        </div>
      )}

      {/* ── Unlocked: sync controls ── */}
      {status.keysState === 'unlocked' && (
        <>
          <div className="flex items-center gap-2">
            {status.enabled ? (
              <>
                <Cloud size={12} className="text-green-400" />
                <span className="text-xs font-mono text-green-400">{t.settings.cloud.syncEnabled}</span>
              </>
            ) : (
              <>
                <CloudOff size={12} className="text-text-muted" />
                <span className="text-xs font-mono text-text-muted">{t.settings.cloud.syncDisabled}</span>
              </>
            )}
          </div>

          {status.lastSync && (
            <p className="text-[11px] font-mono text-text-muted">
              {tf(t.settings.sync.lastSync, { time: new Date(status.lastSync).toLocaleString() })}
            </p>
          )}

          {/* Pull result */}
          {pullResult && (
            <div className={`px-3 py-2 rounded text-xs font-mono ${
              pullResult.errors.length > 0
                ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
                : 'bg-green-500/10 border border-green-500/30 text-green-400'
            }`}>
              {pullResult.pulled === 0
                ? t.settings.sync.alreadyUpToDate
                : plural(t.settings.sync.pulled, pullResult.pulled)}
              {pullResult.errors.length > 0 && (
                <div className="mt-1 text-[11px] text-red-400">{pullResult.errors.join(', ')}</div>
              )}
            </div>
          )}

          {/* Mutual-exclusion heads-up shown BEFORE enabling Cloud over GitHub */}
          {!status.enabled && githubConnected && (
            <div className="px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-[11px] font-mono text-yellow-400 leading-relaxed">
              {t.settings.cloud.willPauseGitHub}
            </div>
          )}

          {/* Entitlement gate — enabling only; unlock/pull/disable stay open so a
              lapsed subscriber can still read and take their data out. */}
          {!status.enabled && !account.entitlements.cloud && (
            <div className="space-y-2">
              <p className="text-[11px] font-mono text-text-muted leading-relaxed">
                {t.settings.cloud.requiresSubscription}
              </p>
              {account.cloudCheckoutConfigured ? (
                <>
                  <button
                    onClick={handleSubscribe}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40"
                  >
                    <Sparkles size={11} />
                    {t.settings.cloud.subscribe}
                  </button>
                  <p className="text-[11px] font-mono text-text-muted/60 leading-relaxed">
                    {t.settings.cloud.subscribeHint}
                  </p>
                </>
              ) : (
                <p className="text-[11px] font-mono text-text-muted/60 leading-relaxed">
                  {t.settings.account.subscriptionsSoon}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {status.enabled ? (
              <>
                <button
                  onClick={handlePull}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text transition-colors disabled:opacity-40"
                >
                  {busy === 'pull' ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  {t.settings.sync.syncNow}
                </button>
                <button
                  onClick={handleDisable}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                >
                  <CloudOff size={11} />
                  {t.settings.cloud.disableSync}
                </button>
              </>
            ) : (
              account.entitlements.cloud && (
                <button
                  onClick={handleEnable}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40"
                >
                  {busy === 'toggle' ? <Loader size={11} className="animate-spin" /> : <Cloud size={11} />}
                  {t.settings.cloud.enableSync}
                </button>
              )
            )}
            <button
              onClick={handleLock}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono text-text-muted hover:text-text transition-colors disabled:opacity-40"
            >
              <Lock size={11} />
              {t.settings.cloud.lock}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
