import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
const supabase = createClient(conf.url, conf.serviceRoleKey || conf.anonKey);

async function run() {
  const variants = ['exec_sql', 'execute_sql', 'run_sql', 'exec', 'sql', 'query'];
  for (const variant of variants) {
    try {
      const { error } = await supabase.rpc(variant, { sql: 'SELECT 1;', query: 'SELECT 1;' });
      if (error) {
        console.log(`Variant ${variant} returned error:`, error.message);
      } else {
        console.log(`Variant ${variant} executed successfully!`);
        return;
      }
    } catch (e) {
      console.log(`Variant ${variant} threw error:`, e.message);
    }
  }
}
run();
