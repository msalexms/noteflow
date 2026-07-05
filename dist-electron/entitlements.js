"use strict";
// Pure entitlement derivation from the `subscriptions` rows the client can read
// via RLS. Lives in electron/ (not src/lib/) because only the main process needs
// it — tsconfig.electron.json (rootDir: 'electron') cannot import renderer code,
// and the renderer only ever sees the derived {ai, cloud} booleans in the public
// account status. Covered by tests/electron/entitlements.test.ts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.NO_ENTITLEMENTS = void 0;
exports.computeEntitlements = computeEntitlements;
exports.NO_ENTITLEMENTS = { ai: false, cloud: false };
/**
 * A product is entitled when some row carries that product (or 'bundle') with
 * status 'active'. Any other status (past_due, canceled, expired) grants nothing
 * — grace periods, if ever wanted, are a server-side decision (the webhook keeps
 * status 'active' during them), not a client one.
 */
function computeEntitlements(rows) {
    let ai = false;
    let cloud = false;
    for (const row of rows ?? []) {
        if (!row || row.status !== 'active')
            continue;
        if (row.product === 'ai' || row.product === 'bundle')
            ai = true;
        if (row.product === 'cloud' || row.product === 'bundle')
            cloud = true;
    }
    return { ai, cloud };
}
