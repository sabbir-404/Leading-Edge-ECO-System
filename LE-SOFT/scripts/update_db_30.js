import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
let url, key;
if (fs.existsSync(userEnvPath)) {
  const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
  url = conf.url;
  key = conf.serviceRoleKey || conf.anonKey;
}

const supabase = createClient(url, key);

async function run() {
  const sql = fs.readFileSync('supabase/migrations/030_purchase_requisition_quotes.sql', 'utf8');
  // Unfortunately supabase-js doesn't have a way to run arbitrary raw SQL
  // unless we use postgres connection string. Let's see if the user can do it, 
  // or I can modify the migration file and tell the user to run it.
}
run();
