#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'user-guide-light-screenshots');
const WAIT_MS = 2200;
const BASE_URL = 'http://127.0.0.1:5173';

const pages = [
  { path: '/dashboard', file: '01_dashboard___overview.jpg' },
  { path: '/masters', file: '02_masters_hub.jpg' },
  { path: '/masters/products', file: '03_masters___products.jpg' },
  { path: '/masters/products/create', file: '04_masters___create_product.jpg' },
  { path: '/masters/groups', file: '05_masters___account_groups.jpg' },
  { path: '/masters/ledgers', file: '06_masters___ledgers.jpg' },
  { path: '/masters/stock-groups', file: '07_masters___stock_groups.jpg' },
  { path: '/masters/units', file: '08_masters___units_of_measurement.jpg' },
  { path: '/masters/suppliers', file: '09_masters___supplier_management.jpg' },
  { path: '/masters/purchase-requisitions', file: '10_masters___purchase_requisitions.jpg' },
  { path: '/billing', file: '11_billing___pos.jpg' },
  { path: '/billing/history', file: '12_billing___bill_history.jpg' },
  { path: '/billing/pending-approvals', file: '13_billing___pending_approvals.jpg' },
  { path: '/quotations', file: '14_quotations.jpg' },
  { path: '/vouchers', file: '15_vouchers.jpg' },
  { path: '/reports', file: '16_reports.jpg' },
  { path: '/hrm', file: '17_hrm___dashboard.jpg' },
  { path: '/hrm/employees', file: '18_hrm___employees.jpg' },
  { path: '/hrm/attendance', file: '19_hrm___attendance.jpg' },
  { path: '/hrm/leaves', file: '20_hrm___leave_management.jpg' },
  { path: '/hrm/payroll', file: '21_hrm___payroll.jpg' },
  { path: '/make/dashboard', file: '22_make___production_dashboard.jpg' },
  { path: '/make/place-order', file: '23_make___place_order.jpg' },
  { path: '/make/track', file: '24_make___track_orders.jpg' },
  { path: '/shipping', file: '25_shipping_dashboard.jpg' },
  { path: '/website', file: '26_website_admin.jpg' },
  { path: '/users', file: '27_user_management.jpg' },
  { path: '/users/groups', file: '28_user_management___groups.jpg' },
  { path: '/settings', file: '29_settings.jpg' },
  { path: '/email', file: '30_email_campaigns.jpg' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForVite() {
  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

function mockBridgeScript() {
  return `
    (() => {
      const sampleProducts = [
        { id: 1, name: 'Aurelia Circle Glass Light', sku: '01.10.12.5228', model_number: '01.10.12.5228', quantity: 10, unit_name: 'piece', selling_price: 2500, cost_price: 1800, stock_group_name: 'Light' },
        { id: 2, name: 'Hardware Bracket Set', sku: '02.20.01.1001', model_number: '02.20.01.1001', quantity: 24, unit_name: 'set', selling_price: 450, cost_price: 300, stock_group_name: 'Hardware' }
      ];
      const sampleUsers = [
        { id: 1, username: 'sabbirsuperadmin', full_name: 'Super Admin', role: 'superadmin', group_name: 'Super Admin', is_active: true, device_type: 'PC', last_active: new Date().toISOString() },
        { id: 2, username: 'inventory', full_name: 'Inventory Manager', role: 'manager', group_name: 'Inventory Department', is_active: true, device_type: 'PC', last_active: new Date().toISOString() }
      ];
      const sampleGroups = [
        { id: 1, name: 'Super Admin', description: 'Full administrative access to all features.', is_active: true, permissions: { manage_users: true, manage_settings: true, read_product_ledger: true } },
        { id: 2, name: 'Store Department', description: 'Creates purchase requisitions and tracks store-side requisition status.', is_active: true, permissions: { create_purchase_requisition: true, read_purchase_requisition: true } },
        { id: 3, name: 'Inventory Department', description: 'Receives goods, posts stock, and manages damaged goods.', is_active: true, permissions: { read_damaged_goods: true, manage_damaged_goods: true } }
      ];
      const sampleRequisitions = [
        { id: 'req-1', requisition_number: 'REQ-20260521-0001', priority_level: 'HIGH', status: 'PENDING_AUDIT', approval_status: 'APPROVED', current_stage: 'Audit Review', required_delivery_date: '2026-05-28', item_count: 2, total_quantity_label: '2 lines' },
        { id: 'req-2', requisition_number: 'REQ-20260521-0002', priority_level: 'MEDIUM', status: 'APPROVED', approval_status: 'APPROVED', current_stage: 'Ready to Purchase', required_delivery_date: '2026-05-30', item_count: 1, total_quantity_label: '1 line' }
      ];
      const sampleLedgers = [
        { id: 1, name: 'Cash', group_name: 'Cash-in-Hand', opening_balance: 0, balance_type: 'Dr' },
        { id: 2, name: 'Test Supplier', group_name: 'Sundry Creditors', opening_balance: 0, balance_type: 'Cr', contact_person: 'Purchase Desk', contact_number: '01700000000' }
      ];
      const sampleBills = [
        { id: 1, invoice_number: '20260521-0035-8322', customer_name: 'Shahin', total_amount: 12500, created_at: new Date().toISOString(), payment_status: 'paid' }
      ];
      const sampleNotifications = [
        { id: 1, title: 'Low stock alert', message: 'Aurelia Circle Glass Light is below threshold.', is_read: false, action_path: '/masters/products/1/ledger', action_label: 'Open Product Ledger' }
      ];

      const resultFor = (name) => {
        if (/typing/i.test(name)) return [];
        if (/online/i.test(name)) return [1, 2];
        if (/chat.*message|message/i.test(name)) return [
          { id: 1, sender_id: 2, receiver_id: 1, body: 'Please review the pending requisition.', created_at: new Date().toISOString() },
          { id: 2, sender_id: 1, receiver_id: 2, body: 'Reviewed. Accounts can add supplier details.', created_at: new Date().toISOString() }
        ];
        if (/supabase.*config/i.test(name)) return { url: 'https://example.supabase.co', anonKey: 'mock-anon-key' };
        if (/makeGetDashboardStats/i.test(name)) return {
          total: 8,
          pending: 2,
          inProgress: 3,
          readyForDispatch: 1,
          delivered: 2,
          byStatus: { Placed: 2, 'In Production': 2, Welding: 1, Painting: 0, 'Ready for Dispatch': 1, Delivered: 2 },
          pendingDelivery: [
            { id: 101, furniture_name: 'Custom Display Unit', designer_name: 'Production Team', created_at: new Date().toISOString() }
          ],
          recent: [
            { id: 101, furniture_name: 'Custom Display Unit', designer_name: 'Production Team', status: 'Ready for Dispatch', priority: 'High', created_at: new Date().toISOString() },
            { id: 102, furniture_name: 'Office Counter', designer_name: 'Workshop', status: 'In Production', priority: 'Normal', created_at: new Date().toISOString() }
          ]
        };
        if (/websiteGetDashboardData/i.test(name)) return {
          stats: {
            totalOrdersMonth: 18,
            revenueMonth: 245000,
            pendingOrders: 4,
            totalVisitsMonth: 1280
          },
          trending: [
            { name: 'Aurelia Light', sales: 12 },
            { name: 'Hardware Set', sales: 8 },
            { name: 'Office Counter', sales: 5 }
          ],
          logs: [
            { action_type: 'product_updated', admin_email: 'admin@leadingedge', timestamp: new Date().toISOString() },
            { action_type: 'order_received', admin_email: 'website', timestamp: new Date().toISOString() }
          ]
        };
        if (/notification/i.test(name)) return sampleNotifications;
        if (/dashboard.*stat|stat/i.test(name)) return { totalSales: 125000, pendingBills: 3, lowStock: 2, activeUsers: 2, totalProducts: 2 };
        if (/product.*ledger/i.test(name)) return { product: sampleProducts[0], suppliers: [], purchases: [], sales: [], damagedGoods: [] };
        if (/product/i.test(name)) return sampleProducts;
        if (/purchase.*requisition/i.test(name)) return sampleRequisitions;
        if (/user.*group|group/i.test(name)) return sampleGroups;
        if (/active|online|session|user/i.test(name)) return sampleUsers;
        if (/ledger|supplier/i.test(name)) return sampleLedgers;
        if (/bill|invoice|billing/i.test(name)) return sampleBills;
        if (/unit/i.test(name)) return [{ id: 1, name: 'Piece', symbol: 'pc' }, { id: 2, name: 'Set', symbol: 'set' }];
        if (/stock.*group/i.test(name)) return [{ id: 1, name: 'Light', parent_id: null }, { id: 2, name: 'Chandelier', parent_id: 1 }, { id: 3, name: 'Hardware', parent_id: null }];
        if (/permission/i.test(name)) return [{ id: 1, feature_name: 'PR Store Head Approval', feature_key: 'purchase_requisition_store_head', approver_role: 'manager', is_active: true }];
        if (/hrm|employee|attendance|leave|payroll/i.test(name)) return [];
        if (/make|shipping|website|quotation|voucher|email|report|crm|exchange/i.test(name)) return [];
        if (/hasSupabaseConfig|save|create|update|delete|mark|send|set|check|activate|verify/i.test(name)) return { success: true };
        return [];
      };

      const bridge = new Proxy({}, {
        get(target, prop) {
          if (prop === 'onUpdateStatus' || prop === 'onCacheProgress' || prop === 'onCacheLoadProgress' || prop === 'onWriteQueueStatus' || prop === 'onDataUpdated' || prop === 'onRedirect') {
            return () => () => {};
          }
          if (prop === 'removeAllListeners') return () => {};
          if (prop === 'getAppVersion') return async () => '1.4.0';
          if (prop === 'checkLicense') return async () => ({ valid: true, success: true });
          if (prop === 'preloadCache') return async () => ({ success: true });
          if (prop === 'hasSupabaseConfig') return async () => true;
          if (prop === 'getCurrentUser') return async () => sampleUsers[0];
          if (typeof prop === 'string') return async () => resultFor(prop);
          return undefined;
        }
      });

      Object.defineProperty(window, 'electron', { value: bridge, configurable: true });
      const permissions = {
        read_bill: true, write_bill: true, alter_bill: true, approve_bill: true,
        read_group: true, write_group: true, read_ledger: true, write_ledger: true,
        read_stock_items: true, write_stock_items: true, read_purchase_requisition: true,
        create_purchase_requisition: true, approve_store_requisition: true,
        add_purchase_estimates: true, audit_purchase_requisition: true,
        director_approve_purchase_requisition: true, purchase_requisition: true,
        receive_purchase_requisition: true, complete_purchase_requisition: true,
        read_product_ledger: true, manage_product_model_rules: true,
        manage_product_attributes: true, read_damaged_goods: true,
        manage_damaged_goods: true, read_accounts: true, write_accounts: true,
        manage_users: true, manage_sessions: true, manage_groups: true,
        manage_permissions: true, read_hrm: true, write_hrm: true,
        approve_leave: true, view_payroll: true, read_make: true, write_make: true,
        read_email: true, write_email: true, manage_shipping: true,
        manage_website: true, manage_settings: true, read_quotation: true,
        write_quotation: true, view_customer_ledger: true, initiate_exchange: true,
        read_customer: true, write_customer: true
      };
      localStorage.setItem('app_license_key', 'guide');
      localStorage.setItem('supabase_admin_key', 'guide');
      localStorage.setItem('user_role', 'superadmin');
      localStorage.setItem('user_id', '1');
      localStorage.setItem('user_name', 'Super Admin');
      localStorage.setItem('user_email', 'sabbirsuperadmin');
      localStorage.setItem('user_permissions', JSON.stringify(permissions));
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'sabbirsuperadmin', full_name: 'Super Admin', role: 'superadmin', group: 'Super Admin' }));
      localStorage.setItem('theme', 'light');
    })();
  `;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  vite.stdout.on('data', (chunk) => process.stdout.write(chunk));
  vite.stderr.on('data', (chunk) => process.stderr.write(chunk));

  const ready = await waitForVite();
  if (!ready) {
    vite.kill();
    throw new Error('Vite did not become ready on port 5173.');
  }

  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: fs.existsSync(macChrome) ? macChrome : undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => console.warn(`Page error: ${err.message}`));
  await page.evaluateOnNewDocument(mockBridgeScript());

  for (let i = 0; i < pages.length; i++) {
    const target = pages[i];
    console.log(`Capturing ${String(i + 1).padStart(2, '0')} ${target.path}`);
    await page.goto(`${BASE_URL}/#${target.path}`, { waitUntil: 'networkidle0', timeout: 45000 });
    await page.evaluate(mockBridgeScript());
    await page.evaluate(() => {
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      window.scrollTo(0, 0);
    });
    await sleep(WAIT_MS);
    await page.screenshot({
      path: path.join(OUT_DIR, target.file),
      type: 'jpeg',
      quality: 90,
      fullPage: false,
    });
  }

  await browser.close();
  vite.kill();
  console.log(`Saved ${pages.length} screenshots to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
