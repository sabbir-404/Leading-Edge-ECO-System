import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
const supabase = createClient(conf.url, conf.serviceRoleKey || conf.anonKey);

async function run() {
  const { data, error } = await supabase.from('purchase_requisitions').select('*').limit(1);
  if (error) {
    console.error('Error fetching requisition:', error);
  } else {
    console.log('Requisition columns:', Object.keys(data[0] || {}));
    console.log('Sample row data:', data[0]);
  }
}
run();
