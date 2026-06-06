import { useEffect, useRef, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useGroupsStore } from '../../stores/groupsStore'
import type { Note } from '../../types'
import {
  Search, Plus, FolderOpen, Keyboard, X,
  Clock, FolderPlus, Upload, Download, RefreshCw, Cloud, Zap, Settings,
} from 'lucide-react'
import { format } from 'date-fns'
import { escapeRegExp } from '../../lib/searchUtils'

function HighlightText({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim()
  if (!trimmed) return <>{text}</>

  const matcher = new RegExp(`(${escapeRegExp(trimmed)})`, 'ig')
  const parts = text.split(matcher)
  if (parts.length <= 1) return <>{text}</>

  return (
    <>
      {parts.map((part, index) => (
        index % 2 === 1
          ? (
            <mark key={`${part}-${index}`} className="bg-text/15 text-text rounded px-[1px]">
              {part}
            </mark>
          )
          : <span key={`${part}-${index}`}>{part}</span>
      ))}
    </>
  )
}

interface Command {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
  category: 'create' | 'navigate' | 'action'
}

const ICON_CLS = 'text-text-muted/60'
const ICON_SIZE = 12

export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    notes,
    setActiveNote,
    createNote,
    createTempNote,
  } = useNotesStore()

  const createGroup = useGroupsStore((s) => s.createGroup)

  const [query, setQuery] = useState('')
  const [showCheatSheet, setShowCheatSheet] = useState(false)
  const [mode, setMode] = useState<'search' | 'create-group'>('search')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (commandPaletteOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode('search')
      const seenCheatSheet = window.localStorage.getItem('noteflow:palette-cheatsheet-seen') === '1'
      setShowCheatSheet(!seenCheatSheet)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.key === 'Escape' && commandPaletteOpen) {
        if (mode === 'create-group') {
          setMode('search')
          setQuery('')
        } else {
          setCommandPaletteOpen(false)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commandPaletteOpen, mode, setCommandPaletteOpen])

  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIdx(0)
  }, [query])

  if (!commandPaletteOpen) return null

  const staticCommands: Command[] = [
    {
      id: 'new-note',
      label: 'New note',
      description: 'Create a blank note · Ctrl+N',
      icon: <Plus size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { createNote(); setCommandPaletteOpen(false) },
      category: 'create',
    },
    {
      id: 'new-temp-note',
      label: 'New temporary note',
      description: 'Auto-deletes in 24h · Ctrl+Shift+N',
      icon: <Clock size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { createTempNote(); setCommandPaletteOpen(false) },
      category: 'create',
    },
    {
      id: 'create-group',
      label: 'Create group',
      description: 'Organize notes into a new group',
      icon: <FolderPlus size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { setMode('create-group'); setQuery('') },
      category: 'create',
    },
    {
      id: 'export',
      label: 'Export notes',
      description: 'Save notes to a file',
      icon: <Upload size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { window.dispatchEvent(new CustomEvent('noteflow:open-export')); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'import',
      label: 'Import notes',
      description: 'Load notes from a file',
      icon: <Download size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { window.dispatchEvent(new CustomEvent('noteflow:open-import')); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'sync',
      label: 'Sync notes',
      description: 'Pull latest from GitHub',
      icon: <RefreshCw size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { window.dispatchEvent(new CustomEvent('noteflow:sync-notes')); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'github-sync',
      label: 'GitHub Sync',
      description: 'Open sync configuration',
      icon: <Cloud size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { window.dispatchEvent(new CustomEvent('noteflow:open-github-sync')); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'check-update',
      label: 'Check for updates',
      description: 'Check for a new NoteFlow version',
      icon: <Zap size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { window.dispatchEvent(new CustomEvent('noteflow:check-for-update')); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'startup-settings',
      label: 'Startup settings',
      description: 'Autostart and stickies on launch',
      icon: <Settings size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { window.dispatchEvent(new CustomEvent('noteflow:open-startup')); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'open-folder',
      label: 'Open notes folder',
      description: '~/noteflow-notes',
      icon: <FolderOpen size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { window.noteflow.openNotesFolder(); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      description: 'Open shortcut reference',
      icon: <Keyboard size={ICON_SIZE} className={ICON_CLS} />,
      action: () => {
        window.dispatchEvent(new CustomEvent('noteflow:open-shortcuts'))
        setCommandPaletteOpen(false)
      },
      category: 'action',
    },
  ]

  const q = query.toLowerCase().trim()

  const matchedNotes: Command[] = q
    ? notes
        .filter(
          (n) =>
            !n.archived &&
            (n.title.toLowerCase().includes(q) ||
              n.sections.some((s) => s.content.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) ||
              n.tags.some((t) => t.includes(q)))
        )
        .slice(0, 8)
        .map((n: Note) => ({
          id: `note-${n.id}`,
          label: n.title || 'Untitled',
          description: format(new Date(n.updated), 'MMM d · HH:mm'),
          icon: <Search size={ICON_SIZE} className={ICON_CLS} />,
          action: () => { setActiveNote(n.id); setCommandPaletteOpen(false) },
          category: 'navigate' as const,
        }))
    : []

  const matchedCommands = q
    ? staticCommands.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          (c.description?.toLowerCase().includes(q) ?? false)
      )
    : staticCommands

  const allItems = mode === 'search' ? [...matchedCommands, ...matchedNotes] : []

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mode === 'create-group') {
      if (e.key === 'Enter' && query.trim()) {
        e.preventDefault()
        createGroup(query.trim(), '--accent')
        setCommandPaletteOpen(false)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => (allItems.length === 0 ? 0 : (i + 1) % allItems.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => (allItems.length === 0 ? 0 : (i <= 0 ? allItems.length - 1 : i - 1)))
    } else if (e.key === 'Enter' && allItems[selectedIdx]) {
      allItems[selectedIdx].action()
    }
  }

  const dismissCheatSheet = () => {
    setShowCheatSheet(false)
    window.localStorage.setItem('noteflow:palette-cheatsheet-seen', '1')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60 backdrop-blur-sm"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-surface-1 border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {mode === 'create-group' ? (
            <>
              <FolderPlus size={14} className="text-text-muted flex-shrink-0" />
              <button
                onClick={() => { setMode('search'); setQuery('') }}
                className="text-[10px] font-mono text-text-muted/50 hover:text-text-muted whitespace-nowrap flex-shrink-0 transition-colors"
              >
                Commands ›
              </button>
            </>
          ) : (
            <Search size={14} className="text-text-muted flex-shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'create-group' ? 'Group name...' : 'Search notes or run command...'}
            className="flex-1 bg-transparent text-xs font-mono text-text placeholder-text-muted/50
                       outline-none caret-text"
          />
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="text-text-muted hover:text-text transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {mode === 'create-group' ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs font-mono text-text-muted">
                {query.trim() ? (
                  <>
                    Press{' '}
                    <kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded text-[10px]">Enter</kbd>
                    {' '}to create{' '}
                    <span className="text-text">"{query.trim()}"</span>
                  </>
                ) : 'Type a name for the new group'}
              </p>
              <p className="text-[10px] font-mono text-text-muted/40 mt-1.5">Esc to go back</p>
            </div>
          ) : (
            <>
              {showCheatSheet && !q && (
                <div className="mx-3 mt-2 mb-2 rounded border border-text/15 bg-surface-2 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Quick shortcuts</span>
                    <button
                      onClick={dismissCheatSheet}
                      className="text-[10px] font-mono text-text-muted/70 hover:text-text transition-colors"
                    >
                      hide
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] font-mono text-text-muted/80">
                    <span className="flex items-center gap-1"><kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded">Ctrl+P</kbd> palette</span>
                    <span className="flex items-center gap-1"><kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded">Ctrl+N</kbd> note</span>
                    <span className="flex items-center gap-1"><kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded">Ctrl+F</kbd> search</span>
                    <span className="flex items-center gap-1"><kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded">Ctrl+Shift+E</kbd> raw/editor</span>
                  </div>
                </div>
              )}

              <div className="px-4 py-1 text-[10px] font-mono text-text-muted/60 uppercase tracking-wider">
                {allItems.length} result{allItems.length === 1 ? '' : 's'}
              </div>

              {allItems.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs font-mono text-text-muted">
                  No results for "{query}"
                </div>
              ) : (
                <>
                  {matchedCommands.length > 0 && (
                    <>
                      <div className="px-3 py-1">
                        <span className="text-[10px] font-mono text-text-muted/40 uppercase tracking-wider">Commands</span>
                      </div>
                      {matchedCommands.map((cmd, i) => (
                        <CommandItem
                          key={cmd.id}
                          cmd={cmd}
                          query={query}
                          isSelected={selectedIdx === i}
                          onHover={() => setSelectedIdx(i)}
                        />
                      ))}
                    </>
                  )}
                  {matchedNotes.length > 0 && (
                    <>
                      <div className="px-3 py-1 mt-1">
                        <span className="text-[10px] font-mono text-text-muted/40 uppercase tracking-wider">Notes</span>
                      </div>
                      {matchedNotes.map((cmd, i) => (
                        <CommandItem
                          key={cmd.id}
                          cmd={cmd}
                          query={query}
                          isSelected={selectedIdx === matchedCommands.length + i}
                          onHover={() => setSelectedIdx(matchedCommands.length + i)}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex gap-3">
          {mode === 'create-group' ? (
            <>
              {[['↵', 'create'], ['esc', 'back']].map(([key, label]) => (
                <span key={key} className="flex items-center gap-1 text-[10px] font-mono text-text-muted/50">
                  <kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded text-[10px]">{key}</kbd>
                  {label}
                </span>
              ))}
            </>
          ) : (
            <>
              {[['↑↓', 'navigate'], ['↵', 'select'], ['esc', 'close'], ['Ctrl+P', 'toggle']].map(([key, label]) => (
                <span key={key} className="flex items-center gap-1 text-[10px] font-mono text-text-muted/50">
                  <kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded text-[10px]">{key}</kbd>
                  {label}
                </span>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CommandItem({
  cmd,
  query,
  isSelected,
  onHover,
}: {
  cmd: Command
  query: string
  isSelected: boolean
  onHover: () => void
}) {
  return (
    <button
      onClick={cmd.action}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-3 px-4 py-1.5 text-left transition-colors
        ${isSelected ? 'bg-surface-2' : 'hover:bg-surface-3'}`}
    >
      <span className="flex-shrink-0">{cmd.icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-mono text-text truncate block"><HighlightText text={cmd.label} query={query} /></span>
        {cmd.description && (
          <span className="text-[10px] font-mono text-text-muted/50 truncate block"><HighlightText text={cmd.description} query={query} /></span>
        )}
      </div>
    </button>
  )
}
