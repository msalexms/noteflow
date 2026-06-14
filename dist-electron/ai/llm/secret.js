"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptSecret = encryptSecret;
exports.decryptSecret = decryptSecret;
// API-key encryption at rest. Mirrors githubSync's encryptToken/decryptToken so the
// LLM key gets the same OS-level protection (safeStorage) with a base64 fallback when
// the platform keyring is unavailable (common on Linux). Kept as its own module to
// avoid coupling the AI subsystem to the GitHub sync module.
const electron_1 = require("electron");
// Distinguishes a safeStorage ciphertext from the plain base64 fallback, so a change in
// keyring availability between encrypt and decrypt doesn't pick the wrong method.
const SAFE_STORAGE_PREFIX = 'safe:';
function encryptSecret(value) {
    if (electron_1.safeStorage.isEncryptionAvailable()) {
        return SAFE_STORAGE_PREFIX + electron_1.safeStorage.encryptString(value).toString('base64');
    }
    return Buffer.from(value).toString('base64');
}
function decryptSecret(encrypted) {
    if (encrypted.startsWith(SAFE_STORAGE_PREFIX)) {
        return electron_1.safeStorage.decryptString(Buffer.from(encrypted.slice(SAFE_STORAGE_PREFIX.length), 'base64'));
    }
    // Legacy / fallback: try safeStorage, then treat as plain base64.
    if (electron_1.safeStorage.isEncryptionAvailable()) {
        try {
            return electron_1.safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
        }
        catch {
            // not a safeStorage ciphertext — fall through to plain base64
        }
    }
    return Buffer.from(encrypted, 'base64').toString('utf-8');
}
