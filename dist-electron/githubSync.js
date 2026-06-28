"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasPendingRemoteMutations = hasPendingRemoteMutations;
exports.loadSyncSettings = loadSyncSettings;
exports.getSyncStatus = getSyncStatus;
exports.setInitialPullStatus = setInitialPullStatus;
exports.onStatusChanged = onStatusChanged;
exports.initiateDeviceFlow = initiateDeviceFlow;
exports.cancelDeviceFlow = cancelDeviceFlow;
exports.disconnectGitHub = disconnectGitHub;
exports.pullNotes = pullNotes;
exports.pushAllNotes = pushAllNotes;
exports.pushPathsNow = pushPathsNow;
exports.schedulePush = schedulePush;
exports.scheduleDelete = scheduleDelete;
exports.scheduleDeleteDir = scheduleDeleteDir;
exports.migrateRemoteToV2IfNeeded = migrateRemoteToV2IfNeeded;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
const noteFormat_1 = require("./noteFormat");
// ── Constants ─────────────────────────────────────────────────────────────────
const README_CONTENT = `# Your notes are synced with GitHub

Your NoteFlow notes are automatically backed up to a **private GitHub repository** — only you can access them.

## Your privacy is protected

This repository is **private**. As long as it stays that way, nobody else can see or access your notes.

## How sync works

- Every time you create, edit, or delete a note in NoteFlow, changes are pushed here automatically.
- When you open NoteFlow, it pulls any remote changes so your notes stay in sync across devices.
- You can also trigger a manual sync from the GitHub panel in the app.

---

You are reading this note inside NoteFlow. It lives in your GitHub repository as \`README.md\` and will stay in sync like any other note.
`;
// Root-level JSON files that sync alongside the note folders.
// folders.json / note-order.json were historically pushed but never pulled —
// fixed here as part of the v2 format work.
const METADATA_FILENAMES = ['groups.json', 'folders.json', 'section-colors.json', 'note-order.json', 'templates.json'];
// ── Settings helpers ──────────────────────────────────────────────────────────
function getSettingsPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'settings.json');
}
function readSettings() {
    try {
        return JSON.parse(fs_1.default.readFileSync(getSettingsPath(), 'utf-8'));
    }
    catch {
        return {};
    }
}
function writeSettings(data) {
    fs_1.default.writeFileSync(getSettingsPath(), JSON.stringify(data), 'utf-8');
}
// ── Token encryption ──────────────────────────────────────────────────────────
// Prefix to distinguish safeStorage-encrypted tokens from plain base64 fallback.
// Without this, if safeStorage availability changes between encryption and
// decryption (common on Linux where keyring availability can vary), the wrong
// method would be used, causing "Ciphertext does not appear to be encrypted".
const SAFE_STORAGE_PREFIX = 'safe:';
function encryptToken(token) {
    if (electron_1.safeStorage.isEncryptionAvailable()) {
        return SAFE_STORAGE_PREFIX + electron_1.safeStorage.encryptString(token).toString('base64');
    }
    // Fallback: base64 only (less secure, but avoids blocking the feature)
    return Buffer.from(token).toString('base64');
}
function decryptToken(encrypted) {
    if (encrypted.startsWith(SAFE_STORAGE_PREFIX)) {
        return electron_1.safeStorage.decryptString(Buffer.from(encrypted.slice(SAFE_STORAGE_PREFIX.length), 'base64'));
    }
    // Legacy token (no prefix): could be safeStorage-encrypted or plain base64.
    // Try safeStorage first; if it fails, fall back to plain base64.
    if (electron_1.safeStorage.isEncryptionAvailable()) {
        try {
            return electron_1.safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
        }
        catch {
            // Not a safeStorage ciphertext — treat as plain base64 fallback
        }
    }
    return Buffer.from(encrypted, 'base64').toString('utf-8');
}
const GITHUB_CLIENT_ID = 'Ov23liut9QOJ2pJFF0KR';
// ── GitHub REST API (raw https, no external deps) ─────────────────────────────
async function githubRequest(token, method, endpoint, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : undefined;
        const req = https_1.default.request({
            hostname: 'api.github.com',
            path: endpoint,
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'NoteFlow-App',
                ...(payload
                    ? {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                    }
                    : {}),
            },
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => (raw += chunk));
            res.on('end', () => {
                if (res.statusCode === 204)
                    return resolve(null);
                try {
                    const json = JSON.parse(raw);
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(json.message ?? `HTTP ${res.statusCode}`));
                    }
                    else {
                        resolve(json);
                    }
                }
                catch {
                    reject(new Error(`HTTP ${res.statusCode}: unparseable response`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('GitHub API request timed out'));
        });
        if (payload)
            req.write(payload);
        req.end();
    });
}
// Auth requests go to github.com (not api.github.com) with form-encoded body
async function githubAuthPost(path, params) {
    return new Promise((resolve, reject) => {
        const payload = new URLSearchParams(params).toString();
        const req = https_1.default.request({
            hostname: 'github.com',
            path,
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(payload),
                'User-Agent': 'NoteFlow-App',
            },
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => (raw += chunk));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(raw));
                }
                catch {
                    reject(new Error(`Auth request failed: ${raw}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Auth request timed out')); });
        req.write(payload);
        req.end();
    });
}
// ── GitHub API operations ─────────────────────────────────────────────────────
async function validateToken(token) {
    const user = (await githubRequest(token, 'GET', '/user'));
    return user.login;
}
async function ensureRepo(token, owner, repo) {
    try {
        await githubRequest(token, 'GET', `/repos/${owner}/${repo}`);
    }
    catch {
        await githubRequest(token, 'POST', '/user/repos', {
            name: repo,
            private: true,
            description: 'NoteFlow notes — auto-synced',
            auto_init: true,
        });
        // Brief pause for GitHub to initialize the repo
        await new Promise((r) => setTimeout(r, 1500));
        // Replace default README with informative content
        await upsertRemoteFile(token, owner, repo, 'README.md', README_CONTENT);
    }
}
// Remote paths are notes-dir-relative with forward slashes ('<dir>/<file>.md'
// for note files, bare filenames for root metadata). The Contents API accepts
// slash paths verbatim — but each SEGMENT must be URL-encoded individually
// (encoding the whole path would escape the separators).
function encodeRemotePath(relPath) {
    return relPath.split('/').map(encodeURIComponent).join('/');
}
// Cached per connection; reset on disconnect
let cachedDefaultBranch = null;
async function getDefaultBranch(token, owner, repo) {
    if (cachedDefaultBranch)
        return cachedDefaultBranch;
    const info = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}`));
    cachedDefaultBranch = info.default_branch || 'main';
    return cachedDefaultBranch;
}
/**
 * Recursive listing of every blob in the repo via the Git Trees API — the
 * Contents API only lists one directory level, the tree call returns the whole
 * folder-per-note layout in a single request.
 *
 * Do NOT catch here — let network/API errors propagate to the caller (pullNotes).
 * Returning [] on error would make the deletion logic treat all local notes as
 * "remotely deleted" and wipe them from disk when there is no internet connection.
 */
async function listRemoteTree(token, owner, repo) {
    const branch = await getDefaultBranch(token, owner, repo);
    const res = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`));
    if (res?.truncated)
        console.warn('[GitHubSync] tree listing truncated — repo unusually large');
    return (res?.tree ?? [])
        .filter((t) => t.type === 'blob')
        .map(({ path: p, sha }) => ({ path: p, sha }));
}
/** Groups tree blobs into note directories: dir → set of .md filenames inside it. */
function groupRemoteNoteDirs(blobs) {
    const dirs = new Map();
    for (const b of blobs) {
        const i = b.path.indexOf('/');
        if (i <= 0)
            continue;
        const rest = b.path.slice(i + 1);
        if (rest.includes('/') || !rest.endsWith('.md'))
            continue; // deeper nesting / non-md: not ours
        const dir = b.path.slice(0, i);
        let set = dirs.get(dir);
        if (!set) {
            set = new Set();
            dirs.set(dir, set);
        }
        set.add(rest);
    }
    // Only dirs anchored by a note.md are notes
    for (const [dir, files] of dirs) {
        if (!files.has(noteFormat_1.NOTE_MD))
            dirs.delete(dir);
    }
    return dirs;
}
function rootFlatNoteBlobs(blobs) {
    return blobs.filter((b) => !b.path.includes('/') && b.path.endsWith('.md') && b.path !== 'README.md');
}
async function getRemoteFile(token, owner, repo, relPath) {
    try {
        const file = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`));
        const content = Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf-8');
        return { content, sha: file.sha };
    }
    catch {
        return null;
    }
}
// Serialized entry points — every push/delete goes through one of these two, so
// wrapping them here serializes the whole module's remote writes (see enqueueMutation).
function upsertRemoteFile(token, owner, repo, relPath, content) {
    return enqueueMutation(() => upsertRemoteFileNow(token, owner, repo, relPath, content));
}
function removeRemoteFile(token, owner, repo, relPath) {
    return enqueueMutation(() => removeRemoteFileNow(token, owner, repo, relPath));
}
function isConflictError(msg) {
    return msg.includes('is at') || msg.includes('conflict') || msg.includes('422') || msg.includes('409');
}
function isNotFoundError(msg) {
    return msg.includes('Not Found') || msg.includes('404');
}
async function upsertRemoteFileNow(token, owner, repo, relPath, content, _retrying = false) {
    let sha;
    try {
        const existing = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`));
        sha = existing.sha;
    }
    catch {
        // File doesn't exist yet — will be created
    }
    // note.md carries the title; section files fall back to '<dir>/<file>' label
    const titleMatch = content.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
    const label = titleMatch ? titleMatch[1].trim() : relPath.replace(/\.md$/, '');
    try {
        await githubRequest(token, 'PUT', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`, {
            message: sha ? `update: ${label}` : `add: ${label}`,
            content: Buffer.from(content).toString('base64'),
            ...(sha ? { sha } : {}),
        });
    }
    catch (err) {
        // SHA conflict: another push updated the file between our GET and PUT.
        // Re-fetch the current SHA and retry once.
        const msg = err instanceof Error ? err.message : String(err);
        if (!_retrying && isConflictError(msg)) {
            await upsertRemoteFileNow(token, owner, repo, relPath, content, true);
            return;
        }
        throw err;
    }
}
async function removeRemoteFileNow(token, owner, repo, relPath, _retrying = false) {
    let sha;
    try {
        const existing = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`));
        sha = existing.sha;
    }
    catch (err) {
        // GET failed: a real 404 means it's already gone (success); anything else is a
        // transient error we must surface so the delete isn't silently dropped.
        const msg = err instanceof Error ? err.message : String(err);
        if (isNotFoundError(msg))
            return;
        throw err;
    }
    try {
        await githubRequest(token, 'DELETE', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`, { message: `delete: ${relPath}`, sha });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // SHA moved under us (another commit landed first) — re-fetch and retry once.
        if (!_retrying && isConflictError(msg)) {
            await removeRemoteFileNow(token, owner, repo, relPath, true);
            return;
        }
        if (isNotFoundError(msg))
            return; // already deleted — fine
        throw err;
    }
}
// ── Module state ──────────────────────────────────────────────────────────────
let syncSettings = null;
let syncError;
let initialPullStatus = 'pending';
// Fired every time initialPullStatus changes so main.ts can broadcast to renderers.
let statusListener = null;
// Pending push timers per filename (debounce)
const pushTimers = new Map();
// ── Remote-mutation serialization ──────────────────────────────────────────────
// The GitHub Contents API commits one change at a time per branch: every PUT/DELETE
// moves the branch HEAD, so a concurrent write holding a now-stale file SHA gets a
// 409/422 conflict. Firing many writes at once (e.g. a batch delete, or saving a
// multi-section note) used to race and silently drop some — the next pull then
// "restored" the lost remote change locally. We funnel ALL remote mutations through
// this single promise chain so they run strictly one-at-a-time. `pendingMutations`
// also lets the auto-sync pull stand down while writes are still draining, closing
// the window where a pull could re-add a note whose remote delete hasn't landed yet.
let mutationChain = Promise.resolve();
let pendingMutations = 0;
function enqueueMutation(task) {
    pendingMutations++;
    const run = mutationChain.then(task, task);
    // Keep the chain alive regardless of individual task outcomes.
    mutationChain = run.then(() => { pendingMutations--; }, () => { pendingMutations--; });
    return run;
}
/** True while remote writes/deletes are queued or in flight (auto-sync defers). */
function hasPendingRemoteMutations() {
    return pendingMutations > 0;
}
let deviceFlow = null;
// ── Public API ────────────────────────────────────────────────────────────────
function loadSyncSettings() {
    const settings = readSettings();
    syncSettings = settings.githubSync ?? { enabled: false };
    return syncSettings;
}
function getSyncStatus() {
    const s = syncSettings ?? loadSyncSettings();
    return {
        enabled: s.enabled,
        connected: !!(s.encryptedToken && s.owner && s.repo),
        owner: s.owner,
        repo: s.repo,
        lastSync: s.lastSync,
        error: syncError,
        initialPullStatus,
    };
}
function setInitialPullStatus(status) {
    if (initialPullStatus === status)
        return;
    initialPullStatus = status;
    statusListener?.();
}
function onStatusChanged(cb) {
    statusListener = cb;
}
// Starts Device Flow. Returns the user_code to display + verification URL to open.
// onComplete is called when auth succeeds or fails (from background polling).
async function initiateDeviceFlow(repo, notesDir, onComplete) {
    // Cancel any existing flow
    cancelDeviceFlow();
    try {
        const data = await githubAuthPost('/login/device/code', {
            client_id: GITHUB_CLIENT_ID,
            scope: 'repo',
        });
        if (data.error) {
            return { ok: false, error: data.error_description ?? data.error };
        }
        deviceFlow = {
            deviceCode: data.device_code,
            userCode: data.user_code,
            verificationUri: data.verification_uri,
            expiresAt: Date.now() + parseInt(data.expires_in) * 1000,
            interval: parseInt(data.interval) || 5,
            pendingRepo: repo,
        };
        // Start polling in background
        schedulePoll(notesDir, onComplete);
        return {
            ok: true,
            userCode: data.user_code,
            verificationUri: data.verification_uri,
        };
    }
    catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { ok: false, error };
    }
}
function schedulePoll(notesDir, onComplete) {
    if (!deviceFlow)
        return;
    const intervalMs = deviceFlow.interval * 1000;
    deviceFlow.pollTimer = setTimeout(async () => {
        if (!deviceFlow)
            return;
        if (Date.now() > deviceFlow.expiresAt) {
            deviceFlow = null;
            onComplete({ ok: false, error: 'Authorization code expired. Please try again.' });
            return;
        }
        try {
            const data = await githubAuthPost('/login/oauth/access_token', {
                client_id: GITHUB_CLIENT_ID,
                device_code: deviceFlow.deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            });
            if (data.access_token) {
                // Auth complete — finalize connection
                const token = data.access_token;
                const repo = deviceFlow.pendingRepo;
                deviceFlow = null;
                try {
                    const owner = await validateToken(token);
                    await ensureRepo(token, owner, repo);
                    syncSettings = {
                        enabled: true,
                        encryptedToken: encryptToken(token),
                        owner,
                        repo,
                    };
                    syncError = undefined;
                    const settings = readSettings();
                    settings.githubSync = syncSettings;
                    writeSettings(settings);
                    await pullNotes(notesDir);
                    await pushAllNotes(notesDir);
                    onComplete({ ok: true, owner, repo });
                }
                catch (err) {
                    const error = err instanceof Error ? err.message : String(err);
                    syncError = error;
                    onComplete({ ok: false, error });
                }
            }
            else if (data.error === 'authorization_pending') {
                // Still waiting — keep polling
                schedulePoll(notesDir, onComplete);
            }
            else if (data.error === 'slow_down') {
                // Increase interval as requested
                deviceFlow.interval += 5;
                schedulePoll(notesDir, onComplete);
            }
            else {
                // access_denied or other terminal error
                const error = data.error_description ?? data.error ?? 'Authorization failed';
                deviceFlow = null;
                onComplete({ ok: false, error });
            }
        }
        catch (err) {
            // Network error — retry
            schedulePoll(notesDir, onComplete);
        }
    }, intervalMs);
}
function cancelDeviceFlow() {
    if (deviceFlow?.pollTimer)
        clearTimeout(deviceFlow.pollTimer);
    deviceFlow = null;
}
function disconnectGitHub() {
    // Cancel any pending pushes
    pushTimers.forEach((t) => clearTimeout(t));
    pushTimers.clear();
    syncSettings = { enabled: false };
    syncError = undefined;
    cachedDefaultBranch = null;
    setInitialPullStatus('pending');
    const settings = readSettings();
    delete settings.githubSync;
    writeSettings(settings);
}
async function pullNotes(notesDir) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) {
        return { pulled: 0, deleted: 0, errors: [], updatedFiles: [], hadDeletions: false, hadMetadataChanges: false };
    }
    let token;
    try {
        token = decryptToken(s.encryptedToken);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const userFacingError = `Failed to decrypt GitHub token. Please reconnect GitHub sync. (${msg})`;
        syncError = userFacingError;
        if (initialPullStatus === 'pending')
            setInitialPullStatus('failed');
        return {
            pulled: 0,
            deleted: 0,
            errors: [userFacingError],
            updatedFiles: [],
            hadDeletions: false,
            hadMetadataChanges: false,
        };
    }
    let pulled = 0;
    let deleted = 0;
    const errors = [];
    const updatedFiles = [];
    let hadMetadataChanges = false;
    const previousLastSync = s.lastSync;
    try {
        const blobs = await listRemoteTree(token, s.owner, s.repo);
        const remoteNoteDirs = groupRemoteNoteDirs(blobs);
        const remoteHasMarker = blobs.some((b) => b.path === noteFormat_1.FORMAT_MARKER_FILE);
        const remoteHasFlatNotes = rootFlatNoteBlobs(blobs).length > 0;
        // Transition guard: while the remote is still (partly) on format v1 — flat
        // .md files present and no v2 marker — the pull is ADDITIVE ONLY. The
        // deletion rule below would otherwise wipe freshly-migrated local folders
        // that the remote simply doesn't have yet.
        const remoteIsV2 = remoteHasMarker && !remoteHasFlatNotes;
        // Pull each remote note directory. The note dir is the unit of conflict
        // resolution: note.md's `updated:` decides, and a newer remote wins
        // WHOLESALE (all its section files mirrored, stale local sections removed).
        for (const [dir, remoteFilesInDir] of remoteNoteDirs) {
            try {
                const anchorRel = `${dir}/${noteFormat_1.NOTE_MD}`;
                const remoteAnchor = await getRemoteFile(token, s.owner, s.repo, anchorRel);
                if (!remoteAnchor)
                    continue;
                const localDirPath = path_1.default.join(notesDir, dir);
                const localAnchorPath = path_1.default.join(localDirPath, noteFormat_1.NOTE_MD);
                if (fs_1.default.existsSync(localAnchorPath)) {
                    const localUpdatedTs = parseUpdatedTimestamp(extractUpdatedTimestamp(fs_1.default.readFileSync(localAnchorPath, 'utf-8')));
                    const remoteUpdatedTs = parseUpdatedTimestamp(extractUpdatedTimestamp(remoteAnchor.content));
                    // Skip the whole dir if local is newer or equal
                    if (localUpdatedTs !== null && remoteUpdatedTs !== null && remoteUpdatedTs <= localUpdatedTs)
                        continue;
                }
                fs_1.default.mkdirSync(localDirPath, { recursive: true });
                fs_1.default.writeFileSync(localAnchorPath, remoteAnchor.content, 'utf-8');
                for (const f of remoteFilesInDir) {
                    if (f === noteFormat_1.NOTE_MD)
                        continue;
                    const remoteSection = await getRemoteFile(token, s.owner, s.repo, `${dir}/${f}`);
                    if (remoteSection)
                        fs_1.default.writeFileSync(path_1.default.join(localDirPath, f), remoteSection.content, 'utf-8');
                }
                // Sections removed remotely → remove their local files
                try {
                    for (const lf of fs_1.default.readdirSync(localDirPath)) {
                        if (!lf.endsWith('.md') || lf === noteFormat_1.NOTE_MD)
                            continue;
                        if (!remoteFilesInDir.has(lf)) {
                            try {
                                fs_1.default.unlinkSync(path_1.default.join(localDirPath, lf));
                            }
                            catch { /* ignore */ }
                        }
                    }
                }
                catch { /* ignore */ }
                updatedFiles.push(localDirPath);
                pulled++;
            }
            catch (err) {
                errors.push(`${dir}: ${String(err)}`);
            }
        }
        // Delete local note dirs that no longer exist on remote.
        // Safety rule: only delete if the local note.md's `updated` timestamp is
        // older than the last sync — meaning it was known to the remote at some
        // point and was since deleted. Dirs newer than lastSync were created
        // locally after the last sync and haven't been pushed yet — keep them.
        const lastSyncTime = s.lastSync ? new Date(s.lastSync).getTime() : null;
        if (lastSyncTime !== null && remoteIsV2) {
            for (const dir of (0, noteFormat_1.listNoteDirs)(notesDir)) {
                if (remoteNoteDirs.has(dir))
                    continue;
                const localDirPath = path_1.default.join(notesDir, dir);
                try {
                    const localContent = fs_1.default.readFileSync(path_1.default.join(localDirPath, noteFormat_1.NOTE_MD), 'utf-8');
                    const localUpdatedTime = parseUpdatedTimestamp(extractUpdatedTimestamp(localContent));
                    if (localUpdatedTime === null)
                        continue; // can't determine age — skip to be safe
                    if (localUpdatedTime > lastSyncTime)
                        continue; // created locally after last sync, not yet pushed
                    fs_1.default.rmSync(localDirPath, { recursive: true, force: true });
                    deleted++;
                }
                catch { /* ignore */ }
            }
        }
        // Pull optional metadata JSON files used by non-note features.
        for (const metadataFilename of METADATA_FILENAMES) {
            try {
                const remoteMetadata = await getRemoteFile(token, s.owner, s.repo, metadataFilename);
                if (!remoteMetadata)
                    continue;
                const metadataPath = path_1.default.join(notesDir, metadataFilename);
                const localContent = fs_1.default.existsSync(metadataPath)
                    ? fs_1.default.readFileSync(metadataPath, 'utf-8')
                    : null;
                if (localContent !== remoteMetadata.content) {
                    fs_1.default.writeFileSync(metadataPath, remoteMetadata.content, 'utf-8');
                    hadMetadataChanges = true;
                }
            }
            catch {
                // Optional metadata file is missing or unreadable remotely.
            }
        }
        syncSettings = { ...s, lastSync: new Date().toISOString() };
        const settings = readSettings();
        settings.githubSync = syncSettings;
        writeSettings(settings);
        syncError = undefined;
        const wasNotOk = initialPullStatus !== 'ok';
        if (wasNotOk) {
            setInitialPullStatus('ok');
            flushPendingLocalChanges(notesDir, previousLastSync);
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        syncError = msg;
        errors.push(msg);
        if (initialPullStatus === 'pending')
            setInitialPullStatus('failed');
    }
    return {
        pulled,
        deleted,
        errors,
        updatedFiles,
        hadDeletions: deleted > 0,
        hadMetadataChanges,
    };
}
async function pushAllNotes(notesDir) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo)
        return { pushed: 0, errors: [] };
    // Cancel any debounced pushes queued by flushPendingLocalChanges — pushAllNotes
    // does the same work synchronously, so leaving timers active would double-push
    // and produce duplicate commits.
    pushTimers.forEach((t) => clearTimeout(t));
    pushTimers.clear();
    let token;
    try {
        token = decryptToken(s.encryptedToken);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const userFacingError = `Failed to decrypt GitHub token. Please reconnect GitHub sync. (${msg})`;
        syncError = userFacingError;
        return { pushed: 0, errors: [userFacingError] };
    }
    let pushed = 0;
    const errors = [];
    // Every file of every note directory ('<dir>/<file>.md') + root metadata
    const relPaths = [];
    try {
        for (const dir of (0, noteFormat_1.listNoteDirs)(notesDir)) {
            for (const f of fs_1.default.readdirSync(path_1.default.join(notesDir, dir))) {
                if (f.endsWith('.md'))
                    relPaths.push(`${dir}/${f}`);
            }
        }
        for (const filename of METADATA_FILENAMES) {
            if (fs_1.default.existsSync(path_1.default.join(notesDir, filename)))
                relPaths.push(filename);
        }
    }
    catch {
        return { pushed: 0, errors: [] };
    }
    for (const relPath of relPaths) {
        try {
            const content = fs_1.default.readFileSync(path_1.default.join(notesDir, relPath), 'utf-8');
            await upsertRemoteFile(token, s.owner, s.repo, relPath, content);
            pushed++;
        }
        catch (err) {
            errors.push(relPath);
            console.error(`[GitHubSync] pushAll failed for ${relPath}:`, String(err));
        }
    }
    return { pushed, errors };
}
/**
 * Pushes a specific set of notes-dir-relative files NOW (awaited, no debounce),
 * reading their current content from disk. Used by bulk imports: the per-file
 * `schedulePush` path bumps `lastSync` to "now" on each completion, so while a
 * large batch drains, a racing auto-sync pull sees the not-yet-pushed notes as
 * `updated <= lastSync` and DELETES them. Landing them on the remote up front
 * makes them immune to that deletion (the pull keeps any dir present remotely).
 * Does NOT bump `lastSync` (the freshly-imported notes are newer than it, and
 * leaving it untouched avoids exposing OTHER pending local notes to deletion).
 * No-op while the push gate is closed — `flushPendingLocalChanges` will push
 * them after the first successful pull.
 */
async function pushPathsNow(notesDir, relPaths) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo)
        return { pushed: 0, errors: [] };
    if (initialPullStatus !== 'ok')
        return { pushed: 0, errors: [] };
    let token;
    try {
        token = decryptToken(s.encryptedToken);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        syncError = `Failed to decrypt GitHub token. Please reconnect GitHub sync. (${msg})`;
        return { pushed: 0, errors: [syncError] };
    }
    let pushed = 0;
    const errors = [];
    for (const relPath of relPaths) {
        // Supersede any debounced timer for this path — we're pushing it now.
        const existing = pushTimers.get(relPath);
        if (existing) {
            clearTimeout(existing);
            pushTimers.delete(relPath);
        }
        try {
            const content = fs_1.default.readFileSync(path_1.default.join(notesDir, relPath), 'utf-8');
            await upsertRemoteFile(token, s.owner, s.repo, relPath, content);
            pushed++;
        }
        catch (err) {
            errors.push(relPath);
            console.error(`[GitHubSync] pushPathsNow failed for ${relPath}:`, String(err));
        }
    }
    if (pushed > 0)
        syncError = undefined;
    return { pushed, errors };
}
/**
 * Debounced single-file push. `relPath` is the notes-dir-relative remote path
 * ('<dir>/<file>.md' for note files, '<name>.json' for root metadata) and is
 * also the debounce key — two files of the same note debounce independently.
 */
function schedulePush(relPath, content, onStart, onComplete) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) {
        onComplete?.();
        return;
    }
    // Gate: defer pushes until the initial pull has succeeded — otherwise a stale
    // local file could overwrite a newer remote version (data loss). The on-disk
    // write already happened in the caller, so no data is lost by deferring.
    // Pending changes are flushed automatically when pullNotes transitions to 'ok'.
    if (initialPullStatus !== 'ok') {
        console.warn(`[GitHubSync] Push deferred for ${relPath}: initialPullStatus=${initialPullStatus}`);
        onComplete?.(`sync-gated:${initialPullStatus}`);
        return;
    }
    schedulePushUnguarded(relPath, content, onStart, onComplete);
}
function schedulePushUnguarded(relPath, content, onStart, onComplete) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) {
        onComplete?.();
        return;
    }
    // Debounce: reset timer if already queued for this file.
    // Previous callbacks are intentionally discarded — the new call supersedes them.
    const existing = pushTimers.get(relPath);
    if (existing)
        clearTimeout(existing);
    const timer = setTimeout(async () => {
        pushTimers.delete(relPath);
        onStart?.(); // timer fired → HTTP request is about to start
        try {
            const token = decryptToken(s.encryptedToken);
            await upsertRemoteFile(token, s.owner, s.repo, relPath, content);
            syncSettings = { ...s, lastSync: new Date().toISOString() };
            const settings = readSettings();
            settings.githubSync = syncSettings;
            writeSettings(settings);
            syncError = undefined;
            onComplete?.();
        }
        catch (err) {
            syncError = err instanceof Error ? err.message : String(err);
            console.error('[GitHubSync] push failed:', syncError);
            onComplete?.(syncError);
        }
    }, 5000); // 5s debounce — avoids spamming API while typing
    pushTimers.set(relPath, timer);
}
// Called when pullNotes transitions from pending/failed → ok. Scans the note
// directories and re-queues pushes for every file of any note whose note.md is
// newer than the previous lastSync (i.e. edits made while the push gate was
// closed). The note.md timestamp can't tell WHICH section changed, so the
// whole dir is re-queued. Survives restarts: detection is purely on-disk.
function flushPendingLocalChanges(notesDir, previousLastSync) {
    const lastSyncMs = previousLastSync ? Date.parse(previousLastSync) : null;
    for (const dir of (0, noteFormat_1.listNoteDirs)(notesDir)) {
        const dirPath = path_1.default.join(notesDir, dir);
        try {
            const anchor = fs_1.default.readFileSync(path_1.default.join(dirPath, noteFormat_1.NOTE_MD), 'utf-8');
            const updatedMs = parseUpdatedTimestamp(extractUpdatedTimestamp(anchor));
            if (updatedMs === null)
                continue;
            if (lastSyncMs !== null && updatedMs <= lastSyncMs)
                continue;
            for (const f of fs_1.default.readdirSync(dirPath)) {
                if (!f.endsWith('.md'))
                    continue;
                try {
                    schedulePushUnguarded(`${dir}/${f}`, fs_1.default.readFileSync(path_1.default.join(dirPath, f), 'utf-8'));
                }
                catch { /* unreadable file — skip */ }
            }
        }
        catch {
            // Unreadable dir — skip.
        }
    }
}
/** Removes a single remote file ('<dir>/<file>.md') — used for dropped sections. */
async function scheduleDelete(relPath) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo)
        return;
    // Cancel any pending push for this file before deleting
    const existing = pushTimers.get(relPath);
    if (existing) {
        clearTimeout(existing);
        pushTimers.delete(relPath);
    }
    try {
        const token = decryptToken(s.encryptedToken);
        await removeRemoteFile(token, s.owner, s.repo, relPath);
    }
    catch (err) {
        console.error('[GitHubSync] delete failed:', String(err));
    }
}
/** Removes a whole remote note directory (every blob under '<dir>/'). */
async function scheduleDeleteDir(dir) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo)
        return;
    // Cancel any pending pushes for files inside this dir
    for (const key of [...pushTimers.keys()]) {
        if (key.startsWith(`${dir}/`)) {
            clearTimeout(pushTimers.get(key));
            pushTimers.delete(key);
        }
    }
    try {
        const token = decryptToken(s.encryptedToken);
        const blobs = await listRemoteTree(token, s.owner, s.repo);
        const targets = blobs.filter((b) => b.path.startsWith(`${dir}/`));
        // Delete every blob; one failure must not abort the rest (a half-deleted dir
        // would be re-pulled on the next sync). Surface failures via syncError so the
        // delete isn't silently dropped — the cause of notes "coming back".
        let failures = 0;
        for (const b of targets) {
            try {
                await removeRemoteFile(token, s.owner, s.repo, b.path);
            }
            catch (err) {
                failures++;
                console.error(`[GitHubSync] delete dir blob failed for ${b.path}:`, String(err));
            }
        }
        if (failures > 0)
            syncError = `Failed to delete ${failures} remote file(s) in ${dir}`;
    }
    catch (err) {
        syncError = `delete dir ${dir} failed: ${String(err)}`;
        console.error('[GitHubSync] delete dir failed:', String(err));
    }
}
// ── One-time remote format migration (v1 flat files → v2 folders) ────────────
let remoteMigrationInFlight = false;
/**
 * Brings the remote repo to format v2: converts any remaining root-level flat
 * note files into folders, pushes every local note folder, deletes the old
 * flat files and finally uploads the `.noteflow-format` marker. Idempotent and
 * cheap once done (guarded by `remoteFormatMigratedAt` in settings).
 *
 * Sequencing safety: callers run this AFTER a successful pull (which is
 * additive-only while the remote is v1), and the marker is pushed LAST so
 * other v2 clients keep their deletion logic disabled until the conversion
 * has fully landed. Returns true when a migration actually ran.
 */
async function migrateRemoteToV2IfNeeded(notesDir) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo)
        return false;
    if (s.remoteFormatMigratedAt)
        return false;
    if (initialPullStatus !== 'ok')
        return false;
    if (remoteMigrationInFlight)
        return false;
    remoteMigrationInFlight = true;
    try {
        const token = decryptToken(s.encryptedToken);
        const blobs = await listRemoteTree(token, s.owner, s.repo);
        const hasMarker = blobs.some((b) => b.path === noteFormat_1.FORMAT_MARKER_FILE);
        const flatNotes = rootFlatNoteBlobs(blobs);
        if (hasMarker && flatNotes.length === 0) {
            // Remote already fully v2 (migrated by another device) — just record it.
            persistMigratedAt(s);
            return false;
        }
        console.log(`[GitHubSync] migrating remote to format v2 (${flatNotes.length} flat note(s))`);
        // 1) Convert remote flat notes locally first so nothing is lost: notes that
        //    only exist remotely (or are NEWER remotely — an old client pushed after
        //    our local migration) are written as local folders before deletion.
        for (const blob of flatNotes) {
            try {
                const remote = await getRemoteFile(token, s.owner, s.repo, blob.path);
                if (!remote)
                    continue;
                const dir = blob.path.replace(/\.md$/i, '');
                const localAnchorPath = path_1.default.join(notesDir, dir, noteFormat_1.NOTE_MD);
                if (fs_1.default.existsSync(localAnchorPath)) {
                    const localTs = parseUpdatedTimestamp(extractUpdatedTimestamp(fs_1.default.readFileSync(localAnchorPath, 'utf-8')));
                    const remoteTs = parseUpdatedTimestamp(extractUpdatedTimestamp(remote.content));
                    if (localTs !== null && remoteTs !== null && remoteTs <= localTs)
                        continue; // local folder is current
                }
                const note = (0, noteFormat_1.parseLegacyNoteRaw)(remote.content);
                const { files } = (0, noteFormat_1.serializeNoteFolder)(note, { preserveUpdated: true });
                fs_1.default.mkdirSync(path_1.default.join(notesDir, dir), { recursive: true });
                for (const [f, content] of Object.entries(files)) {
                    fs_1.default.writeFileSync(path_1.default.join(notesDir, dir, f), content, 'utf-8');
                }
            }
            catch (err) {
                console.error(`[GitHubSync] remote migration: failed to convert ${blob.path}:`, String(err));
            }
        }
        // 2) Push every local note folder + metadata
        await pushAllNotes(notesDir);
        // 3) Delete the old flat files from the remote
        for (const blob of flatNotes) {
            try {
                await removeRemoteFile(token, s.owner, s.repo, blob.path);
            }
            catch (err) {
                console.error(`[GitHubSync] remote migration: failed to delete ${blob.path}:`, String(err));
            }
        }
        // 4) Marker LAST — it flips other clients into full v2 behaviour
        await upsertRemoteFile(token, s.owner, s.repo, noteFormat_1.FORMAT_MARKER_FILE, `${noteFormat_1.NOTE_FORMAT_VERSION}\n`);
        persistMigratedAt(s);
        console.log('[GitHubSync] remote format migration complete');
        return true;
    }
    finally {
        remoteMigrationInFlight = false;
    }
}
function persistMigratedAt(s) {
    // Re-read the live settings — a debounced push may have bumped lastSync
    // while the migration was running.
    const latest = syncSettings ?? s;
    syncSettings = { ...latest, remoteFormatMigratedAt: new Date().toISOString() };
    const settings = readSettings();
    settings.githubSync = syncSettings;
    writeSettings(settings);
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function extractUpdatedTimestamp(content) {
    const match = content.match(/^updated:\s*['"]?([^'"\n]+)['"]?\s*$/m);
    return match ? match[1].trim() : null;
}
function parseUpdatedTimestamp(value) {
    if (!value)
        return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}
