import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { ENCRYPTED_URL, ENCRYPTED_ANON_KEY } from './credentials';


// ─────────────────────────────────────────────────────────────────────────────
// Config path — stored in the OS user-data directory (never in Git)
// macOS:   ~/Library/Application Support/le-soft/supabase-config.json
// Windows: %APPDATA%\le-soft\supabase-config.json
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'supabase-config.json');

interface SupabaseConfig {
    url: string;
    anonKey: string;
    serviceRoleKey?: string;
}

// SECURITY: No credentials are hardcoded here.
// All keys must come from the on-disk config file written during first-time setup.
// If the config file is absent, the app redirects to /setup via hasSupabaseConfig().
const EMPTY_DEFAULTS: SupabaseConfig = {
    url: '',
    anonKey: '',
    serviceRoleKey: ''
};

function loadConfig(): SupabaseConfig {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
            const parsed = JSON.parse(raw);
            // Merge with empty defaults — partial configs are handled gracefully
            return { ...EMPTY_DEFAULTS, ...parsed };
        }
    } catch (e) {
        console.warn('[SUPABASE] Could not load config file:', e);
    }
    // No config found — caller should redirect to /setup
    return EMPTY_DEFAULTS;
}

/**
 * Returns true if a valid Supabase config exists on disk.
 * Used by main.ts to decide whether to show the Setup screen on first launch.
 */
export function hasSupabaseConfig(): boolean {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return false;
        const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        return !!(cfg.url && cfg.anonKey);
    } catch {
        return false;
    }
}

export function saveSupabaseConfig(config: Partial<SupabaseConfig>): void {
    // Merge with any existing config so partial saves don't wipe other keys
    const existing = loadConfig();
    const merged = { ...existing, ...config };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
    console.log('[SUPABASE] Config saved to', CONFIG_PATH);
}

// ─────────────────────────────────────────────────────────────────────────────
// Credential decryption — unlocked by the license key at setup time
// ─────────────────────────────────────────────────────────────────────────────

// Must match tools/encrypt-credentials.cjs constants exactly
const GENERATION_SECRET = 'LE-SOFT-MASTER-KEY-2026-Pr0duct10n-S3cret!@#';
const CREDENTIAL_SALT   = 'LE-SOFT-CREDENTIAL-ENCRYPT-SALT-v1-2026';

/**
 * Derives the AES-256 decryption key using PBKDF2.
 * Same derivation as the encryption tool — produces an identical key.
 */
function deriveCredentialKey(): Buffer {
    return crypto.pbkdf2Sync(
        GENERATION_SECRET,
        CREDENTIAL_SALT,
        100_000,   // iterations — must match encrypt-credentials.cjs
        32,        // 32 bytes = 256-bit key
        'sha512'
    );
}

/**
 * Decrypts a single AES-256-GCM encrypted blob.
 * Format: base64( IV[12] + AuthTag[16] + Ciphertext )
 */
function decryptBlob(encryptedBase64: string, key: Buffer): string {
    const buf        = Buffer.from(encryptedBase64, 'base64');
    const iv         = buf.subarray(0, 12);
    const tag        = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher   = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

/**
 * Decrypts the embedded Supabase URL and anon key from credentials.ts and
 * saves them to the userData config file.
 *
 * Called from the activate-license IPC handler after license validation passes.
 * This means the user NEVER has to manually type the project URL or anon key —
 * a valid license key is sufficient to unlock the database connection.
 *
 * @returns true if decryption succeeded and config was saved, false on error
 */
export function decryptEmbeddedCredentials(): boolean {
    try {
        const key     = deriveCredentialKey();
        const url     = decryptBlob(ENCRYPTED_URL, key);
        const anonKey = decryptBlob(ENCRYPTED_ANON_KEY, key);

        // Sanity check: decrypted values must look like real credentials
        if (!url.startsWith('https://') || !anonKey.startsWith('eyJ')) {
            console.error('[CREDENTIALS] Decryption produced invalid output. Blob may be corrupted or GENERATION_SECRET has changed.');
            return false;
        }

        // Save to userData config — this is what supabase.ts reads on next launch
        saveSupabaseConfig({ url, anonKey });
        console.log('[CREDENTIALS] Supabase credentials auto-configured from embedded encrypted store.');
        return true;
    } catch (e: any) {
        console.error('[CREDENTIALS] Failed to decrypt embedded credentials:', e.message);
        return false;
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// Client singletons — created once at module load time
// ─────────────────────────────────────────────────────────────────────────────
const config = loadConfig();

// Standard client — uses anon key, subject to Supabase RLS policies
export const supabase: SupabaseClient = createClient(config.url || 'https://placeholder.supabase.co', config.anonKey || 'placeholder', {
    auth: {
        persistSession: false,    // Electron manages sessions via session-vault.ts
        autoRefreshToken: true,
    },
    global: {
        headers: {
            'x-app-name': 'LE-SOFT',
        },
    },
});

// Admin client — uses service role key, bypasses RLS completely.
// Only available after the superadmin has entered the service key in Settings.
// All destructive / privileged operations (clear-database, get-device-sessions, etc.)
// use this client, never the standard anon client.
export const supabaseAdmin = config.serviceRoleKey ? createClient(config.url, config.serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
}) : null;

if (config.url && config.anonKey) {
    console.log('[SUPABASE] Client initialized →', config.url);
} else {
    console.warn('[SUPABASE] No config found — app will redirect to /setup on first launch.');
}

export default supabase;
