/**
 * ═══════════════════════════════════════════════════════════════════════════
 * electron/field-encryption.ts — Versioned AES-256-GCM Field-Level Encryption
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CRYPTOGRAPHIC SPECIFICATION (Version 3 — New Writes):
 *   - Cipher: AES-256-GCM (Authenticated Encryption with Associated Data)
 *   - Nonce: Cryptographically random 12-byte IV per record (NIST SP 800-38D)
 *   - Salt: Cryptographically random 16-byte salt per record
 *   - Key Derivation: HKDF-SHA256 (RFC 5869) deriving a 32-byte record key
 *     from Master Key + per-record Salt with info 'lesoft-field-encryption-v3'.
 *   - Tag: 16-byte authentication tag verified on every decryption.
 *   - Format: e3:<base64( salt[16] + iv[12] + authTag[16] + ciphertext )>
 *
 * BACKWARD COMPATIBILITY:
 *   - e1: format (AES-256-GCM, static salt HMAC-SHA256 key, IV[12] + Tag[16] + Ciphertext)
 *     is fully supported for decryption of existing records.
 *   - e2: format (legacy AES-256-CBC, IV[16] + Ciphertext) is supported for decryption.
 *   - Plaintext / unencrypted values are returned as-is.
 *   - New writes use ONLY the e3: format.
 *
 * COLUMNS EXCLUDED FROM ENCRYPTION (Structural / Relational):
 *   - id, foreign keys (*_id), auth_id, timestamps, booleans, search keys.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import {
    encryptStandardSecret,
    decryptStandardSecret,
    getUserDataPath
} from './secure-storage';

const CIPHER_GCM    = 'aes-256-gcm';
const V3_PREFIX     = 'e3:';
const V1_PREFIX     = 'e1:';
const V2_CBC_PREFIX = 'e2:';

const SALT_LEN = 16;
const IV_LEN   = 12;
const TAG_LEN  = 16;
const HKDF_INFO = Buffer.from('lesoft-field-encryption-v3', 'utf-8');

const MASTER_SEED_FILE = '.field-master-seed.key';
const LEGACY_SALT = crypto.createHash('sha256').update('lesoft-e2e-salt-v1').digest();

// In-memory keys
let _masterKey: Buffer | null = null;
let _legacyE1Key: Buffer | null = null;

/**
 * Retrieves the raw license or project key string from configuration.
 */
function getLicenseKey(): string {
    try {
        const cfgPath = path.join(getUserDataPath(), 'supabase-config.json');
        if (fs.existsSync(cfgPath)) {
            const raw = fs.readFileSync(cfgPath, 'utf-8');
            const cfg = JSON.parse(raw);
            const key = cfg.serviceRoleKey || cfg.anonKey;
            if (key && typeof key === 'string') {
                return key.startsWith('enc:v1:') ? decryptStandardSecret(key) : key;
            }
        }
    } catch {}
    return '';
}

/**
 * Retrieves or generates the machine-protected master seed.
 * Protected by safeStorage or secure fallback.
 */
function getOrCreateMachineMasterSeed(): Buffer {
    const keyPath = path.join(getUserDataPath(), MASTER_SEED_FILE);
    if (fs.existsSync(keyPath)) {
        try {
            const fileContent = fs.readFileSync(keyPath, 'utf-8');
            const decryptedHex = decryptStandardSecret(fileContent);
            const seedBuf = Buffer.from(decryptedHex, 'hex');
            if (seedBuf.length === 32) {
                return seedBuf;
            }
        } catch (err) {
            console.warn('[FieldEncryption] Error reading protected master seed, generating new one:', err);
        }
    }

    // Generate fresh 32-byte master seed
    const newSeed = crypto.randomBytes(32);
    try {
        const encryptedEnvelope = encryptStandardSecret(newSeed.toString('hex'));
        fs.writeFileSync(keyPath, encryptedEnvelope, { encoding: 'utf-8', mode: 0o600 });
        try { fs.chmodSync(keyPath, 0o600); } catch {}
    } catch (err) {
        console.error('[FieldEncryption] Failed to persist protected master seed:', err);
    }
    return newSeed;
}

/**
 * Initializes the master encryption key using safeStorage-protected key material
 * and configured credentials.
 */
export function initEncryptionKey(): void {
    const licenseKey = getLicenseKey();
    const machineSeed = getOrCreateMachineMasterSeed();

    // 1. Derive Legacy E1 Key for backwards compatibility with existing e1: records
    const legacyIkm = licenseKey || 'default-lesoft-key';
    _legacyE1Key = crypto.createHmac('sha256', LEGACY_SALT).update(legacyIkm).digest();

    // 2. Derive Version 3 Master Key via HKDF using machine-bound protected seed + license key
    const ikm = Buffer.concat([
        machineSeed,
        Buffer.from(licenseKey || 'lesoft-v3-root', 'utf-8')
    ]);

    const masterSalt = crypto.createHash('sha256').update(machineSeed).digest();
    _masterKey = crypto.hkdfSync('sha256', ikm, masterSalt, Buffer.from('lesoft-field-master-v3', 'utf-8'), 32);

    console.log('[Encryption] Master field encryption key initialized.');
}

/**
 * Retrieves the master key, initializing it if necessary.
 */
function getMasterKey(): Buffer {
    if (!_masterKey) initEncryptionKey();
    return _masterKey!;
}

/**
 * Retrieves the legacy E1 key for backward-compatible decryption of existing e1: records.
 */
function getLegacyE1Key(): Buffer {
    if (!_legacyE1Key) initEncryptionKey();
    return _legacyE1Key!;
}

/**
 * For testing: manually set or clear the master key and legacy key.
 */
export function _setKeysForTesting(masterKey: Buffer | null, legacyKey?: Buffer | null): void {
    _masterKey = masterKey;
    if (legacyKey !== undefined) {
        _legacyE1Key = legacyKey;
    } else if (masterKey) {
        _legacyE1Key = crypto.createHmac('sha256', LEGACY_SALT).update(masterKey).digest();
    }
}

export function clearEncryptionKey(): void {
    _masterKey = null;
    _legacyE1Key = null;
    console.log('[Encryption] Keys cleared from memory.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Encrypt / Decrypt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypts a single field using Version 3 (AES-256-GCM + random per-record salt + random nonce).
 *
 * All new writes strictly use this format.
 */
export function encryptField(text: string): string {
    if (!text) return text || '';
    const masterKey = getMasterKey();

    try {
        // Random 16-byte salt and 12-byte nonce per record
        const salt = crypto.randomBytes(SALT_LEN);
        const iv   = crypto.randomBytes(IV_LEN);

        // Derive unique record key using HKDF-SHA256
        const recordKey = crypto.hkdfSync('sha256', masterKey, salt, HKDF_INFO, 32);

        const cipher = crypto.createCipheriv(CIPHER_GCM, recordKey, iv);
        const ciphertextBuf = Buffer.concat([
            cipher.update(text, 'utf8'),
            cipher.final()
        ]);
        const tag = cipher.getAuthTag();

        // Binary layout: [Salt (16)] + [IV (12)] + [AuthTag (16)] + [Ciphertext (N)]
        const combined = Buffer.concat([salt, iv, tag, ciphertextBuf]);
        return `${V3_PREFIX}${combined.toString('base64')}`;
    } catch (e) {
        console.error('[Encrypt] V3 GCM encryption failed:', e);
        throw e;
    }
}

/**
 * Decrypts an encrypted field string.
 *
 * Seamlessly handles:
 *   - e3: (Version 3 AES-256-GCM with per-record salt + nonce)
 *   - e1: (Legacy AES-256-GCM with static salt)
 *   - e2: (Legacy AES-256-CBC)
 *   - Plaintext (returned unmodified)
 */
export function decryptField(encryptedText: string | null): string {
    if (!encryptedText || typeof encryptedText !== 'string') {
        return encryptedText || '';
    }

    // ── Handle CURRENT format: e3:<base64(salt[16] + iv[12] + tag[16] + ciphertext)> ─
    if (encryptedText.startsWith(V3_PREFIX)) {
        try {
            const masterKey = getMasterKey();
            const combined = Buffer.from(encryptedText.slice(V3_PREFIX.length), 'base64');

            if (combined.length < SALT_LEN + IV_LEN + TAG_LEN) {
                console.warn('[Decrypt e3] Payload length too short.');
                return encryptedText;
            }

            const salt       = combined.subarray(0, SALT_LEN);
            const iv         = combined.subarray(SALT_LEN, SALT_LEN + IV_LEN);
            const tag        = combined.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
            const ciphertext = combined.subarray(SALT_LEN + IV_LEN + TAG_LEN);

            // Derive record key via HKDF-SHA256
            const recordKey = crypto.hkdfSync('sha256', masterKey, salt, HKDF_INFO, 32);

            const decipher = crypto.createDecipheriv(CIPHER_GCM, recordKey, iv);
            decipher.setAuthTag(tag);

            return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
        } catch (err) {
            console.warn('[Decrypt e3] GCM authentication verification failed (tampered ciphertext or invalid key).');
            return encryptedText;
        }
    }

    // ── Handle LEGACY format: e1:<base64(iv[12] + tag[16] + ciphertext)> ─────────────
    if (encryptedText.startsWith(V1_PREFIX)) {
        try {
            const legacyKey = getLegacyE1Key();
            const combined = Buffer.from(encryptedText.slice(V1_PREFIX.length), 'base64');

            if (combined.length < IV_LEN + TAG_LEN) {
                console.warn('[Decrypt e1] Payload length too short.');
                return encryptedText;
            }

            const iv         = combined.subarray(0, IV_LEN);
            const tag        = combined.subarray(IV_LEN, IV_LEN + TAG_LEN);
            const ciphertext = combined.subarray(IV_LEN + TAG_LEN);

            const decipher = crypto.createDecipheriv(CIPHER_GCM, legacyKey, iv);
            decipher.setAuthTag(tag);

            return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
        } catch {
            console.warn('[Decrypt e1] GCM auth failed — key mismatch or tampered data.');
            return encryptedText;
        }
    }

    // ── Handle LEGACY format: e2:iv:ciphertext (AES-256-CBC) ─────────────────────────
    if (encryptedText.startsWith(V2_CBC_PREFIX)) {
        try {
            const legacyKey = getLegacyE1Key();
            const parts = encryptedText.split(':');
            if (parts.length !== 3) return encryptedText;
            const iv = Buffer.from(parts[1], 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', legacyKey, iv);
            let decrypted = decipher.update(parts[2], 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (e) {
            console.error('[Decrypt e2] CBC decryption failed:', (e as Error).message);
            return encryptedText;
        }
    }

    // Plaintext (not encrypted) — return as-is
    return encryptedText;
}

// ── Columns that must NEVER be encrypted (structural) ─────────────────────────
const SKIP_KEYS = new Set([
    'id', 'auth_id', 'user_id', 'employee_id', 'customer_id', 'bill_id',
    'group_id', 'order_id', 'sender_id', 'receiver_id', 'product_id',
    'created_at', 'updated_at', 'last_active', 'date', 'check_in', 'check_out',
    'from_date', 'to_date', 'month', 'delivery_date', 'paid_at', 'invoice_date',
    'is_active', 'email_confirm', 'is_read', 'is_online', 'is_visible',
    'password_hash', // already hashed
    'permissions',   // JSONB
    'le_local_id',   // mysql sync key

    // Linkages and Search keys (PlainText for indexability and reliability)
    'username',
    'full_name',
    'role',
    'invoice_number',
    'sku',
    'name',
    'phone',
    'email',
    'product_name',
    'customer_name',
    'platform',
    'status',
    'type',
    'device_type',
    'employee_code',
    'crm_state'
]);

// ── Bulk object encrypt / decrypt ──────────────────────────────────────────────

export function encryptObject(obj: Record<string, any>): Record<string, any> {
    if (!obj || typeof obj !== 'object') return obj;
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined || SKIP_KEYS.has(k)) {
            result[k] = v;
        } else if (typeof v === 'string' && v.length > 0) {
            result[k] = encryptField(v);
        } else if (typeof v === 'number') {
            result[k] = v;
        } else if (typeof v === 'boolean') {
            result[k] = v;
        } else if (typeof v === 'object') {
            result[k] = encryptField(JSON.stringify(v));
        } else {
            result[k] = v;
        }
    }
    return result;
}

export function decryptObject(obj: Record<string, any>): Record<string, any> {
    if (!obj || typeof obj !== 'object') return obj;
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && (v.startsWith(V3_PREFIX) || v.startsWith(V1_PREFIX) || v.startsWith(V2_CBC_PREFIX))) {
            const plain = decryptField(v);
            if (plain.startsWith('{') || plain.startsWith('[')) {
                try { result[k] = JSON.parse(plain); } catch { result[k] = plain; }
            } else if (!isNaN(Number(plain)) && plain.trim() !== '') {
                result[k] = Number(plain);
            } else {
                result[k] = plain;
            }
        } else {
            result[k] = v;
        }
    }
    return result;
}

/** Decrypt an array of rows */
export function decryptRows(rows: Record<string, any>[]): Record<string, any>[] {
    if (!rows || !Array.isArray(rows)) return [];
    return rows.map(decryptObject);
}

/** 
 * Non-blocking Decrypt for large datasets. 
 */
export async function decryptRowsAsync(rows: Record<string, any>[], chunkSize: number = 200): Promise<Record<string, any>[]> {
    if (!rows || !Array.isArray(rows)) return [];
    const result: Record<string, any>[] = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        result.push(...chunk.map(decryptObject));
        await new Promise(resolve => setImmediate(resolve));
    }
    return result;
}

/** 
 * Non-blocking Encrypt for large datasets. 
 */
export async function encryptRowsAsync(rows: Record<string, any>[], chunkSize: number = 200): Promise<Record<string, any>[]> {
    if (!rows || !Array.isArray(rows)) return [];
    const result: Record<string, any>[] = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        result.push(...chunk.map(encryptObject));
        await new Promise(resolve => setImmediate(resolve));
    }
    return result;
}

/** Encrypt object but keep certain keys plaintext (for search indices) */
export function encryptObjectPartial(
    obj: Record<string, any>,
    keepPlain: string[] = []
): Record<string, any> {
    const extraSkip = new Set([...SKIP_KEYS, ...keepPlain]);
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined || extraSkip.has(k)) {
            result[k] = v;
        } else if (typeof v === 'string' && v.length > 0) {
            result[k] = encryptField(v);
        } else if (typeof v === 'number') {
            result[k] = v;
        } else if (typeof v === 'boolean') {
            result[k] = v;
        } else if (typeof v === 'object') {
            result[k] = encryptField(JSON.stringify(v));
        } else {
            result[k] = v;
        }
    }
    return result;
}
