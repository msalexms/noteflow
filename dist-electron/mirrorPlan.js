"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gitBlobSha = gitBlobSha;
exports.remoteHasContent = remoteHasContent;
exports.isMirrorDeletable = isMirrorDeletable;
exports.planMirror = planMirror;
// Pure decision logic for the "Mirror to GitHub" action (Settings → Sync →
// GitHub, only offered while NoteFlow Cloud is the active backend): given the
// local file set and the remote tree, decide what to upload, what to delete and
// what is already identical. Lives in electron/ but imports nothing from
// Electron (node:crypto only) — same pure-module pattern as syncState.ts /
// cloudCrypto.ts / entitlements.ts. Covered by tests/electron/mirrorPlan.test.ts.
//
// The mirror makes the repo an exact copy of the notes dir, so it is the only
// GitHub operation that deletes remote files it never wrote. That makes the
// deletion allowlist (isMirrorDeletable) the critical part of this module.
//
// The blob-SHA comparison it is built on (gitBlobSha / remoteHasContent) is
// shared with the pull's upload catch-up, which uses it for the same reason:
// never send a write the remote already has.
const crypto_1 = require("crypto");
const noteFormat_1 = require("./noteFormat");
/**
 * Git blob SHA of a UTF-8 text file: sha1("blob <byteLength>\0<content>").
 * Computed locally so the mirror can skip identical files against the SHAs the
 * Trees API already returned — zero extra requests for an up-to-date repo.
 * The bytes match what upsertRemoteFile PUTs (Buffer.from(content) in UTF-8).
 */
function gitBlobSha(content) {
    const body = Buffer.from(content, 'utf-8');
    return (0, crypto_1.createHash)('sha1')
        .update(`blob ${body.length}\0`, 'utf-8')
        .update(body)
        .digest('hex');
}
/**
 * Does the remote already hold EXACTLY these bytes at `relPath`? Answered from
 * the blob SHAs the Trees API already returned, so a skip costs zero requests.
 * Used by the pull's upload catch-up (flushPendingLocalChanges), which can only
 * tell that a NOTE changed — re-queuing every section of it made GitHub commit
 * one empty commit per untouched file.
 *
 * ⚠️ Fail-safe: any missing input (no map at all, path not in the tree) answers
 * false. "I don't know" must mean "upload it" — skipping on absent data would
 * silently drop a push.
 */
function remoteHasContent(remoteShaByPath, relPath, content) {
    const remoteSha = remoteShaByPath?.get(relPath);
    return remoteSha !== undefined && remoteSha === gitBlobSha(content);
}
/**
 * ⚠️ DELETION ALLOWLIST — the mirror may ONLY remove a remote path that is one of:
 *   (a) '<noteDir>/<something>.md'  — a file inside a note folder,
 *   (b) a root-level metadata JSON  — the METADATA_FILENAMES of githubSync.ts,
 *       passed in so this module doesn't become a 5th copy of that list,
 *   (c) a root-level '.md' that is NOT README.md — leftovers of format v1.
 *
 * Everything else is protected, explicitly:
 *   - 'README.md' (case-insensitive): written by NoteFlow itself on repo creation
 *     and never present locally, so without this rule every mirror would delete it.
 *   - Anything whose path has a segment starting with '.': the format marker
 *     '.noteflow-format' (the mirror re-uploads it, never removes it), '.github/',
 *     '.gitignore', '.gitattributes'…
 *   - Any other extension at the root (LICENSE, notes.txt, images…) and anything
 *     nested deeper than one folder — not part of the format, not ours to delete.
 *
 * This is a check on the path SHAPE only. planMirror adds a second, stricter
 * condition for anything inside a folder: the folder must be a real note folder
 * on the remote (anchored by a '<dir>/note.md' blob). See there.
 */
function isMirrorDeletable(relPath, metadataFilenames) {
    const segments = relPath.split('/');
    // Empty segments ('a//b', trailing slash) and dotfiles/dot-dirs are never ours.
    if (segments.some((seg) => seg === '' || seg.startsWith('.')))
        return false;
    if (segments.length === 1) {
        const name = segments[0];
        if (name.toLowerCase() === 'readme.md')
            return false;
        if (metadataFilenames.includes(name))
            return true;
        return name.endsWith('.md'); // v1 flat note left behind by the format migration
    }
    if (segments.length === 2)
        return segments[1].endsWith('.md'); // '<noteDir>/<file>.md'
    return false; // deeper nesting isn't part of the note format
}
/**
 * Compares the local file set against the remote tree. Local wins everywhere:
 * differing content is uploaded, remote-only paths are deleted (when the
 * allowlist clears them), identical blobs are skipped.
 *
 * `remoteBlobs` is the FULL tree (including protected paths) — filtering happens
 * here so the allowlist is applied in one place.
 *
 * ⚠️ Deletions inside a folder are restricted to REAL remote note folders, i.e.
 * those anchored by a '<dir>/note.md' blob (the same rule groupRemoteNoteDirs
 * uses in githubSync.ts). A folder without that anchor is left completely alone
 * — no deleteDir, no per-file delete. Two reasons:
 *   - It isn't a note for ANY part of the app: the pull never looks at it, so
 *     leaving it can't resurrect anything.
 *   - A journaled 'deleteDir' is retried by deleteRemoteDirNow, which sweeps
 *     EVERY blob under '<dir>/' with no allowlist. Keyed on a user folder that
 *     merely happens to contain a '.md' (a 'docs/' with images and subfolders),
 *     that retry would wipe files the mirror is not allowed to touch.
 * Accepted trade-off: orphan section blobs of a folder whose note.md was never
 * uploaded are not cleaned up. The pull ignores them just the same.
 */
function planMirror(localFiles, remoteBlobs, metadataFilenames) {
    const remoteShaByPath = new Map(remoteBlobs.map((b) => [b.path, b.sha]));
    const localPaths = new Set(localFiles.map((f) => f.path));
    const toUpload = [];
    const unchanged = [];
    for (const file of localFiles) {
        if (remoteShaByPath.get(file.path) === file.sha)
            unchanged.push(file.path);
        else
            toUpload.push(file.path);
    }
    // Folders that still hold at least one local file. A remote note folder
    // missing from this set is a note deleted locally → one 'deleteDir' entry.
    const localDirs = new Set();
    for (const file of localFiles) {
        const i = file.path.indexOf('/');
        if (i > 0)
            localDirs.add(file.path.slice(0, i));
    }
    // Remote folders that are actually notes (anchored by '<dir>/note.md').
    const remoteNoteDirs = new Set();
    for (const blob of remoteBlobs) {
        const i = blob.path.indexOf('/');
        if (i > 0 && blob.path.slice(i + 1) === noteFormat_1.NOTE_MD)
            remoteNoteDirs.add(blob.path.slice(0, i));
    }
    const toDelete = [];
    const dirEntryByDir = new Map();
    for (const blob of remoteBlobs) {
        if (localPaths.has(blob.path))
            continue;
        if (!isMirrorDeletable(blob.path, metadataFilenames))
            continue;
        const i = blob.path.indexOf('/');
        const dir = i > 0 ? blob.path.slice(0, i) : null;
        // Not a real remote note folder → hands off the whole folder (see jsdoc).
        if (dir !== null && !remoteNoteDirs.has(dir))
            continue;
        if (dir === null || localDirs.has(dir)) {
            // Root-level file, or a section of a note that still exists locally.
            toDelete.push({ op: 'delete', key: blob.path, paths: [blob.path] });
            continue;
        }
        let entry = dirEntryByDir.get(dir);
        if (!entry) {
            entry = { op: 'deleteDir', key: dir, paths: [] };
            dirEntryByDir.set(dir, entry);
            toDelete.push(entry);
        }
        entry.paths.push(blob.path);
    }
    return { toUpload, toDelete, unchanged };
}
