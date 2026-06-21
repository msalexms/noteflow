"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseKeepZip = parseKeepZip;
/** Google Keep importer — reads a Google Takeout export (.zip) of Keep notes. */
const adm_zip_1 = __importDefault(require("adm-zip"));
function usecToIso(usec) {
    if (!usec || !Number.isFinite(usec))
        return undefined;
    const d = new Date(Math.round(usec / 1000));
    return isNaN(d.getTime()) ? undefined : d.toISOString();
}
/**
 * True if a parsed JSON looks like a Keep note. Google Takeout localizes the
 * folder name (Keep → "Conservar" in Spanish, etc.), so we can't filter by path
 * — instead we match every .json by its Keep-note shape.
 */
function isKeepNote(o) {
    if (!o || typeof o !== 'object')
        return false;
    const k = o;
    return 'textContent' in k || 'listContent' in k || 'isTrashed' in k ||
        'isArchived' in k || 'isPinned' in k || 'userEditedTimestampUsec' in k;
}
function buildBody(note) {
    const parts = [];
    if (note.textContent?.trim())
        parts.push(note.textContent.trim());
    if (Array.isArray(note.listContent) && note.listContent.length) {
        const list = note.listContent
            .filter((i) => (i.text ?? '').trim().length > 0)
            .map((i) => `- [${i.isChecked ? 'x' : ' '}] ${i.text.trim()}`)
            .join('\n');
        if (list)
            parts.push(list);
    }
    return parts.join('\n\n');
}
function parseKeepZip(zipPath) {
    const zip = new adm_zip_1.default(zipPath);
    const notes = [];
    for (const entry of zip.getEntries()) {
        if (entry.isDirectory)
            continue;
        // One .json per note (skip .html mirrors, attachments, Labels.txt). The Keep
        // folder name is localized, so match by content shape, not path.
        if (!/\.json$/i.test(entry.entryName))
            continue;
        let parsed;
        try {
            parsed = JSON.parse(entry.getData().toString('utf-8'));
        }
        catch {
            continue;
        }
        if (!isKeepNote(parsed))
            continue;
        const note = parsed;
        if (note.isTrashed)
            continue;
        const body = buildBody(note);
        const title = (note.title ?? '').trim();
        if (!title && !body)
            continue; // truly empty note
        const tags = (note.labels ?? []).map((l) => l.name).filter((n) => !!n);
        notes.push({
            title,
            format: 'md',
            body,
            tags: tags.length ? tags : undefined,
            created: usecToIso(note.createdTimestampUsec ?? note.userEditedTimestampUsec),
            archived: note.isArchived || undefined,
            favorited: note.isPinned || undefined,
            relPath: [],
        });
    }
    return notes;
}
