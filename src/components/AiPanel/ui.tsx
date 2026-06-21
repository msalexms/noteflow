// Shared visual primitives for the AI panel — lifted from the landing's
// "Low-friction signal" card: mono micro-labels, soft rounded surfaces, accent
// chips and the signature this-or-that segmented control. Theme-accent driven
// (no fixed orange) so it stays continuous with the rest of the app's themes.
import { Fragment, type ReactNode } from 'react'

/** Mono uppercase micro-label (the "LOW-FRICTION SIGNAL" caption style). */
export const PANEL_LABEL = 'text-[11px] font-mono uppercase tracking-[0.16em] text-text-muted'

/** Active-state fill shared by chips / picks (theme accent, soft). */
export const ACTIVE_PILL = 'bg-accent/15 border-accent/50 text-text'
export const IDLE_PILL = 'bg-surface-0 border-border text-text-muted hover:text-text hover:border-text/30'

/** Text/textarea input matching the card language (rounded, accent focus). */
export const FIELD_INPUT =
  'bg-surface-0 border-solid border border-border rounded-lg px-2.5 py-2 text-[13px] font-mono text-text placeholder-text-muted/40 outline-none focus:border-accent/50 transition-colors disabled:opacity-60'

/** Soft rounded surface that groups a chunk of UI, like the card in the design. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border-solid border border-border bg-surface-1/50 ${className}`}>{children}</div>
  )
}

/** Mono micro-label with an optional helper line under it. */
export function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={PANEL_LABEL}>{children}</span>
      {hint && <span className="text-[11px] font-mono text-text-muted/60 leading-snug normal-case">{hint}</span>}
    </div>
  )
}

/** A faint full-width divider, like the hairline rules inside the design card. */
export function Divider({ className = '' }: { className?: string }) {
  return <div className={`h-px bg-border ${className}`} />
}

// The signature element from the design: a connected this-or-that control.
// The active segment is filled with the theme accent; tapping the active one
// clears the pick (so a question can be left unanswered). Dividers are drawn as
// standalone elements to dodge the global `button { border: none }` reset.
export function Segmented({
  options,
  value,
  onPick,
  disabled,
}: {
  options: string[]
  value: string
  onPick: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex w-full overflow-hidden rounded-lg border-solid border border-border font-mono text-[12px]">
      {options.map((opt, i) => {
        const active = value === opt
        return (
          <Fragment key={opt}>
            {i > 0 && <div className="w-px self-stretch bg-border" />}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(opt)}
              className={`flex-1 px-3 py-1.5 text-center leading-tight transition-colors disabled:opacity-50 ${
                active ? 'bg-accent/15 text-accent' : 'text-text-muted hover:bg-text/5 hover:text-text'
              }`}
            >
              {opt}
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}
