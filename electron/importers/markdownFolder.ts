/** Markdown folder importer — recursively reads .md/.txt files. */
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import type { ExternalNote } from './index'
import { extractHashTags } from './index'

const TEXT_EXTS = new Set(['.md', '.markdown', '.txt'])
const SKIP_DIRS = new Set(['.obsidian', '.git', '.trash', 'node_modules'])

/** Splits leading `---\n...\n---` YAML frontmatter from the body (tolerates a UTF-8 BOM). */
function splitFrontmatter(raw: string): { fm: Record<string, unknown>; body: string } {
  const m = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { fm: {}, body: raw.replace(/^\uFEFF/, '') }
  let fm: Record<string, unknown> = {}
  try {
    const parsed = yaml.load(m[1])
    if (parsed && typeof parsed === 'object') fm = parsed as Record<string, unknown>
  } catch {
    return { fm: {}, body: raw.replace(/^\uFEFF/, '') }
  }
  return { fm, body: m[2] }
}

function firstHeading(body: string): string | null {
  const m = body.match(/^#{1,6}\s+(.+)$/m)
  return m ? m[1].trim() : null
}

function fmTags(fm: Record<string, unknown>): string[] {
  const t = fm.tags
  if (Array.isArray(t)) return t.map(String)
  if (typeof t === 'string') return t.split(/[,\s]+/).filter(Boolean)
  return []
}

function fmDate(fm: Record<string, unknown>): string | undefined {
  const v = fm.created ?? fm.date
  if (!v) return undefined
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function parseMarkdownFolder(rootDir: string): ExternalNote[] {
  const notes: ExternalNote[] = []

  function walk(dir: string, relSegments: string[]) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        walk(path.join(dir, entry.name), [...relSegments, entry.name])
        continue
      }
      const ext = path.extname(entry.name).toLowerCase()
      if (!TEXT_EXTS.has(ext)) continue
      let raw: string
      try {
        raw = fs.readFileSync(path.join(dir, entry.name), 'utf-8')
      } catch {
        continue
      }
      if (!raw.trim()) continue

      const { fm, body } = splitFrontmatter(raw)
      const filename = path.basename(entry.name, path.extname(entry.name))
      const title = String(fm.title ?? firstHeading(body) ?? filename).trim() || filename
      const tags = [...new Set([...fmTags(fm), ...extractHashTags(body)])]

      notes.push({
        title,
        format: 'md',
        body: body.trim(),
        tags: tags.length ? tags : undefined,
        created: fmDate(fm),
        relPath: relSegments,
      })
    }
  }

  walk(rootDir, [])
  return notes
}
