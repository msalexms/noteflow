"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_AI_SETTINGS = void 0;
exports.init = init;
exports.isEnabled = isEnabled;
exports.primeSettings = primeSettings;
exports.getSettings = getSettings;
exports.applySettings = applySettings;
exports.scheduleIndex = scheduleIndex;
exports.removeFromIndex = removeFromIndex;
exports.reindexAll = reindexAll;
exports.search = search;
exports.related = related;
exports.graph = graph;
/**
 * aiIndex.ts — runs in the main process. Owns the AI utilityProcess lifecycle and
 * exposes a small async API consumed by the IPC handlers and the fs:write-note hook.
 *
 * The heavy work (embeddings, SQLite) lives in aiWorker.ts; this module only forks it,
 * mediates a request/response message protocol, debounces incremental indexing (mirrors
 * githubSync.schedulePush), and respawns the worker if it crashes (the index persists).
 */
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const protocol_1 = require("./protocol");
exports.DEFAULT_AI_SETTINGS = {
    enabled: false,
    modelId: protocol_1.DEFAULT_AI_MODEL,
    lastIndexedModelId: null,
    chunking: 'section',
};
let child = null;
let ready = false;
let manualStop = false;
let starting = null;
let settings = { ...exports.DEFAULT_AI_SETTINGS };
let notesDir = '';
let eventSink = {};
let nextId = 1;
const pending = new Map();
const indexTimers = new Map();
const INDEX_DEBOUNCE_MS = 2500;
// ── Public API ──────────────────────────────────────────────────────────────
function init(opts) {
    notesDir = opts.notesDir;
    eventSink = { progress: opts.onProgress, state: opts.onState };
}
function isEnabled() {
    return settings.enabled;
}
/**
 * Set the persisted settings at boot. Nothing is started here: the lightweight worker (SQLite
 * only, ~70 MB) spins up lazily the first time the brain view asks for graph/related, and the
 * heavy model loads only on an explicit reindex / reactivate. So a fresh boot costs 0 MB of AI.
 */
function primeSettings(next) {
    settings = next;
}
function getSettings() {
    return settings;
}
/** Load the heavy model (lazy, in the worker) and reindex if the stored vectors are stale/missing.
 *  This is the "reactivate" path — the only thing besides the Reindex button that wakes the model. */
async function activateModel() {
    await ensureStarted(); // light SQLite worker
    const res = (await request('load-model', {}));
    if (res?.needsReindex)
        await reindexAll();
}
/** Apply a new settings snapshot: start/stop/restart the worker as needed. */
async function applySettings(next) {
    const prev = settings;
    settings = next;
    if (!next.enabled) {
        // Disable → fully stop the worker (drops both SQLite and the model).
        await stop();
        return;
    }
    const modelChanged = prev.modelId !== next.modelId;
    if (modelChanged && child) {
        // Model swap → restart so the worker picks up the new model on its next lazy load.
        await stop();
    }
    await ensureStarted(); // light worker (SQLite only); the model stays unloaded until needed
    // Turning AI on, or switching models, is an explicit activation → load the model + reindex.
    if (!prev.enabled || modelChanged)
        await activateModel();
}
/** Debounced incremental index of a single note directory (called from fs:write-note). */
function scheduleIndex(dirPath) {
    if (!settings.enabled)
        return;
    const key = path_1.default.basename(dirPath);
    const existing = indexTimers.get(key);
    if (existing)
        clearTimeout(existing);
    indexTimers.set(key, setTimeout(async () => {
        indexTimers.delete(key);
        // Only index if the model is already up this session — never wake the worker/model from a save.
        // While dormant the edit is skipped; the next explicit reindex catches it up.
        if (!child || !ready)
            return;
        try {
            await request('index-note', { dirPath });
        }
        catch (err) {
            console.error('[aiIndex] index-note failed:', String(err));
        }
    }, INDEX_DEBOUNCE_MS));
}
function removeFromIndex(dirPath) {
    if (!settings.enabled || !child || !ready)
        return;
    request('remove-note', { dirPath }).catch((err) => console.error('[aiIndex] remove-note failed:', String(err)));
}
async function reindexAll() {
    await ensureStarted();
    return request('reindex-all', { notesDir });
}
async function search(query, k = 10) {
    if (!settings.enabled)
        return [];
    try {
        await ensureStarted();
        return await request('search', { query, k });
    }
    catch (err) {
        // Worker stopped/restarting (e.g. user toggled off mid-request) → no results, not an error.
        console.warn('[aiIndex] search aborted:', String(err));
        return [];
    }
}
async function related(noteId, sectionId, k = 6) {
    if (!settings.enabled)
        return [];
    try {
        await ensureStarted();
        return await request('related', { noteId, sectionId, k });
    }
    catch (err) {
        console.warn('[aiIndex] related aborted:', String(err));
        return [];
    }
}
/** Note-to-note content edges for the brain graph (Phase 2). [] if AI is off or empty. */
async function graph() {
    if (!settings.enabled)
        return [];
    try {
        await ensureStarted();
        return await request('graph', {});
    }
    catch (err) {
        // Worker stopped/restarting (e.g. user toggled off mid-request) → no edges, not an error.
        console.warn('[aiIndex] graph aborted:', String(err));
        return [];
    }
}
// ── Worker lifecycle ────────────────────────────────────────────────────────
function ensureStarted() {
    if (child && ready)
        return Promise.resolve();
    if (starting)
        return starting;
    starting = start().finally(() => { starting = null; });
    return starting;
}
async function start() {
    if (child)
        return;
    manualStop = false;
    const dbPath = path_1.default.join(electron_1.app.getPath('userData'), 'ai-index', 'index.db');
    const cacheDir = path_1.default.join(electron_1.app.getPath('userData'), 'ai-models');
    // aiIndex.js is compiled to dist-electron/ai/, so the worker is a sibling here.
    const workerPath = path_1.default.join(__dirname, 'aiWorker.js');
    const proc = electron_1.utilityProcess.fork(workerPath, [], {
        serviceName: 'noteflow-ai',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout?.on('data', (d) => console.log('[aiWorker]', d.toString().trimEnd()));
    proc.stderr?.on('data', (d) => console.error('[aiWorker:err]', d.toString().trimEnd()));
    child = proc;
    await new Promise((resolve, reject) => {
        let settled = false;
        proc.on('message', (msg) => onMessage(msg));
        proc.on('exit', (code) => {
            if (!settled) {
                settled = true;
                reject(new Error(`AI worker exited before init (code ${code})`));
            }
            onExit(code);
        });
        // Send init once spawned. Electron queues the message until the child port is up.
        // init is light (opens the DB, no model) → resolves fast. We never reindex here: the model
        // is only loaded on an explicit reindex/reactivate, so a fresh start costs ~70 MB, not ~600.
        proc.once('spawn', () => {
            request('init', { modelId: settings.modelId, cacheDir, dbPath })
                .then(() => {
                ready = true;
                settled = true;
                resolve();
            })
                .catch((err) => {
                if (!settled) {
                    settled = true;
                    reject(err);
                }
            });
        });
    });
}
async function stop() {
    manualStop = true;
    for (const t of indexTimers.values())
        clearTimeout(t);
    indexTimers.clear();
    for (const { reject } of pending.values())
        reject(new Error('AI worker stopped'));
    pending.clear();
    const proc = child;
    child = null;
    ready = false;
    if (proc)
        proc.kill();
}
function onExit(code) {
    child = null;
    ready = false;
    for (const { reject } of pending.values())
        reject(new Error('AI worker exited'));
    pending.clear();
    if (!manualStop && settings.enabled) {
        // Unexpected crash → respawn after a short delay. The on-disk index survives.
        console.warn(`[aiIndex] worker exited (code ${code}); respawning…`);
        setTimeout(() => { ensureStarted().catch((err) => console.error('[aiIndex] respawn failed:', String(err))); }, 1000);
    }
}
function onMessage(msg) {
    switch (msg.type) {
        case 'result': {
            const p = pending.get(msg.id);
            if (p) {
                pending.delete(msg.id);
                p.resolve(msg.payload);
            }
            break;
        }
        case 'error': {
            const p = pending.get(msg.id);
            if (p) {
                pending.delete(msg.id);
                p.reject(new Error(msg.error));
            }
            break;
        }
        case 'progress':
            eventSink.progress?.(msg.payload);
            break;
        case 'state':
            eventSink.state?.(msg.payload);
            break;
    }
}
function request(type, payload) {
    if (!child)
        return Promise.reject(new Error('AI worker not running'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.postMessage({ type, id, payload });
    });
}
