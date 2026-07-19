import { describe, it, expect } from 'vitest'
import { bucketDailyActivity, ACTIVITY_WINDOW_DAYS } from '../../src/lib/activityPulse'

// Fixed "now" for deterministic buckets (local time)
const NOW = new Date(2026, 6, 14, 15, 30) // 2026-07-14 15:30 local
const LAST = ACTIVITY_WINDOW_DAYS - 1 // index of "today"

function iso(daysAgo: number, hour = 10): string {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, hour)
  return d.toISOString()
}

describe('bucketDailyActivity', () => {
  it('returns one bucket per day of the window, all empty without notes', () => {
    const days = bucketDailyActivity([], NOW)
    expect(days).toHaveLength(ACTIVITY_WINDOW_DAYS)
    expect(days.every((d) => d.count === 0 && d.dominantGroup === null)).toBe(true)
  })

  it('counts created and updated on their own days', () => {
    const days = bucketDailyActivity([{ created: iso(5), updated: iso(2) }], NOW)
    expect(days[LAST - 5].count).toBe(1)
    expect(days[LAST - 2].count).toBe(1)
    expect(days[LAST].count).toBe(0)
  })

  it('a note created and updated the same day counts once', () => {
    const days = bucketDailyActivity([{ created: iso(3, 9), updated: iso(3, 20) }], NOW)
    expect(days[LAST - 3].count).toBe(1)
  })

  it('ignores activity outside the window and invalid timestamps', () => {
    const days = bucketDailyActivity(
      [
        { created: iso(ACTIVITY_WINDOW_DAYS + 10), updated: iso(ACTIVITY_WINDOW_DAYS + 5) },
        { created: 'not-a-date', updated: '' },
      ],
      NOW,
    )
    expect(days.every((d) => d.count === 0)).toBe(true)
  })

  it('picks the group with most activity as dominant; ungrouped is neutral', () => {
    const days = bucketDailyActivity(
      [
        { created: iso(1), updated: iso(1), group: 'g1' },
        { created: iso(1), updated: iso(1), group: 'g1' },
        { created: iso(1), updated: iso(1), group: 'g2' },
        { created: iso(1), updated: iso(1) }, // ungrouped
        { created: iso(0), updated: iso(0) }, // today, only ungrouped
      ],
      NOW,
    )
    expect(days[LAST - 1].count).toBe(4)
    expect(days[LAST - 1].dominantGroup).toBe('g1')
    expect(days[LAST].count).toBe(1)
    expect(days[LAST].dominantGroup).toBeNull()
  })

  it('prefers a group over ungrouped on a tie', () => {
    const days = bucketDailyActivity(
      [
        { created: iso(4), updated: iso(4) },
        { created: iso(4), updated: iso(4), group: 'g1' },
      ],
      NOW,
    )
    expect(days[LAST - 4].dominantGroup).toBe('g1')
  })
})
