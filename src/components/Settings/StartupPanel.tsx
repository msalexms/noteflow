import { useEffect, useState } from 'react'
import { Bookmark } from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { getTagColor } from '../../lib/tagColors'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'

interface StartupSticky {
  noteId: string
  sectionId: string
}

export function StartupPanel() {
  const notes = useNotesStore((s) => s.notes)
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  const [openAtLogin, setOpenAtLogin] = useState(false)
  const [startupStickies, setStartupStickies] = useState<StartupSticky[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      window.noteflow.getLoginItem(),
      window.noteflow.getStartupStickies(),
    ]).then(([loginItem, stickies]) => {
      setOpenAtLogin(loginItem.openAtLogin)
      setStartupStickies(stickies)
      setLoading(false)
    })
  }, [])

  const handleToggleLogin = async (enabled: boolean) => {
    setOpenAtLogin(enabled)
    await window.noteflow.setLoginItem(enabled)
  }

  const isSectionActive = (noteId: string, sectionId: string) =>
    startupStickies.some((s) => s.noteId === noteId && s.sectionId === sectionId)

  const toggleSection = async (noteId: string, sectionId: string) => {
    const next = isSectionActive(noteId, sectionId)
      ? startupStickies.filter((s) => !(s.noteId === noteId && s.sectionId === sectionId))
      : [...startupStickies, { noteId, sectionId }]
    setStartupStickies(next)
    await window.noteflow.setStartupStickies(next)
  }

  // Encrypted notes can't be opened as sticky at startup (require password)
  const visibleNotes = notes.filter((n) => !n.archived && !n.encryption)

  if (loading) {
    return (
      <div className="flex items-center justify-center text-text-muted text-xs font-mono py-8">
        Loading...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Open at login toggle */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono font-medium text-text">Launch on system startup</p>
          <p className="text-[11px] font-mono text-text-muted mt-0.5">
            NoteFlow starts automatically when you turn on your computer
          </p>
        </div>
        <button
          onClick={() => handleToggleLogin(!openAtLogin)}
          title={openAtLogin ? 'Disable launch on startup' : 'Enable launch on startup'}
          className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${
            openAtLogin ? 'bg-text/70' : 'bg-surface-3 border border-border'
          }`}
        >
          <span
            className={`absolute top-[2px] w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
              openAtLogin ? 'left-[18px]' : 'left-[2px]'
            }`}
          />
        </button>
      </div>

      {/* Sticky notes section */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <Bookmark size={11} className="text-text-muted" />
          <span className="text-[11px] font-mono font-medium text-text-muted uppercase tracking-widest">
            Open as sticky at startup
          </span>
        </div>
        {!openAtLogin && (
          <p className="text-[11px] font-mono text-text-muted/60 mb-2">
            Enable "Launch on system startup" to use this feature
          </p>
        )}

        <div className={`transition-opacity ${!openAtLogin ? 'opacity-40 pointer-events-none' : ''}`}>
          {visibleNotes.length === 0 ? (
            <div className="flex items-center justify-center h-16 text-text-muted text-xs font-mono">
              No notes available
            </div>
          ) : (
            <ul className="space-y-2">
              {visibleNotes.map((note) => {
                const hasAnyActive = note.sections.some((s) => isSectionActive(note.id, s.id))
                return (
                  <li key={note.id}>
                    <span
                      className={`text-xs font-mono transition-colors ${
                        hasAnyActive ? 'text-text' : 'text-text/50'
                      }`}
                    >
                      {note.title || 'Untitled'}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {note.sections.map((section) => {
                        const active = isSectionActive(note.id, section.id)
                        return (
                          <button
                            key={section.id}
                            onClick={() => toggleSection(note.id, section.id)}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded transition-all"
                            style={
                              active
                                ? { ...getTagColor(section.name, sectionTagColors), opacity: 1, outline: '1px solid currentColor' }
                                : { ...getTagColor(section.name, sectionTagColors), opacity: 0.35 }
                            }
                          >
                            {section.name}
                          </button>
                        )
                      })}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <p className="text-[11px] font-mono text-text-muted/60 mt-3">
          {startupStickies.length > 0
            ? `${startupStickies.length} sticky window${startupStickies.length > 1 ? 's' : ''} will open on startup`
            : 'No tabs selected — app will start in tray'}
        </p>
      </div>
    </div>
  )
}
