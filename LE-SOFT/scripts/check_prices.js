import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
const supabase = createClient(conf.url, conf.serviceRoleKey || conf.anonKey);

async function run() {
  console.log('--- PRODUCTS ---');
  const { data: products } = await supabase.from('products').select('id, name, purchase_price, quantity, product_code');
  console.log(products);

  console.log('--- REQUISITIONS ---');
  const { data: reqs } = await supabase.from('purchase_requisitions').select('id, requisition_number, status, product_id, quantity, supplier_ledger_id');
  console.log(reqs);

  console.log('--- QUOTES ---');
  const { data: quotes } = await supabase.from('purchase_requisition_quotes').select('id, requisition_id, supplier_ledger_id, product_id, unit_price, estimated_price');
  console.log(quotes);
}
run();
