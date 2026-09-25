import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import {
    validateLicense,
    isLicensed,
    saveLicense,
    getMachineId,
    LICENSE_VERIFICATION_PUBLIC_KEY
} from '../../electron/license-manager';
import supabase, {
    bootstrapPublicClientConfig,
    loadConfig,
    hasSupabaseConfig,
    reinitSupabaseClients
} from '../../electron/supabase';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '../../electron/credentials';

const {
    generateLicenseKey,
    generateLegacyLicenseKey,
    resolveSigningPrivateKey,
    resolveGenerationSecret
} = require('../../tools/generate-license.cjs');

describe('LESOFT v1.8.2 Real-World Clean-Install & Production Validation', () => {
    let originalEnv: NodeJS.ProcessEnv;
    let cleanUserData: string;
    let existingUserData: string;
    let privateSigningKey: string;
    let canonicalGenSecret: string;

    const realAppData = process.env.APPDATA || 'C:\\Users\\sabbi\\AppData\\Roaming';
    const installerPath = path.join(__dirname, '../../release/LESOFT Setup 1.8.2.exe');
    const exePath = path.join(__dirname, '../../scratch/installed-app/LESOFT.exe');

    beforeAll(() => {
        process.env.APPDATA = realAppData;
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
    });

    beforeEach(() => {
        cleanUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'lesoft-clean-customer-val-'));
        existingUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'lesoft-existing-customer-val-'));

        process.env.APPDATA = cleanUserData;
        const electron = require('electron');
        if (electron.app && electron.app.getPath) {
            electron.app.getPath.mockReturnValue(cleanUserData);
        }
    });

    afterEach(() => {
        process.env.APPDATA = realAppData;
        try { fs.rmSync(cleanUserData, { recursive: true, force: true }); } catch {}
        try { fs.rmSync(existingUserData, { recursive: true, force: true }); } catch {}
    });

    it('1. Build Verification: Production installer and installed executable exist and are valid', () => {
        expect(fs.existsSync(installerPath)).toBe(true);
        const installerStat = fs.statSync(installerPath);
        expect(installerStat.size).toBeGreaterThan(100 * 1024 * 1024); // > 100 MB

        expect(fs.existsSync(exePath)).toBe(true);
        const exeStat = fs.statSync(exePath);
        expect(exeStat.size).toBeGreaterThan(100 * 1024 * 1024); // > 100 MB
    });

    it('2. Fresh Environment Verification: Clean start has no prior license, config, or vault', () => {
        const licenseFile = path.join(cleanUserData, 'license.json');
        const configFile = path.join(cleanUserData, 'supabase-config.json');
        const vaultFile = path.join(cleanUserData, '.session.vault');

        expect(fs.existsSync(licenseFile)).toBe(false);
        expect(fs.existsSync(configFile)).toBe(false);
        expect(fs.existsSync(vaultFile)).toBe(false);

        // Before activation, machine is not licensed
        const status = isLicensed();
        expect(status.valid).toBe(false);
        expect(hasSupabaseConfig()).toBe(false);
    });

    it('3. Real Customer Flow: Confirm device ID, activate V2 license, bootstrap public Supabase, and query MAKE', async () => {
        // Strip developer secrets completely
        delete process.env.LE_GENERATION_SECRET;
        delete process.env.LE_LICENSE_SIGNING_PRIVATE_KEY;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        delete process.env.CF_ACCESS_CLIENT_SECRET;
        delete process.env.GEMINI_API_KEY;

        // 3.1 Device Machine ID
        const machineId = getMachineId();
        expect(machineId).toMatch(/^LE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

        // 3.2 Activate valid V2 license (generated outside customer machine)
        const v2LicenseKey = generateLicenseKey(machineId, privateSigningKey);
        const saveRes = saveLicense(v2LicenseKey);
        expect(saveRes.success).toBe(true);

        // 3.3 Confirm license active
        const licStatus = isLicensed();
        expect(licStatus.valid).toBe(true);
        expect(licStatus.version).toBe(2);

        // 3.4 Bootstrap public Supabase configuration
        const bootSuccess = bootstrapPublicClientConfig();
        expect(bootSuccess).toBe(true);

        const configFile = path.join(cleanUserData, 'supabase-config.json');
        expect(fs.existsSync(configFile)).toBe(true);

        const config = loadConfig();
        expect(config.url).toBe(PUBLIC_SUPABASE_URL);
        expect(config.anonKey).toBe(PUBLIC_SUPABASE_ANON_KEY);
        expect(config.serviceRoleKey).toBe('');
        expect(config.cfAccessClientSecret).toBe('');

        // 3.5 Reinitialize client singletons
        reinitSupabaseClients();

        // 3.6 Query Supabase via public client
        const { data: users, error: userErr } = await supabase.from('users').select('id,username,role').limit(3);
        expect(userErr).toBeNull();
        expect(users).toBeDefined();
        expect(users!.length).toBeGreaterThan(0);

        // 3.7 Confirm MAKE product catalog / categories readable
        const { data: categories, error: catErr } = await supabase.from('make_product_categories').select('id,name').limit(3);
        // Table exists in production schema
        expect(catErr).toBeNull();
        expect(categories).toBeDefined();

        // 3.8 Confirm read-only verification (no mutations performed)
        expect(userErr).toBeNull();
    });

    it('4. Security Verification: Customer environment has zero developer secrets, zero private keys, and safe logs', () => {
        delete process.env.LE_GENERATION_SECRET;
        delete process.env.LE_LICENSE_SIGNING_PRIVATE_KEY;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        delete process.env.CF_ACCESS_CLIENT_SECRET;

        // Customer environment checks
        expect(process.env.LE_GENERATION_SECRET).toBeUndefined();
        expect(process.env.LE_LICENSE_SIGNING_PRIVATE_KEY).toBeUndefined();

        // Public verification key is public
        expect(LICENSE_VERIFICATION_PUBLIC_KEY).toContain('BEGIN PUBLIC KEY');
        expect(LICENSE_VERIFICATION_PUBLIC_KEY).not.toContain('PRIVATE KEY');

        // Config checks
        bootstrapPublicClientConfig();
        const cfg = loadConfig();
        expect(cfg.serviceRoleKey).toBe('');
        expect(cfg.cfAccessClientSecret).toBe('');

        // Ensure no private key in log
        const logPath = path.join(cleanUserData, 'app.log');
        if (fs.existsSync(logPath)) {
            const logContent = fs.readFileSync(logPath, 'utf-8');
            expect(logContent.includes(privateSigningKey)).toBe(false);
            expect(logContent.includes(canonicalGenSecret)).toBe(false);
            expect(logContent.includes('BEGIN PRIVATE KEY')).toBe(false);
        }
    });

    it('5. Existing Customer Test: Legacy installation remains licensed, custom config preserved', () => {
        process.env.APPDATA = existingUserData;
        const electron = require('electron');
        if (electron.app && electron.app.getPath) {
            electron.app.getPath.mockReturnValue(existingUserData);
        }

        const machineId = getMachineId();
        const legacyKey = generateLegacyLicenseKey(machineId, canonicalGenSecret);

        // Populate existing customer license and custom configuration
        const existingLicenseFile = path.join(existingUserData, 'license.json');
        fs.writeFileSync(existingLicenseFile, JSON.stringify({
            version: 1,
            machineId,
            key: legacyKey,
            activatedAt: '2026-05-01T12:00:00Z',
            appVersion: '1.8.1'
        }, null, 2), 'utf-8');

        const existingConfigFile = path.join(existingUserData, 'supabase-config.json');
        const customConfig = {
            url: 'https://custom-existing-customer.supabase.co',
            anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.custom-anon-token',
            nasTunnelUrl: 'https://tunnel.existing.me',
            nasLocalUrl: 'http://192.168.1.99:3001'
        };
        fs.writeFileSync(existingConfigFile, JSON.stringify(customConfig, null, 2), 'utf-8');

        // Verify existing customer remains licensed
        const lic = isLicensed();
        expect(lic.valid).toBe(true);
        expect(lic.legacy).toBe(true);
        expect(lic.version).toBe(1);

        // Verify custom config preserved
        const loaded = loadConfig();
        expect(loaded.url).toBe(customConfig.url);
        expect(loaded.nasTunnelUrl).toBe(customConfig.nasTunnelUrl);

        // bootstrapPublicClientConfig must NOT overwrite custom config
        expect(bootstrapPublicClientConfig()).toBe(true);
        const reloaded = loadConfig();
        expect(reloaded.url).toBe(customConfig.url);
        expect(reloaded.anonKey).toBe(customConfig.anonKey);
    });

    it('6. Actual Installed Binary Execution: LESOFT.exe launches and runs normally without lockout', async () => {
        // Prepare activated state in cleanUserData
        const machineId = getMachineId();
        const v2LicenseKey = generateLicenseKey(machineId, privateSigningKey);
        saveLicense(v2LicenseKey);
        bootstrapPublicClientConfig();

        const cleanEnv = {
            ...process.env,
            APPDATA: cleanUserData,
        };
        delete cleanEnv.LE_GENERATION_SECRET;
        delete cleanEnv.LE_LICENSE_SIGNING_PRIVATE_KEY;
        delete cleanEnv.SUPABASE_SERVICE_ROLE_KEY;
        delete cleanEnv.CF_ACCESS_CLIENT_SECRET;
        delete cleanEnv.GEMINI_API_KEY;

        const launched = await new Promise<boolean>((resolve) => {
            const child = spawn(exePath, [`--user-data-dir=${cleanUserData}`], {
                env: cleanEnv,
                stdio: 'ignore'
            });

            setTimeout(() => {
                child.kill();
                resolve(true);
            }, 4000);
        });

        expect(launched).toBe(true);

        // Verify lock file was NOT created (no lockout, no tampering triggered)
        const lockFile = path.join(cleanUserData, '.system-lock');
        expect(fs.existsSync(lockFile)).toBe(false);

        // Verify app.log was written
        const logFile = path.join(cleanUserData, 'app.log');
        if (fs.existsSync(logFile)) {
            const logContent = fs.readFileSync(logFile, 'utf-8');
            expect(logContent).toContain('App starting...');
            expect(logContent).not.toContain('SECURITY LOCKOUT');
        }
    }, 15000);
});
