import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
const supabase = createClient(conf.url, conf.serviceRoleKey || conf.anonKey);

async function run() {
  const { data, error } = await supabase.from('products').select('id, name, status, is_active').limit(1);
  if (error) {
     console.error('Error selecting status:', error.message);
  } else {
     console.log('Columns exist! Sample product:', data);
  }
}
run();
