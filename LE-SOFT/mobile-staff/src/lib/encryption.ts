import CryptoJS from 'crypto-js';
import Constants from 'expo-constants';
import { AES_GCM } from 'asmcrypto.js/dist_es8/aes/gcm.js';

const SALT_PHRASE = 'lesoft-e2e-salt-v1';
const FALLBACK_KEY_BASE = 'default-lesoft-key';
const LEGACY_ANON_BASE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzMzMjQsImV4cCI6MjA4NzUwOTMyNH0.Bn6c-87BOumPXyH5F469P04fQSMnI9SjNDZAwgGyTsM';

const NON_ENCRYPTED_KEY_PATTERNS = [
    /^id$/i,
    /_id$/i,
    /^auth_id$/i,
    /^created_at$/i,
    /^updated_at$/i,
    /^deleted_at$/i,
    /^date$/i,
    /^is_/i,
    /^password_hash$/i,
    /^username$/i,
    /^role$/i,
    /(^|_)name$/i,
    /(^|_)phone$/i,
    /(^|_)email$/i,
    /(^|_)sku$/i,
    /(^|_)status$/i,
    /(^|_)type$/i,
    /(^|_)platform$/i,
    /(^|_)number$/i,
];

const LOOKUP_KEYS = new Set([
    'invoice_number',
    'sku',
    'name',
    'username',
    'role',
    'phone',
    'email',
    'product_name',
    'status',
    'platform',
    'type',
]);

function getKeyBaseCandidates() {
    const extra = Constants.expoConfig?.extra as Record<string, any> | undefined;
    const candidates = [
        extra?.supabaseServiceRoleKey,
        extra?.encryptionKeyBase,
        FALLBACK_KEY_BASE,
        LEGACY_ANON_BASE,
    ];
    return candidates
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .filter((v, idx, arr) => arr.indexOf(v) === idx);
}

function deriveKey(base: string) {
    const salt = CryptoJS.SHA256(SALT_PHRASE);
    return CryptoJS.HmacSHA256(base, salt);
}

const KEY_CANDIDATES = getKeyBaseCandidates().map(deriveKey);
const PRIMARY_KEY = KEY_CANDIDATES[0] || deriveKey(FALLBACK_KEY_BASE);

function wordArrayToUint8Array(wordArray: CryptoJS.lib.WordArray): Uint8Array {
    const { words, sigBytes } = wordArray;
    const out = new Uint8Array(sigBytes);
    for (let i = 0; i < sigBytes; i += 1) {
        out[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return out;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}

function decryptE2WithKey(encryptedText: string, key: CryptoJS.lib.WordArray): string | null {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return null;

    const iv = CryptoJS.enc.Hex.parse(parts[1]);
    const ciphertext = CryptoJS.enc.Hex.parse(parts[2]);

    const decrypted = CryptoJS.AES.decrypt(
        // CryptoJS accepts this shape for raw ciphertext
        { ciphertext } as any,
        key,
        { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    );

    const out = decrypted.toString(CryptoJS.enc.Utf8);
    return out || null;
}

function decryptLegacyE1(encryptedText: string): string | null {
    if (!encryptedText.startsWith('e1:')) return null;

    try {
        const payload = encryptedText.slice(3);
        if (!payload) return null;

        const combinedWa = CryptoJS.enc.Base64.parse(payload);
        const combined = wordArrayToUint8Array(combinedWa);
        if (combined.length <= 28) return null;

        const iv = combined.slice(0, 12);
        const tag = combined.slice(12, 28);
        const ciphertext = combined.slice(28);
        const cipherAndTag = concatBytes(ciphertext, tag);

        for (const candidate of [PRIMARY_KEY, ...KEY_CANDIDATES]) {
            try {
                const keyBytes = wordArrayToUint8Array(candidate);
                const plainBytes = AES_GCM.decrypt(cipherAndTag, keyBytes, iv) as Uint8Array;
                const plain = new TextDecoder().decode(plainBytes);
                if (plain) return plain;
            } catch {
                // Try next candidate key
            }
        }

        return null;
    } catch {
        return null;
    }
}

export function shouldEncryptKey(key: string): boolean {
    const normalized = key.toLowerCase();
    if (LOOKUP_KEYS.has(normalized)) return false;
    return !NON_ENCRYPTED_KEY_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Decrypts "e2:" (AES-256-CBC current) and safely preserves unsupported legacy values.
 */
export function decryptField(encryptedText: string | null): string {
    if (!encryptedText || typeof encryptedText !== 'string') {
        return encryptedText || '';
    }

    if (encryptedText.startsWith('e1:')) {
        const legacy = decryptLegacyE1(encryptedText);
        return legacy ?? encryptedText;
    }

    if (!encryptedText.startsWith('e2:')) {
        return encryptedText;
    }

    try {
        for (const candidate of [PRIMARY_KEY, ...KEY_CANDIDATES]) {
            const out = decryptE2WithKey(encryptedText, candidate);
            if (out !== null) return out;
        }
        return encryptedText;
    } catch (e) {
        console.error('Decryption failed:', e);
        return encryptedText;
    }
}

/**
 * Encrypts a string in e2 format (AES-256-CBC): e2:ivHex:ciphertextHex
 */
export function encryptField(text: string): string {
    if (!text) return '';
    if (text.startsWith('e1:') || text.startsWith('e2:')) return text;

    try {
        const iv = CryptoJS.lib.WordArray.random(16);
        const encrypted = CryptoJS.AES.encrypt(text, PRIMARY_KEY, {
            iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });

        return `e2:${iv.toString(CryptoJS.enc.Hex)}:${encrypted.ciphertext.toString(CryptoJS.enc.Hex)}`;
    } catch (e) {
        console.error('Encryption failed:', e);
        return text;
    }
}

export function encryptObjectForDb(obj: any): any {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const out: any = { ...obj };

    for (const k of Object.keys(out)) {
        if (typeof out[k] === 'string' && shouldEncryptKey(k)) {
            out[k] = encryptField(out[k]);
        }
    }

    return out;
}

export function decryptObject(obj: any): any {
    if (!obj) return obj;
    if (Array.isArray(obj)) return obj.map((item) => decryptObject(item));

    const out = { ...obj };
    for (const k in out) {
        if (typeof out[k] === 'string') {
            out[k] = decryptField(out[k]);
        } else if (out[k] && typeof out[k] === 'object') {
            out[k] = decryptObject(out[k]);
        }
    }
    return out;
}

export function decryptRows(rows: any[]): any[] {
    return (rows || []).map((r) => decryptObject(r));
}
