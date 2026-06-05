import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
const supabase = createClient(conf.url, conf.serviceRoleKey || conf.anonKey);

// Run each statement separately via rpc if possible, else fall back to direct API calls
async function run() {
  console.log('Step 1: Creating purchase_requisition_quotes table...');
  const { error: e1 } = await supabase.rpc('exec_sql', { sql: `
    CREATE TABLE IF NOT EXISTS purchase_requisition_quotes (
      id SERIAL PRIMARY KEY,
      requisition_id UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
      supplier_ledger_id INTEGER REFERENCES ledgers(id) ON DELETE SET NULL,
      estimated_price NUMERIC(12, 2) NOT NULL,
      remarks TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
    )
  `});
  if (e1) console.error('Step 1 error (may require manual SQL):', e1.message);
  else console.log('Step 1 OK');

  console.log('Step 2: Adding new columns to purchase_requisitions...');
  const { error: e2 } = await supabase.rpc('exec_sql', { sql: `
    ALTER TABLE purchase_requisitions
      ADD COLUMN IF NOT EXISTS purchase_invoice_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS purchased_quantity INTEGER,
      ADD COLUMN IF NOT EXISTS purchase_remarks TEXT
  `});
  if (e2) console.error('Step 2 error:', e2.message);
  else console.log('Step 2 OK');

  console.log('Step 3: Updating status constraint...');
  const { error: e3 } = await supabase.rpc('exec_sql', { sql: `
    ALTER TABLE purchase_requisitions DROP CONSTRAINT IF EXISTS purchase_requisitions_status_check;
    ALTER TABLE purchase_requisitions ADD CONSTRAINT purchase_requisitions_status_check 
      CHECK (status IN ('DRAFT','PENDING_ESTIMATE','PENDING_AUDIT','PENDING_DIRECTOR','APPROVED','PURCHASED','RECEIVED','COMPLETED','REJECTED'))
  `});
  if (e3) console.error('Step 3 error:', e3.message);
  else console.log('Step 3 OK');

  console.log('Step 4: Reload schema cache...');
  const { error: e4 } = await supabase.rpc('exec_sql', { sql: `NOTIFY pgrst, 'reload schema'` });
  if (e4) console.error('Step 4 error:', e4.message);
  else console.log('Step 4 OK');
}
run();
