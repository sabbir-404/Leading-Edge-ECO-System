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
console.log('Connecting to', url);

async function check() {
  const { error } = await supabase.from('purchase_requisition_quotes').select('id').limit(1);
  if (error && error.code === '42P01') {
      console.log('Table missing, needs migration.');
  } else {
      console.log('Table exists or other error:', error);
  }
}
check();
