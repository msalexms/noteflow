import { contextBridge, ipcRenderer } from 'electron'

export type NoteDirRecord = {
  dir: string
  path: string
  noteMd: string
  sections: { file: string; content: string }[]
}

export type NoteWritePayload = {
  dir: string
  files: Record<string, string>
  deleteFiles: string[]
}

export type FsResult = { ok: boolean; error?: string }

const api = {
  // Identification
  windowId: (): number => ipcRenderer.sendSync('window:get-id'),

  // Platform — lets the renderer adapt shortcut labels (⌘ vs Ctrl), etc.
  platform: process.platform as NodeJS.Platform,

  // Real hardware info from the Node side (os module). Read synchronously from the
  // main process at preload load so the renderer can access it without async IPC: the
  // Brain store needs it at import time to decide 2D vs 3D. It must come from main
  // because the preload runs sandboxed (Electron 35 default) and node:os is not
  // available there. The browser's navigator.hardwareConcurrency (logical threads)
  // and navigator.deviceMemory (coarse, power-of-two, capped ~8) are too blunt to spot
  // low-power laptop chips; os.cpus() exposes the CPU model (with base clock) and
  // os.totalmem() the real RAM.
  hardware: ipcRenderer.sendSync('app:get-hardware'),

  // File system (folder-per-note: one dir per note, one .md per section)
  readAllNotes: (): Promise<NoteDirRecord[]> => ipcRenderer.invoke('fs:read-all-notes'),
  readNoteDir: (dir: string): Promise<NoteDirRecord | null> => ipcRenderer.invoke('fs:read-note-dir', dir),
  writeNote: (payload: NoteWritePayload): Promise<FsResult> =>
    ipcRenderer.invoke('fs:write-note', payload),
  deleteNote: (dir: string): Promise<FsResult> => ipcRenderer.invoke('fs:delete-note', dir),
  getNotesDir: (): Promise<string> => ipcRenderer.invoke('fs:notes-dir'),
  openNotesFolder: (): Promise<void> => ipcRenderer.invoke('app:open-notes-folder'),
  chooseNotesDir: (): Promise<string | null> => ipcRenderer.invoke('app:choose-notes-dir'),

  // Settings
  getTheme: (): string | null => ipcRenderer.sendSync('settings:get-theme'),
  setTheme: (id: string)      => ipcRenderer.send('settings:set-theme', id),
  getLanguage: (): 'en' | 'es' | 'system' => ipcRenderer.sendSync('settings:get-language'),
  setLanguage: (setting: 'en' | 'es' | 'system') => ipcRenderer.send('settings:set-language', setting),
  onLanguageChanged: (callback: (setting: 'en' | 'es' | 'system') => void) => {
    const wrapper = (_event: any, setting: 'en' | 'es' | 'system') => callback(setting)
    ipcRenderer.on('language-changed', wrapper)
    return () => ipcRenderer.removeListener('language-changed', wrapper)
  },
  getLoginItem: (): Promise<{ openAtLogin: boolean }> => ipcRenderer.invoke('app:get-login-item'),
  setLoginItem: (enabled: boolean): Promise<void> => ipcRenderer.invoke('app:set-login-item', enabled),
  getSkillSync: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke('app:get-skill-sync'),
  setSkillSync: (enabled: boolean): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('app:set-skill-sync', enabled),
  getStartupStickies: (): Promise<Array<{ noteId: string; sectionId: string }>> => ipcRenderer.invoke('settings:get-startup-stickies'),
  setStartupStickies: (stickies: Array<{ noteId: string; sectionId: string }>): Promise<void> => ipcRenderer.invoke('settings:set-startup-stickies', stickies),
  getUiState: (): Promise<{ activeNoteId?: string; activeSectionId?: string; collapsedGroupIds?: string[]; collapsedFolderIds?: string[] }> =>
    ipcRenderer.invoke('settings:get-ui-state'),
  setUiState: (patch: { activeNoteId?: string; activeSectionId?: string; collapsedGroupIds?: string[]; collapsedFolderIds?: string[] }): Promise<void> =>
    ipcRenderer.invoke('settings:set-ui-state', patch),
  getGroups: (): Promise<unknown[]> => ipcRenderer.invoke('groups:get'),
  setGroups: (groups: unknown[]): Promise<void> => ipcRenderer.invoke('groups:set', groups),
  getFolders: (): Promise<unknown[]> => ipcRenderer.invoke('folders:get'),
  setFolders: (folders: unknown[]): Promise<void> => ipcRenderer.invoke('folders:set', folders),
  getSectionTagColors: (): Promise<Record<string, string>> => ipcRenderer.invoke('section-colors:get'),
  setSectionTagColors: (colors: Record<string, string>): Promise<void> => ipcRenderer.invoke('section-colors:set', colors),
  getNoteOrder: (): Promise<Record<string, string[]>> => ipcRenderer.invoke('note-order:get'),
  setNoteOrder: (order: Record<string, string[]>): Promise<void> => ipcRenderer.invoke('note-order:set', order),
  getTemplates: (): Promise<unknown[]> => ipcRenderer.invoke('templates:get'),
  setTemplates: (templates: unknown[]): Promise<void> => ipcRenderer.invoke('templates:set', templates),

  // Window controls
  openSticky: (noteId: string, sectionId: string) => ipcRenderer.send('window:open-sticky', noteId, sectionId),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  setSize: (w: number, h: number, minW: number, minH: number) =>
    ipcRenderer.send('window:set-size', w, h, minW, minH),
  setAlwaysOnTop: (flag: boolean) =>
    ipcRenderer.send('window:set-always-on-top', flag),
  foldToCorner: (w: number, h: number) =>
    ipcRenderer.send('window:fold-to-corner', w, h),
  unfold: () => ipcRenderer.send('window:unfold'),

  // Updates
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  checkUpdate: (): Promise<{ hasUpdate: boolean; latestVersion?: string; downloadUrl?: string }> =>
    ipcRenderer.invoke('app:check-update'),
  openUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('app:open-url', url),
  downloadAndInstall: (url: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('app:download-and-install', url),
  onUpdateProgress: (callback: (percent: number) => void) => {
    const wrapper = (_event: any, percent: number) => callback(percent)
    ipcRenderer.on('update:download-progress', wrapper)
    return () => ipcRenderer.removeListener('update:download-progress', wrapper)
  },
  onUpdateInstalling: (callback: () => void) => {
    const wrapper = () => callback()
    ipcRenderer.on('update:installing', wrapper)
    return () => ipcRenderer.removeListener('update:installing', wrapper)
  },

  // Export / Import — .noteflow entries are v2 folder bundles { dir, files };
  // .md/.txt exports remain plain { filename, content } files.
  exportNotes: (entries: Array<{ filename: string; content: string }> | Array<{ dir: string; files: Record<string, string> }>, format: string, hint?: string): Promise<{ ok: boolean; filePath?: string; error?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('notes:export', entries, format, hint),
  parseImportFile: (): Promise<{ ok: boolean; file?: { version: number; exported: string; app: string; notes: Array<{ dir: string; files: Record<string, string> }> }; error?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('notes:parse-import-file'),
  parseExternalImport: (source: 'md-folder' | 'notion' | 'keep'): Promise<{
    ok: boolean
    source?: string
    notes?: Array<{ title: string; format: 'html' | 'md'; body: string; tags?: string[]; created?: string; archived?: boolean; favorited?: boolean; relPath: string[] }>
    error?: string
    canceled?: boolean
  }> =>
    ipcRenderer.invoke('notes:parse-external-import', source),
  writeImportedNotes: (entries: Array<{ dir: string; files: Record<string, string> }>): Promise<{ written: string[]; errors: string[] }> =>
    ipcRenderer.invoke('notes:write-imported', entries),

  // GitHub Sync
  getSyncStatus: (): Promise<{
    enabled: boolean
    connected: boolean
    owner?: string
    repo?: string
    lastSync?: string
    error?: string
    initialPullStatus: 'pending' | 'ok' | 'failed'
  }> => ipcRenderer.invoke('sync:get-status'),
  initiateGitHubAuth: (
    repo: string
  ): Promise<{ ok: boolean; userCode?: string; verificationUri?: string; error?: string }> =>
    ipcRenderer.invoke('sync:initiate', repo),
  cancelGitHubAuth: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('sync:cancel-auth'),
  disconnectGitHub: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('sync:disconnect'),
  pullNotes: (): Promise<{
    pulled: number
    deleted: number
    errors: string[]
    updatedFiles: string[]
    hadDeletions: boolean
    hadMetadataChanges: boolean
  }> => ipcRenderer.invoke('sync:pull'),
  onSyncAuthComplete: (
    cb: (result: { ok: boolean; owner?: string; repo?: string; error?: string }) => void
  ) => {
    const wrapper = (_event: any, result: { ok: boolean; owner?: string; repo?: string; error?: string }) => cb(result)
    ipcRenderer.on('sync-auth-complete', wrapper)
    return () => ipcRenderer.removeListener('sync-auth-complete', wrapper)
  },
  onSyncPushState: (cb: (state: 'pushing' | 'idle') => void) => {
    const wrapper = (_event: any, state: 'pushing' | 'idle') => cb(state)
    ipcRenderer.on('sync:push-state', wrapper)
    return () => ipcRenderer.removeListener('sync:push-state', wrapper)
  },
  onSyncStatusChanged: (cb: () => void) => {
    const wrapper = () => cb()
    ipcRenderer.on('sync:status-changed', wrapper)
    return () => ipcRenderer.removeListener('sync:status-changed', wrapper)
  },

  // NoteFlow account (Supabase Auth + entitlements) — public status only,
  // tokens never cross this bridge.
  getAccountStatus: (): Promise<{
    configured: boolean
    signedIn: boolean
    email?: string
    entitlements: { ai: boolean; cloud: boolean }
    entitlementsFetchedAt?: string
    aiCheckoutConfigured: boolean
  }> => ipcRenderer.invoke('account:get-status'),
  accountRequestOtp: (email: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('account:request-otp', email),
  accountVerifyOtp: (email: string, code: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('account:verify-otp', email, code),
  accountSignOut: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('account:sign-out'),
  accountRefreshEntitlements: (): Promise<{ ok: boolean; error?: string; entitlements: { ai: boolean; cloud: boolean } }> =>
    ipcRenderer.invoke('account:refresh-entitlements'),
  // Opens the subscription checkout in the browser; the URL (with the user id)
  // is built in main so the id never crosses the bridge.
  accountOpenCheckout: (product: 'ai'): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('account:open-checkout', product),
  onAccountStatusChanged: (
    cb: (status: {
      configured: boolean
      signedIn: boolean
      email?: string
      entitlements: { ai: boolean; cloud: boolean }
      entitlementsFetchedAt?: string
      aiCheckoutConfigured: boolean
    }) => void
  ) => {
    const wrapper = (_event: unknown, status: Parameters<typeof cb>[0]) => cb(status)
    ipcRenderer.on('account:status-changed', wrapper)
    return () => ipcRenderer.removeListener('account:status-changed', wrapper)
  },

  // Alarms
  scheduleAlarms: (alarms: Array<{ noteTitle: string; taskText: string; alarmAt: string }>) =>
    ipcRenderer.send('alarms:schedule', alarms),

  // AI / Semantic index
  getAiSettings: () => ipcRenderer.invoke('ai:get-settings'),
  setAiSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke('ai:set-settings', patch),
  aiRelated: (noteId: string, sectionId: string, k?: number) => ipcRenderer.invoke('ai:related', noteId, sectionId, k),
  aiSearch: (query: string, k?: number) => ipcRenderer.invoke('ai:search', query, k),
  aiGraph: () => ipcRenderer.invoke('ai:graph'),
  aiReindexAll: () => ipcRenderer.invoke('ai:reindex-all'),
  onAiReindexProgress: (cb: (progress: { done: number; total: number; phase: string }) => void) => {
    const wrapper = (_event: any, progress: { done: number; total: number; phase: string }) => cb(progress)
    ipcRenderer.on('ai:reindex-progress', wrapper)
    return () => ipcRenderer.removeListener('ai:reindex-progress', wrapper)
  },
  onAiIndexState: (cb: (state: 'idle' | 'indexing' | 'downloading-model') => void) => {
    const wrapper = (_event: any, state: 'idle' | 'indexing' | 'downloading-model') => cb(state)
    ipcRenderer.on('ai:index-state', wrapper)
    return () => ipcRenderer.removeListener('ai:index-state', wrapper)
  },

  // AI / LLM provider (chat + second brain)
  aiLlmGetConfig: () => ipcRenderer.invoke('ai:llm-get-config'),
  aiLlmPresets: () => ipcRenderer.invoke('ai:llm-presets'),
  aiLlmSetConfig: (patch: { active?: string; model?: string; baseUrl?: string; apiKey?: string; clearKey?: boolean }) =>
    ipcRenderer.invoke('ai:llm-set-config', patch),
  aiLlmListModels: () => ipcRenderer.invoke('ai:llm-list-models'),
  aiLlmTest: () => ipcRenderer.invoke('ai:llm-test'),
  aiChatsLoad: () => ipcRenderer.invoke('ai:chats-load'),
  aiChatsSave: (sessions: unknown) => ipcRenderer.invoke('ai:chats-save', sessions),
  aiChat: (requestId: string, messages: Array<{ role: string; content: string; attachmentIds?: string[] }>) =>
    ipcRenderer.invoke('ai:chat', { requestId, messages }),
  aiChatPickFiles: () => ipcRenderer.invoke('ai:chat-pick-files'),
  aiChatRemoveFile: (id: string) => ipcRenderer.invoke('ai:chat-remove-file', id),
  aiChatCancel: (requestId: string) => ipcRenderer.send('ai:chat-cancel', requestId),
  aiChatConfirm: (toolCallId: string, approved: boolean) =>
    ipcRenderer.send('ai:chat-confirm', { toolCallId, approved }),
  onAiChatToolCall: (cb: (p: { requestId: string; toolCallId: string; name: string; input: unknown; label: string }) => void) => {
    const wrapper = (_event: any, p: { requestId: string; toolCallId: string; name: string; input: unknown; label: string }) => cb(p)
    ipcRenderer.on('ai:chat-tool-call', wrapper)
    return () => ipcRenderer.removeListener('ai:chat-tool-call', wrapper)
  },
  onAiChatToolResult: (cb: (p: { requestId: string; toolCallId: string; status: string; summary: string }) => void) => {
    const wrapper = (_event: any, p: { requestId: string; toolCallId: string; status: string; summary: string }) => cb(p)
    ipcRenderer.on('ai:chat-tool-result', wrapper)
    return () => ipcRenderer.removeListener('ai:chat-tool-result', wrapper)
  },
  onAiChatConfirmRequest: (cb: (p: { requestId: string; toolCallId: string; name: string; input: unknown; target?: string }) => void) => {
    const wrapper = (_event: any, p: { requestId: string; toolCallId: string; name: string; input: unknown; target?: string }) => cb(p)
    ipcRenderer.on('ai:chat-confirm-request', wrapper)
    return () => ipcRenderer.removeListener('ai:chat-confirm-request', wrapper)
  },
  onAiChatDelta: (cb: (p: { requestId: string; delta: string }) => void) => {
    const wrapper = (_event: any, p: { requestId: string; delta: string }) => cb(p)
    ipcRenderer.on('ai:chat-delta', wrapper)
    return () => ipcRenderer.removeListener('ai:chat-delta', wrapper)
  },
  onAiChatSources: (cb: (p: { requestId: string; sources: Array<{ noteId: string; sectionId: string; title: string }> }) => void) => {
    const wrapper = (_event: any, p: { requestId: string; sources: Array<{ noteId: string; sectionId: string; title: string }> }) => cb(p)
    ipcRenderer.on('ai:chat-sources', wrapper)
    return () => ipcRenderer.removeListener('ai:chat-sources', wrapper)
  },
  onAiChatDone: (cb: (p: { requestId: string; aborted?: boolean }) => void) => {
    const wrapper = (_event: any, p: { requestId: string; aborted?: boolean }) => cb(p)
    ipcRenderer.on('ai:chat-done', wrapper)
    return () => ipcRenderer.removeListener('ai:chat-done', wrapper)
  },
  onAiChatError: (cb: (p: { requestId: string; error: string }) => void) => {
    const wrapper = (_event: any, p: { requestId: string; error: string }) => cb(p)
    ipcRenderer.on('ai:chat-error', wrapper)
    return () => ipcRenderer.removeListener('ai:chat-error', wrapper)
  },
  aiProfilePickFiles: () => ipcRenderer.invoke('ai:profile-pick-files'),
  aiProfileRemoveFile: (id: string) => ipcRenderer.invoke('ai:profile-remove-file', id),
  aiProfileGenerate: (req: { fields: Array<{ label: string; value: string; section?: string }>; fileIds: string[]; urls: string[]; locale?: string }) =>
    ipcRenderer.invoke('ai:profile-generate', req),
  aiProfileGetStatus: () => ipcRenderer.invoke('ai:profile-get-status'),
  aiProfileSetCompleted: (noteId?: string) => ipcRenderer.invoke('ai:profile-set-completed', noteId),

  // Events from main → renderer
  onNewNote: (cb: () => void) => {
    ipcRenderer.on('new-note', cb)
    return () => ipcRenderer.removeListener('new-note', cb)
  },
  onNotesUpdated: (cb: (filePath?: string, senderId?: number) => void) => {
    const wrapper = (_event: any, path?: string, senderId?: number) => cb(path, senderId)
    ipcRenderer.on('notes-updated', wrapper)
    return () => ipcRenderer.removeListener('notes-updated', wrapper)
  },
}

contextBridge.exposeInMainWorld('noteflow', api)
