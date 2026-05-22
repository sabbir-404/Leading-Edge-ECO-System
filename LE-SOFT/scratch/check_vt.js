import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
let url, key;
if (fs.existsSync(userEnvPath)) {
  const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
  url = conf.url;
  key = conf.anonKey;
}

if(!url) { console.error("No url"); process.exit(1); }
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('voucher_types').select('*').limit(1);
  if(error) {
     console.log("Error querying voucher_types:", error.message);
  } else {
     console.log("voucher_types table exists! Data:", data);
  }
}
run();
