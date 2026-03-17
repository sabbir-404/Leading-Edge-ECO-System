import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ildkkgjrolcjijwfokek.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzMzMjQsImV4cCI6MjA4NzUwOTMyNH0.Bn6c-87BOumPXyH5F469P04fQSMnI9SjNDZAwgGyTsM';
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
    console.log('Starting migration...');

    // 1. Create payment_methods table
    const { error: error1 } = await supabase.rpc('run_sql', {
        sql: `
        CREATE TABLE IF NOT EXISTS payment_methods (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'manual',
          provider TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        `
    });
    if (error1) {
        console.warn('Note: rpc run_sql might fail if not enabled. Falling back to simple property checks.');
        console.error('Error 1:', error1);
    }

    // 2. Update bills table
    const { error: error2 } = await supabase.rpc('run_sql', {
        sql: `
        ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_method_id INTEGER REFERENCES payment_methods(id);
        ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unverified';
        ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_ref TEXT;
        `
    });
    if (error2) console.error('Error 2:', error2);

    console.log('Migration finished (check logs above for any rpc errors).');
}

migrate();
