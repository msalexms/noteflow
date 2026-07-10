import { useEffect, useState } from 'react'
import { Cloud, CloudOff, ExternalLink, Github, Loader, RefreshCw, Unlink } from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { plural, tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'

interface SyncStatus {
  enabled: boolean
  connected: boolean
  owner?: string
  repo?: string
  lastSync?: string
  error?: string
}

type Step = 'idle' | 'waiting-auth' | 'completing' | 'pulling'

export function SyncPanel() {
  const t = useT()
  const loadNotes = useNotesStore((s) => s.loadNotes)

  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [repo, setRepo] = useState('noteflow-notes')
  const [userCode, setUserCode] = useState<string | null>(null)
  const [verificationUri, setVerificationUri] = useState<string | null>(null)
  const [pullResult, setPullResult] = useState<{ pulled: number; errors: string[] } | null>(null)

  useEffect(() => {
    window.noteflow.getSyncStatus().then(setStatus)
  }, [])

  // Listen for auth completion from main process
  useEffect(() => {
    const unsub = window.noteflow.onSyncAuthComplete(async (result) => {
      if (result.ok) {
        setStep('completing')
        setUserCode(null)
        const updated = await window.noteflow.getSyncStatus()
        setStatus(updated)
        await loadNotes()
        setStep('idle')
      } else {
        setError(result.error ?? t.settings.sync.authFailed)
        setUserCode(null)
        setStep('idle')
      }
    })
    return unsub
  }, [loadNotes, t])

  // If the user closes the panel mid device-flow, cancel the pending auth.
  useEffect(() => {
    return () => {
      if (userCode) window.noteflow.cancelGitHubAuth()
    }
  }, [userCode])

  async function handleInitiate() {
    if (!repo.trim()) return
    setStep('waiting-auth')
    setError(null)
    const result = await window.noteflow.initiateGitHubAuth(repo.trim())
    if (result.ok && result.userCode && result.verificationUri) {
      setUserCode(result.userCode)
      setVerificationUri(result.verificationUri)
      window.noteflow.openUrl(result.verificationUri)
    } else {
      setError(result.error ?? t.settings.sync.failedToStart)
      setStep('idle')
    }
  }

  async function handleCancel() {
    await window.noteflow.cancelGitHubAuth()
    setUserCode(null)
    setVerificationUri(null)
    setStep('idle')
  }

  async function handlePull() {
    setStep('pulling')
    setError(null)
    const result = await window.noteflow.pullNotes()
    setPullResult(result)
    setStep('idle')
    if (result.pulled > 0) await loadNotes()
    const updated = await window.noteflow.getSyncStatus()
    setStatus(updated)
  }

  async function handleDisconnect() {
    await window.noteflow.disconnectGitHub()
    const updated = await window.noteflow.getSyncStatus()
    setStatus(updated)
    setPullResult(null)
  }

  const isLoading = step !== 'idle'

  return (
    <div className="space-y-4">
      {/* Status badge */}
      {status && (
        <div className="flex items-center gap-2">
          {status.connected ? (
            <>
              <Cloud size={12} className="text-green-400" />
              <span className="text-xs font-mono text-green-400">{t.settings.sync.connected}</span>
              <span className="text-xs font-mono text-text-muted">·</span>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  window.noteflow.openUrl(`https://github.com/${status.owner}/${status.repo}`)
                }}
                className="text-xs font-mono text-text hover:underline flex items-center gap-1"
              >
                {status.owner}/{status.repo}
                <ExternalLink size={10} />
              </a>
            </>
          ) : (
            <>
              <CloudOff size={12} className="text-text-muted" />
              <span className="text-xs font-mono text-text-muted">{t.settings.sync.notConnected}</span>
            </>
          )}
        </div>
      )}

      {status?.lastSync && (
        <p className="text-[11px] font-mono text-text-muted">
          {tf(t.settings.sync.lastSync, { time: new Date(status.lastSync).toLocaleString() })}
        </p>
      )}

      {/* Error */}
      {(error || status?.error) && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs font-mono text-red-400">
          {error ?? status?.error}
        </div>
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

      {/* ── Waiting for user to authorize in browser ── */}
      {userCode && (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-mono text-text-muted mb-3">
              {t.settings.sync.goToPrefix}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  window.noteflow.openUrl(verificationUri ?? 'https://github.com/login/device')
                }}
                className="text-text hover:underline"
              >
                github.com/login/device
              </a>
              {t.settings.sync.goToSuffix}
            </p>
            <div className="flex items-center justify-center py-3">
              <span className="text-2xl font-mono font-bold text-text tracking-widest bg-surface-0 border border-border px-6 py-3 rounded-lg">
                {userCode}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-text-muted">
            <Loader size={12} className="animate-spin flex-shrink-0" />
            <span className="text-[11px] font-mono">{t.settings.sync.waitingAuth}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.noteflow.openUrl(verificationUri ?? 'https://github.com/login/device')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors"
            >
              <ExternalLink size={11} />
              {t.settings.sync.openBrowser}
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded text-xs font-mono text-text-muted hover:text-text transition-colors"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      {/* ── Completing connection ── */}
      {step === 'completing' && !userCode && (
        <div className="flex items-center gap-2 text-text-muted">
          <Loader size={12} className="animate-spin" />
          <span className="text-xs font-mono">{t.settings.sync.connecting}</span>
        </div>
      )}

      {/* ── Connected: actions ── */}
      {status?.connected && !userCode && step !== 'completing' && (
        <div className="flex gap-2">
          <button
            onClick={handlePull}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text transition-colors disabled:opacity-40"
          >
            {step === 'pulling' ? (
              <Loader size={11} className="animate-spin" />
            ) : (
              <RefreshCw size={11} />
            )}
            {t.settings.sync.syncNow}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
          >
            <Unlink size={11} />
            {t.settings.sync.disconnect}
          </button>
        </div>
      )}

      {/* ── Not connected: setup form ── */}
      {status && !status.connected && !userCode && step !== 'completing' && (
        <div className="space-y-3 pt-1">
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {t.settings.sync.setupDesc}
          </p>
          <div>
            <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
              {t.settings.sync.repoName}
            </label>
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="noteflow-notes"
              disabled={isLoading}
              className="w-full px-3 py-1.5 rounded text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
            />
            <p className="text-[11px] font-mono text-text-muted/60 mt-1">
              {t.settings.sync.repoHint}
            </p>
          </div>
          <button
            onClick={handleInitiate}
            disabled={isLoading || !repo.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 'waiting-auth' && !userCode ? (
              <Loader size={11} className="animate-spin" />
            ) : (
              <Github size={11} />
            )}
            {t.settings.sync.connectWithGitHub}
          </button>
        </div>
      )}

      {/* Loading spinner for initial status fetch */}
      {!status && (
        <div className="flex items-center gap-2 text-text-muted">
          <Loader size={12} className="animate-spin" />
          <span className="text-xs font-mono">{t.common.loading}</span>
        </div>
      )}
    </div>
  )
}
