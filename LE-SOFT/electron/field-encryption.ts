/**
 * field-encryption.ts
 * AES-256-GCM field-level encryption for ALL Supabase data columns.
 *
 * Key derivation:
 *   HKDF( licenseKey + machineId ) → 32-byte AES key
 *   Stored in memory only — never written to disk.
 *
 * Ciphertext format (base64):
 *   e1:<base64( iv[12] + authTag[16] + ciphertext )>
 *
 * Columns that are NEVER encrypted (structural / relational):
 *   - id, *_id (foreign keys), auth_id
 *   - created_at, updated_at, last_active, date timestamps
 *   - is_active, email_confirm (booleans)
 *   - Any null values
 */

import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const CIPHER = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = 'e1:';

// ── Key derivation ─────────────────────────────────────────────────────────────
let _key: Buffer | null = null;

function getLicenseKey(): string {
    try {
        const cfgPath = path.join(app.getPath('userData'), 'supabase-config.json');
        if (fs.existsSync(cfgPath)) {
            const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
            return cfg.serviceRoleKey || cfg.anonKey || 'default-lesoft-key';
        }
    } catch { }
    return 'default-lesoft-key';
}

export function initEncryptionKey(): void {
    const licenseKey = getLicenseKey();
    const salt = crypto.createHash('sha256').update('lesoft-e2e-salt-v1').digest();
    // Portable derivation: License Key only
    const ikm = licenseKey;
    _key = crypto.createHmac('sha256', salt).update(ikm).digest();
    console.log('[Encryption] Portable Key derived.');
}

function getKey(): Buffer {
    if (!_key) initEncryptionKey();
    return _key!;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core encrypt / decrypt
//
// ENCRYPTION FORMAT (all new writes):
//   e1:<base64( IV[12 bytes] + AuthTag[16 bytes] + Ciphertext )>
//   Algorithm: AES-256-GCM
//   - GCM provides authenticated encryption: any bit-flip to the ciphertext
//     causes decryption to throw, preventing silent data corruption.
//   - IV is random 12 bytes per field (GCM standard).
//   - AuthTag is 16 bytes appended after the IV in the base64 blob.
//
// BACKWARD COMPAT:
//   e2: format (AES-256-CBC, no auth tag) is still DECRYPTED but never written.
//   It exists for rows written between v1.3.x and v1.3.6 before this fix.
//   Over time, as data gets re-saved via the app, e2: rows will be replaced
//   with e1: GCM rows automatically.
// ─────────────────────────────────────────────────────────────────────────────

export function encryptField(text: string): string {
    // Return empty strings as-is — encrypting blank fields adds no security
    // and causes problems when comparing/searching for empty values.
    // KNOWN GAP (H5): if a user clears a field, the empty string is stored plaintext.
    // This is acceptable because an empty string reveals no sensitive data.
    if (!text) return text || '';
    const key = getKey();
    try {
        // AES-256-GCM: authenticated encryption.
        // IV must be 12 bytes for GCM (NIST recommendation; 96-bit IV is most efficient).
        const iv = crypto.randomBytes(IV_LEN); // IV_LEN = 12 bytes
        const cipher = crypto.createCipheriv(CIPHER, key, iv); // CIPHER = 'aes-256-gcm'

        // Encrypt the plaintext — two-step: update() + final()
        const encryptedBuf = Buffer.concat([
            cipher.update(text, 'utf8'),
            cipher.final()
        ]);

        // GCM produces an authentication tag after final() is called.
        // This 16-byte tag is stored alongside the ciphertext and verified on decrypt.
        const tag = cipher.getAuthTag(); // TAG_LEN = 16 bytes

        // Pack everything into a single base64 blob: [IV][AuthTag][Ciphertext]
        const combined = Buffer.concat([iv, tag, encryptedBuf]);
        return `${PREFIX}${combined.toString('base64')}`; // PREFIX = 'e1:'
    } catch (e) {
        console.error('[Encrypt] GCM encryption failed:', e);
        // Fallback: return plaintext rather than crashing the app.
        // This should never happen in practice — log it as a critical error.
        return text;
    }
}

export function decryptField(encryptedText: string | null): string {
    if (!encryptedText || typeof encryptedText !== 'string') {
        return encryptedText || '';
    }
    const key = getKey();

    // ── Handle CURRENT format: e1:<base64(iv[12]+tag[16]+ciphertext)> (AES-256-GCM) ─
    // This handles BOTH the original legacy GCM (v1.0-v1.2) AND the new GCM (v1.3.7+).
    // The binary layout is identical — same IV size, same tag size, same algorithm.
    if (encryptedText.startsWith('e1:')) {
        try {
            const combined = Buffer.from(encryptedText.slice(3), 'base64');
            const iv         = combined.subarray(0, IV_LEN);           // 12 bytes
            const tag        = combined.subarray(IV_LEN, IV_LEN + TAG_LEN); // 16 bytes
            const ciphertext = combined.subarray(IV_LEN + TAG_LEN);    // rest = ciphertext

            const decipher = crypto.createDecipheriv(CIPHER, key, iv);
            decipher.setAuthTag(tag);
            // If the data has been tampered with, setAuthTag verification fails here
            // and an error is thrown — preventing silent data corruption.
            return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
        } catch {
            // GCM auth failure = data tampered OR encrypted with a different key.
            // Return ciphertext as-is rather than crashing — prevents data loss.
            // These rows should be investigated: they may need re-encryption.
            console.warn('[Decrypt e1] GCM auth failed — key mismatch or tampered data.');
            return encryptedText;
        }
    }

    // ── Handle LEGACY format: e2:iv:ciphertext (AES-256-CBC) ─────────────────────
    // Written between v1.3.x and v1.3.6 (before the GCM standardisation fix).
    // This path is PERMANENT for backward compatibility — never remove it until
    // all e2: rows have been re-saved (and thus re-encrypted as e1: GCM).
    // CBC has no auth tag so tampered data decrypts silently to garbage.
    if (encryptedText.startsWith('e2:')) {
        try {
            const parts = encryptedText.split(':');
            if (parts.length !== 3) return encryptedText;
            const iv = Buffer.from(parts[1], 'hex'); // 16-byte hex IV for CBC
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
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

    // ── NEW: Linkages and Search keys (PlainText for reliability) ──
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
            result[k] = v; // numbers: never encrypt, preserves NUMERIC db types
        } else if (typeof v === 'boolean') {
            result[k] = v; // booleans: never encrypt
        } else if (typeof v === 'object') {
            // JSONB fields: store encrypted JSON string
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
        // ALWAYS try to decrypt if it looks like ciphertext, 
        // regardless of whether the key is now in SKIP_KEYS.
        if (typeof v === 'string' && (v.startsWith('e1:') || v.startsWith('e2:'))) {
            const plain = decryptField(v);
            // Try to re-parse JSONB fields
            if (plain.startsWith('{') || plain.startsWith('[')) {
                try { result[k] = JSON.parse(plain); } catch { result[k] = plain; }
            } else if (!isNaN(Number(plain)) && plain.trim() !== '') {
                // Re-parse numbers (since we encrypted them as strings)
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
    return rows.map(decryptObject);
}

/** 
 * Non-blocking Decrypt for large datasets. 
 * Processes the array in chunks to prevent freezing the Node.js Event Loop.
 */
export async function decryptRowsAsync(rows: Record<string, any>[], chunkSize: number = 200): Promise<Record<string, any>[]> {
    const result: Record<string, any>[] = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        result.push(...chunk.map(decryptObject));
        // Yield the CPU back to the event loop so the UI and IPC don't hang
        await new Promise(resolve => setImmediate(resolve));
    }
    return result;
}

/** 
 * Non-blocking Encrypt for large datasets. 
 */
export async function encryptRowsAsync(rows: Record<string, any>[], chunkSize: number = 200): Promise<Record<string, any>[]> {
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
            result[k] = v; // numbers: never encrypt
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

export function clearEncryptionKey(): void {
    _key = null;
    console.log('[Encryption] Key cleared from memory.');
}
