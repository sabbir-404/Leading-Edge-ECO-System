import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
const supabase = createClient(conf.url, conf.serviceRoleKey || conf.anonKey);

async function run() {
  const { data, error } = await supabase.from('purchase_requisition_items').select('*').limit(1);
  if (error) {
    console.error("Error fetching purchase_requisition_items:", error);
  } else {
    console.log("Keys of purchase_requisition_items:", data.length > 0 ? Object.keys(data[0]) : "No rows");
  }
}
run();
