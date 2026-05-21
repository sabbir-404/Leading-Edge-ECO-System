import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
const supabase = createClient(conf.url, conf.serviceRoleKey || conf.anonKey);

async function run() {
  console.log('Running database migration to add purchase_order_number column...');
  
  const { error } = await supabase.rpc('exec_sql', { sql: `
    ALTER TABLE purchase_requisitions 
      ADD COLUMN IF NOT EXISTS purchase_order_number VARCHAR(255);
  `});
  
  if (error) {
    console.error('Migration error:', error.message);
  } else {
    console.log('Migration completed successfully! Columns updated.');
  }
}
run();
