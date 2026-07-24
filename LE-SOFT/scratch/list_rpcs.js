import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
const supabase = createClient(conf.url, conf.serviceRoleKey || conf.anonKey);

async function run() {
  console.log('Querying Supabase routines...');
  
  // Since we cannot directly query information_schema or pg_catalog through PostgREST usually,
  // let's try a few common RPC names to see if they exist or get specific errors.
  const rpcs = ['run_sql', 'exec_sql', 'execute_sql', 'sql', 'query', 'run_query'];
  for (const rpc of rpcs) {
    try {
      const { error } = await supabase.rpc(rpc, { sql: 'SELECT 1;' });
      if (error) {
        console.log(`RPC ${rpc}: message=${error.message}, code=${error.code}`);
      } else {
        console.log(`RPC ${rpc}: SUCCESS!`);
      }
    } catch (err) {
      console.log(`RPC ${rpc}: threw error:`, err);
    }
  }
}

run().catch(console.error);
