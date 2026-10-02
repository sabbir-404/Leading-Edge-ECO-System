import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DatabaseFailoverEngine } from './services/DatabaseFailoverEngine';
import { ENCRYPTED_URL, ENCRYPTED_ANON_KEY, PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from './credentials';
import {
    encryptPrivilegedSecret,
    decryptPrivilegedSecret,
    encryptStandardSecret,
    decryptStandardSecret,
    isSafeStorageAvailable,
} from './secure-storage';
import { isLicensed } from './license-manager';


// ─────────────────────────────────────────────────────────────────────────────
// Config path — stored in the OS user-data directory (never in Git)
// macOS:   ~/Library/Application Support/le-soft/supabase-config.json
// Windows: %APPDATA%\le-soft\supabase-config.json
// ─────────────────────────────────────────────────────────────────────────────
function getConfigPath(): string {
    const defaultPath = path.join(app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || process.cwd(), 'le-soft'), 'supabase-config.json');
    if (fs.existsSync(defaultPath)) return defaultPath;

    const candidates = [
        path.join(process.env.APPDATA || '', 'le-soft', 'supabase-config.json'),
        path.join(process.env.APPDATA || '', 'LE-SOFT', 'supabase-config.json'),
        path.join(process.env.APPDATA || '', 'supabase-config.json')
    ];
    for (const c of candidates) {
        if (c && fs.existsSync(c)) {
            return c;
        }
    }
    return defaultPath;
}

// Secret must be provided at runtime via environment variable or secure config — never hardcoded
const CREDENTIAL_SALT   = 'LE-SOFT-CREDENTIAL-ENCRYPT-SALT-v1-2026';

/**
 * Derives the AES-256 decryption key using PBKDF2.
 * Produces key only when a valid generation secret is provided in the environment.
 */
function deriveCredentialKey(): Buffer | null {
    const secret = process.env.LE_GENERATION_SECRET;
    if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
        return null;
    }
    return crypto.pbkdf2Sync(
        secret.trim(),
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
// All keys must come from the on-disk config file written during first-time setup or environment variables.
// If the config file is absent, the app redirects to /setup via hasSupabaseConfig().
const EMPTY_DEFAULTS: SupabaseConfig = {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
    anonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    nasUrl: process.env.NAS_URL || 'http://100.88.85.6:3001',
    nasAnonKey: process.env.NAS_ANON_KEY || '',
    nasStorageUrl: process.env.NAS_STORAGE_URL || 'http://100.88.85.6:8081',
    nasLocalUrl: process.env.NAS_LOCAL_URL || 'http://192.168.1.14:3001',
    nasLocalStorageUrl: process.env.NAS_LOCAL_STORAGE_URL || 'http://192.168.1.14:8081',
    nasTunnelUrl: process.env.NAS_TUNNEL_URL || 'https://db.lenas.me',
    nasTunnelStorageUrl: process.env.NAS_TUNNEL_STORAGE_URL || 'https://storage.lenas.me',
    cfAccessClientId: process.env.CF_ACCESS_CLIENT_ID || '',
    cfAccessClientSecret: process.env.CF_ACCESS_CLIENT_SECRET || ''
};

export function loadConfig(): SupabaseConfig {
    const configPath = getConfigPath();
    try {
        if (!fs.existsSync(configPath)) {
            // Option B: If machine already has an active license, auto-bootstrap public client configuration
            try {
                const lic = isLicensed();
                if (lic.valid) {
                    bootstrapPublicClientConfig();
                }
            } catch (licErr) {
                console.warn('[SUPABASE] License check during config load:', licErr);
            }

            // Legacy backward-compatibility path: if LE_GENERATION_SECRET is provided in dev environment
            if (!fs.existsSync(configPath)) {
                try {
                    const key = deriveCredentialKey();
                    if (key) {
                        const url = decryptBlob(ENCRYPTED_URL, key);
                        const anonKey = decryptBlob(ENCRYPTED_ANON_KEY, key);
                        if (url.startsWith('https://') && anonKey.startsWith('eyJ')) {
                            const autoCfg: SupabaseConfig = { ...EMPTY_DEFAULTS, url, anonKey };
                            fs.mkdirSync(path.dirname(configPath), { recursive: true });
                            fs.writeFileSync(configPath, JSON.stringify(autoCfg, null, 2), { encoding: 'utf-8', mode: 0o600 });
                            console.log('[SUPABASE] Auto-configured credentials from embedded encrypted store.');
                            return autoCfg;
                        }
                    }
                } catch (err) {
                    console.warn('[SUPABASE] Could not auto-decrypt embedded credentials:', err);
                }
            }
        }
        if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, 'utf-8');
            const parsed = JSON.parse(raw);
            const cfg: SupabaseConfig = { ...EMPTY_DEFAULTS, ...parsed };

            let needsMigration = false;

            // Decrypt or migrate serviceRoleKey (Privileged — fails closed if fallback or unencrypted without safeStorage)
            if (cfg.serviceRoleKey) {
                if (cfg.serviceRoleKey.startsWith('enc:v1:safeStorage:')) {
                    try {
                        cfg.serviceRoleKey = decryptPrivilegedSecret(cfg.serviceRoleKey);
                    } catch (err) {
                        console.error('[SUPABASE] Failed to decrypt serviceRoleKey:', err);
                        cfg.serviceRoleKey = '';
                    }
                } else if (cfg.serviceRoleKey.startsWith('enc:v1:fallback:')) {
                    console.error('[SUPABASE] Security policy violation: serviceRoleKey cannot use fallback storage. Refusing to load.');
                    cfg.serviceRoleKey = '';
                } else {
                    // Plaintext in existing file: migrate to safeStorage if available
                    if (isSafeStorageAvailable()) {
                        try {
                            const enc = encryptPrivilegedSecret(cfg.serviceRoleKey);
                            parsed.serviceRoleKey = enc;
                            needsMigration = true;
                        } catch {}
                    } else {
                        console.warn('[SUPABASE] safeStorage is unavailable; refusing to load plaintext serviceRoleKey');
                        cfg.serviceRoleKey = '';
                    }
                }
            }

            // Decrypt or migrate cfAccessClientSecret (Privileged)
            if (cfg.cfAccessClientSecret) {
                if (cfg.cfAccessClientSecret.startsWith('enc:v1:safeStorage:')) {
                    try {
                        cfg.cfAccessClientSecret = decryptPrivilegedSecret(cfg.cfAccessClientSecret);
                    } catch (err) {
                        console.error('[SUPABASE] Failed to decrypt cfAccessClientSecret:', err);
                        cfg.cfAccessClientSecret = '';
                    }
                } else if (cfg.cfAccessClientSecret.startsWith('enc:v1:fallback:')) {
                    console.error('[SUPABASE] Security policy violation: cfAccessClientSecret cannot use fallback storage. Refusing to load.');
                    cfg.cfAccessClientSecret = '';
                } else {
                    if (isSafeStorageAvailable()) {
                        try {
                            const enc = encryptPrivilegedSecret(cfg.cfAccessClientSecret);
                            parsed.cfAccessClientSecret = enc;
                            needsMigration = true;
                        } catch {}
                    } else {
                        console.warn('[SUPABASE] safeStorage is unavailable; refusing to load plaintext cfAccessClientSecret');
                        cfg.cfAccessClientSecret = '';
                    }
                }
            }

            // Decrypt or migrate cfAccessClientId
            if (cfg.cfAccessClientId) {
                if (cfg.cfAccessClientId.startsWith('enc:v1:')) {
                    try {
                        cfg.cfAccessClientId = decryptStandardSecret(cfg.cfAccessClientId);
                    } catch {
                        cfg.cfAccessClientId = '';
                    }
                } else {
                    try {
                        const enc = encryptStandardSecret(cfg.cfAccessClientId);
                        parsed.cfAccessClientId = enc;
                        needsMigration = true;
                    } catch {}
                }
            }

            // Decrypt or migrate geminiKey
            if ((cfg as any).geminiKey) {
                if ((cfg as any).geminiKey.startsWith('enc:v1:')) {
                    try {
                        (cfg as any).geminiKey = decryptStandardSecret((cfg as any).geminiKey);
                    } catch {
                        (cfg as any).geminiKey = '';
                    }
                } else {
                    try {
                        const enc = encryptStandardSecret((cfg as any).geminiKey);
                        parsed.geminiKey = enc;
                        needsMigration = true;
                    } catch {}
                }
            }

            // If we migrated any plaintext secrets, write back to disk immediately
            if (needsMigration) {
                try {
                    fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), { encoding: 'utf-8', mode: 0o600 });
                    try { fs.chmodSync(configPath, 0o600); } catch {}
                    console.log('[SUPABASE] Migrated plaintext privileged credentials to encrypted safeStorage.');
                } catch (e) {
                    console.warn('[SUPABASE] Failed to write back migrated credentials:', e);
                }
            }

            // Fill from environment defaults if missing
            if (!cfg.serviceRoleKey && EMPTY_DEFAULTS.serviceRoleKey) cfg.serviceRoleKey = EMPTY_DEFAULTS.serviceRoleKey;
            if (!cfg.cfAccessClientId && EMPTY_DEFAULTS.cfAccessClientId) cfg.cfAccessClientId = EMPTY_DEFAULTS.cfAccessClientId;
            if (!cfg.cfAccessClientSecret && EMPTY_DEFAULTS.cfAccessClientSecret) cfg.cfAccessClientSecret = EMPTY_DEFAULTS.cfAccessClientSecret;
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
        const configPath = getConfigPath();
        if (fs.existsSync(configPath)) {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            return !!(cfg.url && cfg.anonKey);
        }
        // If config file is missing but machine has a verified license, auto-bootstrap
        try {
            const lic = isLicensed();
            if (lic.valid) {
                return bootstrapPublicClientConfig();
            }
        } catch {}
        return false;
    } catch {
        return false;
    }
}

export function saveSupabaseConfig(config: Partial<SupabaseConfig>): void {
    // Merge with any existing config so partial saves don't wipe other keys
    const existing = loadConfig();
    const merged = { ...existing, ...config };

    // Prepare disk payload with encrypted privileged credentials
    const diskPayload: Record<string, any> = { ...merged };

    // Encrypt serviceRoleKey (Privileged — fails closed if safeStorage unavailable)
    if (merged.serviceRoleKey && merged.serviceRoleKey.trim()) {
        if (!merged.serviceRoleKey.startsWith('enc:v1:')) {
            diskPayload.serviceRoleKey = encryptPrivilegedSecret(merged.serviceRoleKey);
        }
    }

    // Encrypt cfAccessClientSecret (Privileged — fails closed if safeStorage unavailable)
    if (merged.cfAccessClientSecret && merged.cfAccessClientSecret.trim()) {
        if (!merged.cfAccessClientSecret.startsWith('enc:v1:')) {
            diskPayload.cfAccessClientSecret = encryptPrivilegedSecret(merged.cfAccessClientSecret);
        }
    }

    // Encrypt cfAccessClientId (Standard)
    if (merged.cfAccessClientId && merged.cfAccessClientId.trim()) {
        if (!merged.cfAccessClientId.startsWith('enc:v1:')) {
            diskPayload.cfAccessClientId = encryptStandardSecret(merged.cfAccessClientId);
        }
    }

    const configPath = getConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(diskPayload, null, 2), { encoding: 'utf-8', mode: 0o600 });
    try { fs.chmodSync(configPath, 0o600); } catch {}
    console.log('[SUPABASE] Config saved securely to', configPath);
    
    // Automatically refresh in-memory clients
    reinitSupabaseClients();
}

/**
 * Bootstraps public Supabase client configuration for fresh or missing setups.
 * Implements Option B: Separates public Supabase client configuration from the
 * developer-only license-generation secret (LE_GENERATION_SECRET).
 *
 * Safe for customer builds:
 * - Uses only the public project URL and anon JWT key.
 * - Does NOT require LE_GENERATION_SECRET, private signing keys, or privileged credentials.
 * - Preserves any existing valid configuration.
 */
export function bootstrapPublicClientConfig(): boolean {
    try {
        const configPath = getConfigPath();
        const url = PUBLIC_SUPABASE_URL;
        const anonKey = PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !anonKey || !url.startsWith('https://') || !anonKey.startsWith('eyJ')) {
            console.error('[CONFIG] Public Supabase client configuration is invalid or missing.');
            return false;
        }

        // If a valid config already exists on disk, do not overwrite it unnecessarily
        if (fs.existsSync(configPath)) {
            try {
                const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                if (existing.url && existing.anonKey) {
                    console.log('[CONFIG] Existing valid Supabase configuration preserved.');
                    reinitSupabaseClients();
                    return true;
                }
            } catch {
                // If existing file is invalid JSON, repair below
            }
        }

        // Initialize supabase-config.json with non-secret public client configuration
        const newConfig: SupabaseConfig = {
            ...EMPTY_DEFAULTS,
            url,
            anonKey,
        };

        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), { encoding: 'utf-8', mode: 0o600 });
        try { fs.chmodSync(configPath, 0o600); } catch {}
        console.log('[CONFIG] Public Supabase client configuration bootstrapped to', configPath);

        reinitSupabaseClients();
        return true;
    } catch (e: any) {
        console.error('[CONFIG] Failed to bootstrap public client configuration:', e.message);
        return false;
    }
}

/**
 * Decrypts the embedded Supabase URL and anon key from credentials.ts and
 * saves them to the userData config file.
 *
 * Retained for backward compatibility with existing developer/legacy setups.
 * Fresh customer installations use bootstrapPublicClientConfig() instead,
 * eliminating any customer requirement for LE_GENERATION_SECRET.
 *
 * @returns true if decryption succeeded and config was saved, false on error
 */
export function decryptEmbeddedCredentials(): boolean {
    // 1. Try public configuration bootstrap first (no secret required)
    if (PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_ANON_KEY) {
        return bootstrapPublicClientConfig();
    }

    // 2. Legacy fallback: derive key if LE_GENERATION_SECRET is present
    try {
        const key = deriveCredentialKey();
        if (!key) {
            console.warn('[CREDENTIALS] Decryption secret not configured in environment.');
            return false;
        }
        const url     = decryptBlob(ENCRYPTED_URL, key);
        const anonKey = decryptBlob(ENCRYPTED_ANON_KEY, key);

        // Sanity check: decrypted values must look like real credentials
        if (!url.startsWith('https://') || !anonKey.startsWith('eyJ')) {
            console.error('[CREDENTIALS] Decryption produced invalid output. Blob may be corrupted or key is invalid.');
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
export const failoverEngine = DatabaseFailoverEngine.getInstance();
export let dbReadyPromise: Promise<boolean> | null = null;

export let supabaseAdmin: SupabaseClient | null = null;
export let nasClient: SupabaseClient | null = null;
export let supabaseClient: SupabaseClient | null = null;
export let authClient: SupabaseClient | null = null;
export let isNasOnline = false;
export let connectionState: 'supabase' | 'nas_local' | 'nas_tunnel' | 'nas_public' = 'supabase';
export let activeNasUrl: string | null = null;

/**
 * Safely inspects the JWT issuer from an Authorization header without printing or leaking token contents.
 * Used for safe diagnostic telemetry.
 */
export function inspectJwtIssuerSafely(authHeader: string | null | undefined): { present: boolean; issuer: string } {
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        return { present: false, issuer: 'none' };
    }
    try {
        const token = authHeader.slice(7).trim();
        const parts = token.split('.');
        if (parts.length === 3) {
            const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
            const payload = JSON.parse(payloadJson);
            return { present: true, issuer: payload.iss || 'unknown' };
        }
    } catch {}
    return { present: true, issuer: 'unparseable' };
}

/**
 * Returns the canonical Supabase Auth client.
 * Guarantees all authentication and session lifecycle operations communicate
 * strictly with Supabase Cloud GoTrue, never NAS PostgREST.
 */
export function getAuthClient(): SupabaseClient {
    if (!supabaseClient) {
        throw new Error('[AUTH] Supabase Auth client is not initialized.');
    }
    return supabaseClient;
}

// Proxy wrapper for the default export/standard client so external modules
// always reference the authoritative active client determined by failoverEngine.
export const supabase = new Proxy({} as SupabaseClient, {
    get(target, prop, receiver) {
        if (prop === 'auth') {
            if (supabaseClient) return supabaseClient.auth;
            throw new Error('[AUTH] Supabase Auth client is not initialized.');
        }
        const active = failoverEngine.getActiveClient();
        return Reflect.get(active, prop, active);
    }
});

export function getDbClients() {
    const status = failoverEngine.getStatus();
    isNasOnline = status.isNasReachable;
    connectionState = status.connectionTier;
    activeNasUrl = status.activeNasUrl;
    return {
        nas: nasClient,
        supabase: supabaseClient,
        active: failoverEngine.getActiveClient()
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

function recreateNasClient(url: string) {
    try {
        const config = loadConfig();
        const isTunnel = url.startsWith('https://');

        const cfHeaders: Record<string, string> = {};
        if (isTunnel && config.cfAccessClientId && config.cfAccessClientSecret) {
            cfHeaders['CF-Access-Client-Id']     = config.cfAccessClientId;
            cfHeaders['CF-Access-Client-Secret'] = config.cfAccessClientSecret;
        }

        const nasFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            let reqUrl = typeof input === 'string' ? input : input.toString();
            let relativePath = '';
            try {
                const parsed = new URL(reqUrl);
                relativePath = parsed.pathname + parsed.search;
            } catch {
                relativePath = reqUrl;
            }

            // ARCHITECTURAL HARD SEPARATION:
            // nasFetch is exclusively a DATABASE transport for NAS PostgREST.
            // Under no circumstances may Auth traffic (/auth/v1/*) be routed to NAS PostgREST or
            // recorded as a database failure in DatabaseFailoverEngine.
            // If an auth request ever reaches nasFetch, bypass NAS completely and forward directly
            // to the authoritative Supabase Cloud Auth service endpoint without modifying headers or recording NAS failure.
            if (relativePath.includes('/auth/v1/')) {
                const authTargetBase = config.url || 'https://ildkkgjrolcjijwfokek.supabase.co';
                const cleanAuthPath = relativePath.startsWith('/') ? relativePath : '/' + relativePath;
                const targetAuthUrl = new URL(cleanAuthPath, authTargetBase).toString();

                const authHeader = (init?.headers instanceof Headers)
                    ? init.headers.get('Authorization')
                    : (init?.headers as any)?.Authorization || (init?.headers as any)?.authorization;
                const jwtInfo = inspectJwtIssuerSafely(authHeader);

                console.warn(`[NAS:FETCH:AUTH_ISOLATION] Intercepted Auth service request to '${relativePath}'. Routing cleanly to Supabase Auth endpoint (${authTargetBase}). TokenPresent: ${jwtInfo.present}, Issuer: ${jwtInfo.issuer}`);
                return fetch(targetAuthUrl, init);
            }

            // PostgREST URL path normalization for NAS database queries
            let nasTargetUrl = reqUrl;
            if (nasTargetUrl.includes('/rest/v1/')) {
                nasTargetUrl = nasTargetUrl.replace('/rest/v1/', '/');
            }

            const method = (init?.method || 'GET').toUpperCase();
            const isRead = method === 'GET' || method === 'HEAD';
            const headers = new Headers(init?.headers);
            for (const [k, v] of Object.entries(cfHeaders)) {
                headers.set(k, v);
            }
            if (['POST', 'PATCH', 'PUT'].includes(method) && !headers.has('Content-Type')) {
                headers.set('Content-Type', 'application/json');
            }

            // Bounded 2000ms timeout for NAS requests to prevent TCP SYN hang on Windows
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            if (init?.signal) {
                init.signal.addEventListener('abort', () => controller.abort());
            }

            const mergedInit: RequestInit = {
                ...init,
                headers,
                signal: controller.signal
            };

            const t0 = Date.now();
            try {
                const resp = await fetch(nasTargetUrl, mergedInit);
                clearTimeout(timeoutId);

                const contentType = resp.headers.get('content-type') || '';
                const isHtmlBlock = contentType.includes('text/html');
                const isAuthBlocked = resp.status === 401 || resp.status === 403;
                const isServerError = resp.status >= 500;

                if (!isHtmlBlock && !isAuthBlocked && !isServerError) {
                    failoverEngine.recordNasSuccess(Date.now() - t0);
                    return resp;
                }

                let classifiedError: string;
                if (isHtmlBlock && isAuthBlocked) {
                    classifiedError = `Database proxy/access blocked: ${resp.status} ${resp.statusText} (HTML response from proxy/gateway)`;
                } else if (isAuthBlocked) {
                    classifiedError = `Database authorization rejected: ${resp.status} ${resp.statusText} (PostgREST authentication error)`;
                } else if (isServerError) {
                    classifiedError = `Database server error: ${resp.status} ${resp.statusText}`;
                } else if (isHtmlBlock) {
                    classifiedError = `Database returned unexpected HTML gateway response: ${resp.status} ${resp.statusText}`;
                } else {
                    classifiedError = `Database request rejected: ${resp.status} ${resp.statusText}`;
                }

                throw new Error(classifiedError);
            } catch (err: any) {
                clearTimeout(timeoutId);
                const isTimeout = controller.signal.aborted || err?.name === 'AbortError' || err?.message?.includes('aborted');
                const isConnRefused = err?.message?.includes('ECONNREFUSED');
                const errMsg = isTimeout
                    ? 'Database connection timeout (2000ms)'
                    : isConnRefused
                    ? 'Database connection refused'
                    : (err?.message || 'Database connection failed');
                
                failoverEngine.recordNasFailure(new Error(errMsg));

                // ARCHITECTURAL MANDATE:
                // Low-level transport MUST NOT blindly replay mutation requests (POST, PUT, PATCH, DELETE).
                // DatabaseFailoverEngine is the sole authority for write execution, idempotency, and journaling.
                // Replaying a write mutation after an ambiguous timeout risks duplicate record creation.
                if (!isRead) {
                    throw new Error(`[NAS:FETCH] Mutation operation (${method}) failed or timed out on NAS: ${errMsg}. Low-level replay rejected to protect database integrity.`);
                }

                // Safe fallback ONLY for idempotent READ requests (GET, HEAD)
                if (config.url && config.anonKey) {
                    try {
                        const cleanPath = relativePath.startsWith('/rest/v1/') 
                            ? relativePath 
                            : `/rest/v1${relativePath.startsWith('/') ? relativePath : '/' + relativePath}`;
                        const cloudUrl = new URL(cleanPath, config.url).toString();
                        
                        const cloudHeaders = new Headers(init?.headers);
                        cloudHeaders.set('apikey', config.anonKey);
                        if (!cloudHeaders.has('Authorization')) {
                            cloudHeaders.set('Authorization', `Bearer ${config.anonKey}`);
                        }
                        cloudHeaders.delete('CF-Access-Client-Id');
                        cloudHeaders.delete('CF-Access-Client-Secret');

                        console.warn(`[NAS:FETCH] NAS read failed (${errMsg}). Routing read to Supabase Cloud:`, cloudUrl);
                        return await fetch(cloudUrl, {
                            ...init,
                            headers: cloudHeaders
                        });
                    } catch (forwardErr: any) {
                        console.error('[NAS:FETCH] Supabase Cloud auto-forward failed:', forwardErr.message);
                    }
                }

                throw err;
            }
        };

        nasClient = createClient(url, config.nasAnonKey || config.anonKey || 'placeholder', {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            },
            global: {
                fetch: nasFetch,
                headers: {
                    'x-app-name': 'LE-SOFT-NAS',
                    ...cfHeaders,
                }
            }
        });

        // Guard: nasClient is exclusively a PostgREST database query client.
        // It must NOT be treated as an Auth client. Delegate any access to .auth to the
        // canonical Supabase Cloud Auth client (supabaseClient.auth).
        Object.defineProperty(nasClient, 'auth', {
            get() {
                if (supabaseClient) {
                    return supabaseClient.auth;
                }
                throw new Error('[AUTH] nasClient does not provide authentication services. Use authClient.');
            },
            configurable: true
        });

        // Register updated client with failover engine
        failoverEngine.registerClients({
            nas: nasClient,
            supabase: supabaseClient,
            supabaseAdmin: supabaseAdmin
        });
    } catch (e: any) {
        console.error('[SUPABASE] Failed to recreate nasClient:', e.message);
    }
}

export function reinitSupabaseClients(): void {
    try {
        const config = loadConfig();
        
        // Stop any existing monitoring timer
        failoverEngine.stopBackgroundMonitoring();
        
        // Initialize Supabase Client
        supabaseClient = createClient(config.url || 'https://placeholder.supabase.co', config.anonKey || 'placeholder', {
            auth: {
                persistSession: false,
                autoRefreshToken: true,
            },
            global: {
                headers: {
                    'x-app-name': 'LE-SOFT',
                },
            },
        });
        authClient = supabaseClient;
        
        supabaseAdmin = config.serviceRoleKey ? createClient(config.url, config.serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }) : null;

        // Candidate NAS endpoint priority
        // Prioritize last working URL (if not an unauthenticated tunnel), then direct Tailscale IP (port 3001), then LAN
        const hasCf = Boolean(config.cfAccessClientId && config.cfAccessClientSecret);
        const lastWorking = failoverEngine.getLastWorkingNasUrl();
        const isLastWorkingValid = lastWorking && (!lastWorking.startsWith('https://') || hasCf);

        let defaultNasCandidate: string;
        if (isLastWorkingValid) {
            defaultNasCandidate = lastWorking;
        } else if (config.nasUrl) {
            defaultNasCandidate = config.nasUrl;
        } else if (config.nasLocalUrl && config.nasLocalUrl !== 'http://192.168.1.14:3001') {
            defaultNasCandidate = config.nasLocalUrl;
        } else if (hasCf && config.nasTunnelUrl) {
            defaultNasCandidate = config.nasTunnelUrl;
        } else {
            defaultNasCandidate = 'http://100.88.85.6:3001';
        }
        recreateNasClient(defaultNasCandidate);

        failoverEngine.registerClients({
            nas: nasClient,
            supabase: supabaseClient,
            supabaseAdmin: supabaseAdmin,
            onRecreateNasClient: recreateNasClient
        });

        try {
            const { TelemetryEngine } = require('./services/telemetry/TelemetryEngine');
            TelemetryEngine.getInstance().registerClients({
                supabase: supabaseClient,
                supabaseAdmin: supabaseAdmin
            });
        } catch {}

        const getCandidates = () => {
            const hasCfAccess = Boolean(config.cfAccessClientId && config.cfAccessClientSecret);
            return {
                localUrl: config.nasLocalUrl || 'http://192.168.1.14:3001',
                publicUrl: config.nasUrl || 'http://100.88.85.6:3001',
                tunnelUrl: hasCfAccess ? (config.nasTunnelUrl || 'https://db.lenas.me') : undefined,
                cfHeaders: getCfAccessHeaders()
            };
        };

        // Bounded startup check (resolves in ~300ms against Tailscale)
        dbReadyPromise = failoverEngine.checkNasConnectivity(getCandidates()).then(online => {
            const status = failoverEngine.getStatus();
            isNasOnline = status.isNasReachable;
            connectionState = status.connectionTier;
            activeNasUrl = status.activeNasUrl;
            if (activeNasUrl && activeNasUrl !== defaultNasCandidate) {
                recreateNasClient(activeNasUrl);
            }
            return online;
        }).catch(() => false);

        // Start background health monitor (10s cycle) and retention audit
        failoverEngine.startBackgroundMonitoring(getCandidates);

        if (config.url && config.anonKey) {
            console.log('[SUPABASE] Clients successfully re-initialized with FailoverEngine →', config.url);
        } else {
            console.warn('[SUPABASE] Clients re-initialized with placeholders (redirecting to setup).');
        }
    } catch (e: any) {
        console.error('[SUPABASE] Failed to initialize clients:', e.message);
    }
}

// Initial initialization
reinitSupabaseClients();

/**
 * Returns prioritized storage candidate base URLs for TrueNAS storage.
 * Prioritizes direct Tailscale (port 8081) and LAN (port 8081) over Cloudflare Tunnel (storage.lenas.me).
 */
export function getNasStorageCandidates(): string[] {
    const config = loadConfig();
    const candidates = [
        config.nasStorageUrl || 'http://100.88.85.6:8081',
        config.nasLocalStorageUrl || 'http://192.168.1.14:8081',
        config.nasTunnelStorageUrl || 'https://storage.lenas.me'
    ].filter(Boolean);
    return Array.from(new Set(candidates));
}

export default supabase;

