import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

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
