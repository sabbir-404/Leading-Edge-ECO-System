/**
 * session-vault.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Heavily-encrypted last-login cache for LE-SOFT.
 * 
 * Security design:
 *   - Key derivation: PBKDF2-HMAC-SHA512, 200,000 iterations
 *   - Machine-bound salt: derived from os.hostname() + app.getPath('userData')
 *   - Cipher:  AES-256-GCM with a random 12-byte IV per write
 *   - File:    <userData>/.le_vault/.vault.ledat (hidden directory)
 *   - The only plaintext in the file is the IV and GCM auth-tag.
 *     Everything else (user data) is opaque ciphertext.
 * 
 * Public API:
 *   saveSession(user)       – call ONLY after successful Supabase login
 *   loadSession(creds)      – call when Supabase is unreachable
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import bcrypt from 'bcryptjs';

const ALG        = 'aes-256-gcm';
const ITER       = 200_000;
const HASH       = 'sha512';
const KEY_LEN    = 32;
const IV_LEN     = 12;
const TAG_LEN    = 16;

function vaultPath(): string {
    const dir = path.join(app.getPath('userData'), '.le_vault');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, '.vault.ledat');
}

/** Machine-bound salt (deterministic, 32 bytes). */
function getMachineSalt(): Buffer {
    const raw = `${os.hostname()}::${app.getPath('userData')}::leadingedge2026`;
    return crypto.createHash('sha256').update(raw).digest();
}

/** Derive AES key from master passphrase + machine salt. */
function deriveKey(passphrase: string): Buffer {
    return crypto.pbkdf2Sync(passphrase, getMachineSalt(), ITER, KEY_LEN, HASH);
}

/**
 * Static vault passphrase — the second layer of defence.
 * Even if someone copies the .ledat file to another machine,
 * `getMachineSalt()` will produce a different key there.
 */
const VAULT_PASS = 'LE-SOFT-VAULT-2026-LeadingEdge-Encrypted';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Saves an encrypted session to disk.
 * Called ONLY after a verified, successful Supabase login.
 */
export async function saveSession(user: {
    id: number;
    username: string;
    full_name?: string;
    role: string;
    password_hash: string;
    permissions?: any;
    group_id?: number | null;
}): Promise<void> {
    try {
        const payload = JSON.stringify({
            id: user.id,
            username: user.username,
            full_name: user.full_name || '',
            role: user.role,
            password_hash: user.password_hash,
            permissions: user.permissions || {},
            group_id: user.group_id ?? null,
            saved_at: Date.now(),
        });

        const key = deriveKey(VAULT_PASS);
        const iv  = crypto.randomBytes(IV_LEN);
        const cipher = crypto.createCipheriv(ALG, key, iv);

        const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
        const tag       = cipher.getAuthTag();

        // File layout: [IV (12)] + [AUTH_TAG (16)] + [CIPHERTEXT (N)]
        const fileBuffer = Buffer.concat([iv, tag, encrypted]);
        fs.writeFileSync(vaultPath(), fileBuffer);
        console.log('[VAULT] Session saved for:', user.username);
    } catch (err) {
        console.error('[VAULT] Failed to save session:', err);
    }
}

/**
 * Attempts an offline login from the vault.
 * Returns user object if credentials match, null otherwise.
 */
export async function loadSession(credentials: {
    username: string;
    password: string;
}): Promise<{ user: any; offlineMode: true } | null> {
    try {
        const filePath = vaultPath();
        if (!fs.existsSync(filePath)) {
            console.log('[VAULT] No vault file found.');
            return null;
        }

        const fileBuffer = fs.readFileSync(filePath);
        const iv         = fileBuffer.subarray(0, IV_LEN);
        const tag        = fileBuffer.subarray(IV_LEN, IV_LEN + TAG_LEN);
        const ciphertext = fileBuffer.subarray(IV_LEN + TAG_LEN);

        const key      = deriveKey(VAULT_PASS);
        const decipher = crypto.createDecipheriv(ALG, key, iv);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        const payload   = JSON.parse(decrypted.toString('utf8'));

        // Username must match (case-insensitive)
        if (payload.username?.toLowerCase() !== credentials.username.trim().toLowerCase()) {
            console.log('[VAULT] Username mismatch in vault.');
            return null;
        }

        // Verify password against stored bcrypt hash
        const passwordMatch = await bcrypt.compare(credentials.password, payload.password_hash);
        if (!passwordMatch) {
            console.log('[VAULT] Password mismatch for offline login.');
            return null;
        }

        console.log('[VAULT] Offline login successful for:', payload.username);
        return {
            user: {
                id:          payload.id,
                username:    payload.username,
                full_name:   payload.full_name,
                role:        payload.role,
                permissions: payload.permissions,
                group_id:    payload.group_id,
                is_active:   true,
            },
            offlineMode: true,
        };
    } catch (err) {
        // Decryption failure = tampered file or wrong machine
        console.error('[VAULT] Vault decryption failed (tampered or wrong machine):', (err as Error).message);
        return null;
    }
}

/** Clears the vault (called on logout or account switch). */
export function clearSession(): void {
    try {
        const p = vaultPath();
        if (fs.existsSync(p)) fs.unlinkSync(p);
        console.log('[VAULT] Session cleared.');
    } catch {}
}
