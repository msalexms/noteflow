import { useEffect, useState } from 'react'
import { Download, FolderOpen, Upload } from 'lucide-react'

interface DataPanelProps {
  onOpenExportImport: (mode: 'export' | 'import') => void
}

export function DataPanel({ onOpenExportImport }: DataPanelProps) {
  const [notesDir, setNotesDir] = useState<string>('')

  useEffect(() => {
    window.noteflow.getNotesDir().then(setNotesDir)
  }, [])

  return (
    <div className="space-y-5">
      {/* Export / Import */}
      <section>
        <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest mb-2">Backup</div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onOpenExportImport('export')}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-mono text-text hover:bg-surface-2 transition-colors text-left"
          >
            <Download size={13} className="text-text-muted flex-shrink-0" />
            <span className="flex-1">Export notes…</span>
          </button>
          <button
            onClick={() => onOpenExportImport('import')}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-mono text-text hover:bg-surface-2 transition-colors text-left"
          >
            <Upload size={13} className="text-text-muted flex-shrink-0" />
            <span className="flex-1">Import notes…</span>
          </button>
        </div>
      </section>

      {/* Notes location */}
      <section>
        <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest mb-2">Notes location</div>
        <p className="text-[11px] font-mono text-text-muted break-all mb-2">{notesDir || '…'}</p>
        <button
          onClick={() => window.noteflow.openNotesFolder()}
          className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-mono text-text hover:bg-surface-2 transition-colors text-left"
        >
          <FolderOpen size={13} className="text-text-muted flex-shrink-0" />
          <span className="flex-1">Open notes folder</span>
        </button>
      </section>
    </div>
  )
}
