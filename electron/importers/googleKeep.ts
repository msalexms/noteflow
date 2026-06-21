/** Google Keep importer — reads a Google Takeout export (.zip) of Keep notes. */
import AdmZip from 'adm-zip'
import type { ExternalNote } from './index'

interface KeepListItem { text?: string; isChecked?: boolean }
interface KeepLabel { name?: string }
interface KeepNote {
  title?: string
  textContent?: string
  listContent?: KeepListItem[]
  labels?: KeepLabel[]
  isArchived?: boolean
  isPinned?: boolean
  isTrashed?: boolean
  createdTimestampUsec?: number
  userEditedTimestampUsec?: number
}

function usecToIso(usec?: number): string | undefined {
  if (!usec || !Number.isFinite(usec)) return undefined
  const d = new Date(Math.round(usec / 1000))
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

/**
 * True if a parsed JSON looks like a Keep note. Google Takeout localizes the
 * folder name (Keep → "Conservar" in Spanish, etc.), so we can't filter by path
 * — instead we match every .json by its Keep-note shape.
 */
function isKeepNote(o: unknown): o is KeepNote {
  if (!o || typeof o !== 'object') return false
  const k = o as Record<string, unknown>
  return 'textContent' in k || 'listContent' in k || 'isTrashed' in k ||
    'isArchived' in k || 'isPinned' in k || 'userEditedTimestampUsec' in k
}

function buildBody(note: KeepNote): string {
  const parts: string[] = []
  if (note.textContent?.trim()) parts.push(note.textContent.trim())
  if (Array.isArray(note.listContent) && note.listContent.length) {
    const list = note.listContent
      .filter((i) => (i.text ?? '').trim().length > 0)
      .map((i) => `- [${i.isChecked ? 'x' : ' '}] ${i.text!.trim()}`)
      .join('\n')
    if (list) parts.push(list)
  }
  return parts.join('\n\n')
}

export function parseKeepZip(zipPath: string): ExternalNote[] {
  const zip = new AdmZip(zipPath)
  const notes: ExternalNote[] = []

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    // One .json per note (skip .html mirrors, attachments, Labels.txt). The Keep
    // folder name is localized, so match by content shape, not path.
    if (!/\.json$/i.test(entry.entryName)) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(entry.getData().toString('utf-8'))
    } catch {
      continue
    }
    if (!isKeepNote(parsed)) continue
    const note = parsed
    if (note.isTrashed) continue

    const body = buildBody(note)
    const title = (note.title ?? '').trim()
    if (!title && !body) continue   // truly empty note

    const tags = (note.labels ?? []).map((l) => l.name).filter((n): n is string => !!n)

    notes.push({
      title,
      format: 'md',
      body,
      tags: tags.length ? tags : undefined,
      created: usecToIso(note.createdTimestampUsec ?? note.userEditedTimestampUsec),
      archived: note.isArchived || undefined,
      favorited: note.isPinned || undefined,
      relPath: [],
    })
  }

  return notes
}
