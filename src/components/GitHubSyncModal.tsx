import { useEffect, useRef, useState } from 'react'
import { Cloud, CloudOff, ExternalLink, Github, Loader, RefreshCw, Unlink, X } from 'lucide-react'
import { useNotesStore } from '../stores/notesStore'

interface SyncStatus {
  enabled: boolean
  connected: boolean
  owner?: string
  repo?: string
  lastSync?: string
  error?: string
}

interface Props {
  onClose: () => void
}

type Step = 'status' | 'connecting' | 'pulling'

export function GitHubSyncModal({ onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const loadNotes = useNotesStore((s) => s.loadNotes)

  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [step, setStep] = useState<Step>('status')
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [token, setToken] = useState('')
  const [repo, setRepo] = useState('noteflow-notes')

  // Pull result
  const [pullResult, setPullResult] = useState<{ pulled: number; errors: string[] } | null>(null)

  useEffect(() => {
    window.noteflow.getSyncStatus().then(setStatus)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleConnect() {
    if (!token.trim() || !repo.trim()) return
    setStep('connecting')
    setError(null)
    const result = await window.noteflow.connectGitHub(token.trim(), repo.trim())
    if (result.ok) {
      const updated = await window.noteflow.getSyncStatus()
      setStatus(updated)
      setStep('status')
      setToken('')
      await loadNotes()
    } else {
      setError(result.error ?? 'Connection failed')
      setStep('status')
    }
  }

  async function handlePull() {
    setStep('pulling')
    setError(null)
    const result = await window.noteflow.pullNotes()
    setPullResult(result)
    setStep('status')
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

  const isLoading = step === 'connecting' || step === 'pulling'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        className="w-[480px] flex flex-col bg-surface-1 border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-border">
          <Github size={13} className="text-accent flex-shrink-0" />
          <span className="text-xs font-mono text-text font-medium flex-1">GitHub Sync</span>
          <button onClick={onClose} className="text-text-muted hover:text-text transition-colors">
            <X size={13} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Status badge */}
          {status && (
            <div className="flex items-center gap-2">
              {status.connected ? (
                <>
                  <Cloud size={12} className="text-green-400" />
                  <span className="text-xs font-mono text-green-400">Connected</span>
                  <span className="text-xs font-mono text-text-muted">·</span>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      window.noteflow.openUrl(`https://github.com/${status.owner}/${status.repo}`)
                    }}
                    className="text-xs font-mono text-accent hover:underline flex items-center gap-1"
                  >
                    {status.owner}/{status.repo}
                    <ExternalLink size={10} />
                  </a>
                </>
              ) : (
                <>
                  <CloudOff size={12} className="text-text-muted" />
                  <span className="text-xs font-mono text-text-muted">Not connected</span>
                </>
              )}
            </div>
          )}

          {/* Last sync */}
          {status?.lastSync && (
            <p className="text-[11px] font-mono text-text-muted">
              Last sync: {new Date(status.lastSync).toLocaleString()}
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
                ? 'Already up to date'
                : `Pulled ${pullResult.pulled} note${pullResult.pulled !== 1 ? 's' : ''}`}
              {pullResult.errors.length > 0 && (
                <div className="mt-1 text-[10px] text-red-400">{pullResult.errors.join(', ')}</div>
              )}
            </div>
          )}

          {/* Connected: actions */}
          {status?.connected && (
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
                Sync now
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
              >
                <Unlink size={11} />
                Disconnect
              </button>
            </div>
          )}

          {/* Not connected: setup form */}
          {status && !status.connected && (
            <div className="space-y-3 pt-1">
              <p className="text-[11px] font-mono text-text-muted leading-relaxed">
                Connect a GitHub account to sync notes across machines via a private repo.
                Create a{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    window.noteflow.openUrl('https://github.com/settings/tokens/new?scopes=repo&description=NoteFlow+Sync')
                  }}
                  className="text-accent hover:underline"
                >
                  Personal Access Token
                </a>{' '}
                with <code className="text-text">repo</code> scope.
              </p>

              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] font-mono text-text-muted mb-1 uppercase tracking-wider">
                    Personal Access Token
                  </label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_..."
                    className="w-full px-3 py-1.5 rounded text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-text-muted mb-1 uppercase tracking-wider">
                    Repository name
                  </label>
                  <input
                    type="text"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    placeholder="noteflow-notes"
                    className="w-full px-3 py-1.5 rounded text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-accent/50"
                  />
                  <p className="text-[10px] font-mono text-text-muted/60 mt-1">
                    Will be created as private if it doesn&apos;t exist.
                  </p>
                </div>
              </div>

              <button
                onClick={handleConnect}
                disabled={isLoading || !token.trim() || !repo.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {step === 'connecting' ? (
                  <Loader size={11} className="animate-spin" />
                ) : (
                  <Github size={11} />
                )}
                {step === 'connecting' ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          )}

          {/* Loading spinner for initial status fetch */}
          {!status && (
            <div className="flex items-center gap-2 text-text-muted">
              <Loader size={12} className="animate-spin" />
              <span className="text-xs font-mono">Loading...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
