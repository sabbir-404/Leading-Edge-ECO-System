#!/usr/bin/env node
/**
 * LE-SOFT Manuscript PDF Generator — Playwright Electron Edition
 *
 * Usage:  node docs/generate_manuscript_pdf.cjs
 *
 * Uses Playwright's native Electron support to launch the app, log in,
 * screenshot every page, then build a PDF with descriptions.
 */

'use strict';

const { _electron: electron } = require('playwright-core');
const fs   = require('fs');
const path = require('path');
const { buildPDF } = require('./pdf-builder.cjs');
const { execSync } = require('child_process');

// ─── Config ────────────────────────────────────────────────────────────────
const EMAIL    = 'sabbirsuperadmin';
const PASSWORD = 'Brown@8099';
const OUT_DIR  = path.join(__dirname, 'screenshots');
const PDF_OUT  = path.join(__dirname, 'LE-SOFT_Manuscript.pdf');
const ROOT     = path.join(__dirname, '..');
const WAIT     = 2500;

const sleep    = ms => new Promise(r => setTimeout(r, ms));
const sanitise = s => s.replace(/[^a-z0-9]/gi, '_').toLowerCase();

// ─── Pages ─────────────────────────────────────────────────────────────────
const PAGES = [
  { path: '/dashboard', title: 'Dashboard — Overview', description: 'The main landing page after login. Displays key business KPIs including total sales, pending bills, recent transactions, and active users. Charts show daily/weekly revenue trends and quick-access shortcuts to frequently used modules.' },
  { path: '/masters', title: 'Masters Hub', description: 'Central configuration hub with three sections: Accounting (Account Groups, Ledgers, Voucher Types, Currencies), Inventory (Products, Stock Groups, Stock Items, Units, Godowns), and Procurement (Suppliers, Purchase Requisitions).' },
  { path: '/masters/products', title: 'Masters → Products', description: 'Product catalogue listing all items with SKU, category, unit of measurement, stock group, and image. Products are registered here with basic info; pricing and stock are managed through the formal Procurement workflow.' },
  { path: '/masters/products/create', title: 'Masters → Create Product', description: 'Form to register a new product. Fields: Product Name, SKU, Category, HSN/SAC Code, Stock Group, Unit of Measurement, Tax Rate, Description, and optional image. Stock and price are set during Procurement.' },
  { path: '/masters/groups', title: 'Masters → Account Groups', description: 'Manage the chart-of-accounts group hierarchy (Assets, Liabilities, Income, Expenses). Groups classify ledgers and power structured financial reports like Trial Balance and P&L.' },
  { path: '/masters/ledgers', title: 'Masters → Ledgers', description: 'Full chart-of-accounts management. Each ledger belongs to an account group and tracks debit/credit balances. Supplier ledgers (Sundry Creditors) power the Supplier Management module.' },
  { path: '/masters/stock-groups', title: 'Masters → Stock Groups', description: 'Define product groupings for inventory reports (e.g. Furniture, Fabric, Hardware). Stock groups enable batch reporting and structured inventory summaries.' },
  { path: '/masters/units', title: 'Masters → Units of Measurement', description: 'Configure measurement units (Pieces, KG, Metres, Litres, Feet, etc.) with symbol and type. Units are referenced by products and purchase requisition line items.' },
  { path: '/masters/suppliers', title: 'Masters → Supplier Management', description: 'Full supplier directory backed by Sundry Creditors ledger entries. Lists all vendors with contact info, outstanding balance, and payment status. Supports supplier creation, detail view, purchase-bill history, and settlement recording.' },
  { path: '/masters/purchase-requisitions', title: 'Masters → Purchase Requisitions', description: 'Multi-step procurement workflow: Draft → Store Head Review → Audit Approval → Director Approval → Purchased → Received → Completed. Each transition is logged with timestamps. Completing a requisition updates product stock automatically.' },
  { path: '/billing', title: 'Billing / POS', description: 'Point-of-sale billing screen. Create sales bills with multiple line items, apply discounts, select payment methods (Cash, Card, MFS), and print receipts. Integrates with CRM for customer tracking and inventory for stock deduction.' },
  { path: '/billing/history', title: 'Billing → Bill History', description: 'Searchable list of all past sales bills with date, customer, total amount, and payment status. Bills can be viewed, reprinted, or used as a base for returns and alterations.' },
  { path: '/billing/pending-approvals', title: 'Billing → Pending Approvals', description: 'Queue of bills awaiting management approval (large-discount or credit-sale bills). Managers can approve, reject, or request modifications with a full audit trail.' },
  { path: '/quotations', title: 'Quotations', description: 'Manage customer quotations before converting to bills. Supports multi-line items, tax calculation, discount, and PDF preview. Accepted quotations can be converted directly to a sales bill.' },
  { path: '/vouchers', title: 'Vouchers', description: 'Accounting voucher management covering Payment, Receipt, Journal, Contra, and Purchase types. Each voucher posts to the double-entry ledger. Supports date, narration, reference number, and multi-leg entries.' },
  { path: '/reports', title: 'Reports', description: 'Financial and operational reports: Trial Balance, Profit & Loss, Balance Sheet, Day Book, Stock Summary, Market Analysis, and Product History. All support date-range filtering and export to PDF or Excel.' },
  { path: '/hrm', title: 'HRM — Dashboard', description: 'Human Resources Management overview. Shows employee headcount, active leaves, pending payroll, and attendance summary for the current month.' },
  { path: '/hrm/employees', title: 'HRM → Employees', description: 'Full employee directory with profile pictures, role, department, join date, and contact details. Supports adding, editing, and deactivating employee records.' },
  { path: '/hrm/attendance', title: 'HRM → Attendance', description: 'Daily attendance register. Records check-in and check-out times, calculates working hours, and flags late arrivals or absences for each employee.' },
  { path: '/hrm/leaves', title: 'HRM → Leave Management', description: 'Leave application and approval flow. Employees apply for leave; managers approve or reject. Leave balances are tracked per employee with a full history log.' },
  { path: '/hrm/payroll', title: 'HRM → Payroll', description: 'Monthly payroll processing. Calculates gross salary, deductions, bonuses, and net pay per employee. Generates payslips and posts salary entries to the accounting ledger.' },
  { path: '/make/dashboard', title: 'MAKE — Production Dashboard', description: 'Production order management overview. Shows order counts by status (Placed, In Production, Welding, Painting, Ready for Dispatch, Delivered) and lists recent orders with priority indicators.' },
  { path: '/make/place-order', title: 'MAKE → Place Order', description: 'Form to create a new production order linked to a customer bill. Specifies furniture type, designer assignment, dimensions, materials, and delivery deadline.' },
  { path: '/make/track', title: 'MAKE → Track Orders', description: 'Live tracking board for all production orders. Status can be updated inline by the production team. Supports filtering by status, priority, and assigned designer.' },
  { path: '/shipping', title: 'Shipping Dashboard', description: 'Manage outbound deliveries. Links bills to delivery assignments, tracks status (Pending → Dispatched → Delivered), and logs delivery personnel and vehicle info.' },
  { path: '/website', title: 'Website Admin', description: 'Headless CMS for the leadingedge.com.bd WooCommerce website. Manage products, orders, categories, portfolio projects, and newsletter subscribers from the desktop app.' },
  { path: '/users', title: 'User Management', description: 'Manage system users, roles, and access permissions. Create users, assign to groups, and configure granular permission flags for each module (read/write/delete/approve).' },
  { path: '/users/groups', title: 'User Management → Groups', description: 'Define user groups (Super Admin, Manager, Staff, Auditor, Director). Each group has a preset permission template that can be customised per individual user.' },
  { path: '/settings', title: 'Settings', description: 'Application-level settings: company profile, database connection details, theme preference (dark/light), notification settings, and auto-update configuration.' },
  { path: '/email', title: 'Email Campaigns', description: 'Bulk email campaign tool integrated with the newsletter subscriber list. Supports HTML template editing, image blocks, send scheduling, and delivery status tracking.' },
];

// ─── PDF Builder is in ./pdf-builder.cjs ─────────────────────────────────
// (imported at top)
  const objects = [];
  const addObj  = body => { objects.push(body); return objects.length; };
  const F_REG   = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const F_BOLD  = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const esc     = s => s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');

  function wrapText(text, max) {
    const words = text.split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > max) { lines.push(cur.trim()); cur = w; }
      else cur = (cur + ' ' + w).trim();
    }
    if (cur) lines.push(cur.trim());
    return lines;
  }

  // Cover page
  const cover = [
    'BT',
    `/F2 26 Tf 1 0 0 1 ${ML} 580 Tm (LE-SOFT Software Manuscript) Tj`,
    `/F1 13 Tf 1 0 0 1 ${ML} 548 Tm (Leading Edge ECO-System) Tj`,
    `/F1 10 Tf 1 0 0 1 ${ML} 520 Tm (Version 1.3.8  |  ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}) Tj`,
    `/F1 10 Tf 1 0 0 1 ${ML} 490 Tm (A visual walkthrough of every module and page in the LE-SOFT desktop application.) Tj`,
    `/F1 10 Tf 1 0 0 1 ${ML} 475 Tm (Screenshots captured automatically via Playwright Electron automation.) Tj`,
    'ET',
  ].join('\n');
  const coverCId = addObj(`<< /Length ${Buffer.byteLength(cover)} >>\nstream\n${cover}\nendstream`);
  const coverPId = addObj(
    `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${A4W} ${A4H}] ` +
    `/Resources << /Font << /F1 ${F_REG} 0 R /F2 ${F_BOLD} 0 R >> >> /Contents ${coverCId} 0 R >>`
  );
  const pageIds = [coverPId];

  for (const entry of entries) {
    const imgBytes = fs.readFileSync(entry.imagePath);
    const imgId    = objects.length + 1;
    objects.push({ type: 'image', bytes: imgBytes, w: 1440, h: 900 });

    const descLines = wrapText(entry.description, 90);
    const imgY      = A4H - MT - 16 - IH;
    const lines     = [
      'BT',
      `/F2 12 Tf 1 0 0 1 ${ML} ${A4H - MT} Tm (${esc(entry.title)}) Tj`,
      'ET',
      `q ${IW} 0 0 ${IH} ${ML} ${imgY} cm /Im${imgId} Do Q`,
      'BT',
      '/F1 8.5 Tf',
      ...descLines.map((l, i) => `1 0 0 1 ${ML} ${imgY - 18 - i * 12} Tm (${esc(l)}) Tj`),
      'ET',
    ];
    const stream = lines.join('\n');
    const cId    = addObj(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    const pId    = addObj(
      `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${A4W} ${A4H}] ` +
      `/Resources << /Font << /F1 ${F_REG} 0 R /F2 ${F_BOLD} 0 R >> /XObject << /Im${imgId} ${imgId} 0 R >> >> ` +
      `/Contents ${cId} 0 R >>`
    );
    pageIds.push(pId);
  }

  const pagesId   = addObj(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  for (let i = 0; i < objects.length; i++) {
    if (typeof objects[i] === 'string') objects[i] = objects[i].replace(/PAGES_REF/g, `${pagesId} 0 R`);
  }

  const parts = [Buffer.from('%PDF-1.4\n%\xff\xff\xff\xff\n')];
  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(parts.reduce((s, b) => s + b.length, 0));
    const o = objects[i];
    if (o && o.type === 'image') {
      const dict = `<< /Type /XObject /Subtype /Image /Width ${o.w} /Height ${o.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${o.bytes.length} >>`;
      parts.push(Buffer.from(`${i+1} 0 obj\n`), Buffer.from(dict + '\nstream\n'), o.bytes, Buffer.from('\nendstream\nendobj\n'));
    } else {
      parts.push(Buffer.from(`${i+1} 0 obj\n${String(o)}\nendobj\n`));
    }
  }
  const xrefOff = parts.reduce((s,b) => s+b.length, 0);
  let xref = `xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10,'0')} 00000 n \n`;
  parts.push(Buffer.from(xref + `trailer\n<< /Size ${objects.length+1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOff}\n%%EOF\n`));
  return Buffer.concat(parts);
}

// ─── Main ──────────────────────────────────────────────────────────────────
(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Kill any leftover port 5173
  try { execSync('lsof -ti :5173 | xargs kill -9 2>/dev/null', { stdio: 'ignore' }); } catch {}

  // Build Electron bundles
  console.log('⚙️  Building Electron bundles…');
  execSync(
    'npx esbuild electron/main.ts --bundle --platform=node --target=node18 ' +
    '--external:electron --external:better-sqlite3 --external:bcryptjs --external:electron-updater ' +
    '--outfile=core/main.cjs && ' +
    'npx esbuild electron/preload.ts --bundle --platform=node --target=node18 ' +
    '--external:electron --outfile=core/preload.cjs',
    { stdio: 'inherit', cwd: ROOT }
  );

  // Start Vite
  console.log('🌐 Starting Vite…');
  const { spawn } = require('child_process');
  const vite = spawn('npx', ['vite', '--port', '5173'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    try { execSync('curl -s -o /dev/null http://localhost:5173', { stdio: 'ignore' }); break; } catch {}
  }
  console.log('✅ Vite ready');

  // Launch Electron via Playwright
  console.log('🚀 Launching Electron via Playwright…');
  const electronBin = path.join(ROOT, 'node_modules/.bin/electron');

  // Create a temp user-data-dir pre-seeded with the existing license + config
  // so Playwright's Electron session passes the setup screen automatically.
  const realDataDir = path.join(process.env.HOME, 'Library/Application Support/le-soft');
  const tmpDataDir  = path.join(ROOT, '.manuscript-profile');
  if (!fs.existsSync(tmpDataDir)) fs.mkdirSync(tmpDataDir, { recursive: true });

  const filesToCopy = ['license.json', 'supabase-config.json'];
  for (const f of filesToCopy) {
    const src = path.join(realDataDir, f);
    const dst = path.join(tmpDataDir, f);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
      console.log(`📋 Copied ${f} to temp profile`);
    }
  }

  const app = await electron.launch({
    executablePath: electronBin,
    args: ['.', `--user-data-dir=${tmpDataDir}`],
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'development', ELECTRON_ENABLE_LOGGING: '0' },
    timeout: 30000,
  });

  // Get the main window
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1440, height: 900 });

  // Inject localStorage BEFORE React renders — this bypasses setup + login screens
  const supabaseConfig = JSON.parse(
    fs.readFileSync(path.join(realDataDir, 'supabase-config.json'), 'utf8')
  );
  const licenseData = JSON.parse(
    fs.readFileSync(path.join(realDataDir, 'license.json'), 'utf8')
  );

  await win.addInitScript(({ licKey, adminKey, email }) => {
    localStorage.setItem('app_license_key',   licKey);
    localStorage.setItem('supabase_admin_key', adminKey);
    localStorage.setItem('user_role',          'superadmin');
    localStorage.setItem('user_id',            'screenshot-uid-1');
    localStorage.setItem('user_name',          email);
    localStorage.setItem('user_email',         email);
    localStorage.setItem('user_permissions',   JSON.stringify({
      read_billing: true, write_billing: true, delete_billing: true,
      read_make: true, write_make: true, read_hrm: true, write_hrm: true,
      read_reports: true, read_shipping: true, write_shipping: true,
      read_website: true, write_website: true, read_users: true, write_users: true,
      manage_settings: true,
    }));
    localStorage.setItem('user', JSON.stringify({
      id: 'screenshot-uid-1', name: email, role: 'superadmin', group: 'Super Admin', email,
    }));
    localStorage.setItem('theme', 'dark');
  }, {
    licKey:   licenseData.key,
    adminKey: supabaseConfig.serviceRoleKey,
    email:    EMAIL,
  });

  // Reload so the init script fires on the next navigation
  await win.reload();
  await sleep(4000);


  console.log('📍 Current URL:', win.url());
  await sleep(2000);

  // Step 2: inject session keys into the live page and navigate to dashboard
  // This bypasses both setup check and login — ProtectedRoute reads these synchronously.
  console.log('🔐 Injecting session and navigating to dashboard…');
  await win.evaluate(({ licKey, adminKey, email }) => {
    localStorage.setItem('app_license_key',   licKey);
    localStorage.setItem('supabase_admin_key', adminKey);
    localStorage.setItem('user_role',          'superadmin');
    localStorage.setItem('user_id',            'screenshot-uid-1');
    localStorage.setItem('user_name',          email);
    localStorage.setItem('user_email',         email);
    localStorage.setItem('user_permissions',   JSON.stringify({
      read_billing: true, write_billing: true, delete_billing: true,
      read_make: true, write_make: true, read_hrm: true, write_hrm: true,
      read_reports: true, read_shipping: true, write_shipping: true,
      read_website: true, write_website: true, read_users: true, write_users: true,
      manage_settings: true,
    }));
    localStorage.setItem('user', JSON.stringify({
      id: 'screenshot-uid-1', name: email, role: 'superadmin', group: 'Super Admin', email,
    }));
    localStorage.setItem('theme', 'dark');
    // Also set isAppReady-equivalent by calling navigate via React Router history
    window.__MANUSCRIPT_INJECT__ = true;
  }, {
    licKey:   licenseData.key,
    adminKey: supabaseConfig.serviceRoleKey,
    email:    EMAIL,
  });

  // Navigate to dashboard using hash navigation (avoids full page reload that clears localStorage)
  await win.evaluate(() => { window.location.hash = '/dashboard'; });
  await sleep(3500);
  console.log('✅ At:', win.url());

  // Screenshot each page
  const captured = [];
  for (const pg of PAGES) {
    console.log(`📸 ${pg.title}…`);
    try {
      await win.evaluate(p => { window.location.hash = p; }, pg.path);
      await sleep(WAIT + 800);

      // Dismiss modal if open
      const closeBtn = await win.$('[class*="modal"] button[class*="close"], button[aria-label="Close"]');
      if (closeBtn) { await closeBtn.click(); await sleep(300); }

      const filename = `${String(captured.length + 1).padStart(2, '0')}_${sanitise(pg.title)}.jpg`;
      const imgPath  = path.join(OUT_DIR, filename);
      await win.screenshot({ path: imgPath, type: 'jpeg', quality: 88 });
      captured.push({ ...pg, imagePath: imgPath });
      console.log(`   ✅ ${filename}`);
    } catch (err) {
      console.warn(`   ⚠️  Skipped ${pg.path}: ${err.message}`);
    }
  }

  await app.close();
  vite.kill();

  console.log(`\n📄 Building PDF — ${captured.length} pages…`);
  if (captured.length === 0) { console.error('❌ No screenshots captured.'); process.exit(1); }
  fs.writeFileSync(PDF_OUT, buildPDF(captured));
  console.log(`✅ PDF saved → ${PDF_OUT}`);
  console.log(`   Total: ${captured.length + 1} pages (cover + ${captured.length} screenshots)`);
})();
