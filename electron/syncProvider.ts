// SyncProvider — the common surface main.ts uses to route note/metadata writes,
// deletes and pulls to the active sync backend, extracted from what main.ts
// historically consumed from githubSync.ts.
//
// GitHub Sync and NoteFlow Cloud are MUTUALLY EXCLUSIVE: when cloudSync is
// enabled it takes priority and GitHub stops receiving writes (its connection
// settings are untouched). The Settings UI enforcement of "pick one" arrives in
// phase 4.2 stage 4 — until then getActiveSyncProvider() is the single source
// of truth for which backend is live.
//
// Both adapters are THIN: they delegate 1:1 to the module singletons without
// changing behavior. Backend-specific surface (Device Flow, remote format
// migration, cloud keys/unlock) intentionally stays OUT of the interface —
// main.ts keeps calling those modules directly through their own IPC handlers.

import * as githubSync from './githubSync'
import * as cloudSync from './cloudSync'

/** Result shape shared by both backends' pullNotes (paths in updatedFiles are note DIRS). */
export interface SyncPullResult {
  pulled: number
  deleted: number
  errors: string[]
  updatedFiles: string[]
  hadDeletions: boolean
  hadMetadataChanges: boolean
}

export interface SyncProvider {
  readonly id: 'github' | 'cloud'
  /** True when this backend is set up enough to receive pushes/deletes. */
  isConnected(): boolean
  /** Debounced per-file push; relPath is notes-dir-relative and the debounce key. */
  schedulePush(
    relPath: string,
    content: string,
    onStart?: () => void,
    onComplete?: (error?: string) => void
  ): void
  /** Awaited batch push reading from disk; does NOT bump lastSync (bulk imports / agentic writes). */
  pushPathsNow(notesDir: string, relPaths: string[]): Promise<{ pushed: number; errors: string[] }>
  /** Removes a single remote file (dropped section). */
  scheduleDelete(relPath: string): Promise<void>
  /** Removes a whole remote note directory (note deletion / expiry). */
  scheduleDeleteDir(dir: string): Promise<void>
  /** Full/incremental pull into the notes dir. */
  pullNotes(notesDir: string): Promise<SyncPullResult>
  /** Drains the journal of failed/pending remote mutations. */
  retrySyncJournal(notesDir: string): Promise<void>
  /** True while remote writes are in flight (auto-sync pulls stand down). */
  hasPendingRemoteMutations(): boolean
}

export const githubProvider: SyncProvider = {
  id: 'github',
  isConnected: () => githubSync.getSyncStatus().connected,
  schedulePush: (relPath, content, onStart, onComplete) =>
    githubSync.schedulePush(relPath, content, onStart, onComplete),
  pushPathsNow: (notesDir, relPaths) => githubSync.pushPathsNow(notesDir, relPaths),
  scheduleDelete: (relPath) => githubSync.scheduleDelete(relPath),
  scheduleDeleteDir: (dir) => githubSync.scheduleDeleteDir(dir),
  pullNotes: (notesDir) => githubSync.pullNotes(notesDir),
  retrySyncJournal: (notesDir) => githubSync.retrySyncJournal(notesDir),
  hasPendingRemoteMutations: () => githubSync.hasPendingRemoteMutations(),
}

export const cloudProvider: SyncProvider = {
  id: 'cloud',
  // "Connected" = enabled + a signed-in account. The key session may still be
  // locked — pushes gate themselves internally and stay journaled until unlock.
  isConnected: () => {
    const s = cloudSync.getCloudSyncStatus()
    return s.enabled && s.configured && s.signedIn
  },
  schedulePush: (relPath, content, onStart, onComplete) =>
    cloudSync.schedulePush(relPath, content, onStart, onComplete),
  pushPathsNow: (notesDir, relPaths) => cloudSync.pushPathsNow(notesDir, relPaths),
  scheduleDelete: (relPath) => cloudSync.scheduleDelete(relPath),
  scheduleDeleteDir: (dir) => cloudSync.scheduleDeleteDir(dir),
  pullNotes: (notesDir) => cloudSync.pullNotes(notesDir),
  retrySyncJournal: (notesDir) => cloudSync.retrySyncJournal(notesDir),
  hasPendingRemoteMutations: () => cloudSync.hasPendingRemoteMutations(),
}

/** The live backend: Cloud when enabled (priority), GitHub otherwise. */
export function getActiveSyncProvider(): SyncProvider {
  return cloudSync.isCloudSyncEnabled() ? cloudProvider : githubProvider
}
