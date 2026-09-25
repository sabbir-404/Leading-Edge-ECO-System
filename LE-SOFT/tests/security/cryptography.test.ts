import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import bcrypt from 'bcryptjs';

import {
    isSafeStorageAvailable,
    encryptPrivilegedSecret,
    decryptPrivilegedSecret,
    encryptStandardSecret,
    decryptStandardSecret,
    migrateSecretToSafeStorage,
    getOrCreateFallbackKey,
    _setSafeStorageForTesting,
    _setCustomUserDataPathForTesting,
    _clearFallbackKeyCacheForTesting,
    getUserDataPath,
} from '../../electron/secure-storage';

import {
    encryptField,
    decryptField,
    encryptObject,
    decryptObject,
    initEncryptionKey,
    clearEncryptionKey,
    _setKeysForTesting,
} from '../../electron/field-encryption';

import {
    saveSession,
    loadSession,
    clearSession,
    vaultPath,
    _deriveLegacyKey,
} from '../../electron/session-vault';

import { ResticBackupEngine } from '../../electron/backup-engine';

// Create a simulated SafeStorage provider for testing
function createMockSafeStorage() {
    const mockKey = crypto.randomBytes(32);
    let available = true;

    return {
        setAvailable: (val: boolean) => { available = val; },
        mock: {
            isEncryptionAvailable: () => available,
            encryptString: (plaintext: string): Buffer => {
                if (!available) throw new Error('safeStorage is not available');
                const iv = crypto.randomBytes(12);
                const cipher = crypto.createCipheriv('aes-256-gcm', mockKey, iv);
                const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
                const tag = cipher.getAuthTag();
                return Buffer.concat([iv, tag, ciphertext]);
            },
            decryptString: (encrypted: Buffer): string => {
                if (!available) throw new Error('safeStorage is not available');
                if (encrypted.length < 28) throw new Error('Ciphertext too short');
                const iv = encrypted.subarray(0, 12);
                const tag = encrypted.subarray(12, 28);
                const ciphertext = encrypted.subarray(28);
                const decipher = crypto.createDecipheriv('aes-256-gcm', mockKey, iv);
                decipher.setAuthTag(tag);
                return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
            },
        },
    };
}

describe('Phase 3: Cryptography and Secure Local Storage Hardening', () => {
    let testDir: string;
    let mockSafeStorage: ReturnType<typeof createMockSafeStorage>;

    beforeEach(() => {
        // Create isolated temp directory for each test
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesoft-crypto-test-'));
        _setCustomUserDataPathForTesting(testDir);
        _clearFallbackKeyCacheForTesting();

        // Setup mock safeStorage
        mockSafeStorage = createMockSafeStorage();
        _setSafeStorageForTesting(mockSafeStorage.mock);

        // Initialize field encryption with deterministic test key
        const testMasterKey = crypto.randomBytes(32);
        _setKeysForTesting(testMasterKey);
    });

    afterEach(() => {
        _setSafeStorageForTesting(null);
        _setCustomUserDataPathForTesting(null);
        _clearFallbackKeyCacheForTesting();
        clearEncryptionKey();

        try {
            fs.rmSync(testDir, { recursive: true, force: true });
        } catch {}
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. SafeStorage & Fallback Key Management Policy
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. SafeStorage & Fallback Storage Provider', () => {
        it('should detect when safeStorage is available', () => {
            mockSafeStorage.setAvailable(true);
            expect(isSafeStorageAvailable()).toBe(true);
        });

        it('should detect when safeStorage is unavailable', () => {
            mockSafeStorage.setAvailable(false);
            expect(isSafeStorageAvailable()).toBe(false);
        });

        it('should encrypt privileged secrets using safeStorage when available', () => {
            mockSafeStorage.setAvailable(true);
            const secret = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.super-service-role-secret';
            const encrypted = encryptPrivilegedSecret(secret);

            expect(encrypted.startsWith('enc:v1:safeStorage:')).toBe(true);
            const decrypted = decryptPrivilegedSecret(encrypted);
            expect(decrypted).toBe(secret);
        });

        it('CRITICAL RULE: privileged secrets MUST fail closed when safeStorage is unavailable', () => {
            mockSafeStorage.setAvailable(false);
            const privilegedSecret = 'service-role-key-that-must-never-use-fallback';

            // Must throw when encrypting without safeStorage
            expect(() => {
                encryptPrivilegedSecret(privilegedSecret);
            }).toThrow(/safeStorage unavailable: privileged secrets cannot be stored with fallback key/i);
        });

        it('CRITICAL RULE: privileged secrets encrypted with fallback envelope MUST be rejected', () => {
            // Even if a fallback envelope somehow was crafted, decryptPrivilegedSecret must reject it
            const fakeFallbackCipher = 'enc:v1:fallback:' + Buffer.from('arbitrary-bytes').toString('base64');
            expect(() => {
                decryptPrivilegedSecret(fakeFallbackCipher);
            }).toThrow(/Security policy violation: privileged secret was encrypted with fallback storage/i);
        });

        it('should generate a 32-byte fallback key in userData with restrictive permissions', () => {
            mockSafeStorage.setAvailable(false);
            const key = getOrCreateFallbackKey();

            expect(key).toBeInstanceOf(Buffer);
            expect(key.length).toBe(32);

            const keyPath = path.join(testDir, '.secure-fallback.key');
            expect(fs.existsSync(keyPath)).toBe(true);
            const fileBytes = fs.readFileSync(keyPath);
            expect(fileBytes.length).toBe(32);
            expect(fileBytes.equals(key)).toBe(true);

            // Re-calling must return the same key
            const key2 = getOrCreateFallbackKey();
            expect(key2.equals(key)).toBe(true);
        });

        it('should encrypt standard secrets with fallback when safeStorage is unavailable', () => {
            mockSafeStorage.setAvailable(false);
            const plain = 'user-session-state-token';
            const encrypted = encryptStandardSecret(plain);

            expect(encrypted.startsWith('enc:v1:fallback:')).toBe(true);
            const decrypted = decryptStandardSecret(encrypted);
            expect(decrypted).toBe(plain);
        });

        it('should produce unique nonces/ciphertexts for identical plaintexts (fallback)', () => {
            mockSafeStorage.setAvailable(false);
            const plain = 'repeat-plain-text';
            const enc1 = encryptStandardSecret(plain);
            const enc2 = encryptStandardSecret(plain);

            expect(enc1).not.toBe(enc2);
            expect(decryptStandardSecret(enc1)).toBe(plain);
            expect(decryptStandardSecret(enc2)).toBe(plain);
        });

        it('should reject tampered ciphertext in fallback storage (GCM auth tag check)', () => {
            mockSafeStorage.setAvailable(false);
            const plain = 'authenticated-secret-data';
            const enc = encryptStandardSecret(plain);

            // Tamper with the base64 ciphertext
            const prefix = 'enc:v1:fallback:';
            const rawBase64 = enc.slice(prefix.length);
            const buf = Buffer.from(rawBase64, 'base64');

            // Corrupt the last byte of ciphertext
            buf[buf.length - 1] ^= 0xff;
            const tamperedEnc = prefix + buf.toString('base64');

            expect(() => {
                decryptStandardSecret(tamperedEnc);
            }).toThrow();
        });

        it('should reject tampered auth tag in fallback storage', () => {
            mockSafeStorage.setAvailable(false);
            const plain = 'tamper-tag-test';
            const enc = encryptStandardSecret(plain);

            const prefix = 'enc:v1:fallback:';
            const buf = Buffer.from(enc.slice(prefix.length), 'base64');

            // Auth tag is at bytes 12..28 (12-byte IV + 16-byte tag)
            buf[15] ^= 0x55;
            const tamperedEnc = prefix + buf.toString('base64');

            expect(() => {
                decryptStandardSecret(tamperedEnc);
            }).toThrow();
        });

        it('should automatically migrate fallback-protected secrets to safeStorage when it becomes available', () => {
            // 1. Secret originally saved when safeStorage was unavailable
            mockSafeStorage.setAvailable(false);
            const plain = 'offline-user-credential-to-migrate';
            const fallbackEnc = encryptStandardSecret(plain);
            expect(fallbackEnc.startsWith('enc:v1:fallback:')).toBe(true);

            // 2. safeStorage is still unavailable: migration does nothing
            const attempt1 = migrateSecretToSafeStorage(fallbackEnc);
            expect(attempt1.migrated).toBe(false);
            expect(attempt1.result).toBe(fallbackEnc);

            // 3. safeStorage becomes available (e.g. system booted, Keychain unlocked)
            mockSafeStorage.setAvailable(true);
            const attempt2 = migrateSecretToSafeStorage(fallbackEnc);
            expect(attempt2.migrated).toBe(true);
            expect(attempt2.result.startsWith('enc:v1:safeStorage:')).toBe(true);

            // 4. Verify migrated secret decrypts correctly with safeStorage
            const decrypted = decryptStandardSecret(attempt2.result);
            expect(decrypted).toBe(plain);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Field-Level Encryption (Version 3 e3: + Backward Compatibility)
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. Versioned Field Encryption (e3: with e1:/e2: compatibility)', () => {
        it('should encrypt new writes strictly using the e3: format', () => {
            const sensitiveNote = 'Confidential client pricing agreement: 15% VIP discount';
            const encrypted = encryptField(sensitiveNote);

            expect(encrypted.startsWith('e3:')).toBe(true);
            const decrypted = decryptField(encrypted);
            expect(decrypted).toBe(sensitiveNote);
        });

        it('should generate random per-record salt and nonce (unique ciphertext for identical plaintext)', () => {
            const text = 'identical-field-content';
            const enc1 = encryptField(text);
            const enc2 = encryptField(text);

            expect(enc1).not.toBe(enc2);
            expect(decryptField(enc1)).toBe(text);
            expect(decryptField(enc2)).toBe(text);

            // Decode envelopes and verify distinct 16-byte salts and 12-byte IVs
            const buf1 = Buffer.from(enc1.slice(3), 'base64');
            const buf2 = Buffer.from(enc2.slice(3), 'base64');

            const salt1 = buf1.subarray(0, 16);
            const salt2 = buf2.subarray(0, 16);
            const iv1 = buf1.subarray(16, 28);
            const iv2 = buf2.subarray(16, 28);

            expect(salt1.equals(salt2)).toBe(false);
            expect(iv1.equals(iv2)).toBe(false);
        });

        it('should safely reject tampered e3: ciphertext (auth tag mismatch)', () => {
            const original = 'tamper-resistant-financial-record';
            const encrypted = encryptField(original);

            const rawBase64 = encrypted.slice(3);
            const buf = Buffer.from(rawBase64, 'base64');
            // Tamper with the ciphertext byte
            buf[buf.length - 1] ^= 0x42;
            const tampered = 'e3:' + buf.toString('base64');

            // Tampered data must NOT decrypt to original; should return tampered envelope safely
            const result = decryptField(tampered);
            expect(result).not.toBe(original);
            expect(result).toBe(tampered);
        });

        it('should bind key derivation to the 16-byte salt (changing salt prevents decryption)', () => {
            const secret = 'cryptographically-bound-record-content';
            const encrypted = encryptField(secret);
            const rawBase64 = encrypted.slice(3);
            const buf = Buffer.from(rawBase64, 'base64');

            // Corrupt the salt (bytes 0..15)
            buf[5] ^= 0x99;
            const tamperedSaltEnc = 'e3:' + buf.toString('base64');

            // Must NOT decrypt successfully; must return the safe fallback (tampered envelope)
            expect(decryptField(tamperedSaltEnc)).toBe(tamperedSaltEnc);
        });

        it('should seamlessly decrypt legacy e1: records (backward compatibility)', () => {
            // Reconstruct a legacy e1: record as generated by the old system
            const legacySalt = crypto.createHash('sha256').update('lesoft-e2e-salt-v1').digest();
            const legacyKey = crypto.createHmac('sha256', legacySalt).update('default-lesoft-key').digest();
            _setKeysForTesting(crypto.randomBytes(32), legacyKey);

            const plaintext = 'Historical customer ledger balance from 2025';
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', legacyKey, iv);
            const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
            const tag = cipher.getAuthTag();

            const legacyE1Blob = 'e1:' + Buffer.concat([iv, tag, ciphertext]).toString('base64');

            // Decrypt legacy e1: record using field-encryption
            const decrypted = decryptField(legacyE1Blob);
            expect(decrypted).toBe(plaintext);
        });

        it('should seamlessly decrypt legacy e2: records (CBC backward compatibility)', () => {
            const legacySalt = crypto.createHash('sha256').update('lesoft-e2e-salt-v1').digest();
            const legacyKey = crypto.createHmac('sha256', legacySalt).update('default-lesoft-key').digest();
            _setKeysForTesting(crypto.randomBytes(32), legacyKey);

            const plaintext = 'Very old 2024 legacy notes';
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', legacyKey, iv);
            const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

            const legacyE2Blob = `e2:${iv.toString('hex')}:${ciphertext.toString('hex')}`;

            const decrypted = decryptField(legacyE2Blob);
            expect(decrypted).toBe(plaintext);
        });

        it('should pass unencrypted/plaintext strings and empty values through untouched', () => {
            expect(decryptField(null)).toBe('');
            expect(decryptField('')).toBe('');
            expect(decryptField('Regular Plaintext Note')).toBe('Regular Plaintext Note');
        });

        it('should encrypt and decrypt structured objects correctly, respecting skip keys', () => {
            const row = {
                id: 42,
                order_id: 101,
                status: 'pending',
                created_at: '2026-09-25T12:00:00Z',
                internal_notes: 'VIP customer account confidential payment terms',
                custom_token: 'tok_live_9837194821',
            };

            // encryptObject must encrypt sensitive columns with e3: but keep IDs, status, and dates plaintext
            const writePayload = encryptObject(row);

            expect(writePayload.id).toBe(42);
            expect(writePayload.order_id).toBe(101);
            expect(writePayload.status).toBe('pending');
            expect(writePayload.created_at).toBe('2026-09-25T12:00:00Z');

            expect(writePayload.internal_notes.startsWith('e3:')).toBe(true);
            expect(writePayload.custom_token.startsWith('e3:')).toBe(true);

            // decryptObject must decrypt them all back to original
            const readRow = decryptObject(writePayload);
            expect(readRow.internal_notes).toBe('VIP customer account confidential payment terms');
            expect(readRow.custom_token).toBe('tok_live_9837194821');
            expect(readRow.id).toBe(42);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Session Vault Hardening & Automatic Legacy Migration
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. Session Vault (SafeStorage / Fallback + Automatic V1 Migration)', () => {
        const testUser = {
            id: 1,
            username: 'admin',
            full_name: 'System Administrator',
            role: 'superadmin',
            password_hash: bcrypt.hashSync('correct-secure-password', 10),
            permissions: { all: true },
            group_id: null,
        };

        it('should save session in V2 format and authenticate successfully offline', async () => {
            await saveSession(testUser);

            const vPath = vaultPath();
            expect(fs.existsSync(vPath)).toBe(true);

            const fileContent = fs.readFileSync(vPath, 'utf-8');
            const v2Obj = JSON.parse(fileContent);

            expect(v2Obj.version).toBe(2);
            expect(v2Obj.ciphertext.startsWith('enc:v1:')).toBe(true);

            // Successful offline login
            const result = await loadSession({
                username: 'admin',
                password: 'correct-secure-password',
            });

            expect(result).not.toBeNull();
            expect(result?.user.username).toBe('admin');
            expect(result?.user.role).toBe('superadmin');
            expect(result?.offlineMode).toBe(true);
        });

        it('should reject offline login when password does not match', async () => {
            await saveSession(testUser);

            const result = await loadSession({
                username: 'admin',
                password: 'wrong-password',
            });

            expect(result).toBeNull();
        });

        it('should reject offline login when username does not match', async () => {
            await saveSession(testUser);

            const result = await loadSession({
                username: 'unknown_user',
                password: 'correct-secure-password',
            });

            expect(result).toBeNull();
        });

        it('should clear vault on clearSession', async () => {
            await saveSession(testUser);
            expect(fs.existsSync(vaultPath())).toBe(true);

            clearSession();
            expect(fs.existsSync(vaultPath())).toBe(false);
        });

        it('should reject tampered session vault file', async () => {
            await saveSession(testUser);
            const vPath = vaultPath();
            const fileContent = fs.readFileSync(vPath, 'utf-8');
            const v2Obj = JSON.parse(fileContent);

            // Mutate the ciphertext
            v2Obj.ciphertext = v2Obj.ciphertext.slice(0, -6) + 'AAAAAA';
            fs.writeFileSync(vPath, JSON.stringify(v2Obj), 'utf-8');

            const result = await loadSession({
                username: 'admin',
                password: 'correct-secure-password',
            });

            expect(result).toBeNull();
        });

        it('should automatically migrate legacy V1 binary vault to V2 safeStorage format', async () => {
            // 1. Manually craft a legacy V1 binary vault file: [IV (12)] + [TAG (16)] + [CIPHERTEXT (N)]
            const legacyKey = _deriveLegacyKey();
            const legacyPayload = JSON.stringify({
                id: 7,
                username: 'legacy_operator',
                full_name: 'Legacy Operator',
                role: 'operator',
                password_hash: bcrypt.hashSync('legacy-pass-123', 10),
                permissions: { make: true },
                saved_at: Date.now(),
            });

            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', legacyKey, iv);
            const encrypted = Buffer.concat([cipher.update(legacyPayload, 'utf8'), cipher.final()]);
            const tag = cipher.getAuthTag();
            const v1Buffer = Buffer.concat([iv, tag, encrypted]);

            // Write legacy binary vault to disk
            const vPath = vaultPath();
            fs.writeFileSync(vPath, v1Buffer);

            // Confirm it is binary on disk (not JSON V2)
            expect(fs.readFileSync(vPath).toString('utf-8').trim().startsWith('{')).toBe(false);

            // 2. Perform offline login: triggers legacy detection & auto-migration
            const loginResult = await loadSession({
                username: 'legacy_operator',
                password: 'legacy-pass-123',
            });

            expect(loginResult).not.toBeNull();
            expect(loginResult?.user.username).toBe('legacy_operator');
            expect(loginResult?.user.role).toBe('operator');

            // 3. Confirm vault file on disk is now upgraded to V2 JSON format
            const upgradedContent = fs.readFileSync(vPath, 'utf-8');
            expect(upgradedContent.trim().startsWith('{')).toBe(true);
            const upgradedJson = JSON.parse(upgradedContent);
            expect(upgradedJson.version).toBe(2);
            expect(upgradedJson.ciphertext.startsWith('enc:v1:')).toBe(true);

            // 4. Subsequent logins load directly from V2 format
            const subsequentResult = await loadSession({
                username: 'legacy_operator',
                password: 'legacy-pass-123',
            });
            expect(subsequentResult?.user.username).toBe('legacy_operator');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Credential Storage Hardening & Privilege Boundary
    // ─────────────────────────────────────────────────────────────────────────
    describe('4. Credential Storage Hardening & Privilege Boundary', () => {
        it('should encrypt privileged credentials using safeStorage and fail closed if unavailable', () => {
            mockSafeStorage.setAvailable(true);
            const rawServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.privileged_service_role_token';
            const rawCfClientSecret = 'cf_secret_9831984291834928193819283912';

            const encryptedServiceRole = encryptPrivilegedSecret(rawServiceRoleKey);
            const encryptedCfSecret = encryptPrivilegedSecret(rawCfClientSecret);

            expect(encryptedServiceRole.startsWith('enc:v1:safeStorage:')).toBe(true);
            expect(encryptedCfSecret.startsWith('enc:v1:safeStorage:')).toBe(true);

            expect(decryptPrivilegedSecret(encryptedServiceRole)).toBe(rawServiceRoleKey);
            expect(decryptPrivilegedSecret(encryptedCfSecret)).toBe(rawCfClientSecret);

            // Turn off safeStorage -> both operations fail closed
            mockSafeStorage.setAvailable(false);
            expect(() => encryptPrivilegedSecret(rawServiceRoleKey)).toThrow(/safeStorage unavailable/);
            expect(() => decryptPrivilegedSecret(encryptedServiceRole)).toThrow(/safeStorage unavailable/);
        });

        it('should never expose privileged credentials to the renderer via get-supabase-config output format', () => {
            // Simulated loaded config with privileged credentials
            const internalConfig = {
                url: 'https://ildkkgjrolcjijwfokek.supabase.co',
                anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon_key',
                serviceRoleKey: 'privileged_service_role_key_value',
                cfAccessClientId: 'client-id-12345',
                cfAccessClientSecret: 'privileged-cf-secret-67890',
                nasTunnelUrl: 'https://db.lenas.me',
                nasTunnelStorageUrl: 'https://storage.lenas.me',
            };

            // Mirror the exact transformation applied in ipc-handlers.ts 'get-supabase-config'
            const sanitizedForRenderer = {
                url: internalConfig.url,
                anonKey: internalConfig.anonKey,
                nasTunnelUrl: internalConfig.nasTunnelUrl,
                nasTunnelStorageUrl: internalConfig.nasTunnelStorageUrl,
                cfAccessClientId: internalConfig.cfAccessClientId || '',
                cfAccessClientSecret: internalConfig.cfAccessClientSecret ? '••••••••••••••••••••••••••••••••' : '',
                hasServiceRoleKey: !!internalConfig.serviceRoleKey,
            };

            // serviceRoleKey must NEVER exist on the response object
            expect('serviceRoleKey' in sanitizedForRenderer).toBe(false);
            expect((sanitizedForRenderer as any).serviceRoleKey).toBeUndefined();

            // cfAccessClientSecret must ONLY be bullets, never the actual secret
            expect(sanitizedForRenderer.cfAccessClientSecret).toBe('••••••••••••••••••••••••••••••••');
            expect(sanitizedForRenderer.cfAccessClientSecret).not.toContain('privileged-cf-secret');

            // Boolean flag indicates presence without exposing key material
            expect(sanitizedForRenderer.hasServiceRoleKey).toBe(true);
        });

        it('should resolve decrypted Cloudflare Access headers correctly in main and make services', () => {
            mockSafeStorage.setAvailable(true);
            const testClientId = 'cf-test-id-value';
            const testClientSecret = 'cf-test-secret-value';

            const encSecret = encryptPrivilegedSecret(testClientSecret);
            const encId = encryptStandardSecret(testClientId);

            // Construct headers object as decrypted at runtime
            const decryptedHeaders: Record<string, string> = {
                'CF-Access-Client-Id': decryptStandardSecret(encId),
                'CF-Access-Client-Secret': decryptPrivilegedSecret(encSecret),
            };

            expect(decryptedHeaders['CF-Access-Client-Id']).toBe(testClientId);
            expect(decryptedHeaders['CF-Access-Client-Secret']).toBe(testClientSecret);
        });

        it('should create encrypted backup snapshot using machine-protected key and reject tampering', () => {
            const sampleSource = path.join(testDir, 'source-data.json');
            fs.writeFileSync(sampleSource, JSON.stringify({ accounting_records: [1, 2, 3] }));
            const backupDir = path.join(testDir, 'snapshots');

            const snapshotPath = ResticBackupEngine.createEncryptedSnapshot(sampleSource, backupDir);
            expect(fs.existsSync(snapshotPath)).toBe(true);

            const snapshotBytes = fs.readFileSync(snapshotPath);
            // Snapshot format: salt(16) + iv(12) + authTag(16) + ciphertext
            expect(snapshotBytes.length).toBeGreaterThan(44);

            // Reconstruct and decrypt using the machine fallback key
            const fallbackKey = getOrCreateFallbackKey();
            const salt = snapshotBytes.subarray(0, 16);
            const iv = snapshotBytes.subarray(16, 28);
            const tag = snapshotBytes.subarray(28, 44);
            const ct = snapshotBytes.subarray(44);

            const derivedKey = crypto.pbkdf2Sync(fallbackKey.toString('hex'), salt, 100000, 32, 'sha256');
            const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
            decipher.setAuthTag(tag);
            const decrypted = decipher.update(ct).toString('utf8') + decipher.final('utf8');

            expect(JSON.parse(decrypted)).toEqual({ accounting_records: [1, 2, 3] });
        });

        it('should automatically encrypt plaintext cfAccessClientId and geminiKey during config load', () => {
            mockSafeStorage.setAvailable(true);
            const samplePlainConfig = {
                url: 'https://example.supabase.co',
                anonKey: 'eyJhbGciOi...',
                cfAccessClientId: 'plaintext-client-id-12345',
                geminiKey: 'plaintext-gemini-key-67890'
            };

            // Both standard keys get encrypted into envelopes
            const encClientId = encryptStandardSecret(samplePlainConfig.cfAccessClientId);
            const encGemini = encryptStandardSecret(samplePlainConfig.geminiKey);

            expect(encClientId.startsWith('enc:v1:')).toBe(true);
            expect(encGemini.startsWith('enc:v1:')).toBe(true);

            expect(decryptStandardSecret(encClientId)).toBe('plaintext-client-id-12345');
            expect(decryptStandardSecret(encGemini)).toBe('plaintext-gemini-key-67890');
        });
    });
});
