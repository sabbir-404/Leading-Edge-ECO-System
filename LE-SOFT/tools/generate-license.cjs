#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LE-SOFT License Key Generator — Developer Tool
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * DEVELOPER-ONLY TOOL — Do NOT ship this with the application.
 * 
 * Usage:
 *   node tools/generate-license.cjs <MachineID>
 *   node tools/generate-license.cjs <MachineID> --legacy
 *   node tools/generate-license.cjs --status
 *   node tools/generate-license.cjs --check
 *   node tools/generate-license.cjs --init-keys
 * 
 * SECURITY ARCHITECTURE (V2 Asymmetric Signatures):
 *   - Ed25519 Asymmetric Digital Signatures
 *   - The private signing key exists ONLY in the protected developer environment:
 *       1. %APPDATA%\le-soft\.developer-license-signing-key.pem (mode 0o600)
 *       2. Environment variable: LE_LICENSE_SIGNING_PRIVATE_KEY
 *   - The customer application contains ONLY the public verification key.
 *   - Customer binaries cannot generate licenses and cannot recover the private key.
 *   - The private signing key is NEVER logged, displayed, or embedded in output.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Public verification key embedded in production client (license-manager.ts)
const CANONICAL_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAN1VUr6FWOFsJI5xKtlVlLJg167CVtx8d7+tgebClPxI=
-----END PUBLIC KEY-----`;

// Legacy V1 verification salt (retained for backward compatibility)
const VERIFICATION_SALT = 'LE-SOFT-2026-VERIFY-SALT-xK9mQ2';
const CREDENTIAL_SALT = 'LE-SOFT-CREDENTIAL-ENCRYPT-SALT-v1-2026';

/**
 * Returns the path to the protected developer store in the OS user-data directory.
 * Checks USERPROFILE root first (immune to application uninstalls) then APPDATA/le-soft.
 */
function getProtectedStoragePath(filename = '.developer-license-secret') {
    const userProfile = process.env.USERPROFILE || process.env.HOME || '';
    if (userProfile) {
        const profilePath = path.join(userProfile, filename);
        if (fs.existsSync(profilePath)) return profilePath;
    }

    const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library/Application Support') : '');
    if (appData) {
        const appDataPath = path.join(appData, 'le-soft', filename);
        if (fs.existsSync(appDataPath)) return appDataPath;
        return userProfile ? path.join(userProfile, filename) : appDataPath;
    }
    return userProfile ? path.join(userProfile, filename) : null;
}

/**
 * Windows DPAPI encryption/decryption helpers for protecting developer secrets at rest.
 */
function encryptWithDPAPI(plaintext) {
    if (process.platform !== 'win32') return null;
    try {
        const { execFileSync } = require('child_process');
        const b64 = Buffer.from(plaintext, 'utf8').toString('base64');
        const psScript = `Add-Type -AssemblyName System.Security; $bytes = [Convert]::FromBase64String('${b64}'); $enc = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Convert]::ToBase64String($enc);`;
        return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
            encoding: 'utf8',
            windowsHide: true
        }).trim();
    } catch {
        return null;
    }
}

function decryptWithDPAPI(cipherB64) {
    if (process.platform !== 'win32') return null;
    try {
        const { execFileSync } = require('child_process');
        const psScript = `Add-Type -AssemblyName System.Security; $bytes = [Convert]::FromBase64String('${cipherB64}'); $dec = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Text.Encoding]::UTF8.GetString($dec);`;
        return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
            encoding: 'utf8',
            windowsHide: true
        }).trim();
    } catch {
        return null;
    }
}

/**
 * Returns the path to the developer private signing key.
 */
function getSigningKeyPath() {
    return getProtectedStoragePath('.developer-license-signing-key.pem');
}

function getSigningKeyDpapiPath() {
    return getProtectedStoragePath('.developer-license-signing-key.dpapi');
}

/**
 * Resolves the private Ed25519 signing key from secure developer sources.
 * Prefers OS DPAPI-encrypted storage on Windows, followed by protected filesystem storage.
 * Never searches Git history.
 */
function resolveSigningPrivateKey() {
    // 1. Environment variable override
    if (process.env.LE_LICENSE_SIGNING_PRIVATE_KEY && process.env.LE_LICENSE_SIGNING_PRIVATE_KEY.trim().length > 0) {
        return {
            privateKey: process.env.LE_LICENSE_SIGNING_PRIVATE_KEY.trim(),
            source: 'Environment variable ($env:LE_LICENSE_SIGNING_PRIVATE_KEY)'
        };
    }

    // 2. Windows DPAPI encrypted store
    const dpapiPath = getSigningKeyDpapiPath();
    if (dpapiPath && fs.existsSync(dpapiPath)) {
        try {
            const enc = fs.readFileSync(dpapiPath, 'utf-8').trim();
            const decrypted = decryptWithDPAPI(enc);
            if (decrypted && decrypted.includes('BEGIN PRIVATE KEY')) {
                return {
                    privateKey: decrypted,
                    source: 'Local protected user store (Encrypted at rest via Windows DPAPI)'
                };
            }
        } catch {}
    }

    // 3. Protected developer store (plain PEM with 0o600 permissions, migrate to DPAPI on Windows)
    const keyPath = getSigningKeyPath();
    if (keyPath && fs.existsSync(keyPath)) {
        try {
            const raw = fs.readFileSync(keyPath, 'utf-8').trim();
            if (raw.includes('BEGIN PRIVATE KEY')) {
                // If on Windows, automatically encrypt with DPAPI and replace plain PEM
                if (process.platform === 'win32' && dpapiPath) {
                    try {
                        const encrypted = encryptWithDPAPI(raw);
                        if (encrypted) {
                            fs.writeFileSync(dpapiPath, encrypted, { encoding: 'utf-8', mode: 0o600 });
                            try { fs.chmodSync(dpapiPath, 0o600); } catch {}
                            // Remove plain PEM after successful DPAPI write
                            fs.unlinkSync(keyPath);
                            return {
                                privateKey: raw,
                                source: 'Local protected user store (Encrypted at rest via Windows DPAPI)'
                            };
                        }
                    } catch {}
                }
                return {
                    privateKey: raw,
                    source: 'Local protected user store (.developer-license-signing-key.pem, mode 0o600)'
                };
            }
        } catch {}
    }

    // 4. Gitignored local file (.env.local)
    const envLocalPath = path.join(__dirname, '..', '.env.local');
    if (fs.existsSync(envLocalPath)) {
        try {
            const content = fs.readFileSync(envLocalPath, 'utf-8');
            const match = content.match(/LE_LICENSE_SIGNING_PRIVATE_KEY\s*=\s*(["']?)([\s\S]*?)\1\s*$/m);
            if (match && match[2] && match[2].includes('BEGIN PRIVATE KEY')) {
                return {
                    privateKey: match[2].trim(),
                    source: 'Local file (.env.local)'
                };
            }
        } catch {}
    }

    return { privateKey: null, source: null };
}

/**
 * Resolves the legacy generation secret for credentials & backward compatibility.
 */
function resolveGenerationSecret() {
    if (process.env.LE_GENERATION_SECRET && process.env.LE_GENERATION_SECRET.trim().length > 0) {
        return {
            secret: process.env.LE_GENERATION_SECRET.trim(),
            source: 'Environment variable ($env:LE_GENERATION_SECRET)'
        };
    }

    const protectedStorePath = getProtectedStoragePath('.developer-license-secret');
    if (protectedStorePath && fs.existsSync(protectedStorePath)) {
        try {
            const raw = fs.readFileSync(protectedStorePath, 'utf-8').trim();
            if (raw.length > 0) {
                return {
                    secret: raw,
                    source: 'Local protected user store (.developer-license-secret)'
                };
            }
        } catch {}
    }

    return { secret: null, source: null };
}

/**
 * Verifies that the private signing key matches the canonical public key.
 */
function verifySigningKey(privateKey) {
    if (!privateKey || !privateKey.includes('BEGIN PRIVATE KEY')) return false;
    try {
        const pub = crypto.createPublicKey(privateKey);
        const exportedPub = pub.export({ type: 'spki', format: 'pem' }).trim();
        return exportedPub === CANONICAL_PUBLIC_KEY.trim();
    } catch {
        return false;
    }
}

/**
 * Generates an Ed25519-signed V2 License Key.
 * Format: LE2.<payload_base64url>.<signature_base64url>
 */
function generateSignedLicense(machineId, privateKey, options = {}) {
    if (!privateKey) {
        throw new Error('Private signing key not configured.');
    }
    if (!machineId || typeof machineId !== 'string' || !machineId.trim().startsWith('LE-')) {
        throw new Error('Invalid Machine ID. Must start with "LE-" (e.g. LE-XXXX-XXXX-XXXX)');
    }

    const payload = {
        v: 2,
        mid: machineId.trim().toUpperCase(),
        type: options.type || 'commercial',
        iat: Math.floor(Date.now() / 1000)
    };
    if (options.exp) {
        payload.exp = options.exp;
    }

    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const dataToSign = Buffer.from(`LE2.${payloadB64}`, 'utf8');

    const signature = crypto.sign(null, dataToSign, privateKey).toString('base64url');
    return `LE2.${payloadB64}.${signature}`;
}

/**
 * Generates legacy V1 32-character key for backwards compatibility testing.
 */
function generateLegacyLicenseKey(machineId, secret) {
    if (!secret) throw new Error('Missing legacy generation secret');
    if (!machineId || !machineId.startsWith('LE-')) {
        throw new Error('Invalid Machine ID. Must start with "LE-"');
    }

    const prefix = crypto
        .createHmac('sha256', VERIFICATION_SALT)
        .update(machineId.trim())
        .digest('hex')
        .substring(0, 8)
        .toUpperCase();

    const body = crypto
        .createHmac('sha256', secret)
        .update(machineId.trim())
        .digest('hex')
        .substring(0, 24)
        .toUpperCase();

    const fullKey = prefix + body;
    return fullKey.match(/.{1,4}/g).join('-');
}

/**
 * Main license generation interface. Defaults to V2 signed licenses.
 */
function generateLicenseKey(machineId, keyOrSecret, options = {}) {
    if (options.legacy) {
        const secret = keyOrSecret || resolveGenerationSecret().secret;
        return generateLegacyLicenseKey(machineId, secret);
    }

    let privKey = keyOrSecret;
    if (!privKey || typeof privKey !== 'string' || !privKey.includes('BEGIN PRIVATE KEY')) {
        const resolved = resolveSigningPrivateKey();
        privKey = resolved.privateKey;
    }

    if (!privKey) {
        // Fall back to legacy if only legacy secret provided and not a PEM
        if (keyOrSecret && typeof keyOrSecret === 'string' && keyOrSecret.length >= 16 && !keyOrSecret.includes('BEGIN PRIVATE KEY')) {
            return generateLegacyLicenseKey(machineId, keyOrSecret);
        }
        throw new Error('License signing private key is not configured.');
    }

    return generateSignedLicense(machineId, privKey, options);
}

/**
 * Verifies candidate secret against credentials.ts
 */
function verifySecretAgainstCredentials(candidate) {
    if (!candidate || typeof candidate !== 'string' || candidate.trim().length < 16) return false;
    try {
        const credPath = path.join(__dirname, '..', 'electron', 'credentials.ts');
        if (!fs.existsSync(credPath)) return false;
        const credContent = fs.readFileSync(credPath, 'utf-8');
        const urlMatch = credContent.match(/export const ENCRYPTED_URL\s*=\s*'([^']+)'/);
        if (!urlMatch) return false;

        const key = crypto.pbkdf2Sync(candidate.trim(), CREDENTIAL_SALT, 100000, 32, 'sha512');
        const urlBuf = Buffer.from(urlMatch[1], 'base64');
        const urlDec = crypto.createDecipheriv('aes-256-gcm', key, urlBuf.subarray(0, 12));
        urlDec.setAuthTag(urlBuf.subarray(12, 28));
        const decryptedUrl = urlDec.update(urlBuf.subarray(28)).toString('utf8') + urlDec.final('utf8');
        return decryptedUrl.startsWith('https://');
    } catch {
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI Handler
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);
    const isStatusCheck = args.includes('--status') || args.includes('--check') || args.includes('-c');
    const isLegacy = args.includes('--legacy');
    const isInitKeys = args.includes('--init-keys');
    const isHelp = args.includes('--help') || args.includes('-h');

    if (isHelp) {
        console.log('\n╔════════════════════════════════════════════════════════════════════╗');
        console.log('║   LE-SOFT License Key Generator — Developer Tool                   ║');
        console.log('╚════════════════════════════════════════════════════════════════════╝\n');
        console.log('Usage:');
        console.log('  node tools/generate-license.cjs <MachineID>           (Generates V2 signed license)');
        console.log('  node tools/generate-license.cjs <MachineID> --legacy  (Generates legacy V1 key)');
        console.log('  node tools/generate-license.cjs --status');
        console.log('  npm run license:check');
        console.log('');
        process.exit(0);
    }

    if (isInitKeys) {
        const keyPath = getSigningKeyPath();
        if (fs.existsSync(keyPath)) {
            console.log('\n⚠️  Signing key already exists at:', keyPath);
            process.exit(0);
        }
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        fs.mkdirSync(path.dirname(keyPath), { recursive: true });
        fs.writeFileSync(keyPath, privateKey, { mode: 0o600, encoding: 'utf8' });
        try { fs.chmodSync(keyPath, 0o600); } catch {}
        console.log('\n✅ Ed25519 developer signing key generated in protected store.');
        process.exit(0);
    }

    const { privateKey: resolvedKey, source: keySource } = resolveSigningPrivateKey();
    const { secret: resolvedSecret, source: secretSource } = resolveGenerationSecret();

    // ── Diagnostic / Status Check ──
    if (isStatusCheck) {
        const isKeyConfigured = Boolean(resolvedKey);
        const isKeyVerified = verifySigningKey(resolvedKey);
        const isSecretConfigured = Boolean(resolvedSecret);
        const isSecretVerified = verifySecretAgainstCredentials(resolvedSecret);

        console.log('\n═══ LE-SOFT License Generator Configuration Status ═══');
        console.log(`• V2 Signing Key:   ${isKeyConfigured ? '✅ CONFIGURED' : '❌ NOT CONFIGURED'}`);
        console.log(`• V2 Key Source:    ${keySource || 'None'}`);
        console.log(`• Signing Cipher:   ✅ Ed25519 Asymmetric Digital Signature`);
        console.log(`• Public Key Match: ${isKeyVerified ? '✅ Verified against production license manager' : (isKeyConfigured ? '⚠️ Key mismatch' : '❌ Not configured')}`);
        console.log(`• Legacy Secret:    ${isSecretConfigured ? '✅ CONFIGURED' : '❌ NOT CONFIGURED'} (${secretSource || 'None'})`);
        console.log(`• Credential Store: ${isSecretVerified ? '✅ Verified against production credential store' : '❌ Unverified'}`);
        console.log(`• Status:           ${isKeyConfigured && isKeyVerified ? '✅ Ready to generate signed V2 licenses' : '❌ Setup required'}\n`);

        process.exit(isKeyConfigured ? 0 : 1);
    }

    const machineId = args.find(a => !a.startsWith('-'));
    if (!machineId) {
        console.log('\nUsage: node tools/generate-license.cjs <MachineID>\n');
        process.exit(0);
    }

    if (isLegacy) {
        if (!resolvedSecret) {
            console.error('\n❌ Legacy generation secret is not configured.');
            process.exit(1);
        }
        const key = generateLegacyLicenseKey(machineId, resolvedSecret);
        console.log('\n╔════════════════════════════════════════════════════════════════════╗');
        console.log('║   Legacy V1 License Key Generated                                  ║');
        console.log('╚════════════════════════════════════════════════════════════════════╝\n');
        console.log(`  Machine ID:   ${machineId}`);
        console.log(`  Format:       V1 Legacy HMAC`);
        console.log(`  License Key:  ${key}\n`);
        process.exit(0);
    }

    // Default: V2 Signed License
    if (!resolvedKey) {
        console.error('\n❌ License signing private key is not configured.\n');
        console.error('The private signing key must be stored in protected developer storage:');
        console.error(`  ${getSigningKeyPath()}\n`);
        console.error('Or set via environment variable:');
        console.error('  $env:LE_LICENSE_SIGNING_PRIVATE_KEY="<PEM_CONTENT>"\n');
        process.exit(1);
    }

    try {
        const key = generateSignedLicense(machineId, resolvedKey);
        console.log('\n╔════════════════════════════════════════════════════════════════════╗');
        console.log('║   V2 Signed License Key Generated Successfully                     ║');
        console.log('╚════════════════════════════════════════════════════════════════════╝\n');
        console.log(`  Machine ID:   ${machineId}`);
        console.log(`  Algorithm:    Ed25519 (Asymmetric Signature)`);
        console.log(`  License Key:\n\n${key}\n`);
        console.log('──────────────────────────────────────────────────────────────────────');
        console.log('Send the exact license string above to the customer.');
        console.log('It is cryptographically bound to this Machine ID and verifiable offline.\n');
    } catch (err) {
        console.error(`\n❌ Error: ${err.message}\n`);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('Unexpected error:', err.message);
        process.exit(1);
    });
}

module.exports = {
    generateLicenseKey,
    generateSignedLicense,
    generateLegacyLicenseKey,
    resolveSigningPrivateKey,
    resolveGenerationSecret,
    verifySigningKey,
    verifySecretAgainstCredentials,
    CANONICAL_PUBLIC_KEY,
    VERIFICATION_SALT
};
