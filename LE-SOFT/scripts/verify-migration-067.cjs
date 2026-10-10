const { createClient } = require('@supabase/supabase-js');
const http = require('http');

const SUPABASE_URL = 'https://ildkkgjrolcjijwfokek.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzMzMjQsImV4cCI6MjA4NzUwOTMyNH0.Bn6c-87BOumPXyH5F469P04fQSMnI9SjNDZAwgGyTsM';

function queryPostgrest(path, options = {}) {
  return new Promise((resolve) => {
    const url = new URL(path, 'http://100.88.85.6:3001');
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...(options.headers || {})
      },
      timeout: 5000
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });

    req.on('error', (err) => resolve({ error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function verifyLiveDatabases() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('1. VERIFYING TRUENAS POSTGREST (http://100.88.85.6:3001)');
  console.log('═══════════════════════════════════════════════════════════════════');

  // Check Swagger definition for make_order_items columns and nas_client_registry
  const swagger = await queryPostgrest('/');
  let nasHasRegistry = false;
  let nasHasOrderItemsCols = false;
  if (swagger.data && swagger.data.definitions) {
    const defs = Object.keys(swagger.data.definitions);
    nasHasRegistry = defs.includes('nas_client_registry');
    console.log('Has nas_client_registry table in PostgREST?', nasHasRegistry);
    if (swagger.data.definitions['make_order_items']) {
      const itemProps = Object.keys(swagger.data.definitions['make_order_items'].properties || {});
      const hasSpec = itemProps.includes('spec_details');
      const hasSize = itemProps.includes('custom_size');
      const hasDim = itemProps.includes('dimensions_text');
      nasHasOrderItemsCols = hasSpec && hasSize && hasDim;
      console.log('make_order_items has spec_details?', hasSpec);
      console.log('make_order_items has custom_size?', hasSize);
      console.log('make_order_items has dimensions_text?', hasDim);
    }
  } else {
    console.log('Swagger definition fetch response:', swagger.status, swagger.error || 'no defs');
  }

  // Check querying nas_client_registry on NAS
  const nasRegistryQuery = await queryPostgrest('/nas_client_registry?limit=1');
  console.log('/nas_client_registry status:', nasRegistryQuery.status, nasHasRegistry ? 'EXISTS' : 'NOT APPLIED (404/42P01)');

  // Check querying make_order_items with spec_details, custom_size, dimensions_text on NAS
  const nasOrderItemsQuery = await queryPostgrest('/make_order_items?select=id,product_name,spec_details,custom_size,dimensions_text&limit=1');
  console.log('/make_order_items select migration 067 columns status:', nasOrderItemsQuery.status, nasHasOrderItemsCols ? 'EXISTS' : 'NOT APPLIED (400/42703)');

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('2. VERIFYING SUPABASE CLOUD (https://ildkkgjrolcjijwfokek.supabase.co)');
  console.log('═══════════════════════════════════════════════════════════════════');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Check querying nas_client_registry on Cloud
  const { data: cloudRegistry, error: cloudRegErr } = await supabase
    .from('nas_client_registry')
    .select('installation_id, app_version, session_status, connection_state, lease_expires_at')
    .limit(1);
  console.log('Cloud nas_client_registry query:', { error: cloudRegErr?.message, status: cloudRegErr ? 'FAIL' : 'PASS', rowCount: cloudRegistry?.length });

  // Check querying make_order_items with migration 067 columns on Cloud
  const { data: cloudItems, error: cloudItemErr } = await supabase
    .from('make_order_items')
    .select('id, product_name, spec_details, custom_size, dimensions_text')
    .limit(1);
  console.log('Cloud make_order_items migration 067 columns query:', { error: cloudItemErr?.message, status: cloudItemErr ? 'FAIL' : 'PASS', sample: cloudItems });

  // Safe CRUD test on nas_client_registry on Cloud
  const testId = `test-verify-${Date.now()}`;
  console.log('\nTesting safe CRUD on Cloud nas_client_registry with id:', testId);
  const leaseExpiry = new Date(Date.now() + 45000).toISOString();
  const { data: insertData, error: insertErr } = await supabase
    .from('nas_client_registry')
    .insert({
      installation_id: testId,
      app_version: '1.8.11',
      session_status: 'active',
      connection_state: 'connected',
      lease_expires_at: leaseExpiry,
      metadata: { runner: 'verification' }
    })
    .select();
  console.log('Cloud insert result:', { error: insertErr?.message, success: !insertErr });

  if (insertData && insertData.length > 0) {
    // Read
    const { data: readData, error: readErr } = await supabase
      .from('nas_client_registry')
      .select('*')
      .eq('installation_id', testId);
    console.log('Cloud read result:', readData?.[0]?.installation_id === testId ? 'OK' : 'MISMATCH', readErr?.message || '');

    // Update
    const { error: updateErr } = await supabase
      .from('nas_client_registry')
      .update({ session_status: 'reconnecting', connection_state: 'degraded' })
      .eq('installation_id', testId);
    console.log('Cloud update result:', updateErr ? updateErr.message : 'OK');

    // Delete
    const { error: deleteErr } = await supabase
      .from('nas_client_registry')
      .delete()
      .eq('installation_id', testId);
    console.log('Cloud delete result:', deleteErr ? deleteErr.message : 'OK (Cleaned)');
  }
}

verifyLiveDatabases().catch(console.error);
