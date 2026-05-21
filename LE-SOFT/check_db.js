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
  const { data: ledgers, error } = await supabase.from('ledgers').select('id, name, group_id, store_name');
  if(error) console.log("Error:", error.message);
  else console.log("Ledgers:", ledgers);
  
  const { data: groups } = await supabase.from('groups').select('id, name');
  console.log("Groups:", groups);
}
run();
