import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/useT'
import { groupColorToHex, isCustomColor, normalizeGroupColor } from '../lib/tagColors'
import type { CustomColor, GroupColor } from '../types'

const COMMIT_DEBOUNCE_MS = 250

interface CustomColorSwatchProps {
  /** Colour currently applied (theme var or hex) — seeds the native picker. */
  value: GroupColor
  /** Commits the picked colour (store + disk). Called debounced while dragging. */
  onPick: (color: CustomColor) => void
}

/**
 * Free-colour swatch shown next to the 8 theme presets (group and section colour pickers).
 * Same pattern as Settings → Appearance: a conic-gradient circle with a transparent
 * `<input type="color">` on top, which opens the OS picker.
 *
 * The native picker fires `input` continuously while the user drags, and every commit here
 * writes to disk and schedules a sync push — so commits are debounced (and flushed on blur /
 * unmount) while a local draft keeps the swatch preview immediate.
 */
export function CustomColorSwatch({ value, onPick }: CustomColorSwatchProps) {
  const t = useT()
  const [draft, setDraft] = useState<CustomColor | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<CustomColor | null>(null)
  const onPickRef = useRef(onPick)
  useEffect(() => { onPickRef.current = onPick })

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const color = pending.current
    pending.current = null
    if (color) onPickRef.current(color)
  }, [])

  // Don't lose the last dragged colour when the menu/popover closes.
  useEffect(() => flush, [flush])

  const handleChange = (raw: string) => {
    const color = normalizeGroupColor(raw)
    if (!color || !isCustomColor(color)) return
    setDraft(color)
    pending.current = color
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, COMMIT_DEBOUNCE_MS)
  }

  // While dragging, `draft` runs ahead of the committed `value`. Once the applied colour is
  // a preset again (or auto) the draft is ignored, so the swatch goes back to the gradient.
  const selected = isCustomColor(value)
  const current = selected ? draft ?? value : null

  return (
    <label
      title={t.common.customColor}
      aria-label={t.common.customColor}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className={`w-4 h-4 flex-shrink-0 rounded-full cursor-pointer relative overflow-hidden transition-transform hover:scale-110 ${
        selected ? 'ring-1 ring-white/50 ring-offset-1 ring-offset-surface-2' : ''
      }`}
      style={{
        background: current
          ? current
          : 'conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)',
      }}
    >
      <input
        type="color"
        value={groupColorToHex(current ?? value)}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={flush}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
    </label>
  )
}
