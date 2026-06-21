/**
 * importers/ — external note-app importers (main process).
 *
 * These do IO only: read files / unzip, and emit a normalized intermediate
 * (`ExternalNote`). They do NOT serialize to the v2 folder format and do NOT
 * resolve groups — that happens in the renderer (ExportImportModal), which owns
 * the NoteFlow format helpers, the groups store, and the DOM-based HTML→markdown
 * converter (htmlToMarkdown needs DOMParser, unavailable in the main process).
 */

export type ImportSource = 'md-folder' | 'notion' | 'keep'

export interface ExternalNote {
  title: string
  /** 'html' bodies are converted to markdown in the renderer; 'md' are used as-is. */
  format: 'html' | 'md'
  body: string
  tags?: string[]
  created?: string        // ISO
  archived?: boolean
  favorited?: boolean
  /** Source folder segments (cleaned) → mapped to group/folder by the renderer. */
  relPath: string[]
}

export interface ExternalImportResult {
  source: ImportSource
  notes: ExternalNote[]
}

import { parseMarkdownFolder } from './markdownFolder'
import { parseNotionZip } from './notion'
import { parseKeepZip } from './googleKeep'

export function parseExternalSource(source: ImportSource, srcPath: string): ExternalImportResult {
  switch (source) {
    case 'md-folder': return { source, notes: parseMarkdownFolder(srcPath) }
    case 'notion':    return { source, notes: parseNotionZip(srcPath) }
    case 'keep':      return { source, notes: parseKeepZip(srcPath) }
    default:          throw new Error(`Unknown import source: ${source}`)
  }
}

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Decodes the handful of named/numeric HTML entities Notion puts in <title>. */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}

/** Extracts bare `#tags` from markdown text (skips `# heading` — those have a space after #). */
export function extractHashTags(text: string): string[] {
  const out = new Set<string>()
  const re = /(^|\s)#([A-Za-z][\w\-/]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.add(m[2])
  return [...out]
}
