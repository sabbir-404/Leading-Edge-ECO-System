/**
 * LE-SOFT Database Encryption at Rest
 * 
 * Uses AES-256-GCM to encrypt the SQLite database file when the app
 * is not running. The database is decrypted on startup and re-encrypted
 * on graceful shutdown.
 * 
 * How it works:
 * 1. On first run, a random 256-bit encryption key is generated and stored
 *    in a separate key file (protected by the OS user account).
 * 2. On app startup: if an encrypted DB file exists (.db.enc), decrypt it
 *    to .db, then open normally.
 * 3. On app shutdown: encrypt the .db file to .db.enc, then delete the .db.
 * 
 * This protects data if the computer is stolen or the disk is accessed
 * without running the app.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key. If none exists, generate and store one.
 */
function getOrCreateKey(): Buffer {
    const keyPath = path.join(app.getPath('userData'), '.db-key');

    if (fs.existsSync(keyPath)) {
        const keyHex = fs.readFileSync(keyPath, 'utf-8').trim();
        return Buffer.from(keyHex, 'hex');
    }

    // Generate a new key
    const key = crypto.randomBytes(KEY_LENGTH);

    // Write key file with restrictive permissions
    fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });

    return key;
}

/**
 * Encrypt a file using AES-256-GCM.
 * Output format: [16 bytes IV][16 bytes authTag][encrypted data]
 */
export function encryptFile(inputPath: string, outputPath: string): boolean {
    try {
        if (!fs.existsSync(inputPath)) return false;

        const key = getOrCreateKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        const inputData = fs.readFileSync(inputPath);
        const encrypted = Buffer.concat([
            cipher.update(inputData),
            cipher.final()
        ]);

        const authTag = cipher.getAuthTag();

        // Write: IV (16) + authTag (16) + encrypted data
        const output = Buffer.concat([iv, authTag, encrypted]);
        fs.writeFileSync(outputPath, output);

        return true;
    } catch (e) {
        console.error('[ENCRYPTION] Encrypt failed:', e);
        return false;
    }
}

/**
 * Decrypt a file that was encrypted with encryptFile.
 */
export function decryptFile(inputPath: string, outputPath: string): boolean {
    try {
        if (!fs.existsSync(inputPath)) return false;

        const key = getOrCreateKey();
        const fileData = fs.readFileSync(inputPath);

        if (fileData.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
            console.error('[ENCRYPTION] Encrypted file too small');
            return false;
        }

        const iv = fileData.subarray(0, IV_LENGTH);
        const authTag = fileData.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = fileData.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);

        fs.writeFileSync(outputPath, decrypted);
        return true;
    } catch (e) {
        console.error('[ENCRYPTION] Decrypt failed:', e);
        return false;
    }
}

/**
 * Called at app startup — decrypts the database if an encrypted version exists.
 * If neither plain nor encrypted DB exists, does nothing (fresh install).
 */
export function decryptDatabaseOnStartup(): void {
    const dbPath = path.join(app.getPath('userData'), 'le_soft.db');
    const encPath = dbPath + '.enc';

    if (fs.existsSync(encPath)) {
        if (fs.existsSync(dbPath)) {
            // Both exist — the .db may be corrupt (previous shutdown was interrupted).
            // The .db.enc is always a clean encrypted copy. Restore from it.
            console.log('[ENCRYPTION] Both .db and .db.enc exist — restoring from encrypted copy...');
            try {
                fs.unlinkSync(dbPath); // Remove potentially corrupt plaintext
            } catch {
                // If we can't remove it, proceed with existing .db
                console.warn('[ENCRYPTION] Could not remove stale .db — using existing file');
                fs.unlinkSync(encPath);
                return;
            }
        }
        // Decrypt the encrypted database
        console.log('[ENCRYPTION] Decrypting database...');
        const success = decryptFile(encPath, dbPath);
        if (success) {
            fs.unlinkSync(encPath);
            console.log('[ENCRYPTION] Database decrypted successfully');
        } else {
            console.error('[ENCRYPTION] Failed to decrypt database! App may not work correctly.');
        }
    }
}

/**
 * Called at app shutdown — encrypts the database and removes the plain file.
 */
export function encryptDatabaseOnShutdown(): void {
    const dbPath = path.join(app.getPath('userData'), 'le_soft.db');
    const encPath = dbPath + '.enc';

    if (!fs.existsSync(dbPath)) {
        console.log('[ENCRYPTION] No database file to encrypt');
        return;
    }

    console.log('[ENCRYPTION] Encrypting database for at-rest protection...');
    const success = encryptFile(dbPath, encPath);
    if (success) {
        // Delete the plaintext file.
        // NOTE: Do NOT overwrite with random data before deleting — sqlite3 may
        // still hold the file handle open during before-quit, causing the overwrite
        // to corrupt memory-mapped pages. A simple unlink is sufficient since the
        // encrypted copy is already written.
        try {
            fs.unlinkSync(dbPath);
            console.log('[ENCRYPTION] Database encrypted and plaintext removed');
        } catch (e) {
            // sqlite3 may still have the file open — the encrypted copy exists,
            // so data is protected. The plaintext will be cleaned on next startup.
            console.warn('[ENCRYPTION] Could not delete plaintext .db (file may be in use) — encrypted copy saved');
        }
    } else {
        console.error('[ENCRYPTION] Encryption failed — database left unencrypted');
    }
}
