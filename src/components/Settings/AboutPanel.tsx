import { useEffect, useState } from 'react'
import { Check, Download, ExternalLink, Github, RefreshCw } from 'lucide-react'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'

export function AboutPanel() {
  const t = useT()
  const [version, setVersion] = useState<string>('')
  const [checking, setChecking] = useState(false)
  const [upToDate, setUpToDate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string; downloadUrl: string } | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    window.noteflow.getAppVersion().then(setVersion)
    const unsubProgress = window.noteflow.onUpdateProgress((p) => setProgress(p))
    const unsubInstalling = window.noteflow.onUpdateInstalling(() => setInstalling(true))
    return () => {
      unsubProgress()
      unsubInstalling()
    }
  }, [])

  const handleCheck = async () => {
    if (checking) return
    setChecking(true)
    setUpToDate(false)
    const result = await window.noteflow.checkUpdate()
    if (result.hasUpdate && result.latestVersion && result.downloadUrl) {
      setUpdateInfo({ latestVersion: result.latestVersion, downloadUrl: result.downloadUrl })
    } else {
      setUpToDate(true)
      setTimeout(() => setUpToDate(false), 3000)
    }
    setChecking(false)
  }

  const handleUpdate = async () => {
    if (!updateInfo || downloading || installing) return
    setDownloading(true)
    setProgress(0)
    const result = await window.noteflow.downloadAndInstall(updateInfo.downloadUrl)
    if (!result.success) {
      window.noteflow.openUrl(updateInfo.downloadUrl)
      setInstalling(false)
    }
    setDownloading(false)
  }

  return (
    <div className="space-y-5">
      {/* Version */}
      <section className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono font-medium text-text">NoteFlow</p>
          <p className="text-[11px] font-mono text-text-muted mt-0.5">{t.settings.about.tagline}</p>
        </div>
        <span className="text-xs font-mono text-text-muted tabular-nums flex-shrink-0">
          {version ? `v${version}` : '…'}
        </span>
      </section>

      {/* Updates */}
      <section>
        <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest mb-2">{t.settings.about.updates}</div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCheck}
            disabled={checking}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-mono text-text hover:bg-surface-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {checking
              ? <RefreshCw size={13} className="animate-spin text-text-muted" />
              : upToDate
              ? <Check size={13} className="text-green-400" />
              : <RefreshCw size={13} className="text-text-muted" />}
            {checking ? t.settings.about.checking : upToDate ? t.settings.about.upToDate : t.settings.about.checkForUpdates}
          </button>
          {updateInfo && (
            <button
              onClick={handleUpdate}
              disabled={downloading || installing}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-accent/60 bg-accent/[0.1] text-xs font-mono text-accent hover:bg-accent/[0.18] transition-colors disabled:opacity-60"
            >
              {installing ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  {t.settings.about.installing}
                </>
              ) : downloading ? (
                <>
                  <Download size={13} />
                  {progress > 0 ? `${progress}%` : t.settings.about.downloading}
                </>
              ) : (
                <>
                  <Download size={13} />
                  {tf(t.settings.about.updateTo, { version: updateInfo.latestVersion })}
                </>
              )}
            </button>
          )}
        </div>
      </section>

      {/* Links */}
      <section>
        <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest mb-2">{t.settings.about.links}</div>
        <button
          onClick={() => window.noteflow.openUrl('https://github.com/yagoid/noteflow')}
          className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-mono text-text hover:bg-surface-2 transition-colors text-left"
        >
          <Github size={13} className="text-text-muted flex-shrink-0" />
          <span className="flex-1">{t.settings.about.githubRepo}</span>
          <ExternalLink size={11} className="text-text-muted flex-shrink-0" />
        </button>
      </section>
    </div>
  )
}
