"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMarkdownFolder = parseMarkdownFolder;
/** Markdown folder importer — recursively reads .md/.txt files. */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const index_1 = require("./index");
const TEXT_EXTS = new Set(['.md', '.markdown', '.txt']);
const SKIP_DIRS = new Set(['.obsidian', '.git', '.trash', 'node_modules']);
/** Splits leading `---\n...\n---` YAML frontmatter from the body (tolerates a UTF-8 BOM). */
function splitFrontmatter(raw) {
    const m = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!m)
        return { fm: {}, body: raw.replace(/^\uFEFF/, '') };
    let fm = {};
    try {
        const parsed = js_yaml_1.default.load(m[1]);
        if (parsed && typeof parsed === 'object')
            fm = parsed;
    }
    catch {
        return { fm: {}, body: raw.replace(/^\uFEFF/, '') };
    }
    return { fm, body: m[2] };
}
function firstHeading(body) {
    const m = body.match(/^#{1,6}\s+(.+)$/m);
    return m ? m[1].trim() : null;
}
function fmTags(fm) {
    const t = fm.tags;
    if (Array.isArray(t))
        return t.map(String);
    if (typeof t === 'string')
        return t.split(/[,\s]+/).filter(Boolean);
    return [];
}
function fmDate(fm) {
    const v = fm.created ?? fm.date;
    if (!v)
        return undefined;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? undefined : d.toISOString();
}
function parseMarkdownFolder(rootDir) {
    const notes = [];
    function walk(dir, relSegments) {
        let entries;
        try {
            entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.'))
                    continue;
                walk(path_1.default.join(dir, entry.name), [...relSegments, entry.name]);
                continue;
            }
            const ext = path_1.default.extname(entry.name).toLowerCase();
            if (!TEXT_EXTS.has(ext))
                continue;
            let raw;
            try {
                raw = fs_1.default.readFileSync(path_1.default.join(dir, entry.name), 'utf-8');
            }
            catch {
                continue;
            }
            if (!raw.trim())
                continue;
            const { fm, body } = splitFrontmatter(raw);
            const filename = path_1.default.basename(entry.name, path_1.default.extname(entry.name));
            const title = String(fm.title ?? firstHeading(body) ?? filename).trim() || filename;
            const tags = [...new Set([...fmTags(fm), ...(0, index_1.extractHashTags)(body)])];
            notes.push({
                title,
                format: 'md',
                body: body.trim(),
                tags: tags.length ? tags : undefined,
                created: fmDate(fm),
                relPath: relSegments,
            });
        }
    }
    walk(rootDir, []);
    return notes;
}
