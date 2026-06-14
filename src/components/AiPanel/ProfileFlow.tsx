import { useState } from 'react'
import { nanoid } from 'nanoid'
import { Loader2, Sparkles } from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import type { NoteSection } from '../../types'
import { detectLocale, PROFILE_QUESTIONS } from './profileQuestions'

export function ProfileFlow({ onDone }: { onDone: () => void }) {
  const createNote = useNotesStore((s) => s.createNote)
  const updateNote = useNotesStore((s) => s.updateNote)

  const questions = PROFILE_QUESTIONS
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setAnswer = (id: string, value: string) => setAnswers((a) => ({ ...a, [id]: value }))
  const hasAny = Object.values(answers).some((v) => v.trim().length > 0)

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const payload = questions
        .filter((q) => (answers[q.id] ?? '').trim().length > 0)
        .map((q) => ({ question: q.question, answer: answers[q.id].trim() }))
      const res = await window.noteflow.aiProfileGenerate(payload, detectLocale())
      if (!res.ok || !res.title || !res.sections) {
        setError(res.error ?? 'Could not generate the profile')
        setBusy(false)
        return
      }
      // Create the note through the normal store path so it gets indexed like any other.
      const note = await createNote()
      const sections: NoteSection[] = res.sections.map((s) => ({
        id: nanoid(8),
        name: s.name,
        content: s.content,
        isRawMode: true,
      }))
      await updateNote(note.id, { title: res.title, sections })
      await window.noteflow.aiProfileSetCompleted()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const skip = async () => {
    await window.noteflow.aiProfileSetCompleted()
    onDone()
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-text">
          <Sparkles size={15} />
          <h2 className="text-[12px] font-mono font-bold tracking-wide">Create your profile</h2>
        </div>
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">
          Answer whatever you like. The AI will generate an editable profile note in your language.
          This helps it give you more accurate answers.
        </p>

        {questions.map((q) => (
          <div key={q.id} className="flex flex-col gap-1">
            <label className="text-[11px] font-mono text-text/80">{q.question}</label>
            <textarea
              value={answers[q.id] ?? ''}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              rows={2}
              disabled={busy}
              className="resize-none bg-surface-0 border border-border rounded px-2 py-1.5 text-[12px] font-mono text-text placeholder-text-muted/40 outline-none focus:border-text/30 disabled:opacity-60"
            />
          </div>
        ))}

        {error && <p className="text-[11px] font-mono text-red-400">{error}</p>}
      </div>

      <div className="flex-shrink-0 border-t border-text/10 p-2 flex gap-2">
        <button
          onClick={skip}
          disabled={busy}
          className="flex-1 px-3 py-2 rounded border border-border text-text-muted text-[11px] font-mono hover:text-text hover:border-text/30 transition-colors disabled:opacity-50"
        >
          Not now
        </button>
        <button
          onClick={generate}
          disabled={busy || !hasAny}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded bg-text text-surface-0 text-[11px] font-mono font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {busy ? 'Generating…' : 'Generate profile'}
        </button>
      </div>
    </div>
  )
}
