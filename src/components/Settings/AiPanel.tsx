import { useEffect } from 'react'
import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useAiStore } from '../../stores/aiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useAiChatStore } from '../../stores/aiChatStore'
import { LlmConfigView } from '../AiPanel/LlmConfigView'

export function AiPanel({ onClose }: { onClose: () => void }) {
  const enabled = useAiStore((s) => s.enabled)
  const setEnabled = useAiStore((s) => s.setEnabled)
  const reindexAll = useAiStore((s) => s.reindexAll)
  const indexState = useAiStore((s) => s.indexState)
  const progress = useAiStore((s) => s.progress)
  const setBrainView = useNotesStore((s) => s.setBrainView)
  const openAiPanel = useAiChatStore((s) => s.openAiPanel)
  const loadConfig = useAiChatStore((s) => s.loadConfig)
  const configLoaded = useAiChatStore((s) => s.configLoaded)

  // The LLM config is normally loaded by the brain panel; load it here too in case the
  // user jumps straight to Settings → AI without ever opening the brain view.
  useEffect(() => {
    if (!configLoaded) void loadConfig()
  }, [configLoaded, loadConfig])

  const busy = indexState !== 'idle'

  const openProfile = () => {
    setBrainView(true)
    openAiPanel('profile')
    onClose()
  }

  return (
    <div className="space-y-6">
      {/* ── Local AI (embeddings index) ─────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-mono font-medium text-text">Local AI</p>
            <p className="text-[11px] font-mono text-text-muted mt-0.5 max-w-md leading-relaxed">
              Index your notes on this device to power Related notes, the brain graph and
              chat context. Runs fully offline; encrypted notes are skipped.
            </p>
          </div>
          <button
            onClick={() => void setEnabled(!enabled)}
            title={enabled ? 'Disable local AI' : 'Enable local AI'}
            className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${
              enabled ? 'bg-text/70' : 'bg-surface-3 border border-border'
            }`}
          >
            <span
              className={`absolute top-[2px] w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                enabled ? 'left-[18px]' : 'left-[2px]'
              }`}
            />
          </button>
        </div>

        {enabled && (
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => void reindexAll()}
              disabled={busy}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-mono text-text hover:bg-surface-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 size={13} className="animate-spin text-text-muted" /> : <RefreshCw size={13} className="text-text-muted" />}
              Reindex all notes
            </button>
            {busy && progress && (
              <span className="text-[11px] font-mono text-text-muted tabular-nums">
                {indexState === 'downloading-model' ? 'Downloading model…' : `${progress.done}/${progress.total}`}
              </span>
            )}
          </div>
        )}
      </section>

      {/* ── Assistant (LLM provider) ────────────────────────────────── */}
      <section>
        <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest mb-2">Assistant (LLM)</div>
        <p className="text-[11px] font-mono text-text-muted mb-3 max-w-md leading-relaxed">
          Configure the chat provider, endpoint, API key and model. Each provider keeps
          its own credentials; switching providers won't mix keys.
        </p>
        <LlmConfigView embedded />
      </section>

      {/* ── Profile (second brain) ──────────────────────────────────── */}
      <section>
        <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest mb-2">Profile</div>
        <button
          onClick={openProfile}
          className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-mono text-text hover:bg-surface-2 transition-colors text-left"
        >
          <Sparkles size={13} className="text-text-muted flex-shrink-0" />
          <span>Open profile setup</span>
        </button>
        <p className="text-[11px] font-mono text-text-muted/60 mt-2 max-w-md leading-relaxed">
          Re-run the questionnaire to refresh the profile note the assistant uses for context.
        </p>
      </section>
    </div>
  )
}
