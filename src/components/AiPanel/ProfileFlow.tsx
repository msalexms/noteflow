import { useState } from 'react'
import { nanoid } from 'nanoid'
import { Loader2, Sparkles, Paperclip, X, Plus, Link2, FileText, Image as ImageIcon, Check } from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { useAiChatStore } from '../../stores/aiChatStore'
import type { NoteSection } from '../../types'
import { detectLocale, PROFILE_FIELDS, PROFILE_SECTIONS, type ProfileField } from './profileQuestions'
import { Card, FieldLabel, FIELD_INPUT, PANEL_LABEL, Segmented } from './ui'

type FieldValues = Record<string, string | string[]>
interface PickedFile { id: string; name: string; kind: 'pdf' | 'image' | 'text'; sizeBytes: number }

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function looksLikeUrl(v: string): boolean {
  return /^https?:\/\/.+\..+/i.test(v.trim())
}

export function ProfileFlow({ onDone }: { onDone: () => void }) {
  const createNote = useNotesStore((s) => s.createNote)
  const updateNote = useNotesStore((s) => s.updateNote)
  const capabilities = useAiChatStore((s) => s.llmConfig?.capabilities)

  const [values, setValues] = useState<FieldValues>({})
  const [files, setFiles] = useState<PickedFile[]>([])
  const [fileErrors, setFileErrors] = useState<string[]>([])
  const [urls, setUrls] = useState<string[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setText = (id: string, v: string) => setValues((s) => ({ ...s, [id]: v }))
  const getList = (id: string): string[] => (Array.isArray(values[id]) ? (values[id] as string[]) : [])
  const toggleChip = (id: string, opt: string) =>
    setValues((s) => {
      const cur = Array.isArray(s[id]) ? (s[id] as string[]) : []
      return { ...s, [id]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] }
    })
  // Single-select for `choice` fields: tapping the active pick clears it.
  const pickChoice = (id: string, opt: string) =>
    setValues((s) => ({ ...s, [id]: s[id] === opt ? '' : opt }))
  const addTag = (id: string, raw: string) => {
    const tag = raw.trim()
    if (!tag) return
    setValues((s) => {
      const cur = Array.isArray(s[id]) ? (s[id] as string[]) : []
      return cur.some((x) => x.toLowerCase() === tag.toLowerCase()) ? s : { ...s, [id]: [...cur, tag] }
    })
  }
  const removeTag = (id: string, tag: string) =>
    setValues((s) => ({ ...s, [id]: (s[id] as string[]).filter((x) => x !== tag) }))

  const fieldValue = (f: ProfileField): string => {
    const v = values[f.id]
    if (Array.isArray(v)) return v.join(', ')
    return (v ?? '').trim()
  }
  const filledCount = PROFILE_FIELDS.filter((f) => fieldValue(f).length > 0).length
  const hasAny = filledCount > 0 || files.length > 0 || urls.length > 0

  const pickFiles = async () => {
    setFileErrors([])
    const res = await window.noteflow.aiProfilePickFiles()
    if (!res.ok || !res.files) return
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.id))
      return [...prev, ...res.files!.filter((f) => !seen.has(f.id))]
    })
    if (res.errors?.length) setFileErrors(res.errors)
  }
  const removeFile = async (id: string) => {
    await window.noteflow.aiProfileRemoveFile(id)
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const addUrl = () => {
    const u = urlInput.trim()
    if (!u) return
    const normalized = looksLikeUrl(u) ? u : `https://${u}`
    if (!looksLikeUrl(normalized)) return
    setUrls((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]))
    setUrlInput('')
  }
  const removeUrl = (u: string) => setUrls((prev) => prev.filter((x) => x !== u))

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const fields = PROFILE_SECTIONS.flatMap((sec) =>
        sec.fields
          .map((f) => ({ section: sec.title, label: f.label, value: fieldValue(f) }))
          .filter((f) => f.value.length > 0),
      )
      const res = await window.noteflow.aiProfileGenerate({
        fields,
        fileIds: files.map((f) => f.id),
        urls,
        locale: detectLocale(),
      })
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

  const acceptHint = capabilities
    ? `${capabilities.pdf ? 'PDF, ' : ''}${capabilities.images ? 'images, ' : ''}text & code files`
    : 'text & code files'

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-4 flex flex-col gap-5 text-[13px] font-mono">
        {/* Intro */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-text">
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-accent/15 text-accent">
              <Sparkles size={14} />
            </span>
            <h2 className="text-[14px] font-bold tracking-wide">Create your profile</h2>
          </div>
          <p className="text-[12px] text-text-muted leading-relaxed">
            Tap what fits, add a few tags — that's all it takes. The AI fills in the rest and writes
            an editable profile note in your language, used as context for better answers.
          </p>
        </div>

        {/* Sections — each grouped on its own soft card, like the design. */}
        {PROFILE_SECTIONS.map((sec) => (
          <Card key={sec.id} className="flex flex-col gap-5 p-3.5">
            <div className="flex flex-col gap-0.5">
              <span className={PANEL_LABEL}>{sec.title}</span>
              {sec.description && <span className="text-[11px] text-text-muted/70 leading-snug normal-case">{sec.description}</span>}
            </div>

            {sec.fields.map((f) => (
              <div key={f.id} className="flex flex-col gap-2">
                {/* Binary "this or that" picks read as one row: question left, segmented control right. */}
                {f.type === 'choice' ? (
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel hint={f.hint}>{f.label}</FieldLabel>
                    <Segmented
                      options={f.options ?? []}
                      value={(values[f.id] as string) ?? ''}
                      onPick={(opt) => pickChoice(f.id, opt)}
                      disabled={busy}
                    />
                  </div>
                ) : (
                  <>
                    <FieldLabel hint={f.hint}>{f.label}</FieldLabel>

                    {f.type === 'text' && (
                      <textarea
                        value={(values[f.id] as string) ?? ''}
                        onChange={(e) => setText(f.id, e.target.value)}
                        rows={2}
                        disabled={busy}
                        placeholder={f.placeholder}
                        className={`resize-none ${FIELD_INPUT}`}
                      />
                    )}

                    {f.type === 'chips' && (
                      <div className="flex flex-wrap gap-1.5">
                        {f.options?.map((opt) => {
                          const active = getList(f.id).includes(opt)
                          return (
                            <button
                              key={opt}
                              type="button"
                              disabled={busy}
                              onClick={() => toggleChip(f.id, opt)}
                              className={`flex items-center gap-1 pl-2 pr-2.5 py-1 rounded-full text-[12px] border-solid border transition-colors disabled:opacity-50 ${
                                active
                                  ? 'bg-accent/15 border-accent/50 text-text'
                                  : 'bg-surface-0 text-text-muted border-border hover:text-text hover:border-text/30'
                              }`}
                            >
                              <Check size={11} className={active ? 'text-accent' : 'opacity-0'} />
                              {opt}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {f.type === 'tags' && (
                      <TagsField
                        field={f}
                        tags={getList(f.id)}
                        busy={busy}
                        onAdd={(v) => addTag(f.id, v)}
                        onRemove={(t) => removeTag(f.id, t)}
                      />
                    )}
                  </>
                )}
              </div>
            ))}
          </Card>
        ))}

        {/* Extras: files + links */}
        <Card className="flex flex-col gap-4 p-3.5">
          <span className={PANEL_LABEL}>Add more — optional</span>

          {/* Files */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel>Files</FieldLabel>
              <button
                type="button"
                onClick={pickFiles}
                disabled={busy}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg border-solid border border-border text-[11px] text-text-muted hover:text-text hover:border-text/30 transition-colors disabled:opacity-50"
              >
                <Paperclip size={11} /> Add files
              </button>
            </div>
            <span className="text-[11px] text-text-muted/60 leading-snug">
              The AI reads them directly. Supported here: {acceptHint}.
            </span>
            {files.length > 0 && (
              <div className="flex flex-col gap-1">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-[12px] text-text bg-surface-0 border-solid border border-border rounded-lg px-2.5 py-1.5">
                    {f.kind === 'image'
                      ? <ImageIcon size={12} className="shrink-0 text-accent" />
                      : <FileText size={12} className="shrink-0 text-accent" />}
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-text-muted/50 text-[11px]">{formatBytes(f.sizeBytes)}</span>
                    <button type="button" onClick={() => removeFile(f.id)} disabled={busy} className="text-text-muted hover:text-red transition-colors disabled:opacity-50">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {fileErrors.map((e, i) => (
              <span key={i} className="text-[11px] text-amber-400">{e}</span>
            ))}
          </div>

          {/* Links */}
          <div className="flex flex-col gap-2">
            <FieldLabel>Links</FieldLabel>
            <div className="flex items-center gap-1.5">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl() } }}
                disabled={busy}
                placeholder="LinkedIn, portfolio, GitHub, X…"
                className={`flex-1 ${FIELD_INPUT} py-1.5`}
              />
              <button type="button" onClick={addUrl} disabled={busy || !urlInput.trim()} className="flex items-center justify-center w-8 h-8 rounded-lg border-solid border border-border text-text-muted hover:text-text hover:border-text/30 transition-colors disabled:opacity-40">
                <Plus size={14} />
              </button>
            </div>
            {urls.length > 0 && (
              <div className="flex flex-col gap-1">
                {urls.map((u) => (
                  <div key={u} className="flex items-center gap-2 text-[12px] text-text bg-surface-0 border-solid border border-border rounded-lg px-2.5 py-1.5">
                    <Link2 size={12} className="shrink-0 text-accent" />
                    <span className="truncate flex-1">{u}</span>
                    <button type="button" onClick={() => removeUrl(u)} disabled={busy} className="text-text-muted hover:text-red transition-colors disabled:opacity-50">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {error && <p className="text-[12px] text-red-400">{error}</p>}
      </div>

      <div className="flex-shrink-0 border-t border-border p-2.5 flex items-center gap-2">
        <button
          onClick={skip}
          disabled={busy}
          className="px-3 py-2 rounded border-solid border border-border text-text-muted text-[12px] font-mono hover:text-text hover:border-text/30 transition-colors disabled:opacity-50"
        >
          Not now
        </button>
        <button
          onClick={generate}
          disabled={busy || !hasAny}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded bg-text text-surface-0 text-[12px] font-mono font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {busy ? 'Generating…' : 'Generate profile'}
        </button>
      </div>
    </div>
  )
}

function TagsField({
  field, tags, busy, onAdd, onRemove,
}: {
  field: ProfileField
  tags: string[]
  busy: boolean
  onAdd: (v: string) => void
  onRemove: (t: string) => void
}) {
  const [input, setInput] = useState('')
  const commit = () => { onAdd(input); setInput('') }
  const suggestions = (field.options ?? []).filter((o) => !tags.some((t) => t.toLowerCase() === o.toLowerCase()))

  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[12px] bg-accent/15 border-solid border border-accent/50 text-text">
              {t}
              <button type="button" onClick={() => onRemove(t)} disabled={busy} className="text-text-muted hover:text-text transition-colors disabled:opacity-50">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
          else if (e.key === 'Backspace' && !input && tags.length) onRemove(tags[tags.length - 1])
        }}
        disabled={busy}
        placeholder={field.placeholder}
        className={`${FIELD_INPUT} py-1.5`}
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={busy}
              onClick={() => onAdd(opt)}
              className="flex items-center gap-1 pl-1.5 pr-2.5 py-1 rounded-full text-[12px] border-solid border border-border bg-surface-0 text-text-muted hover:text-text hover:border-text/30 transition-colors disabled:opacity-50"
            >
              <Plus size={11} className="opacity-60" />
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
