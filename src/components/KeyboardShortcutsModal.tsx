import { X } from 'lucide-react'

interface ShortcutEntry {
  keys: string[]
  description: string
}

interface ShortcutSection {
  title: string
  shortcuts: ShortcutEntry[]
}

const SECTIONS: ShortcutSection[] = [
  {
    title: 'Quick start',
    shortcuts: [
      { keys: ['Ctrl/Cmd', 'P'], description: 'Open command palette' },
      { keys: ['Ctrl/Cmd', 'N'], description: 'New note' },
      { keys: ['Ctrl/Cmd', 'F'], description: 'Focus sidebar search' },
      { keys: ['Ctrl/Cmd', 'Shift', 'E'], description: 'Toggle editor/raw mode' },
    ],
  },
  {
    title: 'App',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'Space'], description: 'Show / hide app (global)' },
      { keys: ['Ctrl/Cmd', 'N'], description: 'New note' },
      { keys: ['Ctrl/Cmd', 'F'], description: 'Focus search' },
      { keys: ['Ctrl/Cmd', '\''], description: 'Toggle sidebar' },
    ],
  },
  {
    title: 'Sections',
    shortcuts: [
      { keys: ['Ctrl/Cmd', 'T'], description: 'New section' },
      { keys: ['Ctrl/Cmd', 'W'], description: 'Close/delete section' },
      { keys: ['Delete'], description: 'Delete selected note (when not editing)' },
    ],
  },
  {
    title: 'Editor',
    shortcuts: [
      { keys: ['Ctrl/Cmd', 'Z'], description: 'Undo' },
      { keys: ['Ctrl/Cmd', 'Y'], description: 'Redo' },
      { keys: ['Ctrl/Cmd', 'B'], description: 'Bold' },
      { keys: ['Ctrl/Cmd', 'I'], description: 'Italic' },
      { keys: ['Ctrl/Cmd', 'U'], description: 'Underline' },
      { keys: ['Ctrl/Cmd', 'E'], description: 'Inline code' },
      { keys: ['Ctrl/Cmd', 'Shift', 'B'], description: 'Code block' },
      { keys: ['Ctrl/Cmd', 'Shift', 'E'], description: 'Toggle raw/editor mode' },
    ],
  },
  {
    title: 'Font size',
    shortcuts: [
      { keys: ['Ctrl/Cmd', '+'], description: 'Increase font size' },
      { keys: ['Ctrl/Cmd', '-'], description: 'Decrease font size' },
      { keys: ['Ctrl/Cmd', '0'], description: 'Reset font size' },
    ],
  },
]

interface Props {
  onClose: () => void
}

export function KeyboardShortcutsModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface-1 border border-border rounded-lg shadow-2xl w-[480px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs font-mono text-text-muted uppercase tracking-widest">Keyboard shortcuts</span>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-4 space-y-4">
          <div className="rounded border border-accent/30 bg-accent/8 px-3 py-2 text-[11px] font-mono text-text-muted">
            Tip: shortcuts marked as Ctrl/Cmd work on Windows/Linux with Ctrl and on macOS with Cmd.
          </div>
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="text-[10px] font-mono text-text-muted/70 uppercase tracking-widest mb-2">
                {section.title}
              </div>
              <div className="space-y-0.5">
                {section.shortcuts.map((s) => (
                  <div key={s.description} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-surface-2 transition-colors">
                    <span className="text-xs font-mono text-text">{s.description}</span>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                      {s.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-surface-3 border border-border rounded text-text-muted">
                            {k}
                          </kbd>
                          {i < s.keys.length - 1 && (
                            <span className="text-[10px] text-text-muted/40">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
