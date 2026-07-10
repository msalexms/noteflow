import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, Flag } from 'lucide-react'
import { getRootZoom } from '../../stores/themeStore'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'

type Importance = 'low' | 'medium' | 'high'

const IMPORTANCE_VALUES: Importance[] = ['low', 'medium', 'high']

// Today's date as yyyy-mm-dd in LOCAL time (not UTC) to match the date input's value format.
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function badgeColorClass(due: string): string {
  const today = new Date().toISOString().slice(0, 10)
  if (due < today) return 'task-badge--overdue'
  if (due === today) return 'task-badge--today'
  return 'task-badge--future'
}

function formatBadgeDate(due: string): string {
  const [y, m, d] = due.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function DeadlineTaskItemView({ node, updateAttributes }: NodeViewProps) {
  const t = useT()
  const { checked, due, alarm, importance } = node.attrs as {
    checked: boolean
    due: string | null
    alarm: string | null
    importance: Importance | null
  }

  const importanceLabels: Record<Importance, string> = {
    low: t.editor.task.importanceLow,
    medium: t.editor.task.importanceMedium,
    high: t.editor.task.importanceHigh,
  }

  const [popoverOpen, setPopoverOpen] = useState(false)
  const [draftDue, setDraftDue] = useState<string>(due ?? '')
  const [draftAlarm, setDraftAlarm] = useState<string>(alarm ?? '')
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })
  const [isSticky, setIsSticky] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLElement>(null)

  const [impPopoverOpen, setImpPopoverOpen] = useState(false)
  const [impPopoverPos, setImpPopoverPos] = useState({ top: 0, left: 0 })
  const impTriggerRef = useRef<HTMLButtonElement>(null)
  const impPopoverRef = useRef<HTMLDivElement>(null)

  // Detect if we're inside a sticky-editor
  useEffect(() => {
    const el = wrapperRef.current
    if (el) setIsSticky(!!el.closest('.sticky-editor'))
  }, [])

  // Sync drafts when attrs change externally
  useEffect(() => {
    setDraftDue(due ?? '')
    setDraftAlarm(alarm ?? '')
  }, [due, alarm])

  // Close popovers on click-outside
  useEffect(() => {
    if (!popoverOpen) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popoverOpen])

  useEffect(() => {
    if (!impPopoverOpen) return
    const handler = (e: MouseEvent) => {
      if (
        impPopoverRef.current &&
        !impPopoverRef.current.contains(e.target as Node) &&
        impTriggerRef.current &&
        !impTriggerRef.current.contains(e.target as Node)
      ) {
        setImpPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [impPopoverOpen])

  // Close popovers on Escape
  useEffect(() => {
    if (!popoverOpen && !impPopoverOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPopoverOpen(false)
        setImpPopoverOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [popoverOpen, impPopoverOpen])

  function openPopover() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // Popover is `position: fixed` (zoomed/local space); the rect is device space.
    // Divide by the root zoom so it lands in the same space as window.innerHeight.
    const z = getRootZoom()
    const rectTop = rect.top / z
    const rectBottom = rect.bottom / z
    const rectLeft = rect.left / z
    const popH = 148
    const spaceBelow = window.innerHeight - rectBottom
    const top = spaceBelow > popH ? rectBottom + 4 : rectTop - popH - 4
    // Keep popover inside horizontal viewport
    const left = Math.min(rectLeft, window.innerWidth - 230)
    setPopoverPos({ top, left })
    // Prefill today when there's no existing deadline so the user only has to confirm.
    // This only seeds the draft; nothing is written to the node until "Done".
    setDraftDue(due ?? todayISO())
    setDraftAlarm(alarm ?? '')
    setImpPopoverOpen(false)
    setPopoverOpen(true)
  }

  function openImpPopover() {
    if (!impTriggerRef.current) return
    const rect = impTriggerRef.current.getBoundingClientRect()
    // Popover is `position: fixed` (zoomed/local space); the rect is device space.
    // Divide by the root zoom so it lands in the same space as window.innerHeight.
    const z = getRootZoom()
    const rectTop = rect.top / z
    const rectBottom = rect.bottom / z
    const rectLeft = rect.left / z
    const popH = 132
    const spaceBelow = window.innerHeight - rectBottom
    const top = spaceBelow > popH ? rectBottom + 4 : rectTop - popH - 4
    const left = Math.min(rectLeft, window.innerWidth - 170)
    setImpPopoverPos({ top, left })
    setPopoverOpen(false)
    setImpPopoverOpen(true)
  }

  function commit() {
    updateAttributes({
      due: draftDue || null,
      alarm: draftDue && draftAlarm ? draftAlarm : null,
    })
    setPopoverOpen(false)
  }

  function clear() {
    updateAttributes({ due: null, alarm: null })
    setDraftDue('')
    setDraftAlarm('')
    setPopoverOpen(false)
  }

  function setImportance(value: Importance | null) {
    updateAttributes({ importance: value })
    setImpPopoverOpen(false)
  }

  return (
    <NodeViewWrapper
      as="li"
      ref={wrapperRef}
      data-type="taskItem"
      data-checked={String(checked)}
    >
      <label className="task-checkbox-label" contentEditable={false}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => updateAttributes({ checked: !checked })}
        />
      </label>

      <div className="task-item-body group">
        <NodeViewContent as="div" className="task-content" />

        <div className="task-actions" contentEditable={false}>
          <button
            ref={impTriggerRef}
            contentEditable={false}
            className={`task-importance-trigger${importance ? ' has-importance' : ''}`}
            onClick={openImpPopover}
            title={importance ? tf(t.editor.task.importanceTooltip, { level: importanceLabels[importance] }) : t.editor.task.setImportance}
            type="button"
          >
            {importance ? (
              <span className={`task-importance-dot task-importance-dot--${importance}`} />
            ) : (
              <Flag size={14} className="task-importance-icon" />
            )}
          </button>

          <button
            ref={triggerRef}
            contentEditable={false}
            className={`task-deadline-trigger${due ? ' has-due' : ''}`}
            onClick={openPopover}
            title={due ? `${tf(t.editor.task.deadlineTooltip, { date: due })}${alarm ? ' ⏰' + alarm : ''}` : t.editor.task.setDeadline}
            type="button"
          >
            {due ? (
              <span className={`task-badge ${badgeColorClass(due)}`}>
                📅 {formatBadgeDate(due)}
                {alarm && !isSticky && <> ⏰{alarm}</>}
              </span>
            ) : (
              <Calendar size={14} className="task-deadline-icon" />
            )}
          </button>
        </div>
      </div>

      {popoverOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className="task-deadline-popover"
            style={{ top: popoverPos.top, left: popoverPos.left }}
            contentEditable={false}
          >
            <div className="task-deadline-popover-row">
              <label>{t.editor.task.date}</label>
              <input
                type="date"
                value={draftDue}
                onChange={(e) => setDraftDue(e.target.value)}
                autoFocus
              />
            </div>
            <div className="task-deadline-popover-row">
              <label>Alarm</label>
              <input
                type="time"
                value={draftAlarm}
                disabled={!draftDue}
                onChange={(e) => setDraftAlarm(e.target.value)}
              />
            </div>
            <div className="task-deadline-popover-actions">
              <button type="button" onClick={clear} className="task-deadline-btn-clear">
                {t.editor.task.clear}
              </button>
              <button type="button" onClick={commit} className="task-deadline-btn-done">
                {t.editor.task.done}
              </button>
            </div>
          </div>,
          document.body
        )}

      {impPopoverOpen &&
        createPortal(
          <div
            ref={impPopoverRef}
            className="task-importance-popover"
            style={{ top: impPopoverPos.top, left: impPopoverPos.left }}
            contentEditable={false}
          >
            {IMPORTANCE_VALUES.map((level) => (
              <button
                key={level}
                type="button"
                className={`task-importance-option${importance === level ? ' is-active' : ''}`}
                onClick={() => setImportance(level)}
              >
                <span className={`task-importance-dot task-importance-dot--${level}`} />
                {importanceLabels[level]}
              </button>
            ))}
            <button
              type="button"
              className="task-importance-clear"
              onClick={() => setImportance(null)}
            >
              {t.editor.task.clear}
            </button>
          </div>,
          document.body
        )}
    </NodeViewWrapper>
  )
}
