import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
const supabase = createClient(conf.url, conf.serviceRoleKey || conf.anonKey);

async function run() {
  const sqlPath = 'supabase/migrations/044_voucher_types_table.sql';
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('Applying migration:', sqlPath);
  
  const { data, error } = await supabase.rpc('run_sql', { sql });
  if (error) {
     console.error('Error applying migration:', error.message);
  } else {
     console.log('Migration applied successfully!');
  }

  // Reload schema cache
  await supabase.rpc('run_sql', { sql: `NOTIFY pgrst, 'reload schema'` });
}
run();
