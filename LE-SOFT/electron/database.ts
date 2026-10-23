/**
 * database.ts — Supabase primary database layer
 *
 * The local SQLite is no longer the primary database.
 * Supabase (PostgreSQL cloud) is now the single source of truth.
 * Local backup can be enabled per-device from Settings → Device Monitoring.
 */

import supabase from './supabase';

// Re-export supabase as the default db interface
export { supabase as default };

export const initDB = async (): Promise<void> => {
    // The cloud schema intentionally denies the anonymous role. Do not query
    // application tables until Supabase Auth has supplied an authenticated JWT.
    const { data: authState, error: authError } = await supabase.auth.getSession();
    if (authError || !authState.session?.access_token) {
        console.info('[DATABASE] Supabase DB probe deferred until sign-in; anonymous access is intentionally restricted.');
        return;
    }

    const { error } = await supabase.from('companies').select('id').limit(1);
    if (error) {
        console.error('[DATABASE] ⚠️  Supabase connection failed:', error.message);
        console.error('[DATABASE] Check your internet connection and Supabase credentials.');
    } else {
        console.log('[DATABASE] ✅ Supabase connected successfully');
    }
};
