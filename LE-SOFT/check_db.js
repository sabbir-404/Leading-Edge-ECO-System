import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
let url, key;
if (fs.existsSync(userEnvPath)) {
  const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
  url = conf.url;
  key = conf.serviceRoleKey || conf.anonKey;
}

if(!url) { console.error("No url"); process.exit(1); }
const supabase = createClient(url, key);

async function run() {
  console.log("Applying RLS policy migration via run_sql...");
  const sql = `
    ALTER TABLE purchase_requisition_quotes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow anon full access to purchase_requisition_quotes" ON purchase_requisition_quotes;
    CREATE POLICY "Allow anon full access to purchase_requisition_quotes"
        ON purchase_requisition_quotes FOR ALL USING (true) WITH CHECK (true);
    NOTIFY pgrst, 'reload schema';
  `;

  const { error: sqlErr } = await supabase.rpc('run_sql', { sql });
  if (sqlErr) {
    console.error("SQL Migration Error:", sqlErr);
    return;
  }
  console.log("SQL Migration applied successfully.");

  const testQuote = {
    requisition_id: 'b64a00c2-b937-4818-b365-2d1c0a5256b8', // valid REQ-20260522-0002 ID
    supplier_ledger_id: 11, // lets check if a ledger ID exists, or use null
    estimated_price: 100,
    remarks: 'Test insertion'
  };

  console.log("Attempting insert with basic fields...");
  const { data, error } = await supabase
    .from('purchase_requisition_quotes')
    .insert(testQuote)
    .select();

  if (error) {
    console.error("Basic insert error:", error);
  } else {
    console.log("Basic insert success:", data);
  }

  const testQuoteWithNewFields = {
    requisition_id: 'b64a00c2-b937-4818-b365-2d1c0a5256b8',
    supplier_ledger_id: 11,
    estimated_price: 100,
    unit_price: 10,
    product_id: 1, // product ID integer
    remarks: 'Test insertion with new fields'
  };

  console.log("Attempting insert with product_id and unit_price...");
  const { data: data2, error: error2 } = await supabase
    .from('purchase_requisition_quotes')
    .insert(testQuoteWithNewFields)
    .select();

  if (error2) {
    console.error("New fields insert error:", error2);
  } else {
    console.log("New fields insert success:", data2);
  }
}
run();
