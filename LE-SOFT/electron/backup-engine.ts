import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';

/**
 * backup-engine.ts — Restic-Style Encrypted Backup Engine
 * Creates AES-256 encrypted snapshots of local SQLite database and JSON configs.
 */

export class ResticBackupEngine {
    private static algorithm = 'aes-256-gcm';

    /**
     * Derive AES-256 key from master password using PBKDF2
     */
    private static deriveKey(password: string, salt: Buffer): Buffer {
        return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    }

    /**
     * Create an AES-256-GCM encrypted backup archive of a file.
     */
    static createEncryptedSnapshot(sourceFilePath: string, destinationDir: string, masterPassword = 'LESOFT_SECURE_BACKUP_KEY'): string {
        if (!fs.existsSync(sourceFilePath)) {
            throw new Error(`Source file for backup does not exist: ${sourceFilePath}`);
        }

        if (!fs.existsSync(destinationDir)) {
            fs.mkdirSync(destinationDir, { recursive: true });
        }

        const rawData = fs.readFileSync(sourceFilePath);
        const salt = crypto.randomBytes(16);
        const iv = crypto.randomBytes(12);
        const key = this.deriveKey(masterPassword, salt);

        const cipher = crypto.createCipheriv(this.algorithm, key, iv);
        const encryptedData = Buffer.concat([cipher.update(rawData), cipher.final()]);
        const authTag = cipher.getAuthTag();

        // Output format: salt(16) + iv(12) + authTag(16) + encryptedData
        const snapshotBuffer = Buffer.concat([salt, iv, authTag, encryptedData]);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `snapshot-${path.basename(sourceFilePath)}-${timestamp}.restic`;
        const outputPath = path.join(destinationDir, filename);

        fs.writeFileSync(outputPath, snapshotBuffer);
        console.log(`[BackupEngine] Encrypted snapshot created at: ${outputPath}`);
        return outputPath;
    }
}
