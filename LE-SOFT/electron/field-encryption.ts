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

function getMachineFingerprint(): string {
    const cpus = os.cpus();
    const cpu = cpus?.[0]?.model || 'cpu';
    const hostname = os.hostname();
    const platform = os.platform();
    return `${cpu}|${hostname}|${platform}`;
}

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
    const fingerprint = getMachineFingerprint();
    const licenseKey = getLicenseKey();
    const salt = crypto.createHash('sha256').update('lesoft-e2e-salt-v1').digest();
    // HKDF-like derivation using HMAC-SHA256
    const ikm = licenseKey + '|' + fingerprint;
    _key = crypto.createHmac('sha256', salt).update(ikm).digest();
    console.log('[Encryption] Key derived. Field encryption active.');
}

function getKey(): Buffer {
    if (!_key) initEncryptionKey();
    return _key!;
}

// ── Core encrypt / decrypt ─────────────────────────────────────────────────────

export function encryptField(value: string): string {
    try {
        const key = getKey();
        const iv = crypto.randomBytes(IV_LEN);
        const cipher = crypto.createCipheriv(CIPHER, key, iv);
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        const combined = Buffer.concat([iv, tag, encrypted]);
        return PREFIX + combined.toString('base64');
    } catch (e: any) {
        console.error('[Encryption] encryptField failed:', e.message);
        return value; // fallback: return plaintext (should not happen)
    }
}

export function decryptField(value: string): string {
    if (!value || !value.startsWith(PREFIX)) return value; // already plaintext or null
    try {
        const key = getKey();
        const combined = Buffer.from(value.slice(PREFIX.length), 'base64');
        const iv = combined.subarray(0, IV_LEN);
        const tag = combined.subarray(IV_LEN, IV_LEN + TAG_LEN);
        const ciphertext = combined.subarray(IV_LEN + TAG_LEN);
        const decipher = crypto.createDecipheriv(CIPHER, key, iv);
        decipher.setAuthTag(tag);
        return decipher.update(ciphertext) + decipher.final('utf8');
    } catch (e: any) {
        console.warn('[Encryption] decryptField failed (returning as-is):', e.message);
        return value;
    }
}

// ── Columns that must NEVER be encrypted (structural) ─────────────────────────
const SKIP_KEYS = new Set([
    'id', 'auth_id', 'user_id', 'employee_id', 'customer_id', 'bill_id',
    'group_id', 'order_id', 'sender_id', 'receiver_id', 'product_id',
    'created_at', 'updated_at', 'last_active', 'date', 'check_in', 'check_out',
    'from_date', 'to_date', 'month', 'delivery_date', 'paid_at', 'invoice_date',
    'is_active', 'email_confirm', 'is_read', 'is_online', 'is_visible',
    'password_hash', // already hashed
    'permissions',   // JSONB — needs to stay as object for Supabase
    'le_local_id',   // mysql sync key
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
        if (v === null || v === undefined || SKIP_KEYS.has(k)) {
            result[k] = v;
        } else if (typeof v === 'string' && v.startsWith(PREFIX)) {
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
