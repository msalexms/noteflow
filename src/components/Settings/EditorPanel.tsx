import { modKey } from '../../lib/platform'
import { useEditorSettingsStore } from '../../stores/editorSettingsStore'

export function EditorPanel() {
  const { fontSize, changeFontSize, resetFontSize, fontFamily, setFontFamily, readableWidth, setReadableWidth } =
    useEditorSettingsStore()

  return (
    <div className="space-y-5">
      {/* Font size */}
      <section className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono font-medium text-text">Font size</p>
          <p className="text-[10px] font-mono text-text-muted mt-0.5">Size of the text inside the editor</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => changeFontSize(-1)}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            title={`Decrease (${modKey}+-)`}
          >−</button>
          <button
            onClick={resetFontSize}
            className="w-12 h-7 text-center rounded-md border border-border text-text hover:bg-surface-2 transition-colors text-xs font-mono"
            title={`Reset (${modKey}+0)`}
          >{fontSize}px</button>
          <button
            onClick={() => changeFontSize(1)}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            title={`Increase (${modKey}++)`}
          >+</button>
        </div>
      </section>

      {/* Font family */}
      <section className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono font-medium text-text">Editor font</p>
          <p className="text-[10px] font-mono text-text-muted mt-0.5">Typeface used for note content</p>
        </div>
        <button
          onClick={() => setFontFamily(fontFamily === 'mono' ? 'inter' : 'mono')}
          className="flex items-center gap-0.5 text-[11px] font-mono px-2 py-1 rounded-md border border-border bg-surface-2 text-text-muted hover:text-text transition-colors flex-shrink-0"
        >
          <span className={fontFamily === 'mono' ? 'text-text' : ''}>Mono</span>
          <span className="opacity-30 px-0.5">/</span>
          <span className={fontFamily === 'inter' ? 'text-text' : ''}>Inter</span>
        </button>
      </section>

      {/* Reading width */}
      <section className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono font-medium text-text">Content width</p>
          <p className="text-[10px] font-mono text-text-muted mt-0.5">Constrain editor content to a readable column</p>
        </div>
        <button
          onClick={() => setReadableWidth(!readableWidth)}
          className="flex items-center gap-0.5 text-[11px] font-mono px-2 py-1 rounded-md border border-border bg-surface-2 text-text-muted hover:text-text transition-colors flex-shrink-0"
        >
          <span className={!readableWidth ? 'text-text' : ''}>Full</span>
          <span className="opacity-30 px-0.5">/</span>
          <span className={readableWidth ? 'text-text' : ''}>Readable</span>
        </button>
      </section>
    </div>
  )
}
