import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

// ─── Config loading ──────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'supabase-config.json');

interface SupabaseConfig {
    url: string;
    anonKey: string;
}

// Built-in defaults (your project credentials)
const DEFAULTS: SupabaseConfig = {
    url: 'https://ildkkgjrolcjijwfokek.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzMzMjQsImV4cCI6MjA4NzUwOTMyNH0.Bn6c-87BOumPXyH5F469P04fQSMnI9SjNDZAwgGyTsM',
};

function loadConfig(): SupabaseConfig {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
            return { ...DEFAULTS, ...JSON.parse(raw) };
        }
    } catch (e) {
        console.warn('[SUPABASE] Could not load config file, using defaults:', e);
    }
    return DEFAULTS;
}

export function saveSupabaseConfig(config: SupabaseConfig): void {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    console.log('[SUPABASE] Config saved to', CONFIG_PATH);
}

// ─── Client singleton ────────────────────────────────────────────────────────
const config = loadConfig();

export const supabase: SupabaseClient = createClient(config.url, config.anonKey, {
    auth: {
        persistSession: false,           // Electron handles its own sessions
        autoRefreshToken: true,
    },
    global: {
        headers: {
            'x-app-name': 'LE-SOFT',
        },
    },
});

console.log('[SUPABASE] Client initialized →', config.url);

export default supabase;
