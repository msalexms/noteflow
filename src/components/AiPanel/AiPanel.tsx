import { useEffect, useState, type ReactNode } from 'react'
import { Link2, MessageSquare, PanelLeftClose, Settings, Sparkles } from 'lucide-react'
import { useAiChatStore, type PanelTab } from '../../stores/aiChatStore'
import { useNotesStore } from '../../stores/notesStore'
import { useGroupsStore } from '../../stores/groupsStore'
import { ChatView } from './ChatView'
import { RelatedView } from './RelatedView'
import { LlmConfigView } from './LlmConfigView'
import { ProfileFlow, ProfileSummary, findAiProfileNote } from './ProfileFlow'

type Tab = PanelTab

export function AiPanel({ onOpenNote, onCollapse }: { onOpenNote: (noteId: string, sectionId: string) => void; onCollapse?: () => void }) {
  const loadConfig = useAiChatStore((s) => s.loadConfig)
  const loadSessions = useAiChatStore((s) => s.loadSessions)
  const initListeners = useAiChatStore((s) => s.initListeners)
  const llmConfig = useAiChatStore((s) => s.llmConfig)
  const configLoaded = useAiChatStore((s) => s.configLoaded)
  const panelTab = useAiChatStore((s) => s.panelTab)

  // Notes + groups are synced across machines; the local settings flag is not. So we treat the
  // synced profile note (a note in the "AI generated" group) as the source of truth, and only
  // fall back to the local flag for the "skipped" state or legacy notes that predate the group.
  const notes = useNotesStore((s) => s.notes)
  const notesLoading = useNotesStore((s) => s.isLoading)
  const groups = useGroupsStore((s) => s.groups)
  const syncedProfileNote = findAiProfileNote(groups, notes)

  const [tab, setTab] = useState<Tab>('chat')
  const [profileDone, setProfileDone] = useState<boolean | null>(null) // null = unknown
  const [profileNoteId, setProfileNoteId] = useState<string | null>(null)
  const [profileEditing, setProfileEditing] = useState(false) // "Start over" reopened the wizard
  const [autoRouted, setAutoRouted] = useState(false)

  useEffect(() => {
    void loadConfig()
    void loadSessions()
    const off = initListeners()
    return off
  }, [loadConfig, loadSessions, initListeners])

  // Resolve profile status once notes have loaded, so first-time routing doesn't flash the
  // wizard on a machine that already has a synced profile.
  useEffect(() => {
    if (notesLoading) return
    if (syncedProfileNote) {
      setProfileDone(true)
      setProfileNoteId(syncedProfileNote.id)
      return
    }
    // No synced profile note → fall back to the local flag (covers "Not now" and legacy notes).
    window.noteflow.aiProfileGetStatus()
      .then((s) => { setProfileDone(!!s.completedAt); setProfileNoteId((prev) => prev ?? s.noteId) })
      .catch(() => setProfileDone(true))
  }, [notesLoading, syncedProfileNote?.id])

  // First-time routing once both config + profile status are known: show the profile wizard
  // if it hasn't been done and a provider is configured; otherwise land on chat.
  useEffect(() => {
    if (autoRouted || !configLoaded || profileDone === null) return
    setAutoRouted(true)
    if (!profileDone && llmConfig?.configured) setTab('profile')
    else if (!llmConfig?.configured) setTab('settings')
  }, [autoRouted, configLoaded, profileDone, llmConfig?.configured])

  // Explicit routing from the command palette wins over the first-time auto-routing above.
  useEffect(() => {
    if (!panelTab) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab(panelTab)
    setAutoRouted(true)
    useAiChatStore.setState({ panelTab: null })
  }, [panelTab])

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
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] font-mono transition-colors ${
              tab === t.id ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text hover:bg-surface-2'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
        <button
          onClick={() => setTab('settings')}
          title="AI provider"
          className={`ml-auto flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
            tab === 'settings' ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text hover:bg-surface-2'
          }`}
        >
          <Settings size={13} />
        </button>
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="Collapse AI panel"
            className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text transition-colors"
          >
            <PanelLeftClose size={13} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        {tab === 'chat' && <ChatView onOpenNote={onOpenNote} onConfigure={() => setTab('settings')} />}
        {tab === 'related' && <RelatedView onOpenNote={onOpenNote} />}
        {tab === 'profile' && (
          profileDone && profileNoteId && !profileEditing ? (
            <ProfileSummary
              noteId={profileNoteId}
              onOpenNote={onOpenNote}
              onStartOver={() => setProfileEditing(true)}
            />
          ) : (
            <ProfileFlow
              existingNoteId={profileNoteId}
              onDone={(noteId) => {
                setProfileDone(true)
                setProfileNoteId(noteId)
                setProfileEditing(false)
                setTab('chat')
              }}
            />
          )
        )}
        {tab === 'settings' && <LlmConfigView />}
      </div>
    </div>
  )
}
