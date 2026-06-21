"use strict";
/**
 * importers/ — external note-app importers (main process).
 *
 * These do IO only: read files / unzip, and emit a normalized intermediate
 * (`ExternalNote`). They do NOT serialize to the v2 folder format and do NOT
 * resolve groups — that happens in the renderer (ExportImportModal), which owns
 * the NoteFlow format helpers, the groups store, and the DOM-based HTML→markdown
 * converter (htmlToMarkdown needs DOMParser, unavailable in the main process).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseExternalSource = parseExternalSource;
exports.decodeHtmlEntities = decodeHtmlEntities;
exports.extractHashTags = extractHashTags;
const markdownFolder_1 = require("./markdownFolder");
const notion_1 = require("./notion");
const googleKeep_1 = require("./googleKeep");
function parseExternalSource(source, srcPath) {
    switch (source) {
        case 'md-folder': return { source, notes: (0, markdownFolder_1.parseMarkdownFolder)(srcPath) };
        case 'notion': return { source, notes: (0, notion_1.parseNotionZip)(srcPath) };
        case 'keep': return { source, notes: (0, googleKeep_1.parseKeepZip)(srcPath) };
        default: throw new Error(`Unknown import source: ${source}`);
    }
}
// ── Shared helpers ──────────────────────────────────────────────────────────
/** Decodes the handful of named/numeric HTML entities Notion puts in <title>. */
function decodeHtmlEntities(s) {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
/** Extracts bare `#tags` from markdown text (skips `# heading` — those have a space after #). */
function extractHashTags(text) {
    const out = new Set();
    const re = /(^|\s)#([A-Za-z][\w\-/]*)/g;
    let m;
    while ((m = re.exec(text)) !== null)
        out.add(m[2]);
    return [...out];
}
