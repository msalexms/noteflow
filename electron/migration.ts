/**
 * migration.ts — one-time, idempotent migration of the notes directory from
 * format v1 (one flat .md per note, sections inline in frontmatter) to v2
 * (one folder per note, one .md per section).
 *
 * Runs synchronously at startup BEFORE the initial GitHub pull and before the
 * fs watcher starts. Safe to re-run: flat files are converted with a
 * write→verify→unlink sequence, and the scan also catches stray flat files
 * dropped in later (e.g. by an old client) even when the marker exists.
 */
import fs from 'fs'
import path from 'path'
import {
  NOTE_MD,
  hasFormatMarker,
  parseLegacyNoteRaw,
  serializeNoteFolder,
  writeFormatMarker,
} from './noteFormat'

export interface MigrationResult {
  migrated: number
  errors: string[]
}

export function migrateNotesDirToV2(notesDir: string): MigrationResult {
  const result: MigrationResult = { migrated: 0, errors: [] }

  let entries: string[]
  try {
    entries = fs.readdirSync(notesDir)
  } catch {
    return result
  }

  const flatNotes = entries.filter((f) => f.endsWith('.md') && f !== 'README.md')

  for (const filename of flatNotes) {
    const flatPath = path.join(notesDir, filename)
    try {
      if (!fs.statSync(flatPath).isFile()) continue
      const raw = fs.readFileSync(flatPath, 'utf-8')
      const note = parseLegacyNoteRaw(raw)
      // The old stem is already '<slug>-<id>' — reuse it verbatim as the dir
      // name so identity is stable and re-runs land on the same folder.
      const dir = filename.replace(/\.md$/i, '')
      const dirPath = path.join(notesDir, dir)
      // Preserve `updated`: content didn't change, and bumping it would defeat
      // sync conflict resolution during the transition.
      const { files } = serializeNoteFolder(note, { preserveUpdated: true })

      fs.mkdirSync(dirPath, { recursive: true })
      for (const [file, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dirPath, file), content, 'utf-8')
      }
      // Verify before deleting the source (crash safety)
      const anchor = fs.readFileSync(path.join(dirPath, NOTE_MD), 'utf-8')
      if (!anchor.includes(`id: ${JSON.stringify(note.id)}`) && !anchor.includes(`id: ${note.id}`)) {
        throw new Error('post-write verification failed')
      }
      fs.unlinkSync(flatPath)
      result.migrated++
    } catch (err) {
      result.errors.push(`${filename}: ${String(err)}`)
      console.error(`[Migration] failed to migrate ${filename}:`, String(err))
    }
  }

  if (!hasFormatMarker(notesDir)) {
    try {
      writeFormatMarker(notesDir)
    } catch (err) {
      result.errors.push(`marker: ${String(err)}`)
    }
  }

  if (result.migrated > 0) {
    console.log(`[Migration] migrated ${result.migrated} note(s) to folder format v2`)
  }
  return result
}
