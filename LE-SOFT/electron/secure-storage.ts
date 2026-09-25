/**
 * ═══════════════════════════════════════════════════════════════════════════
 * electron/secure-storage.ts — Machine-Bound Protected Storage Service
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implements the LESOFT Secure Storage Policy:
 *
 * PRIMARY:
 *   - Windows/macOS Electron safeStorage (Windows DPAPI / macOS Keychain)
 *   - Format: enc:v1:safeStorage:<base64(ciphertext)>
 *
 * FALLBACK (Lower-risk application/session data only):
 *   - Random 32-byte key generated once via crypto.randomBytes(32).
 *   - Never derived from hostname, username, machine ID, password, static salt,
 *     or application constants.
 *   - Stored in Electron userData directory with OS-user-only permissions (0o600).
 *   - Authenticated encryption: AES-256-GCM with fresh random 12-byte nonce.
 *   - Format: enc:v1:fallback:<base64(iv[12] + authTag[16] + ciphertext)>
 *
 * CRITICAL RULE FOR PRIVILEGED SECRETS:
 *   - Supabase service-role credentials, master/license generation secrets,
 *     and Cloudflare access secrets MUST fail closed when safeStorage is unavailable.
 *   - Fallback storage is strictly prohibited for privileged secrets.
 *
 * MIGRATION:
 *   - Fallback-protected values are automatically migrated to safeStorage
 *     as soon as safeStorage becomes available.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { safeStorage as electronSafeStorage, app } from 'electron';

const PREFIX_SAFESTORAGE = 'enc:v1:safeStorage:';
const PREFIX_FALLBACK    = 'enc:v1:fallback:';
const CIPHER_GCM         = 'aes-256-gcm';
const IV_LENGTH          = 12;
const TAG_LENGTH         = 16;
const FALLBACK_KEY_FILE  = '.secure-fallback.key';

// Test override hooks
let testSafeStorageMock: {
    isEncryptionAvailable: () => boolean;
    encryptString: (plainText: string) => Buffer;
    decryptString: (encrypted: Buffer) => string;
} | null = null;

let customUserDataPath: string | null = null;

/**
 * Returns the userData directory path.
 */
export function getUserDataPath(): string {
    if (customUserDataPath) return customUserDataPath;
    try {
        if (app?.getPath) {
            return app.getPath('userData');
        }
    } catch {}
    return path.join(process.env.APPDATA || process.env.HOME || process.cwd(), 'le-soft');
}

/**
 * For testing: override the userData path.
 */
export function _setCustomUserDataPathForTesting(p: string | null): void {
    customUserDataPath = p;
    cachedFallbackKey = null;
}

/**
 * For testing: override the safeStorage provider.
 */
export function _setSafeStorageForTesting(mock: typeof testSafeStorageMock): void {
    testSafeStorageMock = mock;
}

/**
 * Returns whether Electron safeStorage (DPAPI / Keychain) is available.
 */
export function isSafeStorageAvailable(): boolean {
    if (testSafeStorageMock) {
        return testSafeStorageMock.isEncryptionAvailable();
    }
    try {
        return !!electronSafeStorage?.isEncryptionAvailable?.();
    } catch {
        return false;
    }
}

// In-memory cache for fallback key
let cachedFallbackKey: Buffer | null = null;

/**
 * Retrieves or generates the 32-byte random fallback key.
 * Stored with OS-user-only permissions (0o600).
 */
export function getOrCreateFallbackKey(): Buffer {
    if (cachedFallbackKey) return cachedFallbackKey;

    const keyDir = getUserDataPath();
    const keyPath = path.join(keyDir, FALLBACK_KEY_FILE);

    if (fs.existsSync(keyPath)) {
        try {
            const raw = fs.readFileSync(keyPath);
            if (raw.length === 32) {
                cachedFallbackKey = raw;
                return cachedFallbackKey;
            }
        } catch (err) {
            console.warn('[SecureStorage] Error reading fallback key file, generating new key:', err);
        }
    }

    // Generate fresh random 32-byte key
    const newKey = crypto.randomBytes(32);
    try {
        if (!fs.existsSync(keyDir)) {
            fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
        }
        // Write with restrictive permissions (0o600: read/write by owner only)
        fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
        try {
            fs.chmodSync(keyPath, 0o600);
        } catch {}
        cachedFallbackKey = newKey;
    } catch (err) {
        console.error('[SecureStorage] Failed to persist fallback key to disk:', err);
        // Retain in memory as emergency ephemeral key
        cachedFallbackKey = newKey;
    }

    return cachedFallbackKey;
}

/**
 * Clears the in-memory fallback key cache.
 */
export function _clearFallbackKeyCacheForTesting(): void {
    cachedFallbackKey = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Privileged Secret Operations (Fail Closed if safeStorage is unavailable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypts an infrastructure-level privileged secret (e.g. Supabase service-role key,
 * Cloudflare access secrets, master generation secrets).
 *
 * CRITICAL RULE: Fails closed immediately if safeStorage is unavailable.
 */
export function encryptPrivilegedSecret(plaintext: string): string {
    if (!plaintext || typeof plaintext !== 'string') {
        throw new Error('Invalid plaintext secret provided.');
    }

    if (!isSafeStorageAvailable()) {
        throw new Error('safeStorage unavailable: privileged secrets cannot be stored with fallback key');
    }

    let encryptedBuf: Buffer;
    if (testSafeStorageMock) {
        encryptedBuf = testSafeStorageMock.encryptString(plaintext);
    } else {
        encryptedBuf = electronSafeStorage.encryptString(plaintext);
    }

    return `${PREFIX_SAFESTORAGE}${encryptedBuf.toString('base64')}`;
}

/**
 * Decrypts an infrastructure-level privileged secret.
 *
 * CRITICAL RULE: Rejects fallback-encrypted data and fails closed if safeStorage is unavailable.
 */
export function decryptPrivilegedSecret(ciphertext: string): string {
    if (!ciphertext || typeof ciphertext !== 'string') {
        throw new Error('Invalid ciphertext provided.');
    }

    if (ciphertext.startsWith(PREFIX_FALLBACK)) {
        throw new Error('Security policy violation: privileged secret was encrypted with fallback storage and is rejected');
    }

    if (!ciphertext.startsWith(PREFIX_SAFESTORAGE)) {
        throw new Error('Invalid secret envelope: expected safeStorage format');
    }

    if (!isSafeStorageAvailable()) {
        throw new Error('safeStorage unavailable: cannot decrypt privileged secret');
    }

    const payloadBase64 = ciphertext.slice(PREFIX_SAFESTORAGE.length);
    const encBuffer = Buffer.from(payloadBase64, 'base64');

    if (testSafeStorageMock) {
        return testSafeStorageMock.decryptString(encBuffer);
    }
    return electronSafeStorage.decryptString(encBuffer);
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard Secret Operations (safeStorage with secure fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypts standard application/session data.
 * Uses safeStorage if available; otherwise uses authenticated AES-256-GCM fallback.
 */
export function encryptStandardSecret(plaintext: string): string {
    if (!plaintext || typeof plaintext !== 'string') {
        return '';
    }

    if (isSafeStorageAvailable()) {
        const encBuffer = testSafeStorageMock
            ? testSafeStorageMock.encryptString(plaintext)
            : electronSafeStorage.encryptString(plaintext);
        return `${PREFIX_SAFESTORAGE}${encBuffer.toString('base64')}`;
    }

    // Fallback: AES-256-GCM with fresh 12-byte random nonce
    const key = getOrCreateFallbackKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(CIPHER_GCM, key, iv);

    const ciphertextBuf = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    const combined = Buffer.concat([iv, tag, ciphertextBuf]);
    return `${PREFIX_FALLBACK}${combined.toString('base64')}`;
}

/**
 * Decrypts standard application/session data.
 * Supports both safeStorage and fallback formats.
 * Authenticated decryption throws on data tampering.
 */
export function decryptStandardSecret(ciphertext: string): string {
    if (!ciphertext || typeof ciphertext !== 'string') {
        return '';
    }

    if (ciphertext.startsWith(PREFIX_SAFESTORAGE)) {
        if (!isSafeStorageAvailable()) {
            throw new Error('safeStorage is currently unavailable to decrypt this secret');
        }
        const encBuffer = Buffer.from(ciphertext.slice(PREFIX_SAFESTORAGE.length), 'base64');
        return testSafeStorageMock
            ? testSafeStorageMock.decryptString(encBuffer)
            : electronSafeStorage.decryptString(encBuffer);
    }

    if (ciphertext.startsWith(PREFIX_FALLBACK)) {
        const key = getOrCreateFallbackKey();
        const combined = Buffer.from(ciphertext.slice(PREFIX_FALLBACK.length), 'base64');
        if (combined.length < IV_LENGTH + TAG_LENGTH) {
            throw new Error('Malformed fallback ciphertext envelope: insufficient length');
        }

        const iv         = combined.subarray(0, IV_LENGTH);
        const tag        = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
        const ciphertextBuf = combined.subarray(IV_LENGTH + TAG_LENGTH);

        const decipher = crypto.createDecipheriv(CIPHER_GCM, key, iv);
        decipher.setAuthTag(tag);

        return decipher.update(ciphertextBuf).toString('utf8') + decipher.final('utf8');
    }

    throw new Error('Unrecognized secret format: missing valid safeStorage or fallback prefix');
}

/**
 * Automatically migrates a fallback-protected secret to safeStorage if safeStorage is now available.
 * Returns the migrated ciphertext and a boolean indicating whether migration occurred.
 */
export function migrateSecretToSafeStorage(ciphertext: string): { migrated: boolean; result: string } {
    if (!ciphertext || typeof ciphertext !== 'string') {
        return { migrated: false, result: ciphertext };
    }

    if (ciphertext.startsWith(PREFIX_FALLBACK) && isSafeStorageAvailable()) {
        try {
            const plain = decryptStandardSecret(ciphertext);
            const upgraded = encryptStandardSecret(plain);
            return { migrated: true, result: upgraded };
        } catch (err) {
            console.warn('[SecureStorage] Automatic migration to safeStorage failed:', err);
        }
    }

    return { migrated: false, result: ciphertext };
}
