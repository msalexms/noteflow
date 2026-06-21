import { useEffect, useState } from 'react'
import {
  Database,
  Info,
  Keyboard,
  Monitor,
  Palette,
  Pencil,
  RefreshCw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'
import { AppearancePanel } from './AppearancePanel'
import { EditorPanel } from './EditorPanel'
import { StartupPanel } from './StartupPanel'
import { SyncPanel } from './SyncPanel'
import { DataPanel } from './DataPanel'
import { ShortcutsPanel } from './ShortcutsPanel'
import { AboutPanel } from './AboutPanel'
import { AiPanel } from './AiPanel'

export type SettingsSection =
  | 'appearance'
  | 'editor'
  | 'startup'
  | 'sync'
  | 'data'
  | 'ai'
  | 'shortcuts'
  | 'about'

interface NavEntry {
  id: SettingsSection
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const NAV: NavEntry[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'editor', label: 'Editor', icon: Pencil },
  { id: 'startup', label: 'Startup', icon: Monitor },
  { id: 'sync', label: 'Sync', icon: RefreshCw },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info },
]

interface SettingsModalProps {
  initialSection?: SettingsSection
  onClose: () => void
  onOpenExportImport: (mode: 'export' | 'import') => void
}

export function SettingsModal({ initialSection = 'appearance', onClose, onOpenExportImport }: SettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const activeLabel = NAV.find((n) => n.id === section)?.label ?? ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface-1 border border-border rounded-lg shadow-2xl w-[min(940px,92vw)] h-[min(680px,90vh)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings size={13} className="text-text" />
            <span className="text-sm font-mono font-semibold text-text">Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* ── Nav ──────────────────────────────────────────────────────── */}
          <nav className="w-[200px] flex-shrink-0 border-r border-border p-2 overflow-y-auto">
            {NAV.map((entry) => {
              const Icon = entry.icon
              const active = entry.id === section
              return (
                <button
                  key={entry.id}
                  onClick={() => setSection(entry.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-mono text-left transition-colors ${
                    active
                      ? 'bg-surface-2 text-text'
                      : 'text-text-muted hover:text-text hover:bg-surface-2/60'
                  }`}
                >
                  <Icon size={13} className="flex-shrink-0" />
                  <span className="truncate">{entry.label}</span>
                </button>
              )
            })}
          </nav>

          {/* ── Content ──────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-xs font-mono text-text-muted/70 uppercase tracking-widest">{activeLabel}</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {section === 'appearance' && <AppearancePanel />}
              {section === 'editor' && <EditorPanel />}
              {section === 'startup' && <StartupPanel />}
              {section === 'sync' && <SyncPanel />}
              {section === 'data' && <DataPanel onOpenExportImport={onOpenExportImport} />}
              {section === 'ai' && <AiPanel onClose={onClose} />}
              {section === 'shortcuts' && <ShortcutsPanel />}
              {section === 'about' && <AboutPanel />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
