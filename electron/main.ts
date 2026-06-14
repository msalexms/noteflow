import {
  app,
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
  dialog,
  net,
  screen,
  powerMonitor,
  Notification,
} from 'electron'
import path from 'path'
import fs from 'fs'
import https from 'https'
import os from 'os'
import { spawn } from 'child_process'
import { randomBytes } from 'crypto'
import * as githubSync from './githubSync'
import * as aiIndex from './ai/aiIndex'
import * as noteFormat from './noteFormat'
import { migrateNotesDirToV2 } from './migration'


function getIconPath(): string {
  if (process.platform === 'win32') return path.join(__dirname, '../public/icon.ico')
  // In dev, the icon lives in public/; in production Vite copies it to dist/
  // (only dist/ and dist-electron/ are packed into the ASAR, not public/)
  const dir = (app.isPackaged || process.env.NOTEFLOW_NATIVE) ? '../dist' : '../public'
  return path.join(__dirname, `${dir}/icon.png`)
}

const isDev = process.env.NODE_ENV === 'development' || (!app.isPackaged && !process.env.NOTEFLOW_NATIVE)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let autoSyncTimer: ReturnType<typeof setInterval> | null = null

// Track paths recently written by the app so fs.watch can ignore them.
// Keys are notes-dir-relative with forward slashes: '<dir>' or '<dir>/<file>'.
const recentInternalWrites = new Set<string>()
function markInternalWrite(relPath: string) {
  recentInternalWrites.add(relPath)
  setTimeout(() => recentInternalWrites.delete(relPath), 1500)
}

const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// ── Push state tracking ───────────────────────────────────────────────────────
// Tracks filenames whose debounced push is still pending or in-flight.
// When the set transitions from empty→non-empty or non-empty→empty we notify
// all renderer windows so the sync button can show an uploading indicator.
const pendingPushFiles = new Set<string>()

function notifyPushState(): void {
  const state: 'pushing' | 'idle' = pendingPushFiles.size > 0 ? 'pushing' : 'idle'
  BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('sync:push-state', state))
}

// ── Alarm engine ─────────────────────────────────────────────────────────────

interface AlarmEntry {
  noteTitle: string
  taskText:  string
  alarmAt:   string  // ISO timestamp 'YYYY-MM-DDTHH:MM:00'
}

const registeredAlarms = new Map<string, AlarmEntry>()
const firedAlarms      = new Set<string>()

function alarmKey(e: AlarmEntry): string {
  return `${e.alarmAt}|${e.noteTitle}|${e.taskText}`
}

function checkAlarms(): void {
  const now = new Date()
  for (const [key, entry] of registeredAlarms) {
    if (firedAlarms.has(key)) continue
    if (now >= new Date(entry.alarmAt)) {
      firedAlarms.add(key)
      try {
        if (Notification.isSupported()) {
          new Notification({
            title: `📅 ${entry.noteTitle}`,
            body:  entry.taskText,
            silent: false,
          }).show()
        }
      } catch (err) {
        console.error('[Alarms] Notification failed:', err)
      }
    }
  }
}

let alarmTimer: ReturnType<typeof setInterval> | null = null

function checkExpiredNotes(): void {
  try {
    const now = new Date()
    for (const dir of noteFormat.listNoteDirs(NOTES_DIR)) {
      const dirPath = path.join(NOTES_DIR, dir)
      try {
        const content = fs.readFileSync(path.join(dirPath, noteFormat.NOTE_MD), 'utf-8')
        const match = content.match(/^expiresAt:\s*(.+)$/m)
        if (!match) continue
        const raw = match[1].trim().replace(/^["']|["']$/g, '')
        const expiresAt = new Date(raw)
        if (isNaN(expiresAt.getTime()) || now < expiresAt) continue
        markInternalWrite(dir)
        try {
          for (const f of fs.readdirSync(dirPath)) markInternalWrite(`${dir}/${f}`)
        } catch { /* ignore */ }
        fs.rmSync(dirPath, { recursive: true, force: true })
        BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
        githubSync.scheduleDeleteDir(dir)
      } catch {
        // ignore per-note errors
      }
    }
  } catch (err) {
    console.error('[TempNotes] checkExpiredNotes failed:', err)
  }
}

function startAlarmEngine(): void {
  if (alarmTimer) return
  alarmTimer = setInterval(() => {
    checkAlarms()
    checkExpiredNotes()
  }, 60_000)
}

ipcMain.on('alarms:schedule', (_event, incoming: AlarmEntry[]) => {
  registeredAlarms.clear()
  for (const e of incoming) {
    registeredAlarms.set(alarmKey(e), e)
  }
  // Immediately fire any alarms that are already due (including missed ones)
  checkAlarms()
})

function emitSyncStatusChanged(): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('sync:status-changed')
  })
}

type PullResult = Awaited<ReturnType<typeof githubSync.pullNotes>>

function broadcastPullResult(result: PullResult): void {
  if (result.hadDeletions || result.hadMetadataChanges) {
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
  } else {
    for (const filePath of result.updatedFiles) {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('notes-updated', filePath, null)
      })
    }
  }
  emitSyncStatusChanged()
}

function startAutoSync(): void {
  if (autoSyncTimer) return
  autoSyncTimer = setInterval(async () => {
    if (!githubSync.getSyncStatus().connected) return
    try {
      const result = await githubSync.pullNotes(NOTES_DIR)
      broadcastPullResult(result)
    } catch (err) {
      console.error('[AutoSync] pull failed:', String(err))
      emitSyncStatusChanged()
    }
  }, AUTO_SYNC_INTERVAL_MS)
}

function stopAutoSync(): void {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer)
    autoSyncTimer = null
  }
}

const OLD_NOTES_DIR = path.join(os.homedir(), 'scratch-notes')

// On Linux, follow XDG Base Directory Specification using ~/.local/share as base.
// We intentionally avoid process.env.XDG_DATA_HOME because snap/flatpak runtimes
// override it to their sandboxed paths, which would make notes inaccessible outside
// the dev environment.
// NOTEFLOW_NOTES_DIR overrides the location (testing / scripting; mirrors the CLI).
const NOTES_DIR = process.env.NOTEFLOW_NOTES_DIR || (process.platform === 'linux'
  ? path.join(os.homedir(), '.local', 'share', 'noteflow-notes')
  : path.join(os.homedir(), 'noteflow-notes'))

// Migrate old ~/scratch-notes → new NOTES_DIR
if (fs.existsSync(OLD_NOTES_DIR) && !fs.existsSync(NOTES_DIR)) {
  fs.mkdirSync(path.dirname(NOTES_DIR), { recursive: true })
  fs.renameSync(OLD_NOTES_DIR, NOTES_DIR)
}

// On Linux: migrate legacy ~/noteflow-notes → ~/.local/share/noteflow-notes
if (process.platform === 'linux') {
  const legacyLinuxDir = path.join(os.homedir(), 'noteflow-notes')
  if (fs.existsSync(legacyLinuxDir) && !fs.existsSync(NOTES_DIR)) {
    fs.mkdirSync(path.dirname(NOTES_DIR), { recursive: true })
    fs.renameSync(legacyLinuxDir, NOTES_DIR)
  }
}

// Ensure notes directory exists
if (!fs.existsSync(NOTES_DIR)) {
  fs.mkdirSync(NOTES_DIR, { recursive: true })
}

const GROUPS_FILE = path.join(NOTES_DIR, 'groups.json')
const FOLDERS_FILE = path.join(NOTES_DIR, 'folders.json')
const SECTION_COLORS_FILE = path.join(NOTES_DIR, 'section-colors.json')
const NOTE_ORDER_FILE = path.join(NOTES_DIR, 'note-order.json')
const SECTION_COLOR_VALUES = new Set([
  '--accent',
  '--accent-2',
  '--red',
  '--cyan',
  '--purple',
  '--text',
  '--orange',
  '--pink',
])

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:'])
const ALLOWED_UPDATE_HOSTS = new Set(['github.com'])
const ALLOWED_UPDATE_REDIRECT_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
])

function normalizeSectionColorKey(name: string): string {
  return name.trim().toLowerCase()
}

function sanitizeSectionColors(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string' || !SECTION_COLOR_VALUES.has(value)) continue
    const normalizedKey = normalizeSectionColorKey(key)
    if (!normalizedKey) continue
    next[normalizedKey] = value
  }
  return next
}

// Root-level entries of the notes dir that can never be a note directory
const RESERVED_ROOT_NAMES = new Set([
  'groups.json',
  'folders.json',
  'section-colors.json',
  'note-order.json',
  'README.md',
  noteFormat.FORMAT_MARKER_FILE,
])

/** Validates a note directory name (accepts an absolute dir path; uses its basename). */
function ensureSafeDirname(dirOrPath: string): string {
  if (typeof dirOrPath !== 'string') throw new Error('Invalid note directory')
  const dir = path.basename(dirOrPath.replace(/[\\/]+$/, '')).trim()
  if (!dir || dir === '.' || dir === '..') throw new Error('Invalid note directory')
  if (dir.includes('/') || dir.includes('\\')) throw new Error('Invalid note directory')
  if (dir.startsWith('.') || RESERVED_ROOT_NAMES.has(dir)) throw new Error('Invalid note directory')
  if (dir.length > 160) throw new Error('Note directory name is too long')
  return dir
}

/** Validates a file name inside a note directory (note.md or a section .md). */
function ensureSafeNoteFile(file: string): string {
  if (typeof file !== 'string') throw new Error('Invalid note file name')
  const name = file.trim()
  if (!name || name === '.' || name === '..') throw new Error('Invalid note file name')
  if (name.includes('/') || name.includes('\\') || path.basename(name) !== name) throw new Error('Invalid note file name')
  if (!name.toLowerCase().endsWith('.md')) throw new Error('Only markdown note files are allowed')
  if (name.length > 160) throw new Error('Note file name is too long')
  return name
}

function parseHttpsUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl)
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null
    return parsed
  } catch {
    return null
  }
}

function isAllowedInitialUpdateUrl(url: URL): boolean {
  if (!ALLOWED_UPDATE_HOSTS.has(url.hostname)) return false
  const pathname = url.pathname.toLowerCase()
  if (!pathname.includes('/yagoid/noteflow/releases/')) return false
  return pathname.endsWith('.exe') || pathname.endsWith('.deb') || pathname.endsWith('.AppImage') || pathname.endsWith('.pkg.tar.zst')
}

function isAllowedRedirectUpdateUrl(url: URL): boolean {
  return ALLOWED_UPDATE_REDIRECT_HOSTS.has(url.hostname)
}

function createWindow(hidden = false): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1b26',
    titleBarStyle: 'hidden',
    show: false,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Prevent Chromium from throttling/killing the renderer while hidden in the
      // tray. Without this, the renderer can crash after suspend or prolonged idle,
      // leaving a blank window that requires a full process restart to recover.
      backgroundThrottling: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Reset any persisted zoom level — Chromium stores zoom preferences in the
  // user data directory; old versions set zoomFactor: scaleFactor which got
  // persisted, causing the app to appear zoomed even after that code was removed.
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(1)
  })

  win.once('ready-to-show', () => {
    if (hidden) return  // startup mode: stay hidden in tray
    win.show()
  })

  // Hide instead of close — keeps the process alive for fast re-open
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  // Auto-recover when the renderer process crashes or is killed by the OS
  // (common after system suspend/resume or prolonged idle under memory pressure).
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    console.error('[Renderer] Process gone:', details.reason, details.exitCode)
    if (isDev) {
      win.loadURL('http://localhost:5173')
    } else {
      win.loadFile(path.join(__dirname, '../dist/index.html'))
    }
    // After the reload, send notes-updated once the renderer is ready.
    // The powerMonitor.resume signals may have already been sent to the old
    // (now dead) renderer, so the new one needs its own trigger.
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (!win.isDestroyed()) win.webContents.send('notes-updated')
      }, 2000)
    })
  })

  win.on('unresponsive', () => {
    console.warn('[Renderer] Unresponsive — reloading')
    win.webContents.reload()
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (!win.isDestroyed()) win.webContents.send('notes-updated')
      }, 2000)
    })
  })

  return win
}

/**
 * Builds a pixel-accurate rounded-rectangle region using 1px horizontal strips.
 * Passed to win.setShape() so Windows DWM knows the true window shape —
 * CSS border-radius alone is ignored by the DWM when the window loses focus.
 */
function roundedRectRegion(w: number, h: number, r: number): { x: number; y: number; width: number; height: number }[] {
  const R = Math.min(r, Math.floor(w / 2), Math.floor(h / 2))
  const rects: { x: number; y: number; width: number; height: number }[] = []
  for (let y = 0; y < R; y++) {
    const d = R - y - 0.5
    const xOff = Math.max(0, R - Math.round(Math.sqrt(Math.max(0, R * R - d * d))))
    rects.push({ x: xOff, y, width: w - 2 * xOff, height: 1 })
    rects.push({ x: xOff, y: h - 1 - y, width: w - 2 * xOff, height: 1 })
  }
  if (h > 2 * R) {
    rects.push({ x: 0, y: R, width: w, height: h - 2 * R })
  }
  return rects
}

function applyStickyShape(win: BrowserWindow, w?: number, h?: number) {
  // win.setShape() is Windows-only (DWM); no-op on Linux/macOS
  if (process.platform !== 'win32') return
  const [ww, hh] = w !== undefined ? [w, h!] : win.getSize()
  // Use half-height for pills (folded state ≤40px), otherwise 8px (rounded-lg)
  const r = hh <= 40 ? Math.floor(hh / 2) : 8
  win.setShape(roundedRectRegion(ww, hh, r))
}

// Stores the pre-fold bounds per window so unfold can restore them exactly
const prevBoundsMap = new Map<number, { x: number; y: number; width: number; height: number }>()

// Tracks all open sticky windows to cascade their initial positions
const stickyWindows = new Set<BrowserWindow>()

// Tracks currently folded sticky windows to stack their pills vertically
const foldedWindows = new Set<BrowserWindow>()

function getFoldedPosition(display: Electron.Display, foldedW: number, _foldedH: number): { x: number; y: number } {
  const { x, y, width } = display.workArea
  const targetX = x + width - foldedW - 8
  const GAP = 4
  // Find the bottom edge of the lowest folded pill already in the corner
  let nextY = y + 40
  for (const w of foldedWindows) {
    if (w.isDestroyed()) continue
    const [wx, wy] = w.getPosition()
    const [, wh] = w.getSize()
    if (Math.abs(wx - targetX) < 20) {
      nextY = Math.max(nextY, wy + wh + GAP)
    }
  }
  return { x: targetX, y: nextY }
}

function getStickyInitialPosition(winWidth: number, _winHeight: number): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const { x: wa_x, y: wa_y, width: wa_w } = display.workArea
  const BASE_X = wa_x + Math.round((wa_w - winWidth) / 2)
  const BASE_Y = wa_y + 60
  const STEP = 30
  for (let i = 0; i < 20; i++) {
    const cx = BASE_X + i * STEP
    const cy = BASE_Y + i * STEP
    const overlaps = [...stickyWindows].some(w => {
      if (w.isDestroyed()) return false
      const [wx, wy] = w.getPosition()
      return Math.abs(wx - cx) < STEP && Math.abs(wy - cy) < STEP
    })
    if (!overlaps) return { x: cx, y: cy }
  }
  return { x: BASE_X, y: BASE_Y }
}

function animateStickyWindow(
  win: BrowserWindow,
  from: { x: number; y: number; width: number; height: number },
  to:   { x: number; y: number; width: number; height: number },
  duration: number,
  onComplete?: () => void
) {
  const startTime = Date.now()
  const fromR = from.height <= 40 ? Math.floor(from.height / 2) : 8
  const toR   = to.height   <= 40 ? Math.floor(to.height   / 2) : 8
  const tick = setInterval(() => {
    if (win.isDestroyed()) { clearInterval(tick); return }
    const t = Math.min((Date.now() - startTime) / duration, 1)
    const e = 1 - Math.pow(1 - t, 3)  // ease-out cubic
    const x = Math.round(from.x + (to.x - from.x) * e)
    const y = Math.round(from.y + (to.y - from.y) * e)
    const w = Math.round(from.width  + (to.width  - from.width)  * e)
    const h = Math.round(from.height + (to.height - from.height) * e)
    const r = Math.round(fromR + (toR - fromR) * e)
    win.setMinimumSize(1, 1)
    win.setSize(w, h)
    win.setPosition(x, y)
    if (process.platform === 'win32') win.setShape(roundedRectRegion(w, h, r))
    if (t >= 1) { clearInterval(tick); onComplete?.() }
  }, 16)
}

function createStickyWindow(noteId: string, sectionId: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 300,
    height: 300,
    minWidth: 200,
    minHeight: 200,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    show: false,
    alwaysOnTop: true,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Hash routing pattern for the sticky page
  const hash = `#sticky?noteId=${encodeURIComponent(noteId)}&sectionId=${encodeURIComponent(sectionId)}`

  if (isDev) {
    win.loadURL(`http://localhost:5173/${hash}`)
  } else {
    // In production, file:// URLs need the hash at the end
    win.loadFile(path.join(__dirname, '../dist/index.html'), { hash })
  }

  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(1)
  })

  // Apply the OS-level window shape so Windows DWM respects the rounded corners
  // even when the window loses focus (CSS border-radius is ignored by DWM).
  win.on('resize', () => applyStickyShape(win))
  win.on('closed', () => {
    prevBoundsMap.delete(win.id)
    stickyWindows.delete(win)
    foldedWindows.delete(win)
  })

  win.once('ready-to-show', () => {
    const { x, y } = getStickyInitialPosition(300, 300)
    win.setPosition(x, y)
    stickyWindows.add(win)
    applyStickyShape(win)
    win.show()
  })

  return win
}

function createTray() {
  const dir = (app.isPackaged || process.env.NOTEFLOW_NATIVE) ? '../dist' : '../public'
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, `${dir}/icon.ico`)
    : path.join(__dirname, `${dir}/tray-icon.png`)

  let icon: Electron.NativeImage = nativeImage.createFromPath(iconPath)

  // Resize to 16×16 so Windows renders it correctly in the system tray
  if (!icon.isEmpty()) {
    icon = icon.resize({ width: 16, height: 16 })
  } else {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('NoteFlow — quick notes')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open NoteFlow',
      click: () => toggleWindow(),
    },
    {
      label: 'New Note',
      accelerator: 'CmdOrCtrl+Shift+N',
      click: () => {
        showWindow()
        mainWindow?.webContents.send('new-note')
      },
    },
    { type: 'separator' },
    {
      label: 'Open notes folder',
      click: () => shell.openPath(NOTES_DIR).catch(err => console.error('Failed to open notes folder:', err)),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        mainWindow?.webContents.session.flushStorageData()
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => toggleWindow())
}

function showWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function toggleWindow() {
  if (!mainWindow) return
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide()
  } else {
    showWindow()
  }
}

/**
 * Watches the notes dir for external changes (CLI, sync from another device).
 * Events are normalized to '<dir>' or '<dir>/<file>' (forward slashes) and
 * debounced per note dir; the broadcast always carries the note DIRECTORY path
 * so the renderer re-reads the whole note. Root-level files (metadata json,
 * README, format marker, leftover flat .md) are ignored.
 *
 * Windows/macOS use native recursive watching. Node has no recursive fs.watch
 * on Linux, so there we watch the root (dir add/remove) plus one watcher per
 * note dir (file changes), refreshing the watcher set on root events.
 */
function startNotesWatcher(): void {
  const pendingWatchDebounce = new Map<string, ReturnType<typeof setTimeout>>()

  const broadcastAll = () =>
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
  const broadcastDir = (dir: string) => {
    const dirPath = path.join(NOTES_DIR, dir)
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated', dirPath, null))
  }

  const handleEvent = (rel: string | null) => {
    if (rel === null) {
      // Filename unavailable (inotify edge case) — full reload covers all cases
      const existing = pendingWatchDebounce.get('__all__')
      if (existing) clearTimeout(existing)
      pendingWatchDebounce.set('__all__', setTimeout(() => {
        pendingWatchDebounce.delete('__all__')
        broadcastAll()
      }, 150))
      return
    }

    const parts = rel.split('/')
    const dir = parts[0]
    // Root-level files (json/README/marker/flat .md) — note dirs never contain a dot
    if (parts.length === 1 && dir.includes('.')) return
    if (parts.length === 2 && !parts[1].endsWith('.md')) return
    if (parts.length > 2) return
    if (recentInternalWrites.has(rel) || recentInternalWrites.has(dir)) return

    // Debounce per note dir: a single save touches note.md + section files,
    // and fs.watch can fire multiple times per write (Windows). 150 ms lets
    // the multi-file write settle into ONE broadcast.
    const existing = pendingWatchDebounce.get(dir)
    if (existing) clearTimeout(existing)
    pendingWatchDebounce.set(dir, setTimeout(() => {
      pendingWatchDebounce.delete(dir)
      let isNoteDir = false
      try {
        isNoteDir = fs.existsSync(path.join(NOTES_DIR, dir, noteFormat.NOTE_MD))
      } catch { /* treat as gone */ }
      if (isNoteDir) broadcastDir(dir)
      else broadcastAll() // dir deleted/renamed (or not a note dir) — full reload covers it
    }, 150))
  }

  if (process.platform === 'linux') {
    const dirWatchers = new Map<string, fs.FSWatcher>()
    const watchDir = (dir: string) => {
      if (dirWatchers.has(dir)) return
      try {
        const w = fs.watch(path.join(NOTES_DIR, dir), { persistent: false }, (_t, filename) => {
          handleEvent(filename ? `${dir}/${filename}` : dir)
        })
        w.on('error', () => {
          dirWatchers.delete(dir)
          try { w.close() } catch { /* ignore */ }
        })
        dirWatchers.set(dir, w)
      } catch { /* dir vanished between scan and watch */ }
    }
    const refreshDirWatchers = () => {
      const current = new Set(noteFormat.listNoteDirs(NOTES_DIR))
      for (const dir of current) watchDir(dir)
      for (const [dir, w] of dirWatchers) {
        if (!current.has(dir)) {
          try { w.close() } catch { /* ignore */ }
          dirWatchers.delete(dir)
        }
      }
    }
    refreshDirWatchers()
    fs.watch(NOTES_DIR, { persistent: false }, (_t, filename) => {
      // A root event usually means a note dir appeared/disappeared
      setTimeout(refreshDirWatchers, 200)
      handleEvent(filename ? filename.replace(/\\/g, '/') : null)
    })
  } else {
    fs.watch(NOTES_DIR, { recursive: true, persistent: false }, (_t, filename) => {
      handleEvent(filename ? filename.replace(/\\/g, '/') : null)
    })
  }
}

function registerGlobalShortcut() {
  // Ctrl+Shift+Space — toggle window from anywhere
  const ret = globalShortcut.register('CommandOrControl+Shift+Space', () => {
    toggleWindow()
  })
  if (!ret) {
    console.error('Failed to register global shortcut Ctrl+Shift+Space')
    // Update tray tooltip so the user knows the shortcut is unavailable
    // (common on Linux when an input method or another app captures it)
    tray?.setToolTip('NoteFlow — shortcut unavailable (Ctrl+Shift+Space)')
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('fs:read-note-dir', (_event, dir: string) => {
  try {
    const safeDir = ensureSafeDirname(dir)
    return noteFormat.readNoteDirRecord(NOTES_DIR, safeDir)
  } catch {
    return null
  }
})

interface NoteWritePayload {
  dir: string
  files: Record<string, string>
  deleteFiles?: string[]
}

ipcMain.handle('fs:write-note', (event, payload: NoteWritePayload) => {
  try {
    const dir = ensureSafeDirname(payload.dir)
    const dirPath = path.join(NOTES_DIR, dir)

    // Validate everything before touching disk
    const writes = Object.entries(payload.files ?? {}).map(([f, content]) => {
      if (typeof content !== 'string') throw new Error('Invalid note file content')
      return [ensureSafeNoteFile(f), content] as const
    })
    const deletes = (payload.deleteFiles ?? []).map((f) => ensureSafeNoteFile(f))
    if (writes.length === 0) throw new Error('Empty note write')

    fs.mkdirSync(dirPath, { recursive: true })
    markInternalWrite(dir)
    for (const [f] of writes) markInternalWrite(`${dir}/${f}`)
    for (const f of deletes) markInternalWrite(`${dir}/${f}`)

    // note.md first so a crash mid-write always leaves a consistent anchor
    writes.sort(([a], [b]) => (a === noteFormat.NOTE_MD ? -1 : b === noteFormat.NOTE_MD ? 1 : 0))
    for (const [f, content] of writes) {
      fs.writeFileSync(path.join(dirPath, f), content, 'utf-8')
    }
    for (const f of deletes) {
      try { fs.unlinkSync(path.join(dirPath, f)) } catch { /* already gone */ }
    }

    // Single broadcast per note write — the renderer re-reads the whole dir
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('notes-updated', dirPath, event.sender.id)
    })

    const connected = githubSync.getSyncStatus().connected
    for (const [f, content] of writes) {
      const relPath = `${dir}/${f}`
      if (connected) {
        githubSync.schedulePush(relPath, content,
          () => { pendingPushFiles.add(relPath); notifyPushState() },
          () => { pendingPushFiles.delete(relPath); notifyPushState() }
        )
      } else {
        githubSync.schedulePush(relPath, content)
      }
    }
    for (const f of deletes) githubSync.scheduleDelete(`${dir}/${f}`)

    // Keep the semantic index up to date (debounced; no-op when AI is disabled).
    if (aiIndex.isEnabled()) aiIndex.scheduleIndex(dirPath)
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('fs:delete-note', (_event, dirOrPath: string) => {
  try {
    const dir = ensureSafeDirname(dirOrPath)
    const dirPath = path.join(NOTES_DIR, dir)
    markInternalWrite(dir)
    try {
      for (const f of fs.readdirSync(dirPath)) markInternalWrite(`${dir}/${f}`)
    } catch { /* ignore */ }
    fs.rmSync(dirPath, { recursive: true, force: true })
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('notes-updated')
    })
    githubSync.scheduleDeleteDir(dir)
    aiIndex.removeFromIndex(dirPath)
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('fs:read-all-notes', async () => {
  // Do NOT catch outer errors — let them propagate so the renderer can
  // distinguish a genuine empty directory from a transient FS failure.
  // On Windows, readdirSync can return [] without throwing when the filesystem
  // isn't ready yet (e.g. OS waking from sleep, app starting at boot).
  // Retry so we don't mistake a transient empty result for no notes.
  let dirs: string[] = []
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await new Promise<void>((r) => setTimeout(r, 800))
    dirs = noteFormat.listNoteDirs(NOTES_DIR)
    if (dirs.length > 0) break
  }
  return dirs
    .map((dir) => noteFormat.readNoteDirRecord(NOTES_DIR, dir))
    .filter((rec): rec is noteFormat.NoteDirRecord => rec !== null)
})

ipcMain.handle('fs:notes-dir', () => NOTES_DIR)

ipcMain.handle('app:open-notes-folder', () =>
  shell.openPath(NOTES_DIR).catch(err => console.error('Failed to open notes folder:', err))
)

ipcMain.handle('app:check-update', () => {
  // if (!app.isPackaged) return { hasUpdate: false }
  return new Promise((resolve) => {
    const req = https.get(
      'https://api.github.com/repos/yagoid/noteflow/releases/latest',
      { headers: { 'User-Agent': 'NoteFlow-App' } },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            const latest = json.tag_name?.replace(/^v/, '')
            const current = app.getVersion()
            const hasUpdate = latest && latest !== current
            let downloadUrl: string
            if (process.platform === 'linux') {
              // Match the package manager to the distro: pacman on Arch-based,
              // deb on Debian-based, AppImage as the universal fallback.
              const isArchBased = fs.existsSync('/etc/arch-release') ||
                                 fs.existsSync('/etc/cachyos-release') ||
                                 fs.existsSync('/usr/bin/pacman')
              const isDebBased = fs.existsSync('/etc/debian_version') ||
                                 fs.existsSync('/usr/bin/dpkg')
              if (isArchBased) {
                downloadUrl = `https://github.com/yagoid/noteflow/releases/latest/download/noteflow-${latest}-x86_64.pkg.tar.zst`
              } else if (isDebBased) {
                downloadUrl = `https://github.com/yagoid/noteflow/releases/latest/download/noteflow_${latest}_amd64.deb`
              } else {
                // Use AppImage as universal Linux format (works on all distros)
                downloadUrl = `https://github.com/yagoid/noteflow/releases/latest/download/NoteFlow-${latest}-x86_64.AppImage`
              }
            } else {
              downloadUrl = `https://github.com/yagoid/noteflow/releases/latest/download/NoteFlow-${latest}-Setup.exe`
            }
            resolve({ hasUpdate, latestVersion: latest, downloadUrl })
          } catch {
            resolve({ hasUpdate: false })
          }
        })
      }
    )
    req.on('error', () => resolve({ hasUpdate: false }))
    req.setTimeout(8000, () => { req.destroy(); resolve({ hasUpdate: false }) })
  })
})

ipcMain.handle('app:open-url', (_event, rawUrl: string) => {
  const parsed = parseHttpsUrl(rawUrl)
  if (!parsed) {
    console.warn('[Security] Blocked external URL:', rawUrl)
    return
  }
  shell.openExternal(parsed.toString()).catch((err) => {
    console.error('Failed to open external URL:', err)
  })
})

ipcMain.handle('app:download-and-install', async (_event, url: string) => {
  try {
    const initialUrl = parseHttpsUrl(url)
    if (!initialUrl || !isAllowedInitialUpdateUrl(initialUrl)) {
      throw new Error('Blocked update URL')
    }

    const response = await net.fetch(initialUrl.toString())
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    if (response.url) {
      const finalUrl = parseHttpsUrl(response.url)
      if (!finalUrl || !isAllowedRedirectUpdateUrl(finalUrl)) {
        throw new Error(`Blocked redirected update URL: ${response.url}`)
      }
    }

    const tmpDir = app.getPath('temp')
    const fileName = path.basename(initialUrl.pathname) || 'NoteFlow-update.exe'
    const dest = path.join(tmpDir, fileName)

    const total = parseInt(response.headers.get('content-length') || '0')
    let downloaded = 0
    const writer = fs.createWriteStream(dest)
    const reader = response.body!.getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      writer.write(Buffer.from(value))
      downloaded += value.length
      const percent = total ? Math.round((downloaded / total) * 100) : -1
      BrowserWindow.getAllWindows().forEach(w =>
        w.webContents.send('update:download-progress', percent)
      )
    }

    await new Promise<void>((resolve, reject) => {
      writer.end()
      writer.on('finish', resolve)
      writer.on('error', reject)
    })

    // Download done — signal the install phase so the UI can show "Installing…"
    // for the brief moment before the app quits/relaunches. (spawn below is
    // instantaneous on Windows, so we can't derive this from the 100% progress.)
    BrowserWindow.getAllWindows().forEach(w =>
      w.webContents.send('update:installing')
    )

    if (process.platform === 'linux') {
      // Detect package type from filename
      const isPacman = dest.endsWith('.pkg.tar.zst') || dest.endsWith('.pacman')
      const isDeb = dest.endsWith('.deb')

      if (isDeb) {
        await new Promise<void>((resolve) => {
          const proc = spawn('pkexec', ['dpkg', '-i', dest], { stdio: 'ignore' })
          proc.on('error', () => {
            // pkexec not available, fall back to xdg-open
            shell.openPath(dest)
            resolve()
          })
          proc.on('close', (code) => {
            if (code === 0) {
              app.relaunch()
              app.quit()
            }
            resolve()
          })
        })
      } else if (isPacman) {
        await new Promise<void>((resolve) => {
          const proc = spawn('pkexec', ['pacman', '-U', '--noconfirm', dest], { stdio: 'ignore' })
          proc.on('error', () => {
            // pkexec not available, fall back to xdg-open
            shell.openPath(dest)
            resolve()
          })
          proc.on('close', (code) => {
            if (code === 0) {
              app.relaunch()
              app.quit()
            }
            resolve()
          })
        })
      } else {
        // AppImage: replace the running AppImage in place and relaunch.
        // process.env.APPIMAGE holds the absolute path of the AppImage the user
        // launched (set by the AppImage runtime). No root needed: it lives in the
        // user's space.
        const appImagePath = process.env.APPIMAGE
        if (appImagePath) {
          try {
            const dir = path.dirname(appImagePath)
            const tmpTarget = path.join(dir, `.${path.basename(appImagePath)}.new`)
            // Copy into the target dir, then atomic rename. The rename leaves the
            // currently-running inode untouched (the FUSE mount keeps working) and
            // points the path at the new file — never overwrite the mounted file
            // in place, that would corrupt the running process.
            fs.copyFileSync(dest, tmpTarget)
            fs.chmodSync(tmpTarget, 0o755)
            fs.renameSync(tmpTarget, appImagePath)
            app.relaunch({ execPath: appImagePath })
            app.quit()
          } catch (err) {
            console.error('AppImage in-place update failed, opening file:', err)
            await shell.openPath(dest)
          }
        } else {
          // Not running from an AppImage (dev / unusual packaging) — just open it.
          await shell.openPath(dest)
        }
      }
    } else {
      // Windows: run the NSIS installer with --updated (NOT /S). This keeps the
      // installer's native progress window visible while skipping the "please close
      // the application" popup: electron-builder's app-running check auto-closes the
      // running instance (no MessageBox) when the --updated flag is set. --force-run
      // relaunches NoteFlow when done. We also app.quit() ourselves so the exit is
      // graceful and prompt — otherwise the installer would force-kill us after a
      // retry, since our window-close hides to tray instead of quitting. detached+unref
      // keep the installer alive after we exit. (per-user NSIS install → no UAC.)
      const installer = spawn(dest, ['--updated', '--force-run'], {
        detached: true,
        stdio: 'ignore',
      })
      installer.unref()
      setTimeout(() => app.quit(), 1000)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('app:choose-notes-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Choose notes folder',
  })
  return result.canceled ? null : result.filePaths[0]
})

// For 'md'/'txt' the entries are plain { filename, content } files; for
// '.noteflow'/'json' they are v2 folder bundles { dir, files } dumped as JSON.
ipcMain.handle('notes:export', async (_event, entries: Array<{ filename: string; content: string }> | Array<{ dir: string; files: Record<string, string> }>, format: string, hint?: string) => {
  try {
    const safeHint = hint
      ? hint.replace(/[^a-z0-9 ._-]/gi, '').trim().replace(/\s+/g, '-') || 'note'
      : null

    if (format === 'txt' || format === 'md') {
      const plain = entries as Array<{ filename: string; content: string }>
      if (plain.length === 1) {
        const defaultName = safeHint ? `${safeHint}.${format}` : plain[0].filename
        const result = await dialog.showSaveDialog(mainWindow!, {
          title: 'Export note',
          defaultPath: path.join(os.homedir(), defaultName),
          filters: [{ name: format === 'txt' ? 'Plain Text' : 'Markdown', extensions: [format] }],
        })
        if (result.canceled || !result.filePath) return { ok: false, canceled: true }
        fs.writeFileSync(result.filePath, plain[0].content, 'utf-8')
        return { ok: true, filePath: result.filePath }
      } else {
        const result = await dialog.showOpenDialog(mainWindow!, {
          title: 'Choose destination folder',
          properties: ['openDirectory'],
        })
        if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }
        const dir = result.filePaths[0]
        for (const entry of plain) {
          fs.writeFileSync(path.join(dir, entry.filename), entry.content, 'utf-8')
        }
        return { ok: true, filePath: dir }
      }
    }

    // .noteflow (default)
    const dateStr = new Date().toISOString().slice(0, 10)
    const defaultNoteflowName = safeHint
      ? `${safeHint}.noteflow`
      : `noteflow-export-${dateStr}.noteflow`
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export notes',
      defaultPath: path.join(os.homedir(), defaultNoteflowName),
      filters: [
        { name: 'NoteFlow Export', extensions: ['noteflow'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    })
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true, error: 'Canceled' }
    }
    const exportFile = {
      version: 2,
      exported: new Date().toISOString(),
      app: 'noteflow',
      notes: entries,
    }
    fs.writeFileSync(result.filePath, JSON.stringify(exportFile, null, 2), 'utf-8')
    return { ok: true, filePath: result.filePath }
  } catch (err: unknown) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('notes:parse-import-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Import notes',
      filters: [
        { name: 'All supported', extensions: ['noteflow', 'json', 'txt', 'md'] },
        { name: 'NoteFlow Export', extensions: ['noteflow', 'json'] },
        { name: 'Text / Markdown', extensions: ['txt', 'md'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, canceled: true, error: 'Canceled' }
    }

    const filePath = result.filePaths[0]
    const ext = path.extname(filePath).toLowerCase().slice(1)

    if (ext === 'txt' || ext === 'md') {
      const textContent = fs.readFileSync(filePath, 'utf-8')
      const title = path.basename(filePath, path.extname(filePath))
      const id = randomBytes(4).toString('hex')
      const secId = randomBytes(3).toString('hex')
      const now = new Date().toISOString()
      const slug = title.replace(/[^a-z0-9 ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'note'
      const { files } = noteFormat.serializeNoteFolder({
        id,
        title,
        tags: [],
        created: now,
        updated: now,
        sections: [{ id: secId, name: 'Note', content: textContent, isRawMode: true }],
      })
      return {
        ok: true,
        file: {
          version: 2,
          exported: now,
          app: 'noteflow',
          notes: [{ dir: `${slug}-${id}`, files }],
        },
      }
    }

    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed.app !== 'noteflow' || !Array.isArray(parsed.notes)) {
      return { ok: false, error: 'Invalid .noteflow file format' }
    }
    if (parsed.version === 2) {
      return { ok: true, file: parsed }
    }
    if (parsed.version === 1) {
      // Old export: each entry is one flat .md with inline sections — convert
      // to a v2 folder bundle so the rest of the pipeline only sees v2.
      const notes: Array<{ dir: string; files: Record<string, string> }> = []
      for (const entry of parsed.notes as Array<{ filename?: string; content?: string }>) {
        if (typeof entry?.filename !== 'string' || typeof entry?.content !== 'string') continue
        const note = noteFormat.parseLegacyNoteRaw(entry.content)
        const dir = entry.filename.replace(/\.md$/i, '')
        const { files } = noteFormat.serializeNoteFolder(note, { preserveUpdated: true })
        notes.push({ dir, files })
      }
      return { ok: true, file: { version: 2, exported: String(parsed.exported ?? ''), app: 'noteflow', notes } }
    }
    return { ok: false, error: 'Unsupported .noteflow version' }
  } catch (err: unknown) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('notes:write-imported', async (_event, entries: Array<{ dir: string; files: Record<string, string> }>) => {
  const written: string[] = []
  const errors: string[] = []
  const connected = githubSync.getSyncStatus().connected
  for (const entry of entries) {
    try {
      const dir = ensureSafeDirname(entry.dir)
      const writes = Object.entries(entry.files ?? {}).map(([f, content]) => {
        if (typeof content !== 'string') throw new Error('Import content must be a string')
        return [ensureSafeNoteFile(f), content] as const
      })
      if (!writes.some(([f]) => f === noteFormat.NOTE_MD)) throw new Error('Imported note is missing note.md')
      const dirPath = path.join(NOTES_DIR, dir)
      fs.mkdirSync(dirPath, { recursive: true })
      markInternalWrite(dir)
      for (const [f, content] of writes) {
        markInternalWrite(`${dir}/${f}`)
        fs.writeFileSync(path.join(dirPath, f), content, 'utf-8')
        if (connected) githubSync.schedulePush(`${dir}/${f}`, content)
      }
      written.push(dir)
    } catch (err) {
      errors.push(`${entry.dir}: ${String(err)}`)
    }
  }
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('notes-updated')
  })
  return { written, errors }
})

// ── GitHub Sync ───────────────────────────────────────────────────────────────

ipcMain.handle('sync:get-status', () => {
  return githubSync.getSyncStatus()
})

ipcMain.handle('sync:initiate', async (_event, repo: string) => {
  return githubSync.initiateDeviceFlow(repo, NOTES_DIR, (result) => {
    BrowserWindow.getAllWindows().forEach((win) =>
      win.webContents.send('sync-auth-complete', result)
    )
    if (result.ok) {
      BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
      startAutoSync()
      // Fresh connection: make sure the remote carries the v2 format marker
      // (and convert any v1 leftovers if connecting to an old notes repo).
      githubSync.migrateRemoteToV2IfNeeded(NOTES_DIR).catch((err) => {
        console.error('[Sync] remote format migration failed:', String(err))
      })
    }
  })
})

ipcMain.handle('sync:cancel-auth', () => {
  githubSync.cancelDeviceFlow()
  return { ok: true }
})

ipcMain.handle('sync:disconnect', () => {
  stopAutoSync()
  githubSync.disconnectGitHub()
  return { ok: true }
})

ipcMain.handle('sync:pull', async () => {
  const result = await githubSync.pullNotes(NOTES_DIR)
  // Guarded no-op once the remote is already on format v2
  githubSync.migrateRemoteToV2IfNeeded(NOTES_DIR).catch((err) => {
    console.error('[Sync] remote format migration failed:', String(err))
  })
  if (result.hadDeletions || result.hadMetadataChanges || result.pulled === 0) {
    // Full reload: covers deletions AND the case where the file was already on disk
    // (written by auto-sync) but the UI missed the event — manual sync should always
    // bring the store in sync with disk.
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
  } else {
    for (const filePath of result.updatedFiles) {
      BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated', filePath, null))
    }
  }
  return result
})

// ── Settings (userData/settings.json) ────────────────────────────────────────

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf-8'))
  } catch {
    return {}
  }
}

function writeSettings(data: Record<string, unknown>): void {
  fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify(data), 'utf-8')
}

// ── AI / Semantic index ───────────────────────────────────────────────────────

function readAiSettings(): aiIndex.AiSettings {
  const raw = (readSettings().ai ?? {}) as Partial<aiIndex.AiSettings>
  return { ...aiIndex.DEFAULT_AI_SETTINGS, ...raw }
}

function writeAiSettings(next: aiIndex.AiSettings): void {
  const settings = readSettings()
  settings.ai = next
  writeSettings(settings)
}

function emitAiState(state: string): void {
  BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('ai:index-state', state))
}

function emitAiProgress(progress: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('ai:reindex-progress', progress))
}

ipcMain.handle('ai:get-settings', () => readAiSettings())

ipcMain.handle('ai:set-settings', async (_event, patch: Partial<aiIndex.AiSettings>) => {
  const prev = readAiSettings()
  const next = { ...prev, ...patch }
  try {
    await aiIndex.applySettings(next)
    writeAiSettings(next) // persist only once activation/teardown actually succeeded
    return next
  } catch (err) {
    // Activation failed (e.g. model download/load error). Roll the in-memory settings back so a
    // retry re-triggers activation instead of silently no-op'ing (a persisted enabled:true would
    // make applySettings skip the load+reindex). Surface the error to the renderer.
    aiIndex.primeSettings(prev)
    throw err
  }
})

ipcMain.handle('ai:related', (_event, noteId: string, sectionId: string, k?: number) => aiIndex.related(noteId, sectionId, k))
ipcMain.handle('ai:search', (_event, query: string, k?: number) => aiIndex.search(query, k))
ipcMain.handle('ai:graph', () => aiIndex.graph())
ipcMain.handle('ai:reindex-all', () => aiIndex.reindexAll())

ipcMain.on('settings:get-theme', (event) => {
  event.returnValue = readSettings().theme ?? null
})

ipcMain.on('settings:set-theme', (_event, themeId: string) => {
  const settings = readSettings()
  settings.theme = themeId
  writeSettings(settings)
})

ipcMain.handle('app:get-login-item', () => {
  const openAtLogin = (readSettings().openAtLogin ?? false) as boolean
  return { openAtLogin }
})

function applyLoginItemSettings(enabled: boolean): void {
  if (process.platform === 'linux') {
    // On Linux, manually manage the autostart .desktop file so that the
    // --noteflow-startup arg is reliably included. app.setLoginItemSettings
    // depends on finding the system .desktop file as a template and may drop
    // the args if the file name/path doesn't match exactly.
    const autostartDir = path.join(os.homedir(), '.config', 'autostart')
    const desktopFile = path.join(autostartDir, 'noteflow.desktop')
    if (enabled) {
      fs.mkdirSync(autostartDir, { recursive: true })
      const content = [
        '[Desktop Entry]',
        'Type=Application',
        'Name=NoteFlow',
        'Comment=Fast notes for software engineers',
        `Exec=${process.execPath} --noteflow-startup`,
        'Hidden=false',
        'NoDisplay=false',
        'X-GNOME-Autostart-enabled=true',
        // Wait for the Wayland compositor and GNOME Shell to finish their
        // startup animations before NoteFlow tries to map windows.
        // 15 s covers even slower machines; sticky windows that appear
        // during the login animation are immediately hidden by the shell.
        'X-GNOME-Autostart-Delay=15',
      ].join('\n') + '\n'
      fs.writeFileSync(desktopFile, content, 'utf-8')
    } else {
      try { fs.unlinkSync(desktopFile) } catch { /* already gone */ }
    }
  } else {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: enabled ? ['--noteflow-startup'] : [],
    })
  }
}

ipcMain.handle('app:set-login-item', (_event, enabled: boolean) => {
  const settings = readSettings()
  settings.openAtLogin = enabled
  writeSettings(settings)
  try {
    applyLoginItemSettings(enabled)
    return { ok: true }
  } catch (err) {
    console.error('Failed to set login item:', err)
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('settings:get-startup-stickies', () => {
  return (readSettings().startupStickies ?? [])
})

ipcMain.handle('settings:set-startup-stickies', (_event, stickies: Array<{ noteId: string; sectionId: string }>) => {
  const settings = readSettings()
  settings.startupStickies = stickies
  writeSettings(settings)
})

ipcMain.handle('settings:get-ui-state', () => {
  return (readSettings().uiState ?? {}) as { activeNoteId?: string; activeSectionId?: string; collapsedGroupIds?: string[]; collapsedFolderIds?: string[] }
})

ipcMain.handle('settings:set-ui-state', (_event, patch: { activeNoteId?: string; activeSectionId?: string; collapsedGroupIds?: string[]; collapsedFolderIds?: string[] }) => {
  const settings = readSettings()
  settings.uiState = { ...(settings.uiState as object ?? {}), ...patch }
  writeSettings(settings)
})

ipcMain.handle('groups:get', () => {
  try {
    return JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf-8'))
  } catch { return [] }
})

ipcMain.handle('groups:set', (event, groups: unknown[]) => {
  const content = JSON.stringify(groups, null, 2)
  fs.writeFileSync(GROUPS_FILE, content, 'utf-8')
  // Broadcast to other windows so their groups reload immediately
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents.id !== event.sender.id) {
      win.webContents.send('notes-updated')
    }
  })
  githubSync.schedulePush('groups.json', content)
})

ipcMain.handle('folders:get', () => {
  try {
    return JSON.parse(fs.readFileSync(FOLDERS_FILE, 'utf-8'))
  } catch { return [] }
})

ipcMain.handle('folders:set', (event, folders: unknown[]) => {
  const content = JSON.stringify(folders, null, 2)
  fs.writeFileSync(FOLDERS_FILE, content, 'utf-8')
  // Broadcast to other windows so their folders reload immediately
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents.id !== event.sender.id) {
      win.webContents.send('notes-updated')
    }
  })
  githubSync.schedulePush('folders.json', content)
})

ipcMain.handle('section-colors:get', () => {
  try {
    const raw = JSON.parse(fs.readFileSync(SECTION_COLORS_FILE, 'utf-8'))
    return sanitizeSectionColors(raw)
  } catch {
    return {}
  }
})

ipcMain.handle('section-colors:set', (event, colors: unknown) => {
  const sanitized = sanitizeSectionColors(colors)
  const content = JSON.stringify(sanitized, null, 2)
  fs.writeFileSync(SECTION_COLORS_FILE, content, 'utf-8')
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents.id !== event.sender.id) {
      win.webContents.send('notes-updated')
    }
  })
  githubSync.schedulePush('section-colors.json', content)
})

ipcMain.handle('note-order:get', () => {
  try {
    return JSON.parse(fs.readFileSync(NOTE_ORDER_FILE, 'utf-8'))
  } catch { return {} }
})

ipcMain.handle('note-order:set', (event, order: unknown) => {
  const content = JSON.stringify(order, null, 2)
  fs.writeFileSync(NOTE_ORDER_FILE, content, 'utf-8')
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents.id !== event.sender.id) {
      win.webContents.send('notes-updated')
    }
  })
  githubSync.schedulePush('note-order.json', content)
})

// Window controls
ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.on('window:get-id', (event) => {
  event.returnValue = event.sender.id
})
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', (event) => {
  // Check if it's the main window or a sticky window
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && win !== mainWindow) {
    win.close() // Truly close sticky windows
  } else {
    mainWindow?.hide() // Just hide the main window
  }
})

ipcMain.on('window:open-sticky', (_event, noteId: string, sectionId: string) => {
  createStickyWindow(noteId, sectionId)
})

ipcMain.on('window:set-size', (event, width: number, height: number, minW: number, minH: number) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  win.setMinimumSize(minW, minH)
  win.setSize(width, height)
})

ipcMain.on('window:set-always-on-top', (event, flag: boolean) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  win.setAlwaysOnTop(flag)
})

ipcMain.on('window:fold-to-corner', (event, foldedW: number, foldedH: number) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  const from = win.getBounds()
  prevBoundsMap.set(win.id, from)
  foldedWindows.add(win)
  const display = screen.getDisplayNearestPoint(from)
  const { x: toX, y: toY } = getFoldedPosition(display, foldedW, foldedH)
  const to = { x: toX, y: toY, width: foldedW, height: foldedH }
  animateStickyWindow(win, from, to, 300)
})

ipcMain.on('window:unfold', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  const prev = prevBoundsMap.get(win.id)
  if (!prev) return
  foldedWindows.delete(win)
  const from = win.getBounds()
  animateStickyWindow(win, from, prev, 280, () => {
    if (!win.isDestroyed()) {
      win.setMinimumSize(200, 200)
      applyStickyShape(win)
    }
  })
  prevBoundsMap.delete(win.id)
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

// Ensure single instance — second-instance event brings the existing window to front
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.whenReady().then(async () => {
  // Remove default menu for all windows
  Menu.setApplicationMenu(null)

  // One-time local format migration (v1 flat .md → v2 folder-per-note).
  // MUST run before the initial pull and before the fs watcher starts.
  const migrationResult = migrateNotesDirToV2(NOTES_DIR)

  githubSync.loadSyncSettings()
  githubSync.onStatusChanged(() => emitSyncStatusChanged())
  const connected = githubSync.getSyncStatus().connected

  const isStartupMode = process.argv.includes('--noteflow-startup')
  const startupStickies = (readSettings().startupStickies ?? []) as Array<{ noteId: string; sectionId: string }>

  // Initial GitHub pull. In startup mode we block for up to 10s so sticky
  // windows open with up-to-date content — otherwise an edit on stale data
  // would overwrite newer remote changes (data loss). In normal mode we keep
  // the fast-open UX and pull in the background; schedulePush is gated until
  // the first pull succeeds, so no unsafe pushes happen in the meantime.
  if (connected) {
    const runInitialPull = () =>
      githubSync
        .pullNotes(NOTES_DIR)
        .then((result) => {
          broadcastPullResult(result)
          // One-time remote format migration (v1 flat files → folders + marker).
          // Internally guarded; no-op once the remote is already v2.
          githubSync.migrateRemoteToV2IfNeeded(NOTES_DIR).then((didMigrate) => {
            if (didMigrate) {
              // Remote-only notes may have been imported locally — full reload
              BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
            }
          }).catch((err) => {
            console.error('[Startup] remote format migration failed:', String(err))
          })
        })
        .catch((err) => {
          console.error('[Startup] initial pull failed:', String(err))
          githubSync.setInitialPullStatus('failed')
        })

    if (isStartupMode) {
      await Promise.race([
        runInitialPull(),
        new Promise<void>((resolve) =>
          setTimeout(() => {
            if (githubSync.getSyncStatus().initialPullStatus === 'pending') {
              console.warn('[Startup] initial pull timeout — proceeding with local data')
              githubSync.setInitialPullStatus('failed')
            }
            resolve()
          }, 10_000)
        ),
      ])
    } else {
      runInitialPull()
    }
    startAutoSync()
  }

  // Refresh login item registration on every launch so it stays current after
  // app updates (binary path or args may have changed since the user first
  // enabled the feature).
  const savedOpenAtLogin = (readSettings().openAtLogin ?? false) as boolean
  if (savedOpenAtLogin) {
    try { applyLoginItemSettings(true) } catch (err) {
      console.error('Failed to refresh login item on startup:', err)
    }
  }

  if (isStartupMode) {
    // Launched at system startup: always keep the main window hidden in tray
    // and open any configured startup sticky notes.
    mainWindow = createWindow(true)
    const stickyWins: BrowserWindow[] = []
    for (const { noteId, sectionId } of startupStickies) {
      stickyWins.push(createStickyWindow(noteId, sectionId))
    }
    // Fallback for Wayland: the compositor may not honour ready-to-show, or
    // the window may be obscured by GNOME Shell's startup animation.
    // Force-show any sticky that is still not visible 5 s after creation.
    if (stickyWins.length > 0) {
      setTimeout(() => {
        stickyWins.forEach(w => {
          if (!w.isDestroyed() && !w.isVisible()) w.show()
        })
      }, 5000)
    }
  } else {
    mainWindow = createWindow()
  }

  createTray()
  registerGlobalShortcut()
  startAlarmEngine()
  checkExpiredNotes()

  // Semantic index (AI). init() wires config; primeSettings defers the worker warmup so
  // model loading / reindex doesn't compete with the app's first paint.
  aiIndex.init({ notesDir: NOTES_DIR, onProgress: emitAiProgress, onState: emitAiState })
  aiIndex.primeSettings(readAiSettings())

  // The format migration rewrote every note path — the AI index stores stale
  // file paths and must be rebuilt once. Deferred so it doesn't fight startup.
  if (migrationResult.migrated > 0 && aiIndex.isEnabled()) {
    setTimeout(() => {
      aiIndex.reindexAll().catch((err) => console.error('[Migration] AI reindex failed:', String(err)))
    }, 15_000)
  }

  // Watch for external file changes (CLI, sync from another device, etc.)
  startNotesWatcher()

  app.on('activate', () => {
    showWindow()
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  // After system resume from sleep, reload notes several times with increasing
  // delays. A single 1500ms attempt is not enough: the renderer may take a few
  // seconds to recover (or be reloaded by the crash handler above), and the
  // filesystem may not be ready immediately on Windows.
  // The 15s and 30s signals act as extra safety nets for slow filesystem
  // recovery (e.g. hibernation) or renderer restarts that happen after the
  // earlier signals have already fired.
  powerMonitor.on('resume', () => {
    for (const delay of [1500, 4000, 8000, 15000, 30000]) {
      setTimeout(() => {
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) w.webContents.send('notes-updated')
        })
      }, delay)
    }
  })
})

app.on('window-all-closed', () => {
  // Keep alive on all platforms — tray app pattern
  // Do NOT call app.quit() so the tray keeps running
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('second-instance', () => {
  showWindow()
})
