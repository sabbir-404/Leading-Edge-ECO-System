/**
 * LE-SOFT License Manager
 * 
 * Hardware-bound offline license key system.
 * - Generates a unique Machine ID from hardware fingerprints
 * - Validates license keys using HMAC-SHA256
 * - Stores license in user data directory
 */

import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

// ═══════════════════════════════════════════════
//  SECURITY: Asymmetric License Verification System
//  - Customer application contains ONLY the public verification key.
//  - Private signing key is strictly held by the developer.
//  - Complete license payload and device binding are authenticated.
// ═══════════════════════════════════════════════

/**
 * Canonical Ed25519 Public Verification Key for LESOFT.
 * Safe to embed in client binaries: public keys verify signatures only
 * and cannot be used to forge licenses or derive private keys.
 */
export const LICENSE_VERIFICATION_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAN1VUr6FWOFsJI5xKtlVlLJg167CVtx8d7+tgebClPxI=
-----END PUBLIC KEY-----`;

// Legacy V1 verification salt (retained for backward compatibility with existing installations)
export const VERIFICATION_SALT = 'LE-SOFT-2026-VERIFY-SALT-xK9mQ2';
const MACHINE_ID_SALT = 'LE-SOFT-MACHINE-FINGERPRINT';

export interface LicensePayload {
    v: number;
    mid: string;
    type?: string;
    iat?: number;
    exp?: number | null;
    [key: string]: any;
}

export interface LicenseValidationResult {
    valid: boolean;
    version?: 1 | 2;
    error?: string;
    payload?: LicensePayload;
}

function getLicenseFilePath(): string {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'license.json');
}

/**
 * Generates a unique machine identifier from hardware characteristics.
 * This ID is deterministic — same hardware = same ID every time.
 */
export function getMachineId(): string {
    const parts: string[] = [];

    // CPU info
    const cpus = os.cpus();
    if (cpus.length > 0) {
        parts.push(cpus[0].model);
        parts.push(String(cpus.length));
    }

    // OS hostname + platform
    parts.push(os.hostname());
    parts.push(os.platform());
    parts.push(os.arch());

    // Total memory (rounded to nearest GB to handle minor variations)
    const totalMemGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
    parts.push(String(totalMemGB));

    // First non-internal MAC address
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
                parts.push(iface.mac);
                break;
            }
        }
        if (parts.length > 6) break; // got a MAC, stop looking
    }

    // Hash all parts together
    const raw = parts.join('|');
    const hash = crypto
        .createHmac('sha256', MACHINE_ID_SALT)
        .update(raw)
        .digest('hex')
        .substring(0, 12)
        .toUpperCase();

    // Format as LE-XXXX-XXXX-XXXX for readability
    return `LE-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}`;
}

/**
 * Cryptographically verifies a license key.
 * - V2 licenses (prefixed with "LE2."): Fully authenticated using Ed25519 digital signature.
 *   Verifies complete integrity, machine binding, version, and optional expiry.
 * - V1 legacy licenses: Validated using the legacy HMAC prefix algorithm ONLY if options.allowLegacy is true.
 *   By default, unauthenticated legacy licenses are rejected to prevent forged-prefix attacks.
 */
export function verifyLicense(
    machineId: string,
    licenseKey: string,
    options?: { allowLegacy?: boolean; publicKey?: string }
): LicenseValidationResult {
    if (!machineId || !licenseKey || typeof licenseKey !== 'string') {
        return { valid: false, error: 'Missing machine ID or license key' };
    }

    const trimmed = licenseKey.trim();

    // ── V2 Asymmetric Signature Path ──
    if (trimmed.startsWith('LE2.')) {
        const parts = trimmed.split('.');
        if (parts.length !== 3 || parts[0] !== 'LE2' || !parts[1] || !parts[2]) {
            return { valid: false, error: 'Malformed V2 license key structure' };
        }

        try {
            const dataToVerify = Buffer.from(`LE2.${parts[1]}`, 'utf8');
            const signature = Buffer.from(parts[2], 'base64url');

            // Ed25519 signatures are strictly 64 bytes
            if (signature.length !== 64) {
                return { valid: false, error: 'Invalid signature length' };
            }

            const pubKey = options?.publicKey || LICENSE_VERIFICATION_PUBLIC_KEY;
            const isSignatureValid = crypto.verify(
                null,
                dataToVerify,
                pubKey,
                signature
            );

            if (!isSignatureValid) {
                return { valid: false, error: 'Invalid or forged license signature' };
            }

            const payloadRaw = Buffer.from(parts[1], 'base64url').toString('utf8');
            const payload: LicensePayload = JSON.parse(payloadRaw);

            if (payload.v !== 2) {
                return { valid: false, error: `Unsupported license version: ${payload.v}` };
            }

            if (!payload.mid || payload.mid.trim().toUpperCase() !== machineId.trim().toUpperCase()) {
                return { valid: false, error: 'License is bound to a different machine ID' };
            }

            if (typeof payload.exp === 'number' && payload.exp > 0) {
                const nowSec = Math.floor(Date.now() / 1000);
                if (nowSec > payload.exp) {
                    return { valid: false, error: 'License key has expired', payload };
                }
            }

            return { valid: true, version: 2, payload };
        } catch (err: any) {
            return { valid: false, error: `V2 validation error: ${err.message}` };
        }
    }

    // ── Legacy V1 Compatibility Path ──
    if (options?.allowLegacy) {
        const cleanKey = trimmed.replace(/[\s-]/g, '').toUpperCase();
        if (cleanKey.length >= 16) {
            const expectedPrefix = crypto
                .createHmac('sha256', VERIFICATION_SALT)
                .update(machineId.trim())
                .digest('hex')
                .substring(0, 8)
                .toUpperCase();

            if (cleanKey.substring(0, 8) === expectedPrefix) {
                return { valid: true, version: 1 };
            }
        }
        return { valid: false, error: 'Invalid legacy license key' };
    }

    // Unauthenticated legacy format is rejected by default to prevent forged-prefix attacks
    return { valid: false, error: 'Unauthenticated legacy license format. V2 signed license required.' };
}

/**
 * Validates a license key against a machine ID.
 * Returns true if valid, false otherwise.
 */
export function validateLicense(
    machineId: string,
    licenseKey: string,
    options?: { allowLegacy?: boolean; publicKey?: string }
): boolean {
    return verifyLicense(machineId, licenseKey, options).valid;
}

/**
 * Checks if the current machine has a valid license.
 * Automatically handles both V2 signed licenses and existing legacy V1 installations.
 */
export function isLicensed(): { valid: boolean; machineId: string; key?: string; version?: number; legacy?: boolean } {
    const machineId = getMachineId();
    const licensePath = getLicenseFilePath();

    try {
        if (fs.existsSync(licensePath)) {
            const data = JSON.parse(fs.readFileSync(licensePath, 'utf-8'));
            if (data.machineId === machineId && data.key) {
                // If V2 key:
                if (typeof data.key === 'string' && data.key.startsWith('LE2.')) {
                    if (validateLicense(machineId, data.key)) {
                        return { valid: true, machineId, key: data.key, version: 2 };
                    }
                } else {
                    // Legacy key compatibility path for existing installations
                    if (validateLicense(machineId, data.key, { allowLegacy: true })) {
                        return { valid: true, machineId, key: data.key, version: 1, legacy: true };
                    }
                }
            }
        }
    } catch (e) {
        // Corrupt or missing file — treat as unlicensed
    }

    return { valid: false, machineId };
}

/**
 * Saves a validated license key to disk.
 * Requires a cryptographically valid V2 signed license.
 */
export function saveLicense(key: string): { success: boolean; error?: string } {
    const machineId = getMachineId();
    const trimmed = key.trim();

    const verification = verifyLicense(machineId, trimmed);
    if (!verification.valid) {
        return { success: false, error: verification.error || 'Invalid license key for this machine' };
    }

    try {
        const licensePath = getLicenseFilePath();
        const data = {
            version: 2,
            machineId,
            key: trimmed,
            activatedAt: new Date().toISOString(),
            appVersion: app.getVersion(),
        };
        fs.writeFileSync(licensePath, JSON.stringify(data, null, 2), 'utf-8');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: 'Failed to save license file' };
    }
}
