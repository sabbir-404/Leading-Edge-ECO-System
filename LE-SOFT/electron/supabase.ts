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
    nasUrl?: string;
    nasAnonKey?: string;
    nasStorageUrl?: string;
}

// SECURITY: No credentials are hardcoded here.
// All keys must come from the on-disk config file written during first-time setup.
// If the config file is absent, the app redirects to /setup via hasSupabaseConfig().
const EMPTY_DEFAULTS: SupabaseConfig = {
    url: '',
    anonKey: '',
    serviceRoleKey: '',
    nasUrl: '',
    nasAnonKey: '',
    nasStorageUrl: ''
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
    
    // Automatically refresh in-memory clients
    reinitSupabaseClients();
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
// Client singletons — dynamic and refreshable on-the-fly
// ─────────────────────────────────────────────────────────────────────────────
// ─── Clients & Failover Logic ──────────────────────────────────────────────
let activeClient: SupabaseClient = createClient('https://placeholder.supabase.co', 'placeholder');
export let supabaseAdmin: SupabaseClient | null = null;
export let nasClient: SupabaseClient | null = null;
export let supabaseClient: SupabaseClient | null = null;
export let isNasOnline = false;
export let connectionState: 'supabase' | 'nas_local' | 'nas_public' = 'supabase';
export let activeNasUrl: string | null = null;

// Proxy wrapper for the default export/standard client so external modules
// always reference the active instances after reconfiguration.
export const supabase = new Proxy({} as SupabaseClient, {
    get(target, prop, receiver) {
        if (prop === 'auth' && supabaseClient) {
            return supabaseClient.auth;
        }
        return Reflect.get(activeClient, prop, activeClient);
    }
});

export function getDbClients() {
    return {
        nas: nasClient,
        supabase: supabaseClient,
        active: activeClient
    };
}

export function getNasStorageUrl(): string | null {
    try {
        const config = loadConfig();
        if (!config.nasStorageUrl) return null;
        
        // Dynamically route storage locally if database is using local LAN IP
        if (connectionState === 'nas_local') {
            return "http://192.168.1.60:8081";
        }
        return config.nasStorageUrl;
    } catch {
        return null;
    }
}

let pingInterval: ReturnType<typeof setInterval> | null = null;

function recreateNasClient(url: string) {
    try {
        const config = loadConfig();
        const nasFetch = (input: RequestInfo | URL, init?: RequestInit) => {
            let reqUrl = typeof input === 'string' ? input : input.toString();
            if (reqUrl.includes('/rest/v1/')) {
                reqUrl = reqUrl.replace('/rest/v1/', '/');
            }
            return fetch(reqUrl, init);
        };

        nasClient = createClient(url, config.nasAnonKey || config.anonKey || 'placeholder', {
            auth: {
                persistSession: false,
                autoRefreshToken: true
            },
            global: {
                fetch: nasFetch,
                headers: {
                    'x-app-name': 'LE-SOFT-NAS'
                }
            }
        });

        // Sync current session to the new nasClient if user is logged in
        if (supabaseClient) {
            supabaseClient.auth.getSession().then(({ data: { session } }) => {
                if (session && nasClient) {
                    nasClient.auth.setSession({
                        access_token: session.access_token,
                        refresh_token: session.refresh_token || '',
                    });
                }
            }).catch(() => {});
        }
    } catch (e: any) {
        console.error('[SUPABASE] Failed to recreate nasClient:', e.message);
    }
}

async function checkNasConnectivity() {
    const config = loadConfig();
    const localUrl = "http://192.168.1.60:3001";
    const publicUrl = config.nasUrl || "http://100.101.9.92:3001";
    
    // Helper to check if a PostgREST URL is responding
    const pingUrl = async (url: string): Promise<boolean> => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2-second timeout
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            return res.ok;
        } catch {
            return false;
        }
    };

    // 1. Try local NAS URL
    const isLocalOnline = await pingUrl(localUrl);
    if (isLocalOnline) {
        if (connectionState !== 'nas_local' || activeNasUrl !== localUrl) {
            console.log(`[SUPABASE] Local NAS database (${localUrl}) is ONLINE. Switched active database to Local NAS.`);
            connectionState = 'nas_local';
            activeNasUrl = localUrl;
            recreateNasClient(localUrl);
        }
        activeClient = nasClient!;
        isNasOnline = true;
        return;
    }

    // 2. Try public/Tailscale NAS URL
    if (publicUrl) {
        const isPublicOnline = await pingUrl(publicUrl);
        if (isPublicOnline) {
            if (connectionState !== 'nas_public' || activeNasUrl !== publicUrl) {
                console.log(`[SUPABASE] Public NAS database (${publicUrl}) is ONLINE. Switched active database to Public NAS.`);
                connectionState = 'nas_public';
                activeNasUrl = publicUrl;
                recreateNasClient(publicUrl);
            }
            activeClient = nasClient!;
            isNasOnline = true;
            return;
        }
    }

    // 3. Fallback to Supabase Cloud
    if (connectionState !== 'supabase') {
        console.warn(`[SUPABASE] Both NAS connections are OFFLINE. Falling back to remote Supabase.`);
        connectionState = 'supabase';
        activeNasUrl = null;
    }
    isNasOnline = false;
    if (supabaseClient) {
        activeClient = supabaseClient;
    }
}

export function reinitSupabaseClients(): void {
    try {
        const config = loadConfig();
        
        // Stop any existing ping interval
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }
        
        // Initialize Supabase Client
        supabaseClient = createClient(config.url || 'https://placeholder.supabase.co', config.anonKey || 'placeholder', {
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

        // Sync auth state changes to nasClient
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (nasClient) {
                if (session) {
                    nasClient.auth.setSession({
                        access_token: session.access_token,
                        refresh_token: session.refresh_token || '',
                    });
                }
            }
        });
        
        activeClient = supabaseClient; // Default to Supabase initially
        
        supabaseAdmin = config.serviceRoleKey ? createClient(config.url, config.serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }) : null;

        // Initialize NAS Client if configured
        if (config.nasUrl) {
            // Check immediately and start connectivity interval
            checkNasConnectivity();
            pingInterval = setInterval(checkNasConnectivity, 30000);
        } else {
            nasClient = null;
            isNasOnline = false;
            activeNasUrl = null;
            connectionState = 'supabase';
        }

        if (config.url && config.anonKey) {
            console.log('[SUPABASE] Clients successfully re-initialized →', config.url);
        } else {
            console.warn('[SUPABASE] Clients re-initialized with placeholders (redirecting to setup).');
        }
    } catch (e: any) {
        console.error('[SUPABASE] Failed to initialize clients:', e.message);
    }
}

// Initial initialization
reinitSupabaseClients();

export default supabase;
