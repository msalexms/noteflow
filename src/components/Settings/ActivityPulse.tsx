import { useEffect, useId, useMemo, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useT } from '../../i18n/useT'
import { bucketDailyActivity, ACTIVITY_WINDOW_DAYS } from '../../lib/activityPulse'

// Decorative "activity pulse" section in Settings → General: a monochrome line
// summarising note activity over the last ~16 weeks. Left = 112 days ago, right
// = today. The line rests on a baseline on quiet days and rises into smooth
// mounds over active stretches (consecutive active days merge into one hill),
// with amplitude sqrt-normalised against the window maximum:
//
//              ▁▂▅█▃▁    ▂▃▁       ▁▆█▅▂▁▁▂▃▂▁
//   ────╯         ╰─╯ ╰──╯              ╰────
//
// Only note timestamps are read, never content or titles. (The bucketing lib
// also reports the day's dominant group; this monochrome rendering ignores it.)
//
// The <svg> itself is decorative (aria-hidden, no interactivity, no text inside):
// because it stretches with preserveAspectRatio="none", any SVG <text> would be
// horizontally distorted — so the header and the axis legends are plain HTML
// laid out around the SVG, and go through i18n like every other UI string.

// ── Geometry (viewBox units) ──────────────────────────────────────────────────
const DAY_W = 10
const VB_W = ACTIVITY_WINDOW_DAYS * DAY_W // 1120
const VB_H = 140
const BASELINE = VB_H * 0.7 // 98
const MAX_AMP = 74 // tallest mound peaks at y = 24, leaving headroom
const WEEK_LINES = ACTIVITY_WINDOW_DAYS / 7 // 16 week markers
const H_GRID = [0.25, 0.5, 0.75, 1] // fractions of MAX_AMP above the baseline

// Neutral theme ink: readable on both dark and light without shouting
const STROKE = 'rgb(var(--text) / 0.75)'
const FILL_INK = 'rgb(var(--text-muted))'
const GRID = 'rgb(var(--text-muted) / 0.14)'
const GRID_BASELINE = 'rgb(var(--text-muted) / 0.35)'

// Monotone cubic interpolation (Fritsch–Carlson, as in d3's curveMonotoneX)
// through the per-day points. Monotone segments cannot overshoot, so the curve
// never dips below the baseline; endpoints of flat runs get zero slope, which
// produces the rounded ╯ ╰ junctions where a mound meets the baseline.
function monotonePathD(points: [number, number][]): string {
  const n = points.length
  if (n < 2) return ''
  const dx: number[] = []
  const delta: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1][0] - points[i][0])
    delta.push((points[i + 1][1] - points[i][1]) / dx[i])
  }
  const m: number[] = new Array(n)
  m[0] = delta[0]
  m[n - 1] = delta[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) {
      m[i] = 0
    } else {
      const w1 = 2 * dx[i] + dx[i - 1]
      const w2 = dx[i] + 2 * dx[i - 1]
      m[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])
    }
  }
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    const h = dx[i] / 3
    d += ` C ${x0 + h} ${y0 + m[i] * h}, ${x1 - h} ${y1 - m[i + 1] * h}, ${x1} ${y1}`
  }
  return d
}

export function ActivityPulse() {
  const notes = useNotesStore((s) => s.notes)
  const t = useT()
  const clipId = useId()
  const gradId = useId()

  const { strokeD, fillD } = useMemo(() => {
    const days = bucketDailyActivity(notes)
    const max = Math.max(0, ...days.map((d) => d.count))

    // Amplitude per day, sqrt-normalised so one monster day can't flatten the rest
    const amps = days.map((d) =>
      d.count > 0 && max > 0 ? (Math.sqrt(d.count) / Math.sqrt(max)) * MAX_AMP : 0,
    )

    // Seed state: no activity in the window → one small, subtle mound near the end
    if (max === 0) {
      const seedDay = ACTIVITY_WINDOW_DAYS - 14
      amps[seedDay - 1] = MAX_AMP * 0.12
      amps[seedDay] = MAX_AMP * 0.26
      amps[seedDay + 1] = MAX_AMP * 0.12
    }

    // One point per day at the cell centre, anchored to the baseline at both edges
    const points: [number, number][] = [[0, BASELINE]]
    for (let i = 0; i < amps.length; i++) {
      points.push([i * DAY_W + DAY_W / 2, BASELINE - amps[i]])
    }
    points.push([VB_W, BASELINE])

    const d = monotonePathD(points)
    // Fill under the mounds, closed along the baseline (flat runs enclose no area)
    return { strokeD: d, fillD: `${d} Z` }
  }, [notes])

  // Draw-in animation: a clip rectangle that grows left → right in ~1s, revealing
  // the curve as one continuous stroke (the grid sits outside the clip, so it is
  // there from the start). Skipped under prefers-reduced-motion.
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const [drawn, setDrawn] = useState(reducedMotion)
  useEffect(() => {
    if (reducedMotion) return
    // Double rAF: make sure the 0-width clip gets painted before transitioning
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setDrawn(true))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [reducedMotion])

  return (
    <section>
      <p className="text-xs font-mono font-medium text-text">{t.settings.general.activity.title}</p>
      <p className="text-[11px] font-mono text-text-muted mt-1">{t.settings.general.activity.hint}</p>

      <div className="mt-3 flex items-stretch gap-2">
        {/* Y axis: no numbers (the amplitude is normalised), just the direction */}
        <div
          className="flex items-center justify-center text-[10px] font-mono text-text-muted select-none"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          <span>{t.settings.general.activity.yAxis} ↑</span>
        </div>

        <div className="flex-1 min-w-0">
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            className="w-full h-32 block pointer-events-none"
          >
            <defs>
              <clipPath id={clipId}>
                <rect
                  x="0"
                  y="0"
                  height={VB_H}
                  style={{
                    width: drawn ? VB_W : 0,
                    transition: reducedMotion ? 'none' : 'width 1000ms cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                />
              </clipPath>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={FILL_INK} stopOpacity="0.16" />
                <stop offset="1" stopColor={FILL_INK} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Grid: behind the curve and outside the clip (always fully visible) */}
            <g strokeWidth={1} vectorEffect="non-scaling-stroke">
              {Array.from({ length: WEEK_LINES }, (_, i) => {
                const x = (i + 1) * 7 * DAY_W
                return (
                  <line
                    key={`w${i}`}
                    x1={x}
                    y1={BASELINE - MAX_AMP}
                    x2={x}
                    y2={BASELINE}
                    stroke={GRID}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}
              {H_GRID.map((f) => (
                <line
                  key={`h${f}`}
                  x1={0}
                  y1={BASELINE - MAX_AMP * f}
                  x2={VB_W}
                  y2={BASELINE - MAX_AMP * f}
                  stroke={GRID}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <line
                x1={0}
                y1={BASELINE}
                x2={VB_W}
                y2={BASELINE}
                stroke={GRID_BASELINE}
                vectorEffect="non-scaling-stroke"
              />
            </g>

            <g clipPath={`url(#${clipId})`}>
              <path d={fillD} fill={`url(#${gradId})`} stroke="none" />
              <path
                d={strokeD}
                fill="none"
                stroke={STROKE}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </svg>

          {/* X axis: oldest day on the left, today on the right */}
          <div className="flex items-center justify-between text-[10px] font-mono text-text-muted mt-1 select-none">
            <span>{t.settings.general.activity.xStart}</span>
            <span>{t.settings.general.activity.xEnd}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
