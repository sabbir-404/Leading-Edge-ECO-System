require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://uaznksdjxftmmslmdkzy.supabase.co";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbG... (Wait, I can't guess this)";

// Let's find it in electron/database/api.ts or .env
