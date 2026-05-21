import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
const supabase = createClient(conf.url, conf.serviceRoleKey || conf.anonKey);

async function run() {
  const { data, error } = await supabase.rpc('get_functions'); // check if get_functions exists
  if (error) {
    console.error('Error fetching functions:', error.message);
  } else {
    console.log('Functions:', data);
  }
}
run();
