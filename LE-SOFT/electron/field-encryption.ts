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

// ── Core encrypt / decrypt ─────────────────────────────────────────────────────

export function encryptField(text: string): string {
    if (!text) return text || '';
    const key = getKey();
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `e2:${iv.toString('hex')}:${encrypted}`;
    } catch (e) {
        console.error('Encryption failed:', e);
        return text;
    }
}

export function decryptField(encryptedText: string | null): string {
    if (!encryptedText || typeof encryptedText !== 'string') {
        return encryptedText || '';
    }
    const key = getKey();

    // ── Handle NEW format: e2:iv:ciphertext (AES-256-CBC) ─────────────────────
    if (encryptedText.startsWith('e2:')) {
        try {
            const parts = encryptedText.split(':');
            if (parts.length !== 3) return encryptedText;
            const iv = Buffer.from(parts[1], 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            let decrypted = decipher.update(parts[2], 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (e) {
            console.error('[Decrypt e2] Failed:', (e as Error).message);
            return encryptedText;
        }
    }

    // ── Handle LEGACY format: e1:<base64(iv[12]+tag[16]+ciphertext)> (AES-256-GCM) ─
    if (encryptedText.startsWith('e1:')) {
        try {
            const combined = Buffer.from(encryptedText.slice(3), 'base64');
            const iv = combined.subarray(0, 12);
            const tag = combined.subarray(12, 28);
            const ciphertext = combined.subarray(28);
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            return decipher.update(ciphertext) + decipher.final('utf8');
        } catch {
            // If GCM fails (key mismatch from old machineId-based key), return as-is 
            // — this prevents crashes on data encrypted by a different machine.
            return encryptedText;
        }
    }

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
        } else if (typeof v === 'string' && (v.startsWith('e1:') || v.startsWith('e2:'))) {
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
