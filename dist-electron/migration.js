"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateNotesDirToV2 = migrateNotesDirToV2;
/**
 * migration.ts — one-time, idempotent migration of the notes directory from
 * format v1 (one flat .md per note, sections inline in frontmatter) to v2
 * (one folder per note, one .md per section).
 *
 * Runs synchronously at startup BEFORE the initial GitHub pull and before the
 * fs watcher starts. Safe to re-run: flat files are converted with a
 * write→verify→unlink sequence, and the scan also catches stray flat files
 * dropped in later (e.g. by an old client) even when the marker exists.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const noteFormat_1 = require("./noteFormat");
function migrateNotesDirToV2(notesDir) {
    const result = { migrated: 0, errors: [] };
    let entries;
    try {
        entries = fs_1.default.readdirSync(notesDir);
    }
    catch {
        return result;
    }
    const flatNotes = entries.filter((f) => f.endsWith('.md') && f !== 'README.md');
    for (const filename of flatNotes) {
        const flatPath = path_1.default.join(notesDir, filename);
        try {
            if (!fs_1.default.statSync(flatPath).isFile())
                continue;
            const raw = fs_1.default.readFileSync(flatPath, 'utf-8');
            const note = (0, noteFormat_1.parseLegacyNoteRaw)(raw);
            // The old stem is already '<slug>-<id>' — reuse it verbatim as the dir
            // name so identity is stable and re-runs land on the same folder.
            const dir = filename.replace(/\.md$/i, '');
            const dirPath = path_1.default.join(notesDir, dir);
            // Preserve `updated`: content didn't change, and bumping it would defeat
            // sync conflict resolution during the transition.
            const { files } = (0, noteFormat_1.serializeNoteFolder)(note, { preserveUpdated: true });
            fs_1.default.mkdirSync(dirPath, { recursive: true });
            for (const [file, content] of Object.entries(files)) {
                fs_1.default.writeFileSync(path_1.default.join(dirPath, file), content, 'utf-8');
            }
            // Verify before deleting the source (crash safety)
            const anchor = fs_1.default.readFileSync(path_1.default.join(dirPath, noteFormat_1.NOTE_MD), 'utf-8');
            if (!anchor.includes(`id: ${JSON.stringify(note.id)}`) && !anchor.includes(`id: ${note.id}`)) {
                throw new Error('post-write verification failed');
            }
            fs_1.default.unlinkSync(flatPath);
            result.migrated++;
        }
        catch (err) {
            result.errors.push(`${filename}: ${String(err)}`);
            console.error(`[Migration] failed to migrate ${filename}:`, String(err));
        }
    }
    if (!(0, noteFormat_1.hasFormatMarker)(notesDir)) {
        try {
            (0, noteFormat_1.writeFormatMarker)(notesDir);
        }
        catch (err) {
            result.errors.push(`marker: ${String(err)}`);
        }
    }
    if (result.migrated > 0) {
        console.log(`[Migration] migrated ${result.migrated} note(s) to folder format v2`);
    }
    return result;
}
