// A single section inside a note (user-defined, ordered)
export interface NoteSection {
  id: string       // nanoid — stable key for React
  name: string     // display label, user-editable
  content: string  // markdown body
  isRawMode?: boolean
}

// Legacy fixed type kept only for default section creation
export type NoteType = 'note' | 'task' | 'question'

export interface NoteEncryption {
  alg: 'aes-256-gcm+pbkdf2'
  salt: string        // base64url — PBKDF2 salt (length = saltBytes used at encrypt time)
  iv: string          // base64url, 12 bytes — AES-GCM nonce
  ciphertext: string  // base64url — ciphertext + 16-byte GCM tag
  iterations?: number               // PBKDF2 rounds; omitted when default (310_000)
  hashAlg?: 'SHA-256' | 'SHA-512'  // PBKDF2 hash; omitted when default ('SHA-256')
}

// ── Groups ────────────────────────────────────────────────────────────────────

// Same CSS var names as COLOR_VARS in tagColors.ts
export type GroupColor =
  '--accent' | '--accent-2' | '--red' | '--cyan' |
  '--purple' | '--text' | '--orange' | '--pink'

export interface NoteGroup {
  id: string        // nanoid(8)
  name: string      // user-visible label
  color: GroupColor // CSS var → rgb(var(<color>))
  order: number     // sort order ascending
  archived?: boolean // present iff group is archived (hidden unless "Show archived")
}

// A subfolder inside a group (single nesting level: group → folder → note)
export interface NoteFolder {
  id: string        // nanoid(8)
  name: string      // user-visible label
  groupId: string   // parent NoteGroup id
  order: number     // sort order ascending within the group
}

export interface NoteMeta {
  id: string
  title: string
  tags: string[]
  created: string
  updated: string
  archived: boolean
  favorited: boolean
  group?: string       // groupId — undefined = ungrouped
  folder?: string      // folderId — undefined = at group root (requires group)
  encryption?: NoteEncryption  // present iff note is encrypted
  expiresAt?: string   // ISO timestamp — present only on temporary notes
}

export interface Note extends NoteMeta {
  sections: NoteSection[]  // ordered, user-defined content areas
  raw: string              // content of note.md (frontmatter anchor)
  filePath: string         // absolute path of the note DIRECTORY
}

// On-disk folder record as returned by fs:read-all-notes / fs:read-note-dir
export interface NoteDirRecord {
  dir: string     // directory name ('<slug>-<id>')
  path: string    // absolute path of the note directory
  noteMd: string  // content of note.md
  sections: { file: string; content: string }[]  // sibling section files
}

// Multi-file write of a note directory (computed by buildNoteWritePayload)
export interface NoteWritePayload {
  dir: string                     // directory name (single path segment)
  files: Record<string, string>   // relative filename → content (includes note.md)
  deleteFiles: string[]           // relative filenames to remove (dropped sections)
}

// ── Export / Import ───────────────────────────────────────────────────────────

// v2: a note travels as its folder bundle (note.md + section files)
export interface NoteflowExportEntry {
  dir: string
  files: Record<string, string>
}

export interface NoteflowExportFile {
  version: 2
  exported: string   // ISO 8601
  app: 'noteflow'
  notes: NoteflowExportEntry[]
}

// Plain single-file export entry (.md / .txt formats)
export interface PlainExportEntry {
  filename: string
  content: string
}

export type ImportConflictStrategy = 'skip' | 'overwrite' | 'keep-both'

export interface ImportPreviewEntry {
  dir: string
  files: Record<string, string>
  parsedTitle: string
  parsedId: string
  conflict: 'none' | 'id' | 'dir'
  strategy: ImportConflictStrategy
}

// ── AI / Semantic index ───────────────────────────────────────────────────────

export interface AiSettings {
  enabled: boolean
  modelId: string
  lastIndexedModelId?: string | null
  chunking: 'section'
}

// A note surfaced as semantically related to the active section (powers the panel)
export interface RelatedNote {
  noteId: string
  title: string
  sectionId: string    // matching section in the related note (click navigates here)
  sectionName: string  // its tab label
  score: number
  snippet: string
}

// A single chunk-level hit from a semantic/hybrid search
export interface SemanticHit {
  noteId: string
  sectionId: string
  score: number
  snippet: string
}

// A content (semantic) edge between two notes — powers the brain graph's content layer
export interface GraphEdge {
  a: string   // noteId
  b: string   // noteId
  score: number
}

export type IndexState = 'idle' | 'indexing' | 'downloading-model'

export interface IndexProgress {
  done: number
  total: number
  phase: string
}

// ── AI / LLM provider (chat + second brain) ─────────────────────────────────────

// A provider preset (catalog entry) — the renderer renders the picker from these
export interface LlmPreset {
  id: string
  label: string
  impl: 'anthropic' | 'openai'
  baseUrl: string
  needsKey: boolean
  editableBaseUrl: boolean
  suggestedModels: string[]
}

// Renderer-safe view of the ACTIVE preset's config — never carries the API key
export interface LlmConfigPublic {
  active: string       // active preset id
  model: string
  baseUrl: string
  hasKey: boolean
  configured: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// A tool action the agent performed (or requested) during a chat turn
export interface ChatToolActivity {
  toolCallId: string
  name: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  summary?: string
}

// A destructive tool call awaiting the user's confirmation
export interface ChatPendingConfirm {
  requestId: string
  toolCallId: string
  name: string
  input: unknown
}

// A saved chat session (persisted locally in userData/ai-chats.json)
export interface ChatSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; error?: boolean; actions?: ChatToolActivity[] }>
}

// A note cited as a source for a chat answer (powers citations + brain illumination)
export interface ChatSource {
  noteId: string
  sectionId: string
  title: string
}

// Profile note generated by the LLM from the onboarding questionnaire
export interface GeneratedProfile {
  title: string
  sections: Array<{ name: string; content: string }>
}

// Extend window with our electron bridge
declare global {
  interface Window {
    noteflow: {
      readAllNotes: () => Promise<NoteDirRecord[]>
      readNoteDir: (dir: string) => Promise<NoteDirRecord | null>
      writeNote: (payload: NoteWritePayload) => Promise<{ ok: boolean; error?: string }>
      deleteNote: (dir: string) => Promise<{ ok: boolean; error?: string }>
      getNotesDir: () => Promise<string>
      openNotesFolder: () => Promise<void>
      chooseNotesDir: () => Promise<string | null>
      minimize: () => void
      maximize: () => void
      close: () => void
      setSize: (width: number, height: number, minWidth: number, minHeight: number) => void
      setAlwaysOnTop: (flag: boolean) => void
      foldToCorner: (width: number, height: number) => void
      unfold: () => void
      openSticky: (noteId: string, sectionId: string) => void
      onNewNote: (cb: () => void) => () => void
      onNotesUpdated: (cb: (filePath?: string, senderId?: number) => void) => () => void
      windowId: () => number
      getTheme: () => string | null
      setTheme: (id: string) => void
      getLoginItem: () => Promise<{ openAtLogin: boolean }>
      setLoginItem: (enabled: boolean) => Promise<void>
      getStartupStickies: () => Promise<Array<{ noteId: string; sectionId: string }>>
      setStartupStickies: (stickies: Array<{ noteId: string; sectionId: string }>) => Promise<void>
      getUiState: () => Promise<{ activeNoteId?: string; activeSectionId?: string; collapsedGroupIds?: string[]; collapsedFolderIds?: string[] }>
      setUiState: (patch: { activeNoteId?: string; activeSectionId?: string; collapsedGroupIds?: string[]; collapsedFolderIds?: string[] }) => Promise<void>
      getGroups: () => Promise<NoteGroup[]>
      setGroups: (groups: NoteGroup[]) => Promise<void>
      getFolders: () => Promise<NoteFolder[]>
      setFolders: (folders: NoteFolder[]) => Promise<void>
      getSectionTagColors: () => Promise<Record<string, GroupColor>>
      setSectionTagColors: (colors: Record<string, GroupColor>) => Promise<void>
      getNoteOrder: () => Promise<Record<string, string[]>>
      setNoteOrder: (order: Record<string, string[]>) => Promise<void>
      checkUpdate: () => Promise<{ hasUpdate: boolean; latestVersion?: string; downloadUrl?: string }>
      openUrl: (url: string) => Promise<void>
      downloadAndInstall: (url: string) => Promise<{ success: boolean; error?: string }>
      onUpdateProgress: (callback: (percent: number) => void) => void
      onUpdateInstalling: (callback: () => void) => void
      exportNotes: (entries: NoteflowExportEntry[] | PlainExportEntry[], format: string, hint?: string) => Promise<{ ok: boolean; filePath?: string; error?: string; canceled?: boolean }>
      parseImportFile: () => Promise<{ ok: boolean; file?: NoteflowExportFile; error?: string; canceled?: boolean }>
      writeImportedNotes: (entries: NoteflowExportEntry[]) => Promise<{ written: string[]; errors: string[] }>
      // GitHub Sync
      getSyncStatus: () => Promise<{ enabled: boolean; connected: boolean; owner?: string; repo?: string; lastSync?: string; error?: string; initialPullStatus: 'pending' | 'ok' | 'failed' }>
      initiateGitHubAuth: (repo: string) => Promise<{ ok: boolean; userCode?: string; verificationUri?: string; error?: string }>
      cancelGitHubAuth: () => Promise<{ ok: boolean }>
      disconnectGitHub: () => Promise<{ ok: boolean }>
      pullNotes: () => Promise<{
        pulled: number
        deleted: number
        errors: string[]
        updatedFiles: string[]
        hadDeletions: boolean
        hadMetadataChanges: boolean
      }>
      onSyncAuthComplete: (cb: (result: { ok: boolean; owner?: string; repo?: string; error?: string }) => void) => () => void
      onSyncPushState: (cb: (state: 'pushing' | 'idle') => void) => () => void
      onSyncStatusChanged: (cb: () => void) => () => void
      scheduleAlarms: (alarms: Array<{ noteTitle: string; taskText: string; alarmAt: string }>) => void
      // AI / Semantic index
      getAiSettings: () => Promise<AiSettings>
      setAiSettings: (patch: Partial<AiSettings>) => Promise<AiSettings>
      aiRelated: (noteId: string, sectionId: string, k?: number) => Promise<RelatedNote[]>
      aiSearch: (query: string, k?: number) => Promise<SemanticHit[]>
      aiGraph: () => Promise<GraphEdge[]>
      aiReindexAll: () => Promise<{ ok: boolean }>
      onAiReindexProgress: (cb: (progress: IndexProgress) => void) => () => void
      onAiIndexState: (cb: (state: IndexState) => void) => () => void
      // AI / LLM provider (chat + second brain)
      aiLlmGetConfig: () => Promise<LlmConfigPublic>
      aiLlmPresets: () => Promise<LlmPreset[]>
      aiLlmSetConfig: (patch: { active?: string; model?: string; baseUrl?: string; apiKey?: string; clearKey?: boolean }) => Promise<LlmConfigPublic>
      aiLlmListModels: () => Promise<{ ok: boolean; models: string[]; error?: string }>
      aiLlmTest: () => Promise<{ ok: boolean; error?: string }>
      aiChatsLoad: () => Promise<ChatSession[]>
      aiChatsSave: (sessions: ChatSession[]) => Promise<{ ok: boolean; error?: string }>
      aiChat: (requestId: string, messages: ChatMessage[]) => Promise<void>
      aiChatCancel: (requestId: string) => void
      aiChatConfirm: (toolCallId: string, approved: boolean) => void
      onAiChatToolCall: (cb: (p: { requestId: string; toolCallId: string; name: string; input: unknown }) => void) => () => void
      onAiChatToolResult: (cb: (p: { requestId: string; toolCallId: string; status: ChatToolActivity['status']; summary: string }) => void) => () => void
      onAiChatConfirmRequest: (cb: (p: ChatPendingConfirm) => void) => () => void
      onAiChatDelta: (cb: (p: { requestId: string; delta: string }) => void) => () => void
      onAiChatSources: (cb: (p: { requestId: string; sources: ChatSource[] }) => void) => () => void
      onAiChatDone: (cb: (p: { requestId: string; aborted?: boolean }) => void) => () => void
      onAiChatError: (cb: (p: { requestId: string; error: string }) => void) => () => void
      aiProfileGenerate: (answers: Array<{ question: string; answer: string }>, locale?: string) => Promise<{ ok: boolean; error?: string } & Partial<GeneratedProfile>>
      aiProfileGetStatus: () => Promise<{ completedAt: string | null }>
      aiProfileSetCompleted: () => Promise<{ ok: boolean }>
    }
  }
}
