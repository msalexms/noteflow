import { useEffect, useState, type ReactNode } from 'react'
import { Link2, MessageSquare, Settings, Sparkles } from 'lucide-react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { ChatView } from './ChatView'
import { RelatedView } from './RelatedView'
import { LlmConfigView } from './LlmConfigView'
import { ProfileFlow } from './ProfileFlow'

type Tab = 'chat' | 'related' | 'profile' | 'settings'

export function AiPanel({ onOpenNote }: { onOpenNote: (noteId: string, sectionId: string) => void }) {
  const loadConfig = useAiChatStore((s) => s.loadConfig)
  const loadSessions = useAiChatStore((s) => s.loadSessions)
  const initListeners = useAiChatStore((s) => s.initListeners)
  const llmConfig = useAiChatStore((s) => s.llmConfig)
  const configLoaded = useAiChatStore((s) => s.configLoaded)

  const [tab, setTab] = useState<Tab>('chat')
  const [profileDone, setProfileDone] = useState<boolean | null>(null) // null = unknown
  const [autoRouted, setAutoRouted] = useState(false)

  useEffect(() => {
    void loadConfig()
    void loadSessions()
    const off = initListeners()
    window.noteflow.aiProfileGetStatus().then((s) => setProfileDone(!!s.completedAt)).catch(() => setProfileDone(true))
    return off
  }, [loadConfig, loadSessions, initListeners])

  // First-time routing once both config + profile status are known: show the profile wizard
  // if it hasn't been done and a provider is configured; otherwise land on chat.
  useEffect(() => {
    if (autoRouted || !configLoaded || profileDone === null) return
    setAutoRouted(true)
    if (!profileDone && llmConfig?.configured) setTab('profile')
    else if (!llmConfig?.configured) setTab('settings')
  }, [autoRouted, configLoaded, profileDone, llmConfig?.configured])

  const TABS: { id: Tab; icon: ReactNode; label: string }[] = [
    { id: 'chat', icon: <MessageSquare size={13} />, label: 'Chat' },
    { id: 'related', icon: <Link2 size={13} />, label: 'Related' },
    { id: 'profile', icon: <Sparkles size={13} />, label: 'Profile' },
  ]

  return (
    <div className="flex flex-col h-full min-h-0 border-r border-border" style={{ background: 'rgb(var(--bg-1))' }}>
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center gap-1 px-2 h-9 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono transition-colors ${
              tab === t.id ? 'bg-surface-2 text-text' : 'text-text-muted hover:text-text'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
        <button
          onClick={() => setTab('settings')}
          title="AI provider"
          className={`ml-auto flex items-center justify-center w-7 h-7 rounded transition-colors ${
            tab === 'settings' ? 'bg-surface-2 text-text' : 'text-text-muted hover:text-text'
          }`}
        >
          <Settings size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        {tab === 'chat' && <ChatView onOpenNote={onOpenNote} onConfigure={() => setTab('settings')} />}
        {tab === 'related' && <RelatedView onOpenNote={onOpenNote} />}
        {tab === 'profile' && <ProfileFlow onDone={() => { setProfileDone(true); setTab('chat') }} />}
        {tab === 'settings' && <LlmConfigView />}
      </div>
    </div>
  )
}
