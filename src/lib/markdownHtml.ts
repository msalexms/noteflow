// ── Markdown ↔ HTML helpers ──────────────────────────────────────────────────
//
// Shared between the TipTap editor (round-trips note content) and read-only
// renderers like the Note overview miniature preview. Kept framework-free so it
// can live in lib/ and be imported anywhere without dragging in React.
//
// Rules:
//   - Blank line (two newlines) = paragraph break  → </p><p>
//   - Single newline within a paragraph             → <br>  (HardBreak)
//   - Lists: consecutive same-type items are merged into one <ul>/<ol>
//

// Sentinel character used to protect blank lines inside code fences from
// the \n\n block-splitter. Must not appear in real user content.
const FENCE_BLANK = '\x00'

export function htmlFromMarkdown(md: string): string {
  if (!md.trim()) return '<p></p>'

  // Normalise line endings
  const src = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Protect blank lines inside code fences before splitting on \n\n.
  // Without this, a code block containing an empty line would be torn apart:
  // only the first fragment starts with ```, so the rest becomes plain text.
  const protectedSrc = src.replace(/^```[\s\S]*?^```[ \t]*$/gm, (m) =>
    m.replace(/\n\n/g, '\n' + FENCE_BLANK + '\n')
  )

  // Split into "blocks" on blank lines — use exactly \n\n so that multiple
  // consecutive blank lines produce empty blocks, preserving them as <p></p>.
  const rawBlocks = protectedSrc.split(/\n\n/)
  const htmlBlocks: string[] = []

  // Merge consecutive list blocks so that blank lines between list items
  // (stored as \n\n in markdown) are preserved as hard breaks inside the
  // preceding item rather than splitting into separate disconnected lists.
  const isBlockAList = (b: string) => {
    const first = b.split('\n').find(l => l.trim())
    return !!first && /^\s*(?:[-*+]|\d+\.)[ \t]/.test(first)
  }
  const blocks: string[] = []
  for (const raw of rawBlocks) {
    if (isBlockAList(raw) && blocks.length > 0 && isBlockAList(blocks[blocks.length - 1])) {
      blocks[blocks.length - 1] += '\n\n' + raw
    } else {
      blocks.push(raw)
    }
  }

  for (const block of blocks) {
    const lines = block.split('\n')

    // ── Code fence ──────────────────────────────────────────────────────────
    if (/^```/.test(lines[0])) {
      const lang = lines[0].slice(3).trim()
      const code = lines.slice(1).join('\n').replace(/```\s*$/, '').trimEnd()
        .replace(new RegExp(FENCE_BLANK, 'g'), '')
      htmlBlocks.push(`<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`)
      continue
    }

    // ── Headings ─────────────────────────────────────────────────────────────
    if (lines.length === 1) {
      const hm = lines[0].match(/^(#{1,3})\s+(.+)$/)
      if (hm) {
        const level = hm[1].length
        htmlBlocks.push(`<h${level}>${inlineToHtml(hm[2])}</h${level}>`)
        continue
      }
    }

    // ── Horizontal Rule ──────────────────────────────────────────────────────
    if (lines.length === 1 && lines[0].trim() === '---') {
      htmlBlocks.push('<hr>')
      continue
    }

    // ── List block (supports nested/indented items) ───────────────────────────
    const firstMeaningfulLine = lines.find(l => l.trim())
    const isListBlock = !!firstMeaningfulLine && /^\s*(?:[-*+]|\d+\.)[ \t]/.test(firstMeaningfulLine)

    if (isListBlock) {
      htmlBlocks.push(mdListBlockToHtml(lines))
      continue
    }

    // ── Pipe table ──────────────────────────────────────────────────────────
    // Strict detection: line 1 must contain a |, line 2 must be a separator
    // row with only |, :, -, spaces; every cell ≥3 dashes; ≥2 cells. This
    // avoids reinterpreting paragraphs that contain literal | characters.
    const isPipeTable =
      lines.length >= 2 &&
      /\|/.test(lines[0]) &&
      TABLE_SEPARATOR_RE.test(lines[1])

    if (isPipeTable) {
      htmlBlocks.push(mdTableToHtml(lines))
      continue
    }

    // ── Paragraph (may span multiple lines — single \n becomes <br>) ────────
    const paraContent = lines
      .map((l) => {
        const hm = l.match(/^(#{1,3})\s+(.+)$/)
        if (hm) {
          const level = hm[1].length
          return `</p><h${level}>${inlineToHtml(hm[2])}</h${level}><p>`
        }
        return inlineToHtml(l)
      })
      .join('<br>')
      // clean up <p></p> artefacts from heading injection
      .replace(/<p><\/p>/g, '')
      .replace(/<\/p><br>/g, '</p>')
      .replace(/<br><p>/g, '<p>')

    htmlBlocks.push(`<p>${paraContent}</p>`)
  }

  return htmlBlocks.join('') || '<p></p>'
}

// ── htmlToMarkdown: DOM-based walker to preserve nested list structure ────────

export function htmlToMarkdown(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')
  let result = ''
  for (const child of doc.body.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      result += blockElToMd(child as Element)
    }
  }
  return result.trim()
}

function blockElToMd(el: Element): string {
  const tag = el.tagName.toLowerCase()
  if (tag === 'p') return inlineElToMd(el) + '\n\n'
  if (tag === 'h1') return `# ${inlineElToMd(el)}\n\n`
  if (tag === 'h2') return `## ${inlineElToMd(el)}\n\n`
  if (tag === 'h3') return `### ${inlineElToMd(el)}\n\n`
  if (tag === 'hr') return `---\n\n`
  if (tag === 'pre') {
    const codeEl = el.querySelector('code')
    const lang = (codeEl?.className ?? '').replace('language-', '')
    const code = codeEl?.textContent ?? ''
    return `\`\`\`${lang}\n${code.trimEnd()}\n\`\`\`\n\n`
  }
  if (tag === 'table') return tableElToMd(el) + '\n'
  if (tag === 'ul' || tag === 'ol') return listElToMd(el, 0) + '\n'
  let out = ''
  for (const c of el.childNodes) {
    if (c.nodeType === Node.ELEMENT_NODE) out += blockElToMd(c as Element)
  }
  return out
}

function inlineElToMd(el: Element): string {
  let result = ''
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      // &nbsp; in HTML becomes \u00A0 in textContent — restore to regular space
      result += (child.textContent ?? '').replace(/\u00A0/g, ' ')
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const c = child as Element
      const tag = c.tagName.toLowerCase()
      if (tag === 'strong' || tag === 'b') result += `**${inlineElToMd(c)}**`
      else if (tag === 'em' || tag === 'i') result += `*${inlineElToMd(c)}*`
      else if (tag === 's') result += `~~${inlineElToMd(c)}~~`
      else if (tag === 'code') result += `\`${(c.textContent ?? '').replace(/\u00A0/g, ' ')}\``
      else if (tag === 'br') result += '\n'
      else if (tag === 'img') {
        const w = c.getAttribute('width')
        const suffix = w ? `{width=${w}}` : ''
        result += `![${c.getAttribute('alt') ?? ''}](${c.getAttribute('src') ?? ''})${suffix}`
      }
      else if (tag === 'a') result += `[${inlineElToMd(c)}](${c.getAttribute('href') ?? ''})`
      else result += inlineElToMd(c)
    }
  }
  return result
}

function listElToMd(listEl: Element, depth: number): string {
  const prefix = '  '.repeat(depth)
  const isTaskList = listEl.getAttribute('data-type') === 'taskList'
  const isOl = listEl.tagName.toLowerCase() === 'ol'
  let result = ''
  let olIndex = 1

  for (const li of listEl.children) {
    const isTaskItem = li.getAttribute('data-type') === 'taskItem'
    let text = ''
    const nestedListEls: Element[] = []

    for (const child of li.childNodes) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const c = child as Element
      const tag = c.tagName.toLowerCase()
      if (tag === 'p') {
        if (text) text += '\n'
        text += inlineElToMd(c)
      } else if (tag === 'div') {
        // TipTap may wrap task item content in a <div>
        for (const gc of c.childNodes) {
          if (gc.nodeType !== Node.ELEMENT_NODE) continue
          const gcEl = gc as Element
          const gcTag = gcEl.tagName.toLowerCase()
          if (gcTag === 'p') { if (text) text += '\n'; text += inlineElToMd(gcEl) }
          else if (gcTag === 'ul' || gcTag === 'ol') nestedListEls.push(gcEl)
        }
      } else if (tag === 'ul' || tag === 'ol') {
        nestedListEls.push(c)
      }
      // <label> and <input> are intentionally skipped
    }

    if (isTaskItem || isTaskList) {
      const checked   = li.getAttribute('data-checked') === 'true'
      const due       = li.getAttribute('data-due')
      const alarm     = li.getAttribute('data-alarm')
      const dueAnn    = due   ? ` 📅${due}`   : ''
      const alarmAnn  = alarm ? ` ⏰${alarm}` : ''
      result += `${prefix}- [${checked ? 'x' : ' '}] ${text}${dueAnn}${alarmAnn}\n`
    } else if (isOl) {
      result += `${prefix}${olIndex++}. ${text}\n`
    } else {
      result += `${prefix}- ${text}\n`
    }

    for (const nested of nestedListEls) {
      result += listElToMd(nested, depth + 1)
    }
  }

  return result
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Convert inline markdown (bold, italic, code, links, etc.) to HTML */
function inlineToHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Preserve runs of 2+ spaces: ProseMirror collapses regular spaces when
    // parsing HTML, so we use &nbsp; to keep them intact.
    .replace(/ {2,}/g, (m) => '&nbsp;'.repeat(m.length))
    .replace(/!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/g, (_, alt, src, w) =>
      w ? `<img alt="${alt}" src="${src}" width="${w}">` : `<img alt="${alt}" src="${src}">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
}

// ── Nested markdown list parsing (htmlFromMarkdown helpers) ──────────────────

interface MdListItem {
  type: 'ul' | 'ol' | 'task'
  checked: boolean
  text: string
  due: string | null
  alarm: string | null
  children: MdListItem[]
}

function extractDeadlineAnnotations(raw: string): { text: string; due: string | null; alarm: string | null } {
  let text = raw
  let due: string | null = null
  let alarm: string | null = null
  const dueMatch = text.match(/📅(\d{4}-\d{2}-\d{2})/)
  if (dueMatch) { due = dueMatch[1]; text = text.replace(dueMatch[0], '').trim() }
  const alarmMatch = text.match(/⏰(\d{2}:\d{2})/)
  if (alarmMatch) { alarm = alarmMatch[1]; text = text.replace(alarmMatch[0], '').trim() }
  return { text, due, alarm }
}

function parseMdListItems(lines: string[]): MdListItem[] {
  const result: MdListItem[] = []
  const stack: { depth: number; node: MdListItem }[] = []

  for (const line of lines) {
    // Blank line or empty list item (e.g. "- " left by YAML) — append a line
    // break to the preceding item so it renders as <br> (visual blank line)
    // rather than a new bullet point.
    const isEmptyListMarker = /^\s*[-*+]\s*$/.test(line)
    if (!line.trim() || isEmptyListMarker) {
      const lastNode = stack.length > 0 ? stack[stack.length - 1].node
                     : result.length > 0 ? result[result.length - 1]
                     : null
      if (lastNode) lastNode.text += '\n'
      continue
    }

    const indentLen = line.match(/^(\s*)/)?.[1].length ?? 0
    const depth = Math.floor(indentLen / 2)

    const taskMatch = line.match(/^\s*- \[([ x])\] ?(.*)$/)
    const olMatch = line.match(/^\s*(\d+)\. (.*)$/)
    const ulMatch = line.match(/^\s*[-*+] (.*)$/)

    let item: MdListItem
    if (taskMatch) {
      const { text: cleanText, due, alarm } = extractDeadlineAnnotations(taskMatch[2])
      item = { type: 'task', checked: taskMatch[1] === 'x', text: cleanText, due, alarm, children: [] }
    } else if (olMatch) {
      item = { type: 'ol', checked: false, text: olMatch[2], due: null, alarm: null, children: [] }
    } else if (ulMatch) {
      item = { type: 'ul', checked: false, text: ulMatch[1], due: null, alarm: null, children: [] }
    } else {
      // Continuation line (soft/hard break inside list item) — append to last item
      if (stack.length > 0) {
        stack[stack.length - 1].node.text += '\n' + line.trim()
      }
      continue
    }

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop()
    }

    if (stack.length === 0) {
      result.push(item)
    } else {
      stack[stack.length - 1].node.children.push(item)
    }

    stack.push({ depth, node: item })
  }

  return result
}

function renderMdListItems(items: MdListItem[]): string {
  if (items.length === 0) return ''

  const firstType = items[0].type
  const isTask = firstType === 'task'
  const isOl = firstType === 'ol'

  const innerHtml = items.map(item => {
    const childHtml = item.children.length > 0 ? renderMdListItems(item.children) : ''
    if (item.type === 'task') {
      const dueAttr   = item.due   ? ` data-due="${item.due}"`     : ''
      const alarmAttr = item.alarm ? ` data-alarm="${item.alarm}"` : ''
      return `<li data-checked="${item.checked}" data-type="taskItem"${dueAttr}${alarmAttr}><label><input type="checkbox"${item.checked ? ' checked' : ''}></label><p>${item.text.split('\n').map(inlineToHtml).join('<br>')}</p>${childHtml}</li>`
    }
    return `<li><p>${item.text.split('\n').map(inlineToHtml).join('<br>')}</p>${childHtml}</li>`
  }).join('')

  if (isTask) return `<ul data-type="taskList">${innerHtml}</ul>`
  if (isOl) return `<ol>${innerHtml}</ol>`
  return `<ul>${innerHtml}</ul>`
}

function mdListBlockToHtml(lines: string[]): string {
  return renderMdListItems(parseMdListItems(lines))
}

// ── Pipe table helpers ───────────────────────────────────────────────────────

// A markdown table separator row: only |, :, -, spaces; each cell ≥3 dashes;
// ≥2 cells. Strict (≥3 dashes) so paragraphs with literal | aren't mistaken
// for tables. Shared by block parsing and the paste handler.
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/

/** True if the text has a header line immediately followed by a separator row. */
export function containsMarkdownTable(md: string): boolean {
  const lines = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    if (/\|/.test(lines[i]) && TABLE_SEPARATOR_RE.test(lines[i + 1])) return true
  }
  return false
}

function splitPipeRow(line: string): string[] {
  const trimmed = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '\\' && trimmed[i + 1] === '|') { cur += '|'; i++; continue }
    if (ch === '|') { cells.push(cur); cur = ''; continue }
    cur += ch
  }
  cells.push(cur)
  return cells.map(c => c.trim())
}

function parseAlign(sep: string): 'left' | 'center' | 'right' | null {
  const s = sep.trim()
  const L = s.startsWith(':'), R = s.endsWith(':')
  if (L && R) return 'center'
  if (R) return 'right'
  if (L) return 'left'
  return null
}

function renderCell(c: string): string {
  return c.split(/<br\s*\/?>/i).map(inlineToHtml).join('<br>')
}

function mdTableToHtml(lines: string[]): string {
  const header = splitPipeRow(lines[0])
  const aligns = splitPipeRow(lines[1]).map(parseAlign)
  const bodyLines = lines.slice(2).filter(l => l.trim() && /\|/.test(l))
  const styleFor = (i: number) =>
    aligns[i] ? ` style="text-align:${aligns[i]}"` : ''

  const thead = `<tr>${header.map((c, i) =>
    `<th${styleFor(i)}>${renderCell(c)}</th>`).join('')}</tr>`

  const tbody = bodyLines.map(l => {
    const cells = splitPipeRow(l)
    while (cells.length < header.length) cells.push('')
    cells.length = header.length
    return `<tr>${cells.map((c, i) =>
      `<td${styleFor(i)}>${renderCell(c)}</td>`).join('')}</tr>`
  }).join('')

  return `<table>${thead}${tbody}</table>`
}

function escapeCell(md: string): string {
  return md.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
}

function tableElToMd(tbl: Element): string {
  const rows = Array.from(tbl.querySelectorAll('tr'))
  if (rows.length === 0) return ''

  const headerRow = rows[0]
  const firstHasTh = Array.from(headerRow.children).some(
    c => c.tagName.toLowerCase() === 'th'
  )
  const cellMd = (c: Element) =>
    escapeCell(inlineElToMd(c).trim()) || ' '

  const aligns = Array.from(headerRow.children).map(c => {
    const s = (c as HTMLElement).style?.textAlign ?? ''
    if (s === 'center') return ':---:'
    if (s === 'right')  return '---:'
    if (s === 'left')   return ':---'
    return '---'
  })

  const toLine = (r: Element) =>
    '| ' + Array.from(r.children).map(cellMd).join(' | ') + ' |'

  const head = firstHasTh
    ? toLine(headerRow)
    : '| ' + aligns.map(() => ' ').join(' | ') + ' |'
  const sep  = '| ' + aligns.join(' | ') + ' |'
  const body = rows.slice(firstHasTh ? 1 : 0).map(toLine).join('\n')

  return [head, sep, body].filter(Boolean).join('\n') + '\n\n'
}
