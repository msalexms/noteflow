import { modKey } from '../../lib/platform'
import { useEditorSettingsStore } from '../../stores/editorSettingsStore'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'

export function EditorPanel() {
  const { fontSize, changeFontSize, resetFontSize, fontFamily, setFontFamily, readableWidth, setReadableWidth } =
    useEditorSettingsStore()
  const t = useT()

  return (
    <div className="space-y-5">
      {/* Font size */}
      <section className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono font-medium text-text">{t.settings.editor.fontSize}</p>
          <p className="text-[11px] font-mono text-text-muted mt-0.5">{t.settings.editor.fontSizeHint}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => changeFontSize(-1)}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            title={tf(t.settings.editor.decrease, { keys: `${modKey}+-` })}
          >−</button>
          <button
            onClick={resetFontSize}
            className="w-12 h-7 text-center rounded-md border border-border text-text hover:bg-surface-2 transition-colors text-xs font-mono"
            title={tf(t.settings.editor.reset, { keys: `${modKey}+0` })}
          >{fontSize}px</button>
          <button
            onClick={() => changeFontSize(1)}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            title={tf(t.settings.editor.increase, { keys: `${modKey}++` })}
          >+</button>
        </div>
      </section>

      {/* Font family */}
      <section className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono font-medium text-text">{t.settings.editor.editorFont}</p>
          <p className="text-[11px] font-mono text-text-muted mt-0.5">{t.settings.editor.editorFontHint}</p>
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
          <p className="text-xs font-mono font-medium text-text">{t.settings.editor.contentWidth}</p>
          <p className="text-[11px] font-mono text-text-muted mt-0.5">{t.settings.editor.contentWidthHint}</p>
        </div>
        <button
          onClick={() => setReadableWidth(!readableWidth)}
          className="flex items-center gap-0.5 text-[11px] font-mono px-2 py-1 rounded-md border border-border bg-surface-2 text-text-muted hover:text-text transition-colors flex-shrink-0"
        >
          <span className={!readableWidth ? 'text-text' : ''}>{t.settings.editor.full}</span>
          <span className="opacity-30 px-0.5">/</span>
          <span className={readableWidth ? 'text-text' : ''}>{t.settings.editor.readable}</span>
        </button>
      </section>
    </div>
  )
}
