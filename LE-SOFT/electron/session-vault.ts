/**
 * ═══════════════════════════════════════════════════════════════════════════
 * electron/session-vault.ts — Secure Machine-Bound Session Vault
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Heavily-encrypted last-login cache for LE-SOFT offline authentication.
 *
 * SECURITY DESIGN:
 *   - Protected machine-bound key via Electron safeStorage (Windows DPAPI / macOS Keychain)
 *   - Resilient authenticated fallback key (AES-256-GCM, 12-byte nonce, 0o600 permissions)
 *     when safeStorage is unavailable.
 *   - Hardcoded master passphrase eliminated.
 *   - Seamless one-time automatic migration for existing legacy V1 session vaults.
 *   - File: <userData>/.le_vault/.vault.ledat
 *
 * PUBLIC API:
 *   saveSession(user)        – call ONLY after verified successful login
 *   loadSession(credentials) – call when Supabase is unreachable (offline mode)
 *   clearSession()           – call on logout or user switch
 * ═══════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import bcrypt from 'bcryptjs';
import { triggerSystemLockout } from './lockout';
import {
    encryptStandardSecret,
    decryptStandardSecret,
    migrateSecretToSafeStorage,
    getUserDataPath
} from './secure-storage';

// Legacy constants retained exclusively for backward-compatible migration of existing vaults
const LEGACY_ALG        = 'aes-256-gcm';
const LEGACY_ITER       = 200_000;
const LEGACY_HASH       = 'sha512';
const LEGACY_KEY_LEN    = 32;
const LEGACY_IV_LEN     = 12;
const LEGACY_TAG_LEN    = 16;
const LEGACY_VAULT_PASS = 'LE-SOFT-VAULT-2026-LeadingEdge-Encrypted';

export function vaultPath(): string {
    const dir = path.join(getUserDataPath(), '.le_vault');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return path.join(dir, '.vault.ledat');
}

/** Legacy machine-bound salt for V1 migration only */
function getLegacyMachineSalt(): Buffer {
    let userData = '';
    try {
        userData = app?.getPath ? app.getPath('userData') : getUserDataPath();
    } catch {
        userData = getUserDataPath();
    }
    const raw = `${os.hostname()}::${userData}::leadingedge2026`;
    return crypto.createHash('sha256').update(raw).digest();
}

/** Legacy key derivation for V1 migration only */
export function _deriveLegacyKey(): Buffer {
    return crypto.pbkdf2Sync(LEGACY_VAULT_PASS, getLegacyMachineSalt(), LEGACY_ITER, LEGACY_KEY_LEN, LEGACY_HASH);
}

/**
 * Attempts to decrypt a legacy V1 vault buffer.
 */
function decryptLegacyVault(fileBuffer: Buffer): any {
    if (fileBuffer.length < LEGACY_IV_LEN + LEGACY_TAG_LEN) {
        throw new Error('Legacy vault buffer too small');
    }
    const iv         = fileBuffer.subarray(0, LEGACY_IV_LEN);
    const tag        = fileBuffer.subarray(LEGACY_IV_LEN, LEGACY_IV_LEN + LEGACY_TAG_LEN);
    const ciphertext = fileBuffer.subarray(LEGACY_IV_LEN + LEGACY_TAG_LEN);

    const key      = _deriveLegacyKey();
    const decipher = crypto.createDecipheriv(LEGACY_ALG, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Saves an encrypted session to disk using the secure storage provider.
 * Called ONLY after a verified, successful login.
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

        // Encrypt with safeStorage (or secure fallback)
        const encryptedEnvelope = encryptStandardSecret(payload);

        const v2Record = JSON.stringify({
            version: 2,
            ciphertext: encryptedEnvelope,
            saved_at: new Date().toISOString(),
        }, null, 2);

        const vPath = vaultPath();
        fs.writeFileSync(vPath, v2Record, { encoding: 'utf-8', mode: 0o600 });
        try {
            fs.chmodSync(vPath, 0o600);
        } catch {}

        console.log('[VAULT] Session saved securely for:', user.username || '(anonymous)');
    } catch (err) {
        console.error('[VAULT] Failed to save session:', err);
    }
}

/**
 * Attempts an offline login from the session vault.
 * Automatically migrates legacy V1 vaults or fallback-encrypted vaults.
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

        const rawContent = fs.readFileSync(filePath);
        let payload: any = null;
        let requiresMigration = false;

        // Check if file is V2 JSON format
        const contentStr = rawContent.toString('utf-8');
        if (contentStr.trim().startsWith('{') && contentStr.includes('"version": 2')) {
            try {
                const parsed = JSON.parse(contentStr);
                const decryptedJson = decryptStandardSecret(parsed.ciphertext);
                payload = JSON.parse(decryptedJson);

                // Check if fallback ciphertext can be migrated to safeStorage
                const migrationCheck = migrateSecretToSafeStorage(parsed.ciphertext);
                if (migrationCheck.migrated) {
                    parsed.ciphertext = migrationCheck.result;
                    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), { encoding: 'utf-8', mode: 0o600 });
                    console.log('[VAULT] Automatically migrated vault secret to safeStorage.');
                }
            } catch (v2Err) {
                console.error('[VAULT] Error decrypting V2 vault record:', v2Err);
                throw v2Err;
            }
        } else {
            // Attempt legacy V1 decryption
            console.log('[VAULT] Detected legacy V1 session vault. Attempting migration...');
            try {
                payload = decryptLegacyVault(rawContent);
                requiresMigration = true;
            } catch (legacyErr) {
                console.error('[VAULT] Legacy V1 vault decryption failed:', legacyErr);
                throw legacyErr;
            }
        }

        if (!payload) {
            return null;
        }

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

        // Safe one-time automatic migration: rewrite in V2 format
        if (requiresMigration) {
            console.log('[VAULT] Successfully migrating legacy session vault to V2 safeStorage format...');
            await saveSession(payload);
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
        const errMsg = (err as Error).message;
        console.error('[VAULT] Vault decryption failed (tampered or wrong machine):', errMsg);

        // If it's a GCM authentication/crypto failure, trigger system lockout
        if (errMsg.includes('bad decrypt') || errMsg.includes('Unsupported state') || errMsg.includes('tag check failed')) {
            try {
                triggerSystemLockout(`Vault decryption failed (tampered session vault data: ${errMsg})`);
            } catch (e) {
                console.error('Failed to trigger system lockout from vault:', e);
            }
        }
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
