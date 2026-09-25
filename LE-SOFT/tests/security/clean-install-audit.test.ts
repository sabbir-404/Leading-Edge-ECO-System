import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
    validateLicense,
    verifyLicense,
    isLicensed,
    saveLicense,
    getMachineId,
    LICENSE_VERIFICATION_PUBLIC_KEY,
    VERIFICATION_SALT
} from '../../electron/license-manager';
import supabase, {
    decryptEmbeddedCredentials,
    bootstrapPublicClientConfig,
    loadConfig,
    hasSupabaseConfig,
    saveSupabaseConfig,
    reinitSupabaseClients,
    getDbClients
} from '../../electron/supabase';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '../../electron/credentials';
import {
    encryptPrivilegedSecret,
    isSafeStorageAvailable,
    _setSafeStorageForTesting
} from '../../electron/secure-storage';
import { MakeProductionService, CANONICAL_PRODUCTION_STAGES } from '../../electron/services/make/MakeProductionService';

const {
    generateLicenseKey,
    generateLegacyLicenseKey,
    resolveSigningPrivateKey,
    resolveGenerationSecret
} = require('../../tools/generate-license.cjs');

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
                const iv = encrypted.subarray(0, 12);
                const tag = encrypted.subarray(12, 28);
                const ciphertext = encrypted.subarray(28);
                const decipher = crypto.createDecipheriv('aes-256-gcm', mockKey, iv);
                decipher.setAuthTag(tag);
                return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
            }
        }
    };
}

describe('Fresh Customer Installation & Credential Bootstrap Audit (Option B)', () => {
    let originalEnv: NodeJS.ProcessEnv;
    let tempUserData: string;
    let privateSigningKey: string;
    let canonicalGenSecret: string;
    let mockSafeStorage: ReturnType<typeof createMockSafeStorage>;

    beforeEach(() => {
        originalEnv = { ...process.env };
        tempUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'lesoft-clean-customer-test-'));

        // Initialize safeStorage mock
        mockSafeStorage = createMockSafeStorage();
        _setSafeStorageForTesting(mockSafeStorage.mock);

        // Resolve developer keys for generating test licenses
        try {
            const keyRes = resolveSigningPrivateKey();
            privateSigningKey = keyRes.privateKey;
        } catch {
            privateSigningKey = '';
        }

        try {
            const secRes = resolveGenerationSecret();
            canonicalGenSecret = secRes.secret;
        } catch {
            canonicalGenSecret = '';
        }

        // Isolate APPDATA and userData for clean install simulation
        process.env.APPDATA = tempUserData;
        const electron = require('electron');
        if (electron.app && electron.app.getPath) {
            electron.app.getPath.mockReturnValue(tempUserData);
        }
    });

    afterEach(() => {
        _setSafeStorageForTesting(null);
        process.env = originalEnv;
        try {
            fs.rmSync(tempUserData, { recursive: true, force: true });
        } catch {}
    });

    it('1. Clean install with no LE_GENERATION_SECRET → Supabase bootstrap succeeds', () => {
        // Strip developer secrets completely
        delete process.env.LE_GENERATION_SECRET;
        delete process.env.LE_LICENSE_SIGNING_PRIVATE_KEY;
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_ANON_KEY;

        const configPath = path.join(tempUserData, 'supabase-config.json');
        expect(fs.existsSync(configPath)).toBe(false);

        // Before bootstrap / license: hasSupabaseConfig is false
        expect(hasSupabaseConfig()).toBe(false);

        // Bootstrap public client configuration (Option B)
        const result = bootstrapPublicClientConfig();
        expect(result).toBe(true);

        // Config file was created on disk
        expect(fs.existsSync(configPath)).toBe(true);

        // Has valid public credentials
        expect(hasSupabaseConfig()).toBe(true);
        const config = loadConfig();
        expect(config.url).toBe(PUBLIC_SUPABASE_URL);
        expect(config.anonKey).toBe(PUBLIC_SUPABASE_ANON_KEY);
        expect(config.url.startsWith('https://')).toBe(true);
        expect(config.anonKey.startsWith('eyJ')).toBe(true);

        // Legacy wrapper also succeeds via fallback
        expect(decryptEmbeddedCredentials()).toBe(true);
    });

    it('2. V2 license activation → succeeds without developer secrets', () => {
        delete process.env.LE_GENERATION_SECRET;
        delete process.env.LE_LICENSE_SIGNING_PRIVATE_KEY;

        const currentMachineId = getMachineId();
        const v2LicenseKey = generateLicenseKey(currentMachineId, privateSigningKey);

        // Verification uses ONLY public verification key
        expect(validateLicense(currentMachineId, v2LicenseKey)).toBe(true);

        // Customer activates license
        const saveRes = saveLicense(v2LicenseKey);
        expect(saveRes.success).toBe(true);

        // Machine is licensed with V2
        const status = isLicensed();
        expect(status.valid).toBe(true);
        expect(status.version).toBe(2);

        // After activation, bootstrap initializes public configuration
        expect(bootstrapPublicClientConfig()).toBe(true);
        expect(hasSupabaseConfig()).toBe(true);
    });

    it('3. Supabase login on clean install → succeeds', async () => {
        delete process.env.LE_GENERATION_SECRET;
        delete process.env.LE_LICENSE_SIGNING_PRIVATE_KEY;

        // Fresh install bootstrap
        expect(bootstrapPublicClientConfig()).toBe(true);
        reinitSupabaseClients();

        // Check Supabase client is initialized with canonical public credentials
        const clients = getDbClients();
        expect(clients.supabase).toBeDefined();

        // Verify Supabase Auth service is reachable with public anon client credentials
        // An invalid-credential test verifies the auth endpoint is live and validates the client key
        const authRes = await supabase.auth.signInWithPassword({
            email: 'clean_install_audit_nonexistent@lesoft.local',
            password: 'NonExistentPassword_12345!'
        });

        // Supabase Auth returns standard error from the server (e.g. invalid credentials)
        // rather than network failure or uninitialized client error
        expect(authRes.data.user).toBeNull();
        expect(authRes.error).toBeDefined();
        expect(authRes.error?.message).toMatch(/Invalid login credentials|Email not confirmed/i);
    });

    it('4. Existing encrypted configuration → still loads and is not overwritten', () => {
        const configPath = path.join(tempUserData, 'supabase-config.json');
        const customConfig = {
            url: 'https://existing-customer-project.supabase.co',
            anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.existing-custom-anon-key',
            nasTunnelUrl: 'https://tunnel.existing-customer.me',
            nasLocalUrl: 'http://192.168.1.50:3001'
        };

        fs.writeFileSync(configPath, JSON.stringify(customConfig, null, 2), 'utf-8');

        // loadConfig must preserve existing custom settings
        const loaded = loadConfig();
        expect(loaded.url).toBe(customConfig.url);
        expect(loaded.anonKey).toBe(customConfig.anonKey);
        expect(loaded.nasTunnelUrl).toBe(customConfig.nasTunnelUrl);
        expect(loaded.nasLocalUrl).toBe(customConfig.nasLocalUrl);

        // bootstrapPublicClientConfig must NOT overwrite valid existing configuration
        expect(bootstrapPublicClientConfig()).toBe(true);
        const reloaded = loadConfig();
        expect(reloaded.url).toBe(customConfig.url);
        expect(reloaded.anonKey).toBe(customConfig.anonKey);
    });

    it('5. Privileged credentials remain safeStorage-protected', () => {
        mockSafeStorage.setAvailable(true);

        const dummyServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy-service-key-for-test';
        const dummyCfSecret = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

        saveSupabaseConfig({
            url: PUBLIC_SUPABASE_URL,
            anonKey: PUBLIC_SUPABASE_ANON_KEY,
            serviceRoleKey: dummyServiceKey,
            cfAccessClientSecret: dummyCfSecret
        });

        const configPath = path.join(tempUserData, 'supabase-config.json');
        const rawOnDisk = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

        expect(rawOnDisk.serviceRoleKey).toMatch(/^enc:v1:safeStorage:/);
        expect(rawOnDisk.cfAccessClientSecret).toMatch(/^enc:v1:safeStorage:/);
        expect(rawOnDisk.serviceRoleKey).not.toBe(dummyServiceKey);
        expect(rawOnDisk.cfAccessClientSecret).not.toBe(dummyCfSecret);

        // Test security policy: fallback encrypted privileged secret is rejected
        rawOnDisk.serviceRoleKey = 'enc:v1:fallback:insecure_fallback_token';
        fs.writeFileSync(configPath, JSON.stringify(rawOnDisk, null, 2), 'utf-8');
        const configWithInsecureKey = loadConfig();
        expect(configWithInsecureKey.serviceRoleKey).toBe('');
    });

    it('6. Customer build contains no LE_GENERATION_SECRET', () => {
        if (!canonicalGenSecret) return;

        const customerFiles = [
            path.join(__dirname, '../../electron/credentials.ts'),
            path.join(__dirname, '../../electron/supabase.ts'),
            path.join(__dirname, '../../electron/license-manager.ts'),
            path.join(__dirname, '../../electron/ipc-handlers.ts'),
            path.join(__dirname, '../../src/pages/Auth/LicenseGate.tsx'),
            path.join(__dirname, '../../src/pages/Auth/SetupScreen.tsx'),
        ];

        for (const file of customerFiles) {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf-8');
                expect(content.includes(canonicalGenSecret)).toBe(false);
            }
        }
    });

    it('7. Customer build contains no Ed25519 private key', () => {
        if (!privateSigningKey) return;

        const customerFiles = [
            path.join(__dirname, '../../electron/credentials.ts'),
            path.join(__dirname, '../../electron/supabase.ts'),
            path.join(__dirname, '../../electron/license-manager.ts'),
            path.join(__dirname, '../../electron/ipc-handlers.ts'),
            path.join(__dirname, '../../src/pages/Auth/LicenseGate.tsx'),
        ];

        for (const file of customerFiles) {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf-8');
                expect(content.includes('BEGIN PRIVATE KEY')).toBe(false);
                expect(content.includes('BEGIN EC PRIVATE KEY')).toBe(false);
                expect(content.includes(privateSigningKey)).toBe(false);
            }
        }

        // Public key IS present and begins with BEGIN PUBLIC KEY
        expect(LICENSE_VERIFICATION_PUBLIC_KEY).toContain('BEGIN PUBLIC KEY');
    });

    it('8. Wrong or forged license is rejected', () => {
        delete process.env.LE_GENERATION_SECRET;
        delete process.env.LE_LICENSE_SIGNING_PRIVATE_KEY;

        const currentMachineId = getMachineId();
        const otherMachineId = 'LE-9999-8888-7777';
        const v2LicenseForOther = generateLicenseKey(otherMachineId, privateSigningKey);

        // Wrong machine ID rejected
        expect(validateLicense(currentMachineId, v2LicenseForOther)).toBe(false);

        // Tampered payload rejected
        const tampered = v2LicenseForOther.substring(0, v2LicenseForOther.length - 4) + 'XXXX';
        expect(validateLicense(currentMachineId, tampered)).toBe(false);

        // Forged legacy prefix rejected
        const expectedPrefix = crypto
            .createHmac('sha256', VERIFICATION_SALT)
            .update(currentMachineId)
            .digest('hex')
            .substring(0, 8)
            .toUpperCase();
        const forgedLegacy = (expectedPrefix + '111122223333444455556666').match(/.{1,4}/g)!.join('-');
        expect(validateLicense(currentMachineId, forgedLegacy)).toBe(false);
    });

    it('9. MAKE functionality remains unchanged', () => {
        // Verify canonical MAKE production stages are intact
        expect(CANONICAL_PRODUCTION_STAGES).toBeDefined();
        expect(CANONICAL_PRODUCTION_STAGES).toHaveLength(8);
        expect(CANONICAL_PRODUCTION_STAGES[0]).toBe('Work in process');
        expect(CANONICAL_PRODUCTION_STAGES[7]).toBe('Delivered');

        // Verify state machine transitions
        const initial = MakeProductionService.validateTransition('Placed', 'Work in process');
        expect(initial.allowed).toBe(true);

        const invalidSkip = MakeProductionService.validateTransition('Placed', 'Primary QC');
        expect(invalidSkip.allowed).toBe(false);

        const stepProgress = MakeProductionService.validateTransition('Work in process', 'Production On Going');
        expect(stepProgress.allowed).toBe(true);
    });
});
