import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
const supabase = createClient(conf.url, conf.serviceRoleKey || conf.anonKey);

async function run() {
  console.log('Fetching a single product to inspect all its column keys...');
  const { data, error } = await supabase.from('products').select('*').limit(1);
  if (error) {
    console.error('Error fetching product:', error.message);
  } else if (data && data.length > 0) {
    console.log('Product column keys:', Object.keys(data[0]));
  } else {
    console.log('No products found in the database.');
  }
}
run();
