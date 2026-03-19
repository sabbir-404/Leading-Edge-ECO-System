import CryptoJS from 'crypto-js';

// The key must match the desktop implementation for cross-platform decryption.
const SHARED_KEY_BASE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzMzMjQsImV4cCI6MjA4NzUwOTMyNH0.Bn6c-87BOumPXyH5F469P04fQSMnI9SjNDZAwgGyTsM';

function getDerivedKey() {
    const salt = CryptoJS.SHA256('lesoft-e2e-salt-v1');
    // HMAC-SHA256 derivation matching desktop
    const hmac = CryptoJS.HmacSHA256(SHARED_KEY_BASE, salt);
    return hmac;
}

const key = getDerivedKey();

/**
 * Decrypts a string starting with "e2:" (AES-256-CBC)
 * Format: e2:ivHex:ciphertextHex
 */
export function decryptField(encryptedText: string | null): string {
    if (!encryptedText || typeof encryptedText !== 'string' || !encryptedText.startsWith('e2:')) {
        return encryptedText || '';
    }

    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 3) return encryptedText;

        const iv = CryptoJS.enc.Hex.parse(parts[1]);
        const ciphertext = CryptoJS.enc.Hex.parse(parts[2]);

        const decrypted = CryptoJS.AES.decrypt(
            //@ts-ignore
            { ciphertext: ciphertext },
            key,
            { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
        );

        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        console.error('Decryption failed:', e);
        return encryptedText;
    }
}

/**
 * Encrypts a string (AES-256-CBC format: "e2:iv:ciphertext")
 */
export function encryptField(text: string): string {
    if (!text) return '';
    try {
        const iv = CryptoJS.lib.WordArray.random(16);
        const encrypted = CryptoJS.AES.encrypt(text, key, {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });

        return `e2:${iv.toString(CryptoJS.enc.Hex)}:${encrypted.ciphertext.toString(CryptoJS.enc.Hex)}`;
    } catch (e) {
        console.error('Encryption failed:', e);
        return text;
    }
}

export function decryptObject(obj: any): any {
    if (!obj) return obj;
    const newObj = { ...obj };
    for (const k in newObj) {
        if (typeof newObj[k] === 'string') {
            newObj[k] = decryptField(newObj[k]);
        }
    }
    return newObj;
}

export function decryptRows(rows: any[]): any[] {
    return (rows || []).map(r => decryptObject(r));
}
