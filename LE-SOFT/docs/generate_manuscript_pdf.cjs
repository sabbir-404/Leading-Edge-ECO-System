#!/usr/bin/env node
/**
 * LE-SOFT Manuscript PDF Generator
 * Uses Puppeteer to screenshot every app page and builds a PDF with descriptions.
 *
 * Usage:
 *   node docs/generate_manuscript_pdf.cjs
 *
 * Prerequisites:
 *   - App running on http://localhost:5173 (npm run dev)
 *   - Valid login credentials below
 */

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

// ─── Config ────────────────────────────────────────────────────────────────
const BASE_URL   = 'http://localhost:5173';
const EMAIL      = 'sabbirsuperadmin';   // change if needed
const PASSWORD   = 'your-password';      // change to real password
const OUT_DIR    = path.join(__dirname, 'screenshots');
const PDF_OUT    = path.join(__dirname, 'LE-SOFT_Manuscript.pdf');
const WAIT       = 1800; // ms to wait after navigation

// ─── Page catalogue ────────────────────────────────────────────────────────
const PAGES = [
  {
    path: '/dashboard',
    title: 'Dashboard — Overview',
    description:
      'The main landing page after login. Displays key business KPIs including total sales, ' +
      'pending bills, recent transactions, active users, and quick-access shortcuts to the ' +
      'most frequently used modules. Charts show daily/weekly revenue trends.',
  },
  {
    path: '/masters',
    title: 'Masters Hub',
    description:
      'Central configuration hub organised into three sections: Accounting (Account Groups, ' +
      'Ledgers, Voucher Types, Currencies), Inventory (Products, Stock Groups, Stock Items, ' +
      'Units, Godowns), and Procurement (Suppliers, Purchase Requisitions). Each card ' +
      'navigates directly to the corresponding management page.',
  },
  {
    path: '/masters/products',
    title: 'Masters → Products',
    description:
      'Product catalogue listing all items in the system with SKU, category, unit of ' +
      'measurement, stock group, and image. Supports search and export. Products are ' +
      'created here with basic info; pricing and stock levels are managed via Procurement.',
  },
  {
    path: '/masters/products/create',
    title: 'Masters → Create Product',
    description:
      'Form to register a new product. Fields: Product Name, SKU/Item Code, Category, ' +
      'HSN/SAC Code, Stock Group, Unit of Measurement, Tax Rate, Description, and an ' +
      'optional product image. Purchase price, selling price, and stock are intentionally ' +
      'excluded here — they are set through the formal Procurement workflow.',
  },
  {
    path: '/masters/groups',
    title: 'Masters → Account Groups',
    description:
      'Manage the chart-of-accounts group hierarchy (Assets, Liabilities, Income, Expense ' +
      'etc.). Groups are used to classify ledgers and generate structured financial reports.',
  },
  {
    path: '/masters/ledgers',
    title: 'Masters → Ledgers',
    description:
      'Full ledger/chart-of-accounts management. Each ledger belongs to an account group ' +
      'and tracks debit/credit balances. Supplier ledgers (Sundry Creditors) power the ' +
      'Supplier Management module.',
  },
  {
    path: '/masters/stock-groups',
    title: 'Masters → Stock Groups',
    description:
      'Define product groupings for inventory reports (e.g., Furniture, Fabric, Hardware). ' +
      'Stock groups allow batch reporting and price-list management.',
  },
  {
    path: '/masters/units',
    title: 'Masters → Units of Measurement',
    description:
      'Configure units (Pieces, KG, Metres, Litres, etc.) with symbol and type. ' +
      'Units are referenced by products and purchase requisition line items.',
  },
  {
    path: '/masters/suppliers',
    title: 'Masters → Supplier Management',
    description:
      'Full supplier directory backed by Sundry Creditors ledger entries. Lists all ' +
      'vendors with contact info, outstanding balance, and payment status. Supports ' +
      'inline supplier creation, detail view, purchase-bill history, and settlement recording.',
  },
  {
    path: '/masters/purchase-requisitions',
    title: 'Masters → Purchase Requisitions',
    description:
      'Multi-step procurement workflow: Draft → Store Head Review → Audit Approval → ' +
      'Director Approval → Purchased → Received → Completed. Each transition is logged ' +
      'with timestamps and notes. Completing a requisition updates product stock automatically.',
  },
  {
    path: '/billing',
    title: 'Billing / POS',
    description:
      'Point-of-sale billing screen. Allows creating sales bills with multiple line items, ' +
      'applying discounts, selecting payment methods (Cash, Card, MFS), and printing receipts. ' +
      'Integrates with CRM for customer tracking and with inventory for stock deduction.',
  },
  {
    path: '/billing/history',
    title: 'Billing → Bill History',
    description:
      'Searchable list of all past sales bills with date, customer, total amount, and ' +
      'payment status. Bills can be viewed, reprinted, or used as a base for returns/alterations.',
  },
  {
    path: '/billing/pending-approvals',
    title: 'Billing → Pending Approvals',
    description:
      'Queue of bills awaiting management approval (e.g., large-discount bills or ' +
      'credit-sale bills). Managers can approve, reject, or request modifications.',
  },
  {
    path: '/quotations',
    title: 'Quotations',
    description:
      'Manage customer quotations before converting to bills. Supports multi-line items, ' +
      'tax calculation, discount, and PDF preview. Quotations can be accepted and ' +
      'converted directly to a sales bill.',
  },
  {
    path: '/vouchers',
    title: 'Vouchers',
    description:
      'Accounting voucher management (Payment, Receipt, Journal, Contra, Purchase). ' +
      'Each voucher posts to the double-entry ledger. Supports date, narration, ' +
      'reference number, and multi-leg entries.',
  },
  {
    path: '/reports',
    title: 'Reports',
    description:
      'Financial and operational reports: Trial Balance, Profit & Loss, Balance Sheet, ' +
      'Day Book, Stock Summary, Market Analysis, and Product History. All reports support ' +
      'date-range filtering and can be exported to PDF or Excel.',
  },
  {
    path: '/hrm',
    title: 'HRM — Dashboard',
    description:
      'Human Resources Management overview. Shows employee headcount, active leaves, ' +
      'pending payroll, and attendance summary for the current month.',
  },
  {
    path: '/hrm/employees',
    title: 'HRM → Employees',
    description:
      'Full employee directory with profile pictures, role, department, join date, ' +
      'and contact details. Supports add, edit, and deactivation of employee records.',
  },
  {
    path: '/hrm/attendance',
    title: 'HRM → Attendance',
    description:
      'Daily attendance register. Records check-in and check-out times, calculates ' +
      'working hours, and flags late arrivals or absences.',
  },
  {
    path: '/hrm/leaves',
    title: 'HRM → Leave Management',
    description:
      'Leave application and approval flow. Employees can apply for leave; managers ' +
      'approve or reject. Leave balances are tracked per employee.',
  },
  {
    path: '/hrm/payroll',
    title: 'HRM → Payroll',
    description:
      'Monthly payroll processing. Calculates gross salary, deductions, bonuses, and ' +
      'net pay per employee. Generates payslips and posts salary entries to the ledger.',
  },
  {
    path: '/make/dashboard',
    title: 'MAKE — Production Dashboard',
    description:
      'Production order management overview. Shows counts by status (Placed, In Production, ' +
      'Welding, Painting, Ready for Dispatch, Delivered) and lists recent orders with ' +
      'priority indicators.',
  },
  {
    path: '/make/place-order',
    title: 'MAKE → Place Order',
    description:
      'Form to create a new production/make order linked to a customer bill. Specifies ' +
      'furniture type, designer assignment, dimensions, materials, and delivery deadline.',
  },
  {
    path: '/make/track',
    title: 'MAKE → Track Orders',
    description:
      'Live tracking board for all production orders. Status can be updated inline ' +
      'by the production team. Supports filtering by status, priority, and designer.',
  },
  {
    path: '/shipping',
    title: 'Shipping Dashboard',
    description:
      'Manage outbound deliveries. Links bills to delivery assignments, tracks delivery ' +
      'status (Pending → Dispatched → Delivered), and logs delivery personnel and vehicle.',
  },
  {
    path: '/website',
    title: 'Website Admin',
    description:
      'Headless CMS for the leadingedge.com.bd WooCommerce website. Manage products, ' +
      'orders, categories, projects/portfolio, and newsletter subscribers directly from ' +
      'the desktop app via the Hostinger API.',
  },
  {
    path: '/users',
    title: 'User Management',
    description:
      'Manage system users, roles, and access permissions. Supports creating users, ' +
      'assigning to groups, and configuring granular permission flags for each module ' +
      '(read/write/delete/approve).',
  },
  {
    path: '/users/groups',
    title: 'User Management → Groups',
    description:
      'Define user groups (Super Admin, Manager, Staff, Auditor, Director etc.). ' +
      'Each group has a preset permission template that can be customised per user.',
  },
  {
    path: '/settings',
    title: 'Settings',
    description:
      'Application-level settings: company profile, database connection (Supabase URL ' +
      'and keys), theme preference (dark/light), notification settings, and auto-update ' +
      'configuration.',
  },
  {
    path: '/email',
    title: 'Email Campaigns',
    description:
      'Bulk email campaign tool integrated with the newsletter subscriber list. ' +
      'Supports HTML template editing, image blocks, scheduling, and delivery status tracking.',
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function sanitiseFilename(str) {
  return str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

// ─── PDF builder (pure JS, no external PDF lib needed) ────────────────────
function buildPDF(entries) {
  // Each entry: { title, description, imagePath }
  const A4W = 595, A4H = 842;
  const ML = 40, MR = 40, MT = 44, MB = 44;
  const IW = A4W - ML - MR;   // image width
  const IH = 340;              // image height inside page

  const objects  = [];
  const addObj   = body => { objects.push(body); return objects.length; };

  // Font objects
  const F_REG  = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const F_BOLD = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  const escStr = s => s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');

  function wrapText(text, maxChars) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
      else cur = (cur + ' ' + w).trim();
    }
    if (cur) lines.push(cur.trim());
    return lines;
  }

  // ── Cover page ──────────────────────────────────────────────────────────
  const coverContent = [
    'BT',
    `/F2 28 Tf  1 0 0 1 ${ML} 580 Tm  (LE-SOFT) Tj`,
    `/F1 14 Tf  1 0 0 1 ${ML} 545 Tm  (Leading Edge ECO-System — Software Manual) Tj`,
    `/F1 10 Tf  1 0 0 1 ${ML} 510 Tm  (Version 1.3.8  |  ${new Date().toLocaleDateString('en-GB', {year:'numeric',month:'long',day:'numeric'})}) Tj`,
    `/F1 10 Tf  1 0 0 1 ${ML} 480 Tm  (This document provides a visual walkthrough of every module) Tj`,
    `/F1 10 Tf  1 0 0 1 ${ML} 465 Tm  (and page in the LE-SOFT desktop application.) Tj`,
    'ET',
  ].join('\n');
  const coverContentId = addObj(`<< /Length ${Buffer.byteLength(coverContent)} >>\nstream\n${coverContent}\nendstream`);
  const coverPageId    = addObj(
    `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${A4W} ${A4H}] ` +
    `/Resources << /Font << /F1 ${F_REG} 0 R /F2 ${F_BOLD} 0 R >> >> ` +
    `/Contents ${coverContentId} 0 R >>`
  );

  const pageObjIds = [coverPageId];

  // ── One page per screenshot ──────────────────────────────────────────────
  for (const entry of entries) {
    const imgBytes = fs.readFileSync(entry.imagePath);
    const imgObjId = addObj(
      `<< /Type /XObject /Subtype /Image /Width 1440 /Height 900 ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
      `/Length ${imgBytes.length} >>\nstream\n`
    );
    // We'll store raw bytes separately — handled in final serialisation
    objects[imgObjId - 1] = { type: 'image', bytes: imgBytes, width: 1440, height: 900 };

    // Description text lines
    const descLines = wrapText(entry.description, 85);
    let   streamLines = [
      'BT',
      `/F2 13 Tf  1 0 0 1 ${ML} ${A4H - MT} Tm  (${escStr(entry.title)}) Tj`,
    ];
    // Image placeholder — we'll draw the XObject
    streamLines.push('ET');
    // Draw image
    const imgY = A4H - MT - 18 - IH;
    streamLines.push(`q  ${IW} 0 0 ${IH} ${ML} ${imgY} cm  /Im${imgObjId} Do  Q`);
    // Description
    streamLines.push('BT');
    let ty = imgY - 22;
    streamLines.push(`/F1 9 Tf`);
    for (const line of descLines) {
      streamLines.push(`1 0 0 1 ${ML} ${ty} Tm  (${escStr(line)}) Tj`);
      ty -= 13;
    }
    streamLines.push('ET');

    const stream = streamLines.join('\n');
    const contentId = addObj(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);

    // Resources with image XObject reference
    const pageId = addObj(
      `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${A4W} ${A4H}] ` +
      `/Resources << /Font << /F1 ${F_REG} 0 R /F2 ${F_BOLD} 0 R >> ` +
      `/XObject << /Im${imgObjId} ${imgObjId} 0 R >> >> ` +
      `/Contents ${contentId} 0 R >>`
    );
    pageObjIds.push(pageId);
  }

  // Pages and Catalog
  const kids     = pageObjIds.map(id => `${id} 0 R`).join(' ');
  const pagesId  = addObj(`<< /Type /Pages /Kids [${kids}] /Count ${pageObjIds.length} >>`);
  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  // Fix forward references
  for (let i = 0; i < objects.length; i++) {
    if (typeof objects[i] === 'string') {
      objects[i] = objects[i].replace(/PAGES_REF/g, `${pagesId} 0 R`);
    }
  }

  // Serialise
  const parts  = [Buffer.from('%PDF-1.4\n%\xff\xff\xff\xff\n')];
  const offsets = [];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(parts.reduce((s, b) => s + b.length, 0));
    const header = Buffer.from(`${i + 1} 0 obj\n`);
    const footer = Buffer.from(`\nendobj\n`);
    const obj    = objects[i];
    if (obj && obj.type === 'image') {
      // Binary image stream
      const dictStr = `<< /Type /XObject /Subtype /Image /Width ${obj.width} /Height ${obj.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${obj.bytes.length} >>`;
      parts.push(header, Buffer.from(dictStr + '\nstream\n'), obj.bytes, Buffer.from('\nendstream'), footer);
    } else {
      parts.push(header, Buffer.from(String(obj)), footer);
    }
  }

  const xrefOffset = parts.reduce((s, b) => s + b.length, 0);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(Buffer.from(xref + trailer));

  return Buffer.concat(parts);
}

// ─── Main ──────────────────────────────────────────────────────────────────
(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('🚀 Launching browser…');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  // ── Login ────────────────────────────────────────────────────────────────
  console.log('🔐 Logging in…');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
  await sleep(1000);

  // Try to fill username/email field
  const userSel = 'input[type="text"], input[name="username"], input[name="email"], input[id*="user"], input[id*="email"]';
  const passSel = 'input[type="password"]';

  await page.waitForSelector(passSel, { timeout: 10000 });
  const userInput = await page.$(userSel);
  if (userInput) await userInput.type(EMAIL);
  await page.type(passSel, PASSWORD);

  const loginBtn = await page.$('button[type="submit"], button');
  if (loginBtn) await loginBtn.click();
  await sleep(2500);

  // ── Screenshot each page ─────────────────────────────────────────────────
  const captured = [];
  for (const pg of PAGES) {
    console.log(`📸 ${pg.title}…`);
    try {
      await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: 'networkidle2', timeout: 15000 });
      await sleep(WAIT);

      // Dismiss any modal/overlay
      const closeBtn = await page.$('[class*="modal"] button[class*="close"], button[aria-label="Close"]');
      if (closeBtn) await closeBtn.click();

      const filename = `${String(captured.length + 1).padStart(2, '0')}_${sanitiseFilename(pg.title)}.jpg`;
      const imgPath  = path.join(OUT_DIR, filename);
      await page.screenshot({ path: imgPath, type: 'jpeg', quality: 85 });
      captured.push({ ...pg, imagePath: imgPath });
      console.log(`   ✅ Saved ${filename}`);
    } catch (err) {
      console.warn(`   ⚠️  Skipped ${pg.path}: ${err.message}`);
    }
  }

  await browser.close();
  console.log(`\n📄 Building PDF with ${captured.length} pages…`);

  if (captured.length === 0) {
    console.error('❌ No screenshots captured. Check that the app is running on', BASE_URL);
    process.exit(1);
  }

  const pdfBuf = buildPDF(captured);
  fs.writeFileSync(PDF_OUT, pdfBuf);
  console.log(`✅ PDF written → ${PDF_OUT}`);
  console.log(`   Pages: ${captured.length + 1} (1 cover + ${captured.length} screenshots)`);
})();
