"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOLS = exports.DESTRUCTIVE_TOOLS = void 0;
exports.executeTool = executeTool;
// Agentic tools — the catalog the chat model can call, plus a provider-neutral executor.
// Runs in the MAIN process. The executor is decoupled from main.ts via an injected ToolContext
// so it can be unit-tested and never reaches into Electron globals directly.
const node_crypto_1 = require("node:crypto");
const noteFormat = __importStar(require("../../noteFormat"));
// ── ID + slug helpers (mirror src/lib/noteUtils.ts so dir names / ids match the renderer) ──
const ID_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
function makeId(size = 8) {
    const bytes = (0, node_crypto_1.randomBytes)(size);
    let id = '';
    for (let i = 0; i < size; i++)
        id += ID_ALPHABET[bytes[i] & 63];
    return id;
}
function noteDirname(id, title) {
    const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40);
    return `${slug ? `${slug}-` : ''}${id}`;
}
function defaultNoteTitle() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function extractTags(content) {
    const matches = content.match(/#([a-zA-Z][a-zA-Z0-9_-]*)/g);
    if (!matches)
        return [];
    return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}
function stripBase64(text) {
    return text.replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '[image]');
}
const DEFAULT_GROUP_COLOR = '#64748b';
// Tools that mutate irreversibly — gated behind an in-chat confirmation.
exports.DESTRUCTIVE_TOOLS = new Set(['delete_note', 'delete_section', 'delete_group', 'delete_folder']);
// ── Catalog ─────────────────────────────────────────────────────────────────────
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description) => ({ type: 'string', description });
const bool = (description) => ({ type: 'boolean', description });
exports.TOOLS = [
    {
        name: 'list_notes',
        description: "List the user's notes (id, title, tags, group/folder, section names). Use this to find note ids before editing or deleting. Encrypted notes appear but their content is not readable.",
        inputSchema: obj({
            query: str('Optional case-insensitive substring to match against title or tags.'),
            group_id: str('Optional group id to filter by.'),
            include_archived: bool('Include archived notes (default false).'),
        }),
    },
    {
        name: 'get_note',
        description: 'Read one note in full, including each section id, name and content. Use before editing a section.',
        inputSchema: obj({ note_id: str('The note id.') }, ['note_id']),
    },
    {
        name: 'list_groups',
        description: 'List all groups and folders (with ids) so you can place or move notes correctly.',
        inputSchema: obj({}),
    },
    {
        name: 'search_notes',
        description: 'Semantic search over the notes. Returns the most relevant notes/sections for a natural-language query. Only works when the local AI index is enabled.',
        inputSchema: obj({ query: str('Natural-language search query.'), k: { type: 'number', description: 'Max results (default 6).' } }, ['query']),
    },
    {
        name: 'create_note',
        description: 'Create a new note. Optionally place it in a group/folder and pre-fill sections.',
        inputSchema: obj({
            title: str('Note title. Defaults to today\'s date if omitted.'),
            group_id: str('Optional group id to place the note in.'),
            folder_id: str('Optional folder id (its group must be the same as group_id).'),
            sections: {
                type: 'array',
                description: 'Sections to create. If omitted, a single empty "Note" section is created.',
                items: obj({ name: str('Section name.'), content: str('Markdown content.'), raw: bool('Raw markdown mode — shows the unrendered source. Default false (content is rendered as rich text). Only set true if the user wants to see/edit the raw markdown.') }, ['name']),
            },
        }),
    },
    {
        name: 'update_note',
        description: 'Update a note\'s metadata: title, favorite/archive flags, or move it to a group/folder. Pass an empty string for group_id/folder_id to remove that placement.',
        inputSchema: obj({
            note_id: str('The note id.'),
            title: str('New title.'),
            group_id: str('Group id, or "" to ungroup.'),
            folder_id: str('Folder id, or "" to remove from folder.'),
            favorited: bool('Pin/unpin the note.'),
            archived: bool('Archive/unarchive the note.'),
        }, ['note_id']),
    },
    {
        name: 'add_section',
        description: 'Append a new section to an existing note.',
        inputSchema: obj({ note_id: str('The note id.'), name: str('Section name.'), content: str('Markdown content.'), raw: bool('Raw markdown mode — shows the unrendered source. Default false (content is rendered as rich text). Only set true if the user wants to see/edit the raw markdown.') }, ['note_id', 'name']),
    },
    {
        name: 'update_section',
        description: "Replace a section's content. Read the note first to get the section id.",
        inputSchema: obj({ note_id: str('The note id.'), section_id: str('The section id.'), content: str('New Markdown content.') }, ['note_id', 'section_id', 'content']),
    },
    {
        name: 'rename_section',
        description: 'Rename a section.',
        inputSchema: obj({ note_id: str('The note id.'), section_id: str('The section id.'), name: str('New section name.') }, ['note_id', 'section_id', 'name']),
    },
    {
        name: 'create_group',
        description: 'Create a new group.',
        inputSchema: obj({ name: str('Group name.'), color: str('Optional hex color, e.g. #3b82f6.') }, ['name']),
    },
    {
        name: 'create_folder',
        description: 'Create a folder inside a group.',
        inputSchema: obj({ group_id: str('The parent group id.'), name: str('Folder name.') }, ['group_id', 'name']),
    },
    {
        name: 'rename_group',
        description: 'Rename a group.',
        inputSchema: obj({ group_id: str('The group id.'), name: str('New name.') }, ['group_id', 'name']),
    },
    {
        name: 'rename_folder',
        description: 'Rename a folder.',
        inputSchema: obj({ folder_id: str('The folder id.'), name: str('New name.') }, ['folder_id', 'name']),
    },
    {
        name: 'delete_note',
        description: 'Permanently delete a note and all its sections.',
        inputSchema: obj({ note_id: str('The note id.') }, ['note_id']),
    },
    {
        name: 'delete_section',
        description: 'Delete one section from a note.',
        inputSchema: obj({ note_id: str('The note id.'), section_id: str('The section id.') }, ['note_id', 'section_id']),
    },
    {
        name: 'delete_group',
        description: 'Delete a group and its folders. Notes in the group are kept but ungrouped.',
        inputSchema: obj({ group_id: str('The group id.') }, ['group_id']),
    },
    {
        name: 'delete_folder',
        description: 'Delete a folder. Notes in it keep their group but lose the folder.',
        inputSchema: obj({ folder_id: str('The folder id.') }, ['folder_id']),
    },
];
const asStr = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const asBool = (v) => (typeof v === 'boolean' ? v : undefined);
/** Find the on-disk directory name for a note id (dir name is frozen at creation). */
function findNoteDir(ctx, noteId) {
    return noteFormat.listNoteDirs(ctx.notesDir).find((d) => d.endsWith('-' + noteId) || d === noteId) ?? null;
}
function loadNote(ctx, noteId) {
    const dir = findNoteDir(ctx, noteId);
    if (!dir)
        return null;
    const note = noteFormat.parseNoteDir(`${ctx.notesDir}/${dir}`);
    return note ? { dir, note } : null;
}
/** Re-serialize a (mutated) note and write it, deleting any section files that no longer exist. */
function writeNoteRecord(ctx, dir, before, after) {
    const beforeFiles = new Set(before.sections.map((s) => `${s.id}.md`));
    const { files, sectionFiles } = noteFormat.serializeNoteFolder(after);
    for (const f of sectionFiles)
        beforeFiles.delete(f);
    ctx.writeNote({ dir, files, deleteFiles: [...beforeFiles] });
}
function ok(summary, content) {
    return { summary, content: content ?? summary };
}
function fail(message) {
    return { summary: message, content: message, isError: true };
}
async function executeTool(name, rawInput, ctx) {
    const input = (rawInput && typeof rawInput === 'object' ? rawInput : {});
    try {
        switch (name) {
            case 'list_notes': {
                const q = asStr(input.query).toLowerCase().trim();
                const groupFilter = asStr(input.group_id).trim();
                const includeArchived = asBool(input.include_archived) ?? false;
                const rows = [];
                for (const dir of noteFormat.listNoteDirs(ctx.notesDir)) {
                    const note = noteFormat.parseNoteDir(`${ctx.notesDir}/${dir}`);
                    if (!note)
                        continue;
                    if (note.archived && !includeArchived)
                        continue;
                    if (groupFilter && note.group !== groupFilter)
                        continue;
                    if (q && !note.title.toLowerCase().includes(q) && !note.tags.some((t) => t.includes(q)))
                        continue;
                    const secs = note.encryption ? '(encrypted)' : note.sections.map((s) => `${s.name}#${s.id}`).join(', ');
                    const place = [note.group ? `group=${note.group}` : '', note.folder ? `folder=${note.folder}` : ''].filter(Boolean).join(' ');
                    rows.push(`- ${note.title || 'Untitled'} [id=${note.id}]${place ? ` ${place}` : ''} :: ${secs}`);
                    if (rows.length >= 60)
                        break;
                }
                return ok(`Listed ${rows.length} notes`, rows.length ? rows.join('\n') : 'No notes found.');
            }
            case 'get_note': {
                const found = loadNote(ctx, asStr(input.note_id));
                if (!found)
                    return fail(`No note with id ${asStr(input.note_id)}`);
                const { note } = found;
                if (note.encryption)
                    return ok(`Read "${note.title}"`, `Note "${note.title}" is encrypted; its content is not readable.`);
                const body = note.sections
                    .map((s) => `## ${s.name} [section_id=${s.id}]\n${stripBase64(s.content).slice(0, 6000)}`)
                    .join('\n\n');
                return ok(`Read "${note.title}"`, `# ${note.title} [id=${note.id}]\n${body}`);
            }
            case 'list_groups': {
                const groups = ctx.readGroups();
                const folders = ctx.readFolders();
                const lines = groups.map((g) => {
                    const subs = folders.filter((f) => f.groupId === g.id).map((f) => `${f.name}#${f.id}`).join(', ');
                    return `- ${g.name} [id=${g.id}]${g.archived ? ' (archived)' : ''}${subs ? ` folders: ${subs}` : ''}`;
                });
                return ok(`Listed ${groups.length} groups`, lines.length ? lines.join('\n') : 'No groups yet.');
            }
            case 'search_notes': {
                if (!ctx.search)
                    return ok('Search unavailable', 'Semantic search is unavailable (the local AI index is off).');
                const k = typeof input.k === 'number' ? input.k : 6;
                const hits = await ctx.search(asStr(input.query), k);
                if (!hits.length)
                    return ok('No matches', 'No relevant notes found.');
                const lines = hits.map((h) => {
                    const found = loadNote(ctx, h.noteId);
                    const title = found?.note.title || 'Untitled';
                    return `- ${title} [id=${h.noteId}] :: ${stripBase64(h.snippet).slice(0, 200)}`;
                });
                return ok(`Found ${hits.length} matches`, lines.join('\n'));
            }
            case 'create_note': {
                const title = asStr(input.title).trim() || defaultNoteTitle();
                const groupId = asStr(input.group_id).trim();
                let folderId = asStr(input.folder_id).trim();
                if (folderId && !ctx.readFolders().some((f) => f.id === folderId))
                    folderId = '';
                const rawSections = Array.isArray(input.sections) ? input.sections : [];
                const sections = rawSections.length
                    ? rawSections.map((s) => ({ id: makeId(6), name: asStr(s.name).trim() || 'Note', content: asStr(s.content), isRawMode: asBool(s.raw) ?? false }))
                    : [{ id: makeId(6), name: 'Note', content: '', isRawMode: false }];
                const now = new Date().toISOString();
                const id = makeId(8);
                const note = {
                    id, title, tags: extractTags(sections.map((s) => s.content).join('\n')),
                    created: now, updated: now,
                    ...(groupId ? { group: groupId } : {}), ...(folderId ? { folder: folderId } : {}),
                    sections,
                };
                const dir = noteDirname(id, title);
                const { files } = noteFormat.serializeNoteFolder(note);
                ctx.writeNote({ dir, files });
                return ok(`Created note "${title}"`, `Created note "${title}" with id ${id} and ${sections.length} section(s).`);
            }
            case 'update_note': {
                const found = loadNote(ctx, asStr(input.note_id));
                if (!found)
                    return fail(`No note with id ${asStr(input.note_id)}`);
                const { dir, note } = found;
                const after = { ...note, sections: [...note.sections] };
                if (typeof input.title === 'string' && input.title.trim())
                    after.title = input.title.trim();
                const fav = asBool(input.favorited);
                if (fav !== undefined)
                    after.favorited = fav;
                const arc = asBool(input.archived);
                if (arc !== undefined)
                    after.archived = arc;
                if (typeof input.group_id === 'string')
                    after.group = input.group_id.trim() || undefined;
                if (typeof input.folder_id === 'string')
                    after.folder = input.folder_id.trim() || undefined;
                if (!after.group)
                    after.folder = undefined; // a folder requires a group
                writeNoteRecord(ctx, dir, note, after);
                return ok(`Updated "${after.title}"`);
            }
            case 'add_section': {
                const found = loadNote(ctx, asStr(input.note_id));
                if (!found)
                    return fail(`No note with id ${asStr(input.note_id)}`);
                if (found.note.encryption)
                    return fail('Cannot edit an encrypted note.');
                const sid = makeId(6);
                const after = {
                    ...found.note,
                    sections: [...found.note.sections, { id: sid, name: asStr(input.name).trim() || 'Section', content: asStr(input.content), isRawMode: asBool(input.raw) ?? false }],
                };
                writeNoteRecord(ctx, found.dir, found.note, after);
                return ok(`Added section "${asStr(input.name)}"`, `Added section "${asStr(input.name)}" (id ${sid}).`);
            }
            case 'update_section':
            case 'rename_section': {
                const found = loadNote(ctx, asStr(input.note_id));
                if (!found)
                    return fail(`No note with id ${asStr(input.note_id)}`);
                if (found.note.encryption)
                    return fail('Cannot edit an encrypted note.');
                const sid = asStr(input.section_id);
                if (!found.note.sections.some((s) => s.id === sid))
                    return fail(`No section ${sid} in that note.`);
                const after = {
                    ...found.note,
                    sections: found.note.sections.map((s) => s.id !== sid ? s
                        : name === 'rename_section' ? { ...s, name: asStr(input.name).trim() || s.name }
                            : { ...s, content: asStr(input.content) }),
                };
                writeNoteRecord(ctx, found.dir, found.note, after);
                return ok(name === 'rename_section' ? `Renamed section` : `Updated section`);
            }
            case 'create_group': {
                const groups = ctx.readGroups();
                const id = makeId(8);
                groups.push({ id, name: asStr(input.name).trim() || 'Group', color: asStr(input.color).trim() || DEFAULT_GROUP_COLOR, order: groups.length });
                ctx.writeGroups(groups);
                return ok(`Created group "${asStr(input.name)}"`, `Created group "${asStr(input.name)}" with id ${id}.`);
            }
            case 'create_folder': {
                const groupId = asStr(input.group_id);
                if (!ctx.readGroups().some((g) => g.id === groupId))
                    return fail(`No group with id ${groupId}`);
                const folders = ctx.readFolders();
                const id = makeId(8);
                folders.push({ id, name: asStr(input.name).trim() || 'Folder', groupId, order: folders.filter((f) => f.groupId === groupId).length });
                ctx.writeFolders(folders);
                return ok(`Created folder "${asStr(input.name)}"`, `Created folder "${asStr(input.name)}" with id ${id}.`);
            }
            case 'rename_group': {
                const id = asStr(input.group_id);
                const groups = ctx.readGroups();
                if (!groups.some((g) => g.id === id))
                    return fail(`No group with id ${id}`);
                ctx.writeGroups(groups.map((g) => g.id === id ? { ...g, name: asStr(input.name).trim() || g.name } : g));
                return ok(`Renamed group`);
            }
            case 'rename_folder': {
                const id = asStr(input.folder_id);
                const folders = ctx.readFolders();
                if (!folders.some((f) => f.id === id))
                    return fail(`No folder with id ${id}`);
                ctx.writeFolders(folders.map((f) => f.id === id ? { ...f, name: asStr(input.name).trim() || f.name } : f));
                return ok(`Renamed folder`);
            }
            case 'delete_note': {
                const dir = findNoteDir(ctx, asStr(input.note_id));
                if (!dir)
                    return fail(`No note with id ${asStr(input.note_id)}`);
                ctx.deleteNoteDir(dir);
                return ok(`Deleted note`);
            }
            case 'delete_section': {
                const found = loadNote(ctx, asStr(input.note_id));
                if (!found)
                    return fail(`No note with id ${asStr(input.note_id)}`);
                if (found.note.encryption)
                    return fail('Cannot edit an encrypted note.');
                const sid = asStr(input.section_id);
                if (!found.note.sections.some((s) => s.id === sid))
                    return fail(`No section ${sid} in that note.`);
                const after = { ...found.note, sections: found.note.sections.filter((s) => s.id !== sid) };
                writeNoteRecord(ctx, found.dir, found.note, after);
                return ok(`Deleted section`);
            }
            case 'delete_group': {
                const id = asStr(input.group_id);
                const groups = ctx.readGroups();
                if (!groups.some((g) => g.id === id))
                    return fail(`No group with id ${id}`);
                // ungroup every note that lived in this group (keep the note, drop group+folder)
                for (const dir of noteFormat.listNoteDirs(ctx.notesDir)) {
                    const note = noteFormat.parseNoteDir(`${ctx.notesDir}/${dir}`);
                    if (!note || note.group !== id)
                        continue;
                    writeNoteRecord(ctx, dir, note, { ...note, group: undefined, folder: undefined });
                }
                ctx.writeGroups(groups.filter((g) => g.id !== id));
                ctx.writeFolders(ctx.readFolders().filter((f) => f.groupId !== id));
                return ok(`Deleted group`);
            }
            case 'delete_folder': {
                const id = asStr(input.folder_id);
                const folders = ctx.readFolders();
                if (!folders.some((f) => f.id === id))
                    return fail(`No folder with id ${id}`);
                for (const dir of noteFormat.listNoteDirs(ctx.notesDir)) {
                    const note = noteFormat.parseNoteDir(`${ctx.notesDir}/${dir}`);
                    if (!note || note.folder !== id)
                        continue;
                    writeNoteRecord(ctx, dir, note, { ...note, folder: undefined });
                }
                ctx.writeFolders(folders.filter((f) => f.id !== id));
                return ok(`Deleted folder`);
            }
            default:
                return fail(`Unknown tool: ${name}`);
        }
    }
    catch (err) {
        return fail(`Tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}
