import { forwardRef, useImperativeHandle, useState } from 'react'
import type { SlashCommandItem } from './SlashCommands'
import { useT } from '../../i18n/useT'

export interface SlashCommandMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

interface SlashCommandMenuProps {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

// Command popup shown when typing `/`. Exposes onKeyDown via ref so the TipTap
// suggestion plugin can drive ↑/↓/Enter selection while the editor keeps focus.
export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(
  function SlashCommandMenu({ items, command }, ref) {
    const t = useT()
    const [selected, setSelected] = useState(0)

    // Reset the highlight to the first item whenever the filtered list changes.
    // React's documented "adjust state when a prop changes" pattern (store the
    // previous prop in state, compare during render) — no effect, no extra pass.
    const [prevItems, setPrevItems] = useState(items)
    if (prevItems !== items) {
      setPrevItems(items)
      setSelected(0)
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: (event) => {
        if (items.length === 0) return false
        if (event.key === 'ArrowUp') {
          setSelected((s) => (s + items.length - 1) % items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelected((s) => (s + 1) % items.length)
          return true
        }
        if (event.key === 'Enter') {
          const item = items[selected]
          if (item) command(item)
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="slash-menu">
          <div className="slash-menu-empty">{t.editor.slash.noCommands}</div>
        </div>
      )
    }

    return (
      <div className="slash-menu">
        {items.map((item, i) => (
          <button
            key={item.title}
            type="button"
            className={`slash-menu-item${i === selected ? ' is-selected' : ''}`}
            onMouseEnter={() => setSelected(i)}
            onMouseDown={(e) => {
              e.preventDefault()
              command(item)
            }}
          >
            <span className="slash-menu-item-title">{item.title}</span>
            {item.description && (
              <span className="slash-menu-item-desc">{item.description}</span>
            )}
          </button>
        ))}
      </div>
    )
  },
)
