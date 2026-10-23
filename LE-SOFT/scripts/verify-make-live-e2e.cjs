// Explicitly run against the configured TrueNAS database and storage service.
// Creates uniquely tagged test rows and encrypted files, then removes them.
// Credentials are read from the ignored local environment file/config and never printed.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function readEnvValue(file, name) {
  if (!fs.existsSync(file)) return '';
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find(row => new RegExp(`^\\s*${name}\\s*=`).test(row));
  if (!line) return '';
  return line.slice(line.indexOf('=') + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
}

const root = path.resolve(__dirname, '..');
const appData = process.env.APPDATA || '';
const config = JSON.parse(fs.readFileSync(path.join(appData, 'supabase-config.json'), 'utf8'));
const token = readEnvValue(path.join(root, '.env.local'), 'NAS_JWT_TOKEN');
const databaseUrl = String(config.nasUrl || 'http://100.88.85.6:3001').replace(/\/$/, '');
const storageUrl = String(config.nasStorageUrl || 'http://100.88.85.6:8081').replace(/\/$/, '');
const apiKey = config.nasAnonKey || config.anonKey;
if (!token || !apiKey) throw new Error('NAS test credentials are not configured in ignored local files.');

const runId = `LE-VERIFY-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${crypto.randomBytes(4).toString('hex')}`;
const storageFolder = `integration-verification/${runId.toLowerCase()}`;
const created = { requestId: null, itemId: null, productId: null, orderId: null, paymentId: null, files: [] };
const passed = [];

async function request(base, endpoint, method = 'GET', payload, extraHeaders = {}) {
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...extraHeaders
  };
  const options = { method, headers, signal: AbortSignal.timeout(20000) };
  if (payload !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers.Prefer = 'return=representation';
    options.body = JSON.stringify(payload);
  }
  const response = await fetch(`${base}/${endpoint}`, options);
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    const detail = data?.message || data?.error || response.statusText;
    throw new Error(`${method} ${endpoint.split('?')[0]} failed (${response.status}): ${detail}`);
  }
  return data;
}

async function db(table, method = 'GET', payload, query = '') {
  return request(databaseUrl, `${table}${query ? `?${query}` : ''}`, method, payload);
}

async function upload(name, bytes, mime) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), name);
  const response = await fetch(`${storageUrl}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Subfolder': storageFolder },
    body: form,
    signal: AbortSignal.timeout(30000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(`NAS media upload failed (${response.status}).`);
  const relativePath = result.urlPath || `${storageFolder}/${name}`;
  created.files.push(relativePath);
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
  const fileUrl = `${storageUrl}/files/${encodedPath}`;
  const authorizedRead = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000)
  });
  const downloaded = Buffer.from(await authorizedRead.arrayBuffer());
  await check(authorizedRead.ok && downloaded.equals(bytes), `${name} decrypts and downloads byte-for-byte`);
  const anonymousRead = await fetch(fileUrl, { signal: AbortSignal.timeout(15000) });
  await check(anonymousRead.status === 401, `${name} remains inaccessible without NAS authorization`);
  return result.url || fileUrl;
}

async function check(condition, label) {
  if (!condition) throw new Error(`Verification failed: ${label}`);
  passed.push(label);
}

async function makePdf() {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('LE-SOFT isolated costing and order verification', { x: 50, y: 720, size: 16, font, color: rgb(0.15, 0.2, 0.3) });
  page.drawText(`Test marker: ${runId}`, { x: 50, y: 690, size: 10, font });
  return Buffer.from(await pdf.save());
}

async function cleanup() {
  const failures = [];
  for (const [id, table] of [[created.orderId, 'make_orders'], [created.productId, 'make_products'], [created.requestId, 'make_costing_requests']]) {
    if (!id) continue;
    try { await db(table, 'DELETE', undefined, `id=eq.${encodeURIComponent(id)}`); }
    catch (error) { failures.push(`${table}: ${error.message}`); }
    try {
      const remaining = await db(table, 'GET', undefined, `id=eq.${encodeURIComponent(id)}&select=id`);
      if (remaining?.length) failures.push(`${table} test record remains after deletion`);
    } catch (error) { failures.push(`${table} deletion verification: ${error.message}`); }
  }
  if (created.itemId) {
    try {
      const remaining = await db('make_costing_request_items', 'GET', undefined, `id=eq.${encodeURIComponent(created.itemId)}&select=id`);
      if (remaining?.length) {
        await db('make_costing_request_items', 'DELETE', undefined, `id=eq.${encodeURIComponent(created.itemId)}`);
        const afterDelete = await db('make_costing_request_items', 'GET', undefined, `id=eq.${encodeURIComponent(created.itemId)}&select=id`);
        if (afterDelete?.length) failures.push('make_costing_request_items test record remains after deletion');
      }
    } catch (error) { failures.push(`make_costing_request_items deletion verification: ${error.message}`); }
  }
  if (created.paymentId) {
    try {
      const remaining = await db('make_order_payments', 'GET', undefined, `id=eq.${encodeURIComponent(created.paymentId)}&select=id`);
      if (remaining?.length) {
        await db('make_order_payments', 'DELETE', undefined, `id=eq.${encodeURIComponent(created.paymentId)}`);
        const afterDelete = await db('make_order_payments', 'GET', undefined, `id=eq.${encodeURIComponent(created.paymentId)}&select=id`);
        if (afterDelete?.length) failures.push('make_order_payments test record remains after deletion');
      }
    } catch (error) { failures.push(`make_order_payments deletion verification: ${error.message}`); }
  }
  for (const filePath of created.files) {
    try {
      const response = await fetch(`${storageUrl}/delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok && response.status !== 404) failures.push(`storage file cleanup returned ${response.status}`);
      const verify = await fetch(`${storageUrl}/files/${filePath.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'HEAD', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000)
      });
      if (verify.status !== 404) failures.push(`storage test file cleanup verification returned ${verify.status}`);
    } catch (error) { failures.push(`storage file cleanup: ${error.message}`); }
  }
  if (failures.length) throw new Error(`Test cleanup incomplete: ${failures.join('; ')}`);
}

async function main() {
  const image = fs.readFileSync(path.join(root, 'public', 'logo-black.png'));
  const pdf = await makePdf();
  const [imageUrl, pdfUrl] = await Promise.all([
    upload('reference-image.png', image, 'image/png'),
    upload('production-blueprint.pdf', pdf, 'application/pdf')
  ]);
  await check(imageUrl.includes('/files/') && pdfUrl.includes('/files/'), 'image and PDF upload to protected NAS storage');

  const requestRows = await db('make_costing_requests', 'POST', {
    request_number: runId,
    requester_name: 'LE-SOFT automated integration verification',
    customer_name: 'TEST ONLY — automatic cleanup',
    customer_phone: '0000000000',
    remarks: 'Temporary integration verification; safe to remove.',
    file_urls: [pdfUrl],
    status: 'submitted'
  });
  created.requestId = requestRows?.[0]?.id;
  await check(!!created.requestId, 'create requestion with request-wide PDF');

  const itemRows = await db('make_costing_request_items', 'POST', {
    request_id: created.requestId,
    item_name: 'Integration verification furniture item',
    quantity: 2,
    remarks: 'Test-only product remarks',
    file_urls: [imageUrl],
    status: 'submitted'
  });
  created.itemId = itemRows?.[0]?.id;
  await check(!!created.itemId, 'create requestion item with image attachment');

  const priced = await db('make_costing_request_items', 'PATCH', {
    product_name: 'Integration Verification Sample Table',
    product_code: `${runId}-P`,
    cost_price: 800,
    sale_price: 1200,
    product_image: imageUrl,
    blueprint_url: pdfUrl,
    product_drawing_url: pdfUrl,
    designer_notes: 'Temporary pricing and drawing verification.',
    status: 'priced'
  }, `id=eq.${created.itemId}`);
  await check(priced?.length === 1 && Number(priced[0].sale_price) === 1200, 'designer pricing and product drawings save');

  const productRows = await db('make_products', 'POST', {
    product_code: `${runId}-P`,
    product_name: 'Integration Verification Sample Table',
    description: `Created from ${runId}`,
    main_image: imageUrl,
    blueprint_url: pdfUrl,
    product_drawing_url: pdfUrl,
    cost_price: 800,
    sale_price: 1200,
    is_active: true,
    requestion_item_id: created.itemId,
    created_by: 'LE-SOFT automated integration verification'
  });
  created.productId = productRows?.[0]?.id;
  await check(!!created.productId, 'priced requestion item creates linked catalog product');
  await db('make_costing_request_items', 'PATCH', { product_id: created.productId }, `id=eq.${created.itemId}`);
  await db('make_costing_requests', 'PATCH', { status: 'priced' }, `id=eq.${created.requestId}`);

  const orders = await db('make_orders', 'POST', {
    furniture_name: 'Integration Verification Sample Table',
    description: `Temporary end-to-end order for ${runId}`,
    quantity: 2,
    designer_name: 'LE-SOFT integration verification',
    status: 'Placed',
    priority: 'Normal',
    customer_name: 'TEST ONLY — automatic cleanup',
    customer_phone: '0000000000',
    current_stage: 'Placed',
    current_version: 1,
    approval_status: 'pending',
    cost_price: 800,
    sale_price: 1200,
    total_price: 2400,
    final_price: 2400,
    money_received: 0,
    amount_due: 2400,
    payment_status: 'unpaid',
    production_hold: true,
    hold_reason: 'Temporary integration verification balance.',
    created_by: 'LE-SOFT automated integration verification'
  });
  created.orderId = orders?.[0]?.id;
  await check(!!created.orderId, 'place order with an outstanding balance and production hold');

  const orderItems = await db('make_order_items', 'POST', {
    order_id: created.orderId,
    product_id: created.productId,
    product_name: 'Integration Verification Sample Table',
    quantity: 2,
    item_cost_price: 800,
    item_sale_price: 1200,
    requestion_item_id: created.itemId,
    technical_drawing_url: pdfUrl,
    pdf_urls: [pdfUrl],
    designer_notes: 'Test-only order item'
  });
  await check(!!orderItems?.[0]?.id, 'attach requestion catalog item and production PDF to order');

  const heldOrder = await db('make_orders', 'GET', undefined, `id=eq.${created.orderId}&select=id,amount_due,payment_status,production_hold`);
  await check(Number(heldOrder?.[0]?.amount_due) === 2400 && heldOrder?.[0]?.production_hold === true, 'track order reads unpaid balance and production hold');
  const paymentRows = await db('make_order_payments', 'POST', {
    order_id: created.orderId,
    amount: 2400,
    payment_method: 'CASH',
    reference: `${runId}-PAYMENT`,
    notes: 'Temporary end-to-end payment clearance verification.',
    received_by: 'LE-SOFT automated integration verification'
  });
  created.paymentId = paymentRows?.[0]?.id;
  await check(!!created.paymentId, 'record payment in the order payment ledger');
  await db('make_orders', 'PATCH', {
    money_received: 2400,
    amount_due: 0,
    payment_status: 'paid',
    production_hold: false,
    hold_reason: null
  }, `id=eq.${created.orderId}`);
  const clearedOrder = await db('make_orders', 'GET', undefined, `id=eq.${created.orderId}&select=id,amount_due,payment_status,production_hold`);
  const paymentRead = await db('make_order_payments', 'GET', undefined, `id=eq.${created.paymentId}&select=id,order_id,amount`);
  await check(Number(clearedOrder?.[0]?.amount_due) === 0 && clearedOrder?.[0]?.payment_status === 'paid' && clearedOrder?.[0]?.production_hold === false, 'payment clears the order due balance and production hold');
  await check(paymentRead?.[0]?.order_id === created.orderId && Number(paymentRead?.[0]?.amount) === 2400, 'track order reads the recorded payment against its order');

  const stageRows = await db('make_order_updates', 'POST', {
    order_id: created.orderId,
    status: 'Work in process',
    stage: 'Work in process',
    note: 'Temporary stage-photo integration verification.',
    updated_by: 'LE-SOFT automated integration verification',
    actor_name: 'LE-SOFT integration verification',
    actor_role: 'factory_manager',
    photo_url: imageUrl,
    photo_urls: [imageUrl]
  });
  await check(!!stageRows?.[0]?.id, 'factory stage update accepts attached image and remarks');
  await db('make_orders', 'PATCH', { current_stage: 'Work in process', current_stage_photo: imageUrl }, `id=eq.${created.orderId}`);

  const orderRead = await db('make_orders', 'GET', undefined, `id=eq.${created.orderId}&select=id,current_stage,current_stage_photo,amount_due`);
  const itemRead = await db('make_order_items', 'GET', undefined, `order_id=eq.${created.orderId}&select=id,quantity,technical_drawing_url,requestion_item_id`);
  await check(orderRead?.[0]?.current_stage === 'Work in process' && Number(orderRead?.[0]?.amount_due) === 0, 'track order reads current production stage and cleared balance');
  await check(itemRead?.length === 1 && itemRead[0].technical_drawing_url === pdfUrl, 'track order reads item, requestion link, and PDF');

  await db('make_orders', 'PATCH', { quantity: 3, special_instructions: 'Altered in isolated integration test.' }, `id=eq.${created.orderId}`);
  await db('make_order_items', 'PATCH', { quantity: 3 }, `order_id=eq.${created.orderId}`);
  await db('make_products', 'PATCH', { sale_price: 1250 }, `id=eq.${created.productId}`);
  const altered = await db('make_orders', 'GET', undefined, `id=eq.${created.orderId}&select=id,quantity,special_instructions`);
  const alteredItem = await db('make_order_items', 'GET', undefined, `order_id=eq.${created.orderId}&select=id,quantity`);
  const alteredProduct = await db('make_products', 'GET', undefined, `id=eq.${created.productId}&select=id,sale_price,requestion_item_id`);
  await check(Number(altered?.[0]?.quantity) === 3 && Number(alteredItem?.[0]?.quantity) === 3 && Number(alteredProduct?.[0]?.sale_price) === 1250, 'order quantity and catalog price alter successfully');
}

main()
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => {
    try { await cleanup(); } catch (error) { console.error(error.message); process.exitCode = 1; }
    if (!process.exitCode) console.log(`PASS: ${passed.length} MAKE live checks; requestion, catalog, paid order, stage image, alteration, and cleanup completed.`);
  });
