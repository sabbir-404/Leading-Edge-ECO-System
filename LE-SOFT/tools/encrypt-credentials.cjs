#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * tools/encrypt-credentials.cjs — LE-SOFT Developer Credential Encryptor
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * DEVELOPER-ONLY TOOL — Do NOT ship this with the application.
 *
 * PURPOSE:
 *   Encrypts your Supabase URL and Anon Key into AES-256-GCM ciphertext blobs
 *   that are safe to embed in the app source code.
 *   The blobs can only be decrypted by the GENERATION_SECRET (the same master
 *   secret used to generate license keys).
 *
 *   On the user's machine, when they enter a valid license key:
 *     1. License validation passes (HMAC check against VERIFICATION_SALT)
 *     2. App derives the decryption key from GENERATION_SECRET + CREDENTIAL_SALT
 *     3. Credentials are decrypted and written to userData/supabase-config.json
 *     4. App connects to Supabase automatically — no URL/key entry needed
 *
 * USAGE:
 *   node tools/encrypt-credentials.cjs
 *
 * OUTPUT:
 *   Prints the ENCRYPTED_URL and ENCRYPTED_ANON_KEY constants to paste into
 *   electron/credentials.ts
 *
 * SECURITY:
 *   - The GENERATION_SECRET must NEVER be shipped with the app binary.
 *   - The encrypted blobs embedded in the app are safe in source control —
 *     without GENERATION_SECRET they are indistinguishable from random bytes.
 *   - Key derivation uses PBKDF2 with 100,000 iterations.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const readline = require('readline');

// ─── Must match generate-license.cjs ─────────────────────────────────────────
// This is the master secret used to generate all license keys.
// Only you (the developer) should have this.
const GENERATION_SECRET = 'LE-SOFT-MASTER-KEY-2026-Pr0duct10n-S3cret!@#';

// Salt used specifically for credential encryption (different from license salt)
const CREDENTIAL_SALT = 'LE-SOFT-CREDENTIAL-ENCRYPT-SALT-v1-2026';

// ─── Key derivation ───────────────────────────────────────────────────────────
function deriveKey(secret, salt) {
    return crypto.pbkdf2Sync(
        secret,
        salt,
        100_000,    // iterations — expensive enough to resist brute force
        32,         // 32 bytes = 256-bit AES key
        'sha512'
    );
}

// ─── AES-256-GCM encrypt ──────────────────────────────────────────────────────
function encrypt(plaintext, key) {
    const iv = crypto.randomBytes(12);                          // 12-byte GCM IV
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ]);
    const tag = cipher.getAuthTag();                            // 16-byte auth tag
    // Format: base64( IV[12] + AuthTag[16] + Ciphertext )
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(resolve => rl.question(q, resolve));

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  LE-SOFT Credential Encryptor — Developer Tool');
    console.log('═══════════════════════════════════════════════════════════\n');

    const url     = await ask('Enter Supabase Project URL:  ');
    const anonKey = await ask('Enter Supabase Anon Key:     ');
    rl.close();

    if (!url.startsWith('https://') || !anonKey.startsWith('eyJ')) {
        console.error('\n❌ Invalid input. URL should start with https:// and anon key with eyJ');
        process.exit(1);
    }

    const key = deriveKey(GENERATION_SECRET, CREDENTIAL_SALT);

    const encryptedUrl  = encrypt(url.trim(), key);
    const encryptedAnon = encrypt(anonKey.trim(), key);

    console.log('\n✅ Encryption complete! Copy the output below into electron/credentials.ts:\n');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`// Generated: ${new Date().toISOString()}`);
    console.log(`// Run tools/encrypt-credentials.cjs to regenerate`);
    console.log('');
    console.log(`export const ENCRYPTED_URL      = '${encryptedUrl}';`);
    console.log(`export const ENCRYPTED_ANON_KEY = '${encryptedAnon}';`);
    console.log('─────────────────────────────────────────────────────────────\n');
    console.log('⚠️  These blobs are safe to commit. They need GENERATION_SECRET to decrypt.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
