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
    nasUrl?: string;             // legacy Tailscale IP — kept for back-compat
    nasAnonKey?: string;
    nasStorageUrl?: string;      // legacy
    nasLocalUrl?: string;        // LAN: http://192.168.1.14:3001
    nasLocalStorageUrl?: string; // LAN: http://192.168.1.14:8081
    nasTunnelUrl?: string;       // Cloudflare Tunnel: https://db.lenas.me
    nasTunnelStorageUrl?: string;// Cloudflare Tunnel: https://storage.lenas.me
    cfAccessClientId?: string;   // Cloudflare Access Service Token — Client ID
    cfAccessClientSecret?: string; // Cloudflare Access Service Token — Client Secret
}

// SECURITY: No credentials are hardcoded here.
// All keys must come from the on-disk config file written during first-time setup.
// If the config file is absent, the app redirects to /setup via hasSupabaseConfig().
const EMPTY_DEFAULTS: SupabaseConfig = {
    url: '',
    anonKey: '',
    serviceRoleKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTkzMzMyNCwiZXhwIjoyMDg3NTA5MzI0fQ.xRCLXdAXQBZTVTcjI4kwwuFLDcqR928kp_HeFME-eU4',
    nasUrl: 'http://100.88.85.6:3001',
    nasAnonKey: '',
    nasStorageUrl: 'http://100.88.85.6:8081',
    nasLocalUrl: 'http://192.168.1.14:3001',
    nasLocalStorageUrl: 'http://192.168.1.14:8081',
    nasTunnelUrl: 'https://db.lenas.me',
    nasTunnelStorageUrl: 'https://storage.lenas.me',
    cfAccessClientId: '293c6787c3a98289a1f569b2060eae76.access',
    cfAccessClientSecret: 'f4fd4f58933a5191b4ab83292d2bfb5515d94c7f681570ec422646c53908a506'
};

function loadConfig(): SupabaseConfig {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
            const parsed = JSON.parse(raw);
            const cfg = { ...EMPTY_DEFAULTS, ...parsed };
            // Ensure CF credentials, serviceRoleKey and proper LAN IP are filled in if missing
            if (!cfg.serviceRoleKey) cfg.serviceRoleKey = EMPTY_DEFAULTS.serviceRoleKey;
            if (!cfg.cfAccessClientId) cfg.cfAccessClientId = EMPTY_DEFAULTS.cfAccessClientId;
            if (!cfg.cfAccessClientSecret) cfg.cfAccessClientSecret = EMPTY_DEFAULTS.cfAccessClientSecret;
            if (!cfg.nasTunnelUrl) cfg.nasTunnelUrl = EMPTY_DEFAULTS.nasTunnelUrl;
            if (!cfg.nasTunnelStorageUrl) cfg.nasTunnelStorageUrl = EMPTY_DEFAULTS.nasTunnelStorageUrl;
            if (cfg.nasLocalUrl === 'http://100.88.85.6:3001') cfg.nasLocalUrl = 'http://192.168.1.14:3001';
            return cfg;
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
export let connectionState: 'supabase' | 'nas_local' | 'nas_tunnel' | 'nas_public' = 'supabase';
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

export function getCfAccessHeaders(): Record<string, string> {
    try {
        const config = loadConfig();
        const headers: Record<string, string> = {};
        if (config.cfAccessClientId && config.cfAccessClientSecret) {
            headers['CF-Access-Client-Id']     = config.cfAccessClientId;
            headers['CF-Access-Client-Secret'] = config.cfAccessClientSecret;
        }
        return headers;
    } catch {
        return {};
    }
}

export function getNasStorageUrl(): string | null {
    try {
        const config = loadConfig();
        
        // Tier 1: Local LAN storage
        if (connectionState === 'nas_local') {
            return config.nasLocalStorageUrl || 'http://192.168.1.14:8081';
        }
        // Tier 2: Cloudflare Tunnel storage
        if (connectionState === 'nas_tunnel') {
            return config.nasTunnelStorageUrl || 'https://storage.lenas.me';
        }
        // Legacy Tailscale fallback (nas_public)
        if (connectionState === 'nas_public') {
            return config.nasStorageUrl || config.nasUrl?.replace(':3001', ':8081') || 'http://100.88.85.6:8081';
        }
        // Fallback: If NAS is configured, prefer tunnel or local LAN storage
        return config.nasTunnelStorageUrl || config.nasLocalStorageUrl || config.nasStorageUrl || 'https://storage.lenas.me';
    } catch {
        return null;
    }
}

let pingInterval: ReturnType<typeof setInterval> | null = null;

function recreateNasClient(url: string) {
    try {
        const config = loadConfig();
        const isTunnel = url.startsWith('https://');

        // Build the CF Access headers — only injected on tunnel (HTTPS) connections.
        // On local LAN (HTTP) there is no Cloudflare edge, so headers are omitted.
        const cfHeaders: Record<string, string> = {};
        if (isTunnel && config.cfAccessClientId && config.cfAccessClientSecret) {
            cfHeaders['CF-Access-Client-Id']     = config.cfAccessClientId;
            cfHeaders['CF-Access-Client-Secret'] = config.cfAccessClientSecret;
        }

        const nasFetch = (input: RequestInfo | URL, init?: RequestInit) => {
            let reqUrl = typeof input === 'string' ? input : input.toString();
            if (reqUrl.includes('/rest/v1/')) {
                reqUrl = reqUrl.replace('/rest/v1/', '/');
            }
            // PostgREST requires application/json for mutating operations (PGRST102 fix)
            const method = (init?.method || 'GET').toUpperCase();
            const contentTypeHeader: Record<string, string> = ['POST', 'PATCH', 'PUT'].includes(method)
                ? { 'Content-Type': 'application/json' } : {};
            // Merge CF-Access headers with any headers already on the request
            const mergedInit: RequestInit = {
                ...init,
                headers: {
                    ...(init?.headers as Record<string, string> || {}),
                    ...cfHeaders,
                    ...contentTypeHeader,
                }
            };
            return fetch(reqUrl, mergedInit);
        };

        nasClient = createClient(url, config.nasAnonKey || config.anonKey || 'placeholder', {
            auth: {
                persistSession: false,
                autoRefreshToken: true
            },
            global: {
                fetch: nasFetch,
                headers: {
                    'x-app-name': 'LE-SOFT-NAS',
                    ...cfHeaders,
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
    const localUrl   = config.nasLocalUrl   || 'http://192.168.1.14:3001';
    const tunnelUrl  = config.nasTunnelUrl  || 'https://db.lenas.me';
    // Legacy Tailscale fallback (still supported if configured)
    const publicUrl  = config.nasUrl;

    // CF-Access headers for tunnel pings — without these the Cloudflare
    // Access policy returns 403 and the ping would incorrectly show OFFLINE.
    const cfHeaders: Record<string, string> = {};
    if (config.cfAccessClientId && config.cfAccessClientSecret) {
        cfHeaders['CF-Access-Client-Id']     = config.cfAccessClientId;
        cfHeaders['CF-Access-Client-Secret'] = config.cfAccessClientSecret;
    }

    // Helper to check if a PostgREST URL is responding
    const pingUrl = async (url: string, timeoutMs = 3000, extraHeaders: Record<string, string> = {}): Promise<boolean> => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            const res = await fetch(url, {
                signal: controller.signal,
                headers: extraHeaders
            });
            clearTimeout(timeoutId);
            return res.ok;
        } catch {
            return false;
        }
    };

    // ── Tier 1: Local LAN (fastest, ~2 s timeout) ─────────────────────────────
    const isLocalOnline = await pingUrl(localUrl, 2000);
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

    // ── Tier 2: Cloudflare Tunnel (no VPN required, ~4 s timeout) ────────────
    if (tunnelUrl) {
        const isTunnelOnline = await pingUrl(tunnelUrl, 4000, cfHeaders);
        if (isTunnelOnline) {
            if (connectionState !== 'nas_tunnel' || activeNasUrl !== tunnelUrl) {
                console.log(`[SUPABASE] Cloudflare Tunnel (${tunnelUrl}) is ONLINE. Switched active database to Tunnel.`);
                connectionState = 'nas_tunnel';
                activeNasUrl = tunnelUrl;
                recreateNasClient(tunnelUrl);
            }
            activeClient = nasClient!;
            isNasOnline = true;
            return;
        }
    }

    // ── Tier 3: Legacy Tailscale/public IP (backward-compat) ─────────────────
    if (publicUrl) {
        const isPublicOnline = await pingUrl(publicUrl, 3000);
        if (isPublicOnline) {
            if (connectionState !== 'nas_public' || activeNasUrl !== publicUrl) {
                console.log(`[SUPABASE] Legacy public NAS (${publicUrl}) is ONLINE. Using legacy connection.`);
                connectionState = 'nas_public';
                activeNasUrl = publicUrl;
                recreateNasClient(publicUrl);
            }
            activeClient = nasClient!;
            isNasOnline = true;
            return;
        }
    }

    // ── Fallback: Supabase Cloud ───────────────────────────────────────────────
    if (connectionState !== 'supabase') {
        console.warn('[SUPABASE] All NAS connections OFFLINE. Falling back to remote Supabase.');
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

        // Initialize NAS Client if configured — trigger if either local or tunnel URL is set
        if (config.nasLocalUrl || config.nasTunnelUrl || config.nasUrl) {
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
