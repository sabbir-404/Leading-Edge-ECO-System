import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
const supabase = createClient(conf.url, conf.serviceRoleKey || conf.anonKey);

async function run() {
  console.log('Reading migration file 050_add_product_deletion_approval.sql...');
  const sqlPath = './supabase/migrations/050_add_product_deletion_approval.sql';
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Executing migration on Supabase...');
  const { error } = await supabase.rpc('run_sql', { sql });

  if (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }

  console.log('Migration 050 applied successfully! Schema reloaded.');
}

run().catch(err => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});
