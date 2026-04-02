import type { Note } from '../types'

export interface AlarmEntry {
  noteTitle: string
  taskText: string
  alarmAt: string  // ISO timestamp 'YYYY-MM-DDTHH:MM:00'
}

// Matches tasks with both 📅 date and ⏰ time in any order on the same line
const TASK_ALARM_RE = /^- \[[ x]\] ((?:(?!📅|⏰).)*?)📅(\d{4}-\d{2}-\d{2})(?:(?:.*?)⏰(\d{2}:\d{2}))?/gm

export function collectAlarms(notes: Note[]): AlarmEntry[] {
  const result: AlarmEntry[] = []
  const now = Date.now()
  const past24h  = now - 24  * 60 * 60 * 1000
  const future7d = now + 7 * 24 * 60 * 60 * 1000

  for (const note of notes) {
    for (const section of note.sections) {
      let m: RegExpExecArray | null
      TASK_ALARM_RE.lastIndex = 0
      while ((m = TASK_ALARM_RE.exec(section.content)) !== null) {
        const taskText = m[1].trim()
        const due      = m[2]         // YYYY-MM-DD
        const alarmT   = m[3] ?? null // HH:MM or null

        // Only schedule alarms that have an explicit alarm time
        if (!alarmT) continue

        const alarmAt  = `${due}T${alarmT}:00`
        const t = new Date(alarmAt).getTime()

        // Include only alarms within the last 24h (missed) and next 7 days
        if (t >= past24h && t <= future7d) {
          result.push({ noteTitle: note.title, taskText, alarmAt })
        }
      }
    }
  }

  return result
}
