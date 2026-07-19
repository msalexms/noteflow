// Pure day-bucketing logic behind the decorative "activity pulse" (EKG line) in
// Settings → General (src/components/Settings/ActivityPulse.tsx).
//
// A note contributes once per DISTINCT local day among its `created` and `updated`
// timestamps (created + edited the same day counts once). Only timestamps and the
// group id are read — never titles or content — so archived, encrypted and
// temporary notes all count.

export const ACTIVITY_WINDOW_DAYS = 112 // ~16 weeks

// Minimal shape needed from a note (structural subset of NoteMeta)
export interface ActivityNoteInput {
  created: string
  updated: string
  group?: string
}

export interface ActivityDay {
  /** Number of notes with activity that day. */
  count: number
  /** groupId with most activity that day; null when ungrouped notes win (neutral). */
  dominantGroup: string | null
}

/**
 * Buckets note activity into one entry per local day, oldest first
 * (index 0 = `windowDays - 1` days ago, last index = today).
 */
export function bucketDailyActivity(
  notes: ActivityNoteInput[],
  now: Date = new Date(),
  windowDays: number = ACTIVITY_WINDOW_DAYS,
): ActivityDay[] {
  // Local midnight of the first day in the window. Using the Date constructor
  // (not ms arithmetic) keeps buckets aligned across DST changes.
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (windowDays - 1))
  const startMs = start.getTime()

  const counts = new Array<number>(windowDays).fill(0)
  // Per-day activity per group key ('' = ungrouped)
  const groupCounts: Map<string, number>[] = Array.from({ length: windowDays }, () => new Map())

  const dayIndex = (iso: string): number | null => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    const localMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    // Round (not floor) so a DST hour offset cannot shift the bucket
    const idx = Math.round((localMidnight.getTime() - startMs) / 86_400_000)
    return idx >= 0 && idx < windowDays ? idx : null
  }

  for (const note of notes) {
    const days = new Set<number>()
    const c = dayIndex(note.created)
    if (c !== null) days.add(c)
    const u = dayIndex(note.updated)
    if (u !== null) days.add(u)
    for (const idx of days) {
      counts[idx]++
      const key = note.group ?? ''
      const m = groupCounts[idx]
      m.set(key, (m.get(key) ?? 0) + 1)
    }
  }

  return counts.map((count, i) => {
    let bestKey = ''
    let best = 0
    for (const [key, n] of groupCounts[i]) {
      if (n > best) {
        best = n
        bestKey = key
      } else if (n === best && bestKey === '' && key !== '') {
        // Tie between ungrouped and a group → prefer the group (more colourful)
        bestKey = key
      }
    }
    return { count, dominantGroup: bestKey === '' ? null : bestKey }
  })
}
