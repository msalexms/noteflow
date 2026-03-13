import { Minus, Square, X } from 'lucide-react'

export function TitleBar() {
  return (
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
  )
}
