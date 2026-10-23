import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { LICENSE_VERIFICATION_PUBLIC_KEY } from '../license-manager';

const getProtectedKeyPaths = (): { encrypted: string[]; pem: string[] } => {
    const profile = os.homedir();
    const appData = process.env.APPDATA || path.join(profile, 'AppData', 'Roaming');
    return {
        encrypted: [
            path.join(profile, '.developer-license-signing-key.dpapi'),
            path.join(appData, 'le-soft', '.developer-license-signing-key.dpapi'),
        ],
        pem: [
            path.join(profile, '.developer-license-signing-key.pem'),
            path.join(appData, 'le-soft', '.developer-license-signing-key.pem'),
        ],
    };
};

const decryptWindowsDpapi = (encrypted: string): string | null => {
    if (process.platform !== 'win32') return null;
    try {
        const script = [
            'Add-Type -AssemblyName System.Security',
            `$bytes = [Convert]::FromBase64String('${encrypted}')`,
            '$plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
            '[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))',
        ].join('; ');
        const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
        return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript], {
            encoding: 'utf8',
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return null;
    }
};

const isProductionSigningKey = (privateKey: string): boolean => {
    try {
        const actualPublicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString().trim();
        return actualPublicKey === LICENSE_VERIFICATION_PUBLIC_KEY.trim();
    } catch {
        return false;
    }
};

export const resolveLicenseSigningKey = (): string | null => {
    const fromEnvironment = process.env.LE_LICENSE_SIGNING_PRIVATE_KEY?.trim();
    if (fromEnvironment && isProductionSigningKey(fromEnvironment)) return fromEnvironment;

    const paths = getProtectedKeyPaths();
    if (process.platform === 'win32') {
        for (const keyPath of paths.encrypted) {
            try {
                if (!fs.existsSync(keyPath)) continue;
                const decrypted = decryptWindowsDpapi(fs.readFileSync(keyPath, 'utf8').trim());
                if (decrypted && isProductionSigningKey(decrypted)) return decrypted;
            } catch {
                // Try the next protected user-store location.
            }
        }
    }

    // Accept a PEM only from the developer's protected local store. The normal
    // setup tool migrates this file to DPAPI on Windows before the app is used.
    for (const keyPath of paths.pem) {
        try {
            if (!fs.existsSync(keyPath)) continue;
            const privateKey = fs.readFileSync(keyPath, 'utf8').trim();
            if (isProductionSigningKey(privateKey)) return privateKey;
        } catch {
            // Continue so one stale path cannot prevent another store from working.
        }
    }
    return null;
};

export const generateSignedMachineLicense = (
    machineId: string,
    privateKey: string,
    verificationPublicKey = LICENSE_VERIFICATION_PUBLIC_KEY,
): string => {
    const normalizedMachineId = typeof machineId === 'string' ? machineId.trim().toUpperCase() : '';
    if (!/^LE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(normalizedMachineId)) {
        throw new Error('Invalid Machine ID. It must start with "LE-" and contain only letters, numbers, or hyphens.');
    }
    if (!privateKey || !privateKey.includes('BEGIN PRIVATE KEY')) {
        throw new Error('License signing key is not configured on this computer.');
    }

    const publicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString().trim();
    if (publicKey !== verificationPublicKey.trim()) {
        throw new Error('The configured signing key does not match this software’s license verifier.');
    }

    const payload = {
        v: 2,
        mid: normalizedMachineId,
        type: 'commercial',
        iat: Math.floor(Date.now() / 1000),
    };
    const payloadBase64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signedData = Buffer.from(`LE2.${payloadBase64}`, 'utf8');
    const signature = crypto.sign(null, signedData, privateKey).toString('base64url');
    return `LE2.${payloadBase64}.${signature}`;
};

export const generateLicenseForMachine = (machineId: string): string => {
    const privateKey = resolveLicenseSigningKey();
    if (!privateKey) {
        throw new Error('License signing key is not available in this user’s protected developer key store.');
    }
    return generateSignedMachineLicense(machineId, privateKey);
};
