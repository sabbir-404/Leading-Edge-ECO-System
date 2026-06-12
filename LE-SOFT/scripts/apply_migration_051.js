import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
const supabase = createClient(conf.url, conf.serviceRoleKey || conf.anonKey);

async function run() {
  console.log('Reading migration file 051_add_customizable_orders.sql...');
  const sqlPath = './supabase/migrations/051_add_customizable_orders.sql';
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Executing migration on Supabase...');
  const { error } = await supabase.rpc('exec_sql', { sql });

  if (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }

  console.log('Migration 051 applied successfully! Schema reloaded.');
}

run().catch(err => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});
