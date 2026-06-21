"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseNotionZip = parseNotionZip;
/** Notion importer — reads an HTML export (.zip) produced with "Include subpages". */
const adm_zip_1 = __importDefault(require("adm-zip"));
const index_1 = require("./index");
// A trailing 32-hex Notion id on a file or folder name: "Clean Code 1c77…ca1"
const HEX_SUFFIX = /[ _]?[0-9a-f]{32}$/i;
// Wrapper folders Notion adds around the actual workspace: "Export-<uuid>-Part-1"
const EXPORT_WRAPPER = /^Export-[0-9a-f-]{8,}/i;
function stripHexSuffix(name) {
    return name.replace(HEX_SUFFIX, '').trim();
}
function extractTitle(html, fallback) {
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = t ? (0, index_1.decodeHtmlEntities)(t[1]).trim() : '';
    return title || fallback;
}
/** Inner HTML of <body> (drops <head>/<style>); the renderer parses .page-body. */
function extractBody(html) {
    const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    return (m ? m[1] : html).trim();
}
/**
 * Collects the html of every page in a Notion zip. Large exports are split into
 * nested `Export-…-Part-N.zip` archives, so recurse into any `.zip` entries.
 */
function collectHtml(zip, out, depth = 0) {
    if (depth > 4)
        return;
    for (const entry of zip.getEntries()) {
        if (entry.isDirectory)
            continue;
        if (/\.zip$/i.test(entry.entryName)) {
            try {
                collectHtml(new adm_zip_1.default(entry.getData()), out, depth + 1);
            }
            catch { /* skip bad nested zip */ }
            continue;
        }
        if (!/\.html$/i.test(entry.entryName))
            continue; // skip .csv (databases), images, assets
        out.push({ entryName: entry.entryName, html: entry.getData().toString('utf-8') });
    }
}
function parseNotionZip(zipPath) {
    const raw = [];
    collectHtml(new adm_zip_1.default(zipPath), raw);
    const pages = [];
    for (const { entryName, html } of raw) {
        // entryName uses '/'. Drop the Export-* wrapper folders Notion prepends.
        const segments = entryName.split('/').filter((s) => s && !EXPORT_WRAPPER.test(s));
        if (segments.length === 0)
            continue;
        pages.push({ segments, html });
    }
    // If every page shares the same top folder (the single exported workspace page,
    // e.g. "Privado y compartido"), drop it so its children become the groups.
    const tops = new Set(pages.map((p) => (p.segments.length > 1 ? p.segments[0] : '')));
    const dropTop = pages.length > 0 && tops.size === 1 && !tops.has('');
    return pages.map(({ segments, html }) => {
        const segs = dropTop ? segments.slice(1) : segments;
        const fileSeg = segs[segs.length - 1].replace(/\.html$/i, '');
        const relPath = segs.slice(0, -1).map(stripHexSuffix).filter(Boolean);
        const fallbackTitle = stripHexSuffix(fileSeg);
        return {
            title: extractTitle(html, fallbackTitle),
            format: 'html',
            body: extractBody(html),
            relPath,
        };
    });
}
