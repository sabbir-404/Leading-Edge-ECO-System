import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';

/**
 * Supabase client initialization.
 * 
 * Environment variables MUST be set in app.json > extra or environment:
 *   SUPABASE_URL: Your Supabase project URL (e.g., https://xxxxx.supabase.co)
 *   SUPABASE_ANON_KEY: Public anonymous key from Supabase dashboard
 * 
 * SECURITY: The anon key is intentionally public and restricted by RLS.
 * Never store service role keys in client apps.
 */

const config = Constants.expoConfig?.extra as Record<string, string> | undefined;

const supabaseUrl = config?.SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = config?.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
        '❌ Supabase configuration missing.\n' +
        'Set SUPABASE_URL and SUPABASE_ANON_KEY in app.json > extra\n' +
        'or in environment variables.'
    );
}

export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key',
    {
        auth: {
            storage: AsyncStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
        },
    }
);
