#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const DOCS_DIR = __dirname;
const SHOT_DIR = path.join(DOCS_DIR, 'user-guide-light-screenshots');
const HTML_OUT = path.join(DOCS_DIR, 'LE-SOFT_User_Guide.html');
const PDF_OUT = path.join(DOCS_DIR, 'LE-SOFT_User_Guide.pdf');

const generatedDate = new Date().toLocaleDateString('en-GB', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const chapters = [
  {
    title: 'Dashboard and Daily Overview',
    image: '01_dashboard___overview.jpg',
    intro: 'The dashboard is the first working screen after login. It gives the operator a quick understanding of the business position before opening individual modules.',
    points: [
      'Use the summary cards to review sales, stock, pending work, active users, and other operational totals.',
      'Use the product search or quick lookup area to find products without opening the full product master page.',
      'Use quick action cards to move directly into common tasks such as billing, products, reports, users, or settings.',
      'Use the notification bell to open system alerts. Alerts can redirect to the exact page that needs action.',
      'Use chat or communication tools from the shell when coordination with another user is needed.',
    ],
    workflow: [
      'Start the day from the dashboard.',
      'Check summary cards and pending alerts.',
      'Search for a product or open the relevant module from the sidebar.',
      'Use notifications and chat for urgent follow-up work.',
    ],
  },
  {
    title: 'Masters Hub',
    image: '02_masters_hub.jpg',
    intro: 'Masters is the control room for accounting, inventory, procurement, suppliers, products, and warehouse setup.',
    points: [
      'Open Account Groups before creating ledgers, because every ledger must belong to a group.',
      'Create Units, Stock Groups, Godowns, and Products before using billing or purchase requisitions.',
      'Open Suppliers to manage vendor ledgers, contact details, settlements, and purchase history.',
      'Open Purchase Requisitions to request products and move them through approval, audit, purchase, receipt, and stock completion.',
    ],
    workflow: [
      'Create master data first.',
      'Then create transactions such as bills, purchase bills, and requisitions.',
      'Use reports to verify the effect of the transactions.',
    ],
  },
  {
    title: 'Product List and Product Search',
    image: '03_masters___products.jpg',
    intro: 'The product list is the main catalogue screen. It helps users find, inspect, and manage products before selling, purchasing, or checking stock.',
    points: [
      'Use search to find products by name, SKU, model number, stock group, or other available product identifiers.',
      'Use the action buttons to open the product ledger, edit product information, or manage records if your user group has permission.',
      'Check product stock, unit, stock group, and pricing before using the product in a bill or purchase requisition.',
      'Open Product Ledger when you need the full product history, supplier links, damage records, and purchase/sales movement.',
    ],
    workflow: [
      'Search for the product.',
      'Open the ledger for full history or edit the product if master data needs correction.',
      'Use product summary from requisition screens before adding the product to a purchase request.',
    ],
  },
  {
    title: 'Creating and Editing Products',
    image: '04_masters___create_product.jpg',
    intro: 'The product form stores product identity, categorisation, stock location, pricing, supplier/import data, images, and product attributes.',
    points: [
      'The model number is generated from model rules and should not be typed manually.',
      'Choose the product origin, stock group, unit, and godown carefully because these fields affect reporting and model generation.',
      'Imported product creation should be restricted to Super Admin or approved users.',
      'Use product attributes for flexible specifications such as size, color, finish, material, wattage, or model family.',
      'Use image gallery fields to keep visual reference images for the product.',
    ],
    workflow: [
      'Create product origins and model rules first.',
      'Create stock groups and units.',
      'Create the product and allow the system to generate the model number.',
      'Add supplier/import information and product attributes.',
    ],
  },
  {
    title: 'Account Groups',
    image: '05_masters___account_groups.jpg',
    intro: 'Account groups organise ledgers into accounting categories such as Assets, Liabilities, Income, and Expenses.',
    points: [
      'Create parent groups before creating child groups.',
      'Use correct nature because financial reports depend on group classification.',
      'Keep group names clear and consistent to avoid confusion in trial balance and ledger reports.',
    ],
    workflow: [
      'Create the group hierarchy.',
      'Create ledgers under the correct group.',
      'Use reports to verify account placement.',
    ],
  },
  {
    title: 'Ledgers and Supplier Accounts',
    image: '06_masters___ledgers.jpg',
    intro: 'Ledgers are the accounting accounts used for suppliers, customers, cash, bank, income, expense, and adjustment entries.',
    points: [
      'Supplier ledgers should be created under the proper creditor group.',
      'Opening balances should be entered carefully because they affect financial reports.',
      'Ledger details can be used to inspect related transactions and outstanding balances.',
    ],
    workflow: [
      'Create the ledger with the correct group.',
      'Enter opening balance if applicable.',
      'Use the supplier page for vendor-specific management.',
    ],
  },
  {
    title: 'Stock Groups and Category Tree',
    image: '07_masters___stock_groups.jpg',
    intro: 'Stock groups define the product category structure. They should represent the way inventory is actually organised.',
    points: [
      'Use parent and child groups to create a visual hierarchy, such as Light > Chandelier.',
      'Assign every product to the correct stock group for accurate stock reports.',
      'Use the tree view to confirm that child groups are under the intended parent.',
    ],
    workflow: [
      'Create broad parent groups.',
      'Create child groups under each parent.',
      'Assign products to the correct child group.',
    ],
  },
  {
    title: 'Units of Measurement',
    image: '08_masters___units_of_measurement.jpg',
    intro: 'Units standardise quantities across products, purchase requisitions, billing, and reports.',
    points: [
      'Create units such as piece, box, kg, meter, liter, or set.',
      'Use short symbols for compact display in tables and print formats.',
      'Choose the desired unit while creating products so requisition quantities use the correct unit automatically.',
    ],
    workflow: [
      'Create all common units.',
      'Assign unit to product.',
      'Use the product in bills and requisitions.',
    ],
  },
  {
    title: 'Supplier Management',
    image: '09_masters___supplier_management.jpg',
    intro: 'Supplier management connects vendor details, purchase records, settlements, and requisition estimates.',
    points: [
      'Use supplier ledgers to track purchase bills and settlement status.',
      'Maintain contact person, phone, email, and notes so the purchase team can follow up quickly.',
      'Supplier details entered during purchase requisitions should connect back to the supplier ledger wherever possible.',
    ],
    workflow: [
      'Create supplier ledger.',
      'Use supplier in purchase bill or requisition estimate.',
      'Review supplier ledger for payments and purchase history.',
    ],
  },
  {
    title: 'Purchase Requisitions',
    image: '10_masters___purchase_requisitions.jpg',
    intro: 'Purchase requisitions control the request-to-purchase process. A requisition can contain multiple products and should move through approval, audit, purchase, receipt, and completion.',
    points: [
      'Store users create the requisition and add product lines.',
      'Use the product summary button before adding a product to check stock, last purchase price, last purchase date, and sales history.',
      'Store Head reviews and approves the request.',
      'Accounts adds supplier or vendor information and approximate purchase price.',
      'Audit reviews estimates and adds justification.',
      'Director approves or rejects the requisition.',
      'Purchase department records purchase details and prints the requisition when approved.',
      'Receiving and Inventory complete goods receipt, damage transfer if needed, and stock posting.',
    ],
    workflow: [
      'Create requisition with product lines.',
      'Review product summary for each important item.',
      'Move the requisition step by step through the approval workflow.',
      'Use View to see product lines, quantity, supplier, estimate, previous price, and history.',
      'Print only after director approval.',
    ],
  },
  {
    title: 'Billing and POS',
    image: '11_billing___pos.jpg',
    intro: 'Billing is used for sales invoice creation. It combines customer selection, product search, item lines, payment method, stock deduction, and receipt printing.',
    points: [
      'Search products and add them to the bill.',
      'Select or create the customer before completing the invoice.',
      'Review quantity, rate, discount, tax, and total before saving.',
      'Use payment methods such as cash, card, bank, or MFS depending on configuration.',
      'After saving, the bill affects customer ledger and product stock.',
    ],
    workflow: [
      'Search customer or create customer.',
      'Add products to invoice.',
      'Confirm totals and payment method.',
      'Save and print the bill.',
    ],
  },
  {
    title: 'Bill History',
    image: '12_billing___bill_history.jpg',
    intro: 'Bill history helps users search previous invoices, inspect bill details, reprint bills, and verify customer activity.',
    points: [
      'Search by customer, invoice number, date, or amount where available.',
      'Open bill details before making any alteration.',
      'Use reprint when a customer needs another copy.',
      'Use exchanges or customer ledger to track post-sale activity.',
    ],
    workflow: [
      'Find the bill.',
      'Open details.',
      'Reprint, alter, or inspect as permitted.',
    ],
  },
  {
    title: 'Pending Billing Approvals',
    image: '13_billing___pending_approvals.jpg',
    intro: 'Pending approvals are used when controlled billing actions need management review.',
    points: [
      'Review the bill change or request before approving.',
      'Approve only after checking customer, items, discounts, and amount changes.',
      'Reject or request correction when data is incomplete.',
      'Every approval decision should be auditable.',
    ],
    workflow: [
      'Open pending item.',
      'Review old and new values.',
      'Approve or reject.',
    ],
  },
  {
    title: 'Quotations',
    image: '14_quotations.jpg',
    intro: 'Quotations are used before a confirmed sale. They help prepare formal offers with products, quantities, prices, and validity.',
    points: [
      'Create quotation before billing when the customer has not confirmed the order.',
      'Add products or custom lines.',
      'Preview or print the quotation before sharing.',
      'Convert accepted quotations into billing workflow where supported.',
    ],
    workflow: [
      'Create quotation.',
      'Add customer and line items.',
      'Preview and print.',
      'Follow up through CRM or billing.',
    ],
  },
  {
    title: 'Vouchers',
    image: '15_vouchers.jpg',
    intro: 'Vouchers record accounting transactions such as payments, receipts, journals, contra entries, and adjustments.',
    points: [
      'Select voucher type and date carefully.',
      'Choose debit and credit ledgers correctly.',
      'Use narration to make future audit easy.',
      'Reports such as trial balance and day book depend on voucher accuracy.',
    ],
    workflow: [
      'Create voucher header.',
      'Add debit and credit lines.',
      'Review totals.',
      'Save and verify in reports.',
    ],
  },
  {
    title: 'Reports',
    image: '16_reports.jpg',
    intro: 'Reports provide financial, stock, sales, and product insight for decision making.',
    points: [
      'Use Trial Balance to verify accounting balances.',
      'Use Profit and Loss and Balance Sheet for financial position.',
      'Use Stock Summary to inspect quantity and inventory value.',
      'Use Product History and Market Analysis to review pricing and market movement.',
      'Use date filters before exporting reports.',
    ],
    workflow: [
      'Choose report.',
      'Set date range or filter.',
      'Review totals.',
      'Export or print if required.',
    ],
  },
  {
    title: 'HRM Dashboard',
    image: '17_hrm___dashboard.jpg',
    intro: 'The HRM dashboard gives an overview of employees, attendance, leaves, and payroll activity.',
    points: [
      'Review employee count and attendance summary.',
      'Check pending leave requests.',
      'Open payroll or employee list from shortcuts.',
    ],
    workflow: [
      'Open HRM dashboard.',
      'Check alerts and summaries.',
      'Open the specific HRM page for action.',
    ],
  },
  {
    title: 'Employee Management',
    image: '18_hrm___employees.jpg',
    intro: 'Employee management stores staff records, department, designation, contact, salary, and active status.',
    points: [
      'Create employees before recording attendance or payroll.',
      'Keep employee code unique and readable.',
      'Deactivate employees instead of deleting when history is needed.',
    ],
    workflow: [
      'Create employee.',
      'Maintain profile and employment details.',
      'Use employee in attendance, leave, and payroll.',
    ],
  },
  {
    title: 'Attendance',
    image: '19_hrm___attendance.jpg',
    intro: 'Attendance records check-in, check-out, working hours, and exceptions.',
    points: [
      'Use daily attendance to track staff presence.',
      'Correct attendance only with proper permission.',
      'Use attendance data during payroll review.',
    ],
    workflow: [
      'Select date.',
      'Review employee attendance.',
      'Adjust records if required and permitted.',
    ],
  },
  {
    title: 'Leave Management',
    image: '20_hrm___leave_management.jpg',
    intro: 'Leave management keeps employee leave requests and approval status in one place.',
    points: [
      'Review leave reason and dates before approval.',
      'Approve or reject based on company policy.',
      'Use history to check previous leave activity.',
    ],
    workflow: [
      'Open leave request.',
      'Review dates and reason.',
      'Approve or reject.',
    ],
  },
  {
    title: 'Payroll',
    image: '21_hrm___payroll.jpg',
    intro: 'Payroll summarizes salary calculation, deductions, bonuses, and net pay.',
    points: [
      'Confirm attendance and leave records before payroll finalization.',
      'Review salary components carefully.',
      'Export or print payroll records for company files.',
    ],
    workflow: [
      'Select payroll period.',
      'Review employee salary details.',
      'Finalize or export payroll.',
    ],
  },
  {
    title: 'MAKE Production Dashboard',
    image: '22_make___production_dashboard.jpg',
    intro: 'MAKE tracks custom production or manufacturing orders from request to completion.',
    points: [
      'Use summary cards to check production load.',
      'Open pending orders for follow-up.',
      'Track status across production stages.',
    ],
    workflow: [
      'Review production dashboard.',
      'Open orders needing attention.',
      'Update status from the tracking page.',
    ],
  },
  {
    title: 'Place MAKE Order',
    image: '23_make___place_order.jpg',
    intro: 'The place order screen creates production orders with customer, product, material, delivery, and instruction details.',
    points: [
      'Add customer and order details.',
      'Enter measurements, material, and deadline accurately.',
      'Use notes for production-specific instructions.',
    ],
    workflow: [
      'Create MAKE order.',
      'Assign details and deadline.',
      'Save and track from the production board.',
    ],
  },
  {
    title: 'Track MAKE Orders',
    image: '24_make___track_orders.jpg',
    intro: 'Track Orders shows current production progress and status updates.',
    points: [
      'Filter by status, priority, or assigned user where available.',
      'Update production stage as work moves forward.',
      'Use history to identify delays.',
    ],
    workflow: [
      'Find the order.',
      'Open or update status.',
      'Record meaningful notes when status changes.',
    ],
  },
  {
    title: 'Shipping Dashboard',
    image: '25_shipping_dashboard.jpg',
    intro: 'Shipping manages delivery status after billing or order completion.',
    points: [
      'Review pending payment, packed, dispatched, and delivered shipments.',
      'Update shipping status as goods move.',
      'Keep delivery notes, vehicle, and staff details where required.',
    ],
    workflow: [
      'Open shipping record.',
      'Verify payment and package readiness.',
      'Update dispatch and delivery status.',
    ],
  },
  {
    title: 'Website Admin',
    image: '26_website_admin.jpg',
    intro: 'Website Admin connects the desktop ERP with website commerce and content management.',
    points: [
      'Manage website products, categories, orders, pages, projects, media, and newsletter data.',
      'Use sync tools carefully to avoid mismatched website and ERP data.',
      'Review orders from the website before processing them operationally.',
    ],
    workflow: [
      'Open website dashboard.',
      'Review new orders or content updates.',
      'Sync or update only after verification.',
    ],
  },
  {
    title: 'User Management',
    image: '27_user_management.jpg',
    intro: 'User management controls who can access the system and what they can do.',
    points: [
      'Create each user with a clear username, full name, role, group, and active status.',
      'Use user groups to assign permission sets.',
      'Disable users temporarily when access should be paused.',
      'Delete users only when historical references are safely handled by the database.',
    ],
    workflow: [
      'Create or edit user.',
      'Assign correct group.',
      'Confirm permissions.',
      'Monitor sessions from Active Sessions.',
    ],
  },
  {
    title: 'User Groups and Permissions',
    image: '28_user_management___groups.jpg',
    intro: 'User groups define permission templates for departments and job levels.',
    points: [
      'Create groups for departments such as Store, Store Head, Accounts, Audit, Director, Purchase, Inventory, Admin, and Super Admin.',
      'Assign purchase requisition permissions only to groups involved in the workflow.',
      'Use active/inactive group status to temporarily disable access without deleting history.',
      'Keep group descriptions readable so administrators understand the purpose of each group.',
    ],
    workflow: [
      'Create group.',
      'Write a meaningful description.',
      'Assign permissions.',
      'Save and assign users to the group.',
    ],
  },
  {
    title: 'Settings',
    image: '29_settings.jpg',
    intro: 'Settings controls application preferences, database configuration, print settings, backup tools, and operational defaults.',
    points: [
      'Configure barcode and print page settings per print option.',
      'Manage Supabase admin key and database backup options carefully.',
      'Set auto logout, theme, and other device-level preferences.',
      'Only admin-level users should modify system settings.',
    ],
    workflow: [
      'Open Settings.',
      'Change only the required setting.',
      'Test the related module after saving.',
    ],
  },
  {
    title: 'Email and Campaigns',
    image: '30_email_campaigns.jpg',
    intro: 'The email module is used for internal/outbound email and campaign-style communication.',
    points: [
      'Prepare campaign content and recipients before sending.',
      'Avoid sending large volumes too quickly because email providers can block or throttle bulk mail.',
      'Use proper unsubscribe, sender identity, and recipient list hygiene for deliverability.',
      'Track sent status and failed deliveries where available.',
    ],
    workflow: [
      'Prepare recipient list.',
      'Create email content.',
      'Send in controlled batches.',
      'Review delivery status.',
    ],
  },
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function imageSrc(name) {
  return `screenshots/${encodeURI(name)}`;
}

function renderList(items) {
  return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderChapter(chapter, index) {
  const imgPath = path.join(SHOT_DIR, chapter.image);
  if (!fs.existsSync(imgPath)) {
    throw new Error(`Missing screenshot: ${chapter.image}`);
  }

  return `
    <section class="chapter">
      <div class="chapter-heading">
        <div>
          <p class="eyebrow">Section ${String(index + 1).padStart(2, '0')}</p>
          <h2>${escapeHtml(chapter.title)}</h2>
        </div>
      </div>
      <figure>
        <img src="${imageSrc(chapter.image)}" alt="${escapeHtml(chapter.title)} screenshot" />
        <figcaption>${escapeHtml(chapter.title)} - fresh light-theme screenshot from LE-SOFT.</figcaption>
      </figure>
      <p class="intro">${escapeHtml(chapter.intro)}</p>
      <div class="two-col">
        <div class="panel">
          <h3>Feature controls shown</h3>
          ${renderList(chapter.points)}
        </div>
        <div class="panel muted">
          <h3>What to do in the software</h3>
          ${renderList(chapter.workflow)}
        </div>
      </div>
    </section>
  `;
}

function buildHtml() {
  const toc = chapters.map((chapter, index) => `
    <li>
      <span>${String(index + 1).padStart(2, '0')}</span>
      <strong>${escapeHtml(chapter.title)}</strong>
    </li>
  `).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LE-SOFT User Guide</title>
  <style>
    @page {
      size: A4;
      margin: 16mm 14mm 16mm 14mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #ffffff;
      color: #172033;
      font-family: Inter, "Segoe UI", Arial, sans-serif;
      font-size: 10.8pt;
      line-height: 1.5;
    }

    h1, h2, h3, p {
      margin: 0;
    }

    .cover {
      min-height: 260mm;
      padding: 26mm 18mm;
      background:
        linear-gradient(135deg, rgba(249, 115, 22, 0.12), transparent 38%),
        linear-gradient(160deg, #111827 0%, #1f2937 62%, #111827 100%);
      color: #ffffff;
      page-break-after: always;
      position: relative;
      overflow: hidden;
    }

    .cover::before {
      content: "";
      position: absolute;
      right: -35mm;
      top: -35mm;
      width: 120mm;
      height: 120mm;
      border-radius: 50%;
      background: rgba(249, 115, 22, 0.20);
    }

    .brand {
      color: #fb923c;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      font-size: 10pt;
      margin-bottom: 30mm;
    }

    .cover h1 {
      font-size: 38pt;
      line-height: 1;
      max-width: 145mm;
      margin-bottom: 10mm;
      letter-spacing: 0;
    }

    .cover .subtitle {
      max-width: 150mm;
      font-size: 14pt;
      color: #dbe4f0;
      margin-bottom: 16mm;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 5mm;
      margin-top: 26mm;
      max-width: 160mm;
    }

    .meta-card {
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.08);
      padding: 6mm;
      border-radius: 4mm;
    }

    .meta-card span {
      display: block;
      color: #fb923c;
      font-size: 8pt;
      text-transform: uppercase;
      font-weight: 700;
      margin-bottom: 2mm;
    }

    .meta-card strong {
      display: block;
      color: #ffffff;
      font-size: 12pt;
    }

    .cover-footer {
      position: absolute;
      left: 18mm;
      right: 18mm;
      bottom: 18mm;
      color: #aebaca;
      display: flex;
      justify-content: space-between;
      border-top: 1px solid rgba(255,255,255,0.16);
      padding-top: 5mm;
      font-size: 8.5pt;
    }

    .toc-page {
      page-break-after: always;
    }

    .page-title {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-bottom: 6mm;
      border-bottom: 2px solid #111827;
      margin-bottom: 8mm;
    }

    .page-title h2 {
      font-size: 24pt;
      letter-spacing: 0;
    }

    .page-title p {
      color: #64748b;
      font-weight: 600;
    }

    .toc {
      columns: 2;
      column-gap: 10mm;
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .toc li {
      break-inside: avoid;
      display: flex;
      gap: 4mm;
      border-bottom: 1px solid #e2e8f0;
      padding: 3.2mm 0;
      color: #334155;
    }

    .toc span {
      color: #f97316;
      font-weight: 800;
      min-width: 9mm;
    }

    .overview {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6mm;
      margin-bottom: 7mm;
    }

    .overview-card {
      border: 1px solid #d7dde7;
      border-left: 4px solid #f97316;
      padding: 5mm;
      background: #f8fafc;
      border-radius: 3mm;
    }

    .overview-card h3 {
      font-size: 12pt;
      margin-bottom: 2mm;
    }

    .overview-card p {
      color: #475569;
    }

    .chapter {
      page-break-before: always;
      padding-top: 2mm;
    }

    .chapter-heading {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      border-bottom: 2px solid #111827;
      padding-bottom: 4mm;
      margin-bottom: 5mm;
    }

    .eyebrow {
      color: #f97316;
      font-size: 8pt;
      text-transform: uppercase;
      font-weight: 800;
      letter-spacing: 1px;
      margin-bottom: 1mm;
    }

    .chapter h2 {
      font-size: 20pt;
      letter-spacing: 0;
      color: #111827;
    }

    figure {
      margin: 0 0 5mm 0;
      border: 1px solid #cbd5e1;
      border-radius: 3mm;
      overflow: hidden;
      background: #f8fafc;
    }

    figure img {
      display: block;
      width: 100%;
      height: auto;
    }

    figcaption {
      border-top: 1px solid #e2e8f0;
      padding: 2.5mm 4mm;
      color: #64748b;
      font-size: 8.5pt;
      background: #ffffff;
    }

    .intro {
      color: #334155;
      font-size: 11pt;
      margin-bottom: 5mm;
    }

    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5mm;
    }

    .panel {
      border: 1px solid #d7dde7;
      border-radius: 3mm;
      padding: 5mm;
      background: #ffffff;
      break-inside: avoid;
    }

    .panel.muted {
      background: #f8fafc;
    }

    .panel h3 {
      color: #111827;
      font-size: 12pt;
      margin-bottom: 3mm;
    }

    ul {
      margin: 0;
      padding-left: 5mm;
    }

    li {
      margin-bottom: 2mm;
    }

    .note {
      margin-top: 8mm;
      padding: 5mm;
      border-radius: 3mm;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      color: #7c2d12;
    }

    .small {
      font-size: 8.5pt;
      color: #64748b;
    }

    .appendix {
      page-break-before: always;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 5mm;
      font-size: 9pt;
    }

    th {
      background: #111827;
      color: #ffffff;
      text-align: left;
      padding: 3mm;
    }

    td {
      border-bottom: 1px solid #e2e8f0;
      padding: 3mm;
      vertical-align: top;
    }
  </style>
</head>
<body>
  <section class="cover">
    <div class="brand">Leading Edge ECO-System</div>
    <h1>LE-SOFT User Guide</h1>
    <p class="subtitle">A practical, light-theme, screenshot-based operating manual for daily ERP work, master setup, billing, purchase requisitions, inventory, HRM, MAKE, shipping, website administration, users, settings, and email.</p>
    <div class="meta-grid">
      <div class="meta-card"><span>Document</span><strong>Formal User Guide</strong></div>
      <div class="meta-card"><span>Version</span><strong>1.4.0</strong></div>
      <div class="meta-card"><span>Generated</span><strong>${escapeHtml(generatedDate)}</strong></div>
    </div>
    <div class="cover-footer">
      <div>Internal operating guide</div>
      <div>${chapters.length} illustrated sections</div>
    </div>
  </section>

  <section class="toc-page">
    <div class="page-title">
      <h2>How to Use This Guide</h2>
      <p>Read by module or by workflow</p>
    </div>
    <div class="overview">
      <div class="overview-card">
        <h3>For new users</h3>
        <p>Start with Dashboard, Masters, Products, Billing, and Purchase Requisitions. These explain the daily operating flow.</p>
      </div>
      <div class="overview-card">
        <h3>For managers</h3>
        <p>Focus on approvals, reports, user groups, purchase requisitions, damaged goods, and settings.</p>
      </div>
      <div class="overview-card">
        <h3>For administrators</h3>
        <p>Review users, permissions, model rules, product attributes, print settings, backups, and integration settings.</p>
      </div>
      <div class="overview-card">
        <h3>For auditors</h3>
        <p>Use requisition history, bill audit, voucher records, reports, and supplier/customer ledgers for verification.</p>
      </div>
    </div>
    <p class="note">The screenshots in this document are fresh light-theme LE-SOFT application screens captured for this guide. Some screens may show documentation sample data, but the feature controls and workflows are the same in production.</p>
  </section>

  <section class="toc-page">
    <div class="page-title">
      <h2>Contents</h2>
      <p>Visual walkthrough</p>
    </div>
    <ol class="toc">${toc}</ol>
  </section>

  ${chapters.map(renderChapter).join('\n')}

  <section class="appendix">
    <div class="page-title">
      <h2>Permission and Safety Notes</h2>
      <p>Administrative guidance</p>
    </div>
    <table>
      <thead>
        <tr>
          <th>Area</th>
          <th>Recommended Control</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Product creation</td>
          <td>Imported products should be restricted to Super Admin. Local products can be allowed for approved store managers.</td>
          <td>Product identity, supplier, and import records affect purchasing and reporting.</td>
        </tr>
        <tr>
          <td>Purchase requisitions</td>
          <td>Each workflow step should be assigned to the correct department group.</td>
          <td>This keeps responsibility clear and makes approval history reliable.</td>
        </tr>
        <tr>
          <td>Damaged goods</td>
          <td>Only inventory managers, admins, or specifically approved groups should transfer or write off damaged stock.</td>
          <td>Damaged goods affect usable quantity and financial stock value.</td>
        </tr>
        <tr>
          <td>User groups</td>
          <td>Use group descriptions and disable groups when access must be paused temporarily.</td>
          <td>This is safer than deleting groups that may be linked to users or history.</td>
        </tr>
        <tr>
          <td>Settings</td>
          <td>Limit system settings, database keys, backup, and print configuration to administrators.</td>
          <td>Incorrect settings can affect all users on the device or company dataset.</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section class="appendix">
    <div class="page-title">
      <h2>Daily Operating Checklist</h2>
      <p>Suggested routine</p>
    </div>
    <div class="two-col">
      <div class="panel">
        <h3>Start of Day</h3>
        <ul>
          <li>Open Dashboard and check summary cards.</li>
          <li>Review notifications and pending approvals.</li>
          <li>Check low stock alerts and urgent purchase requisitions.</li>
          <li>Confirm active users and system readiness if you are an admin.</li>
        </ul>
      </div>
      <div class="panel muted">
        <h3>End of Day</h3>
        <ul>
          <li>Review billing history and day book.</li>
          <li>Check pending requisitions, shipping, and MAKE orders.</li>
          <li>Review damaged goods and low stock reports.</li>
          <li>Export or print reports if required by management.</li>
        </ul>
      </div>
    </div>
    <p class="note">For critical data such as stock, supplier balances, and purchase approvals, always use the system reports and ledgers instead of relying only on screen totals.</p>
  </section>
</body>
</html>`;
}

async function main() {
  const html = buildHtml();
  fs.writeFileSync(HTML_OUT, html, 'utf8');

  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: fs.existsSync(macChrome) ? macChrome : undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto(`file://${HTML_OUT}`, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: PDF_OUT,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });
  await browser.close();

  console.log(`HTML saved: ${HTML_OUT}`);
  console.log(`PDF saved: ${PDF_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
