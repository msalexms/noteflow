// Notion HTML → markdown. Notion's HTML export wraps the page title in
// <h1 class="page-title"> and the content in <div class="page-body">. We extract
// the body, normalize Notion's markup into the TipTap-shaped HTML that
// htmlToMarkdown expects (it must run in the renderer — DOMParser), and convert.
// Page metadata (properties table, description) and images are dropped for v1.
import { htmlToMarkdown } from './markdownHtml'

/** Reads the page title from a Notion <body> fragment, if present. */
export function notionTitle(bodyHtml: string): string | null {
  const doc = new DOMParser().parseFromString(`<body>${bodyHtml}</body>`, 'text/html')
  const el = doc.querySelector('.page-title')
  const text = el?.textContent?.trim()
  return text || null
}

/**
 * Wraps an element's loose inline content (text nodes, <span>, <a>, …) into a
 * <p>, leaving nested lists / existing <p> in place. Notion puts list-item and
 * to-do text directly in the <li> (often inside <span>), which htmlToMarkdown —
 * built for TipTap markup — only reads when it lives in a <p>.
 */
function wrapLooseInline(doc: Document, el: Element): void {
  let inline: ChildNode[] = []
  const flush = (before: ChildNode | null) => {
    // Drop leading/trailing whitespace-only nodes (Notion leaves a " " where the
    // checkbox was, which would otherwise show as a double space in the markdown).
    while (inline.length && !inline[0].textContent?.trim()) inline.shift()
    while (inline.length && !inline[inline.length - 1].textContent?.trim()) inline.pop()
    if (inline.length === 0) return
    const p = doc.createElement('p')
    for (const n of inline) p.appendChild(n)
    el.insertBefore(p, before)
    inline = []
  }
  for (const child of Array.from(el.childNodes)) {
    const tag = child.nodeType === Node.ELEMENT_NODE ? (child as Element).tagName.toLowerCase() : ''
    if (tag === 'ul' || tag === 'ol' || tag === 'p') flush(child)
    else inline.push(child)
  }
  flush(null)
}

/** Converts a Notion <body> fragment to markdown (content only, no title). */
export function notionBodyToMarkdown(bodyHtml: string): string {
  const doc = new DOMParser().parseFromString(`<body>${bodyHtml}</body>`, 'text/html')
  const root = doc.querySelector('.page-body') ?? doc.body

  // To-do lists → TipTap task lists (checkbox state → data-checked).
  for (const ul of Array.from(root.querySelectorAll('ul.to-do-list'))) {
    ul.setAttribute('data-type', 'taskList')
    for (const li of Array.from(ul.children)) {
      const box = li.querySelector('.checkbox')
      li.setAttribute('data-type', 'taskItem')
      li.setAttribute('data-checked', String(!!box && box.classList.contains('checkbox-on')))
    }
  }

  // Figures hold embeds/bookmarks (a link) or images. Preserve the link as a
  // paragraph; drop image-only figures (images aren't imported in v1).
  for (const fig of Array.from(root.querySelectorAll('figure'))) {
    const links = Array.from(fig.querySelectorAll('a'))
    if (links.length) {
      const p = doc.createElement('p')
      links.forEach((a, idx) => { if (idx) p.append(' '); p.appendChild(a) })
      fig.replaceWith(p)
    } else {
      fig.remove()
    }
  }

  // Drop Notion helper nodes that carry no textual content.
  for (const junk of Array.from(root.querySelectorAll('.checkbox, .indented, div.column-spacer'))) {
    junk.remove()
  }

  // Ensure list-item text lives in a <p> so htmlToMarkdown picks it up.
  for (const li of Array.from(root.querySelectorAll('li'))) wrapLooseInline(doc, li)

  return htmlToMarkdown(root.innerHTML).trim()
}
