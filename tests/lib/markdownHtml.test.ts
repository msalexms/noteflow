import { describe, it, expect } from 'vitest'
import { htmlFromMarkdown } from '../../src/lib/markdownHtml'

// These tests exercise the markdown → HTML direction (a pure, node-safe string
// transform). The inverse `htmlToMarkdown` relies on the DOM (`DOMParser`) and
// therefore can't run in this node-only vitest env — but both the *correct* and
// the *old-buggy* serialized forms of a multi-line task are covered here at the
// markdown boundary, so the round-trip behaviour is characterised end to end:
//   - "annotation on the first line"  = what the fixed serializer now emits.
//   - "annotation on the last line"   = what the old, buggy serializer emitted;
//     the parser must recover it instead of leaking a literal 🔺 / 📅 / ⏰.

describe('htmlFromMarkdown — multi-line task annotations', () => {
  it('keeps data-importance on a multi-line task when the annotation is on the first line', () => {
    const md = '- [ ] Buy milk 🔺low\nand eggs'
    const html = htmlFromMarkdown(md)
    expect(html).toContain('data-type="taskList"')
    expect(html).toContain('data-importance="low"')
    // Both physical lines survive as a single task, joined by a hard break.
    expect(html).toContain('Buy milk<br>and eggs')
    // The annotation must not leak into the rendered text.
    expect(html).not.toContain('🔺')
  })

  it('recovers importance appended to the LAST line of a multi-line task (old buggy format)', () => {
    const md = '- [ ] Buy milk\nand eggs 🔺low'
    const html = htmlFromMarkdown(md)
    expect(html).toContain('data-importance="low"')
    expect(html).toContain('Buy milk<br>and eggs')
    expect(html).not.toContain('🔺')
  })

  it('recovers a date + importance appended to a continuation line', () => {
    const md = '- [ ] Ship release\npolish notes 📅2026-07-23 🔺high'
    const html = htmlFromMarkdown(md)
    expect(html).toContain('data-due="2026-07-23"')
    expect(html).toContain('data-importance="high"')
    expect(html).not.toContain('📅')
    expect(html).not.toContain('🔺')
  })

  it('does not let a continuation-line annotation overwrite the first-line one', () => {
    // First line wins: the stray 🔺low on the continuation line is stripped but
    // must not clobber the high importance declared on the `- [ ]` line.
    const md = '- [ ] Task 🔺high\nkeep going 🔺low'
    const html = htmlFromMarkdown(md)
    expect(html).toContain('data-importance="high"')
    expect(html).not.toContain('data-importance="low"')
    expect(html).not.toContain('🔺')
  })
})

// A table is followed by exactly one blank line in the serialized markdown
// (`tableElToMd` owns that separator). If a serializer ever emits an extra
// newline there, the next block gets parsed with a leading hard break and the
// gap grows on every save/reopen round-trip — these tests pin the boundary.
describe('htmlFromMarkdown — blocks after a table', () => {
  const table = '| a | b |\n| --- | --- |\n| 1 | 2 |'

  it('renders the paragraph after a table without a leading hard break', () => {
    const html = htmlFromMarkdown(`${table}\n\nText`)
    expect(html).toContain('<p>Text</p>')
    expect(html).not.toContain('<br>Text')
    expect(html).not.toContain('<p></p>')
  })

  it('renders a heading after a table without an empty paragraph before it', () => {
    const html = htmlFromMarkdown(`${table}\n\n# Title`)
    expect(html).toContain('<h1>Title</h1>')
    expect(html).not.toContain('<p><br></p>')
  })
})
