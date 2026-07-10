import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useAiStore } from '../../stores/aiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useAiChatStore } from '../../stores/aiChatStore'
import { LlmConfigView } from '../AiPanel/LlmConfigView'
import { useT } from '../../i18n/useT'

export function AiPanel({ onClose }: { onClose: () => void }) {
  const t = useT()
  const enabled = useAiStore((s) => s.enabled)
  const setEnabled = useAiStore((s) => s.setEnabled)
  const reindexAll = useAiStore((s) => s.reindexAll)
  const indexState = useAiStore((s) => s.indexState)
  const progress = useAiStore((s) => s.progress)
  const setBrainView = useNotesStore((s) => s.setBrainView)
  const openAiPanel = useAiChatStore((s) => s.openAiPanel)
  const loadConfig = useAiChatStore((s) => s.loadConfig)
  const configLoaded = useAiChatStore((s) => s.configLoaded)
  const [exposeSkill, setExposeSkill] = useState(true)

  // The LLM config is normally loaded by the brain panel; load it here too in case the
  // user jumps straight to Settings → AI without ever opening the brain view.
  useEffect(() => {
    if (!configLoaded) void loadConfig()
  }, [configLoaded, loadConfig])

  useEffect(() => {
    void window.noteflow.getSkillSync().then(({ enabled }) => setExposeSkill(enabled))
  }, [])

  const handleToggleSkill = async (next: boolean) => {
    setExposeSkill(next)
    await window.noteflow.setSkillSync(next)
  }

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
            <p className="text-xs font-mono font-medium text-text">{t.settings.ai.localAi}</p>
            <p className="text-[11px] font-mono text-text-muted mt-0.5 max-w-md leading-relaxed">
              {t.settings.ai.localAiHint}
            </p>
          </div>
          <button
            onClick={() => void setEnabled(!enabled)}
            title={enabled ? t.settings.ai.disableLocalAi : t.settings.ai.enableLocalAi}
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
              {t.settings.ai.reindexAll}
            </button>
            {busy && progress && (
              <span className="text-[11px] font-mono text-text-muted tabular-nums">
                {indexState === 'downloading-model' ? t.settings.ai.downloadingModel : `${progress.done}/${progress.total}`}
              </span>
            )}
          </div>
        )}
      </section>

      {/* ── Assistant (LLM provider) ────────────────────────────────── */}
      <section>
        <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest mb-2">{t.settings.ai.assistant}</div>
        <p className="text-[11px] font-mono text-text-muted mb-3 max-w-md leading-relaxed">
          {t.settings.ai.assistantHint}
        </p>
        <LlmConfigView embedded />
      </section>

      {/* ── Profile (second brain) ──────────────────────────────────── */}
      <section>
        <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest mb-2">{t.settings.ai.profile}</div>
        <button
          onClick={openProfile}
          className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-mono text-text hover:bg-surface-2 transition-colors text-left"
        >
          <Sparkles size={13} className="text-text-muted flex-shrink-0" />
          <span>{t.settings.ai.openProfileSetup}</span>
        </button>
        <p className="text-[11px] font-mono text-text-muted/60 mt-2 max-w-md leading-relaxed">
          {t.settings.ai.profileHint}
        </p>
      </section>

      {/* ── AI agents (CLI skill) ───────────────────────────────────── */}
      <section>
        <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest mb-2">{t.settings.ai.aiAgents}</div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-mono font-medium text-text">{t.settings.ai.exposeSkill}</p>
            <p className="text-[11px] font-mono text-text-muted mt-0.5 max-w-md leading-relaxed">
              {t.settings.ai.exposeSkillHint}
            </p>
          </div>
          <button
            onClick={() => void handleToggleSkill(!exposeSkill)}
            title={exposeSkill ? t.settings.ai.stopExposingSkill : t.settings.ai.exposeSkillTooltip}
            className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${
              exposeSkill ? 'bg-text/70' : 'bg-surface-3 border border-border'
            }`}
          >
            <span
              className={`absolute top-[2px] w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                exposeSkill ? 'left-[18px]' : 'left-[2px]'
              }`}
            />
          </button>
        </div>
      </section>
    </div>
  )
}
