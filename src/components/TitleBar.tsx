import { useState, useEffect } from 'react'
import { Check, Cloud, CloudOff, Download, Minus, Palette, RefreshCw, Settings, Square, X } from 'lucide-react'
import { THEMES } from '../lib/themes'
import { useThemeStore } from '../stores/themeStore'
import { useEditorSettingsStore } from '../stores/editorSettingsStore'
import { TitleBarMenu } from './TitleBarMenu'
import { ExportImportModal } from './ExportImportModal'
import { GitHubSyncModal } from './GitHubSyncModal'
import { StartupSettingsModal } from './StartupSettingsModal'
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal'

export function TitleBar() {
  const { activeThemeId, setTheme } = useThemeStore()
  const { fontSize, changeFontSize, resetFontSize } = useEditorSettingsStore()
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string; downloadUrl: string } | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [upToDate, setUpToDate] = useState(false)
  const [exportImportModal, setExportImportModal] = useState<'export' | 'import' | null>(null)
  const [syncModal, setSyncModal] = useState(false)
  type SyncStatus = { enabled: boolean; connected: boolean; owner?: string; repo?: string; lastSync?: string; error?: string }
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ enabled: false, connected: false })
  const [syncing, setSyncing] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [startupModal, setStartupModal] = useState(false)
  const [shortcutsModal, setShortcutsModal] = useState(false)

  const refreshSyncStatus = () => window.noteflow.getSyncStatus().then(setSyncStatus)

  const syncLabel = syncing
    ? 'Syncing'
    : pushing
    ? 'Uploading'
    : syncStatus.error
    ? 'Sync error'
    : syncStatus.connected
    ? 'Synced'
    : 'Sync off'

  const syncTone = syncing || pushing
    ? 'text-accent border-accent/35 bg-accent/10'
    : syncStatus.error
    ? 'text-amber-300 border-amber-300/35 bg-amber-300/10'
    : syncStatus.connected
    ? 'text-emerald-300 border-emerald-300/35 bg-emerald-300/10'
    : 'text-text-muted border-border bg-surface-1'

  const syncTooltip = syncing
    ? 'Syncing notes...'
    : pushing
    ? 'Uploading local changes to GitHub...'
    : syncStatus.error
    ? `Sync error: ${syncStatus.error}`
    : syncStatus.connected
    ? `${syncStatus.owner}/${syncStatus.repo} · Last sync: ${formatLastSync(syncStatus.lastSync)}\nClick to sync now`
    : 'GitHub sync is not connected. Open settings to configure it.'

  const updateLabel = downloading
    ? `Downloading ${downloadProgress > 0 ? `${downloadProgress}%` : '...'}`
    : checkingUpdate
    ? 'Checking updates'
    : updateInfo
    ? `Update v${updateInfo.latestVersion}`
    : upToDate
    ? 'Up to date'
    : 'Check updates'

  const updateTone = downloading || checkingUpdate
    ? 'text-accent border-accent/35 bg-accent/10'
    : updateInfo
    ? 'text-sky-300 border-sky-300/35 bg-sky-300/10'
    : upToDate
    ? 'text-emerald-300 border-emerald-300/35 bg-emerald-300/10'
    : 'text-text-muted border-border bg-surface-1 hover:text-text'

  const updateTooltip = downloading
    ? `Downloading update... ${downloadProgress > 0 ? `${downloadProgress}%` : ''}`
    : checkingUpdate
    ? 'Checking for updates...'
    : updateInfo
    ? `Update available: v${updateInfo.latestVersion}\nClick to download and install`
    : upToDate
    ? 'App is up to date'
    : 'Check for updates'

  useEffect(() => {
    window.noteflow.checkUpdate().then((result) => {
      if (result.hasUpdate && result.latestVersion && result.downloadUrl) {
        setUpdateInfo({ latestVersion: result.latestVersion, downloadUrl: result.downloadUrl })
      }
    })
    refreshSyncStatus()
    window.noteflow.onUpdateProgress((percent) => setDownloadProgress(percent))
    const unsubNotes = window.noteflow.onNotesUpdated(() => refreshSyncStatus())
    const unsubPush = window.noteflow.onSyncPushState((state) => {
      setPushing(state === 'pushing')
      if (state === 'idle') refreshSyncStatus()
    })
    const openShortcutsHandler = () => setShortcutsModal(true)
    window.addEventListener('noteflow:open-shortcuts', openShortcutsHandler)
    return () => {
      unsubNotes()
      unsubPush()
      window.removeEventListener('noteflow:open-shortcuts', openShortcutsHandler)
    }
  }, [])

  function formatLastSync(iso?: string) {
    if (!iso) return 'Never'
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    const hhmm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return sameDay ? hhmm : `${d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${hhmm}`
  }

  const handleSync = async () => {
    if (syncing) return
    setSyncing(true)
    await window.noteflow.pullNotes()
    await refreshSyncStatus()
    setSyncing(false)
  }

  const handleCheckUpdate = async () => {
    if (checkingUpdate) return
    setCheckingUpdate(true)
    setUpToDate(false)
    const result = await window.noteflow.checkUpdate()
    if (result.hasUpdate && result.latestVersion && result.downloadUrl) {
      setUpdateInfo({ latestVersion: result.latestVersion, downloadUrl: result.downloadUrl })
    } else {
      setUpToDate(true)
      setTimeout(() => setUpToDate(false), 3000)
    }
    setCheckingUpdate(false)
  }

  const handleUpdate = async () => {
    if (!updateInfo || downloading) return
    setDownloading(true)
    setDownloadProgress(0)
    const result = await window.noteflow.downloadAndInstall(updateInfo.downloadUrl)
    if (!result.success) {
      window.noteflow.openUrl(updateInfo.downloadUrl)
    }
    setDownloading(false)
  }

  return (
    <>
    <div
      className="flex items-center h-8 bg-surface-0 border-b border-border select-none flex-shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* App name */}
      <div className="flex items-center gap-2 px-4">
        <span className="text-xs font-mono text-accent font-bold tracking-widest">NOTEFLOW</span>
        <span className="text-xs font-mono text-text-muted/30">_</span>
      </div>

      <div className="flex-1" />

      {/* Window controls */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={updateInfo ? handleUpdate : handleCheckUpdate}
          disabled={downloading || checkingUpdate}
          className={`mx-1 inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-mono transition-colors disabled:opacity-60 ${updateTone}`}
          title={updateTooltip}
        >
          {downloading || checkingUpdate ? (
            <RefreshCw size={11} className="animate-spin" />
          ) : updateInfo ? (
            <Download size={11} />
          ) : upToDate ? (
            <Check size={11} />
          ) : (
            <RefreshCw size={11} />
          )}
          <span>{updateLabel}</span>
        </button>

        <button
          onClick={syncStatus.connected ? handleSync : () => setSyncModal(true)}
          disabled={syncing || pushing}
          className={`mx-1 inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-mono transition-colors disabled:opacity-60 ${syncTone}`}
          title={syncTooltip}
        >
          {syncing ? (
            <RefreshCw size={11} className="animate-spin" />
          ) : syncStatus.connected ? (
            <Cloud size={11} className={pushing ? 'animate-pulse' : ''} />
          ) : (
            <CloudOff size={11} />
          )}
          <span>{syncLabel}</span>
        </button>

        <TitleBarMenu
          trigger={<Settings size={12} />}
          groups={[
            {
              label: 'App',
              items: [
                {
                  id: 'shortcuts',
                  label: 'Keyboard shortcuts...',
                  action: () => setShortcutsModal(true),
                },
                {
                  id: 'startup',
                  label: 'Startup settings...',
                  action: () => setStartupModal(true),
                },
                {
                  id: 'check-update',
                  node: (
                    <button
                      onClick={handleCheckUpdate}
                      disabled={checkingUpdate}
                      className="w-full flex items-center gap-2 text-left hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {(checkingUpdate || upToDate || updateInfo) && (
                        <span className="w-[10px] flex-shrink-0 flex items-center justify-center">
                          {checkingUpdate
                            ? <RefreshCw size={10} className="animate-spin" />
                            : upToDate
                            ? <Check size={10} className="text-green-400" />
                            : <Download size={10} className="text-accent" />}
                        </span>
                      )}
                      {checkingUpdate
                        ? 'Checking...'
                        : upToDate
                        ? 'Up to date'
                        : updateInfo
                        ? `Update available (v${updateInfo.latestVersion})`
                        : 'Check for updates'}
                    </button>
                  ),
                },
              ],
            },
            {
              label: 'Sync',
              items: [
                {
                  id: 'github-sync',
                  label: 'GitHub Sync...',
                  indicator: syncStatus.connected
                    ? <Cloud size={10} className="text-green-400" />
                    : <CloudOff size={10} className="text-text-muted/50" />,
                  action: () => setSyncModal(true),
                },
              ],
            },
            {
              label: 'Notes',
              items: [
                { id: 'export', label: 'Export notes...', action: () => setExportImportModal('export') },
                { id: 'import', label: 'Import notes...', action: () => setExportImportModal('import') },
              ],
            },
            {
              label: 'Editor',
              items: [
                {
                  id: 'font-size',
                  node: (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-text-muted">Font size</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => changeFontSize(-1)}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-3 text-text-muted hover:text-text transition-colors"
                          title="Decrease (Ctrl+-)"
                        >−</button>
                        <button
                          onClick={resetFontSize}
                          className="w-10 text-center rounded hover:bg-surface-3 text-text hover:text-accent transition-colors py-0.5"
                          title="Reset (Ctrl+0)"
                        >{fontSize}px</button>
                        <button
                          onClick={() => changeFontSize(1)}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-3 text-text-muted hover:text-text transition-colors"
                          title="Increase (Ctrl++)"
                        >+</button>
                      </div>
                    </div>
                  ),
                },
              ],
            },
          ]}
        />
        <TitleBarMenu
          trigger={<Palette size={12} />}
          groups={[
            {
              label: 'Tema',
              items: THEMES.map((t) => ({
                id: t.id,
                label: t.label,
                indicator: activeThemeId === t.id
                  ? <Check size={10} className="text-accent" />
                  : undefined,
                action: () => setTheme(t.id),
              })),
            },
          ]}
        />
        <div className="flex">
          <button
            onClick={() => window.noteflow.minimize()}
            className="w-10 h-7 flex items-center justify-center text-text-muted hover:bg-surface-2 transition-colors"
            title="Minimize"
          >
            <Minus size={11} />
          </button>
          <button
            onClick={() => window.noteflow.maximize()}
            className="w-10 h-7 flex items-center justify-center text-text-muted hover:bg-surface-2 transition-colors"
            title="Maximize"
          >
            <Square size={10} />
          </button>
          <button
            onClick={() => window.noteflow.close()}
            className="w-10 h-7 flex items-center justify-center text-text-muted hover:bg-red-500 hover:text-white transition-colors"
            title="Close (hides to tray)"
          >
            <X size={11} />
          </button>
        </div>
      </div>
    </div>

    {exportImportModal && (
      <ExportImportModal
        mode={exportImportModal}
        onClose={() => setExportImportModal(null)}
      />
    )}
    {syncModal && (
      <GitHubSyncModal
        onClose={() => {
          setSyncModal(false)
          refreshSyncStatus()
        }}
      />
    )}
    {startupModal && (
      <StartupSettingsModal onClose={() => setStartupModal(false)} />
    )}
    {shortcutsModal && (
      <KeyboardShortcutsModal onClose={() => setShortcutsModal(false)} />
    )}
    </>
  )
}
