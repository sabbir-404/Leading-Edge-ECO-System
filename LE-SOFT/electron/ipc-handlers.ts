/**
 * ipc-handlers.ts
 * All Electron IPC handlers — rewritten from SQLite to Supabase.
 * Call registerHandlers() once after app is ready.
 */

import { app, ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import bcrypt from 'bcrypt';
import supabase from './supabase';
import mysql from 'mysql2/promise';
import * as licenseManager from './license-manager';
import { getConnectedDevices, setBackupNode, DEVICE_ID } from './device-monitor';

const BCRYPT_ROUNDS = 12;

// ── Brute-force helpers (re-exported from main or duplicated) ────────────────
const loginAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();
function checkBruteForce(username: string) {
    const rec = loginAttempts.get(username);
    if (!rec) return { locked: false };
    const minutesSince = (Date.now() - rec.lastAttempt) / 60000;
    if (rec.count >= 5 && minutesSince < 15) {
        return { locked: true, remaining: Math.ceil(15 - minutesSince) };
    }
    if (minutesSince >= 15) loginAttempts.delete(username);
    return { locked: false };
}
function recordFailedLogin(username: string) {
    const rec = loginAttempts.get(username) || { count: 0, lastAttempt: 0 };
    loginAttempts.set(username, { count: rec.count + 1, lastAttempt: Date.now() });
}
function resetLoginAttempts(username: string) { loginAttempts.delete(username); }

// ── MySQL pool (website integration) ─────────────────────────────────────────
let mysqlPool: mysql.Pool | null = null;
try {
    const cfgPath = path.join(app.getPath('userData'), 'mysql-config.json');
    if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        mysqlPool = mysql.createPool({ host: cfg.host, user: cfg.user, password: cfg.password, database: cfg.database, port: cfg.port || 3306, waitForConnections: true, connectionLimit: 5 });
    }
} catch { /* MySQL optional */ }

// ── MySQL sync helpers ────────────────────────────────────────────────────────
async function syncProductToMySQL(p: { localId: number; name: string; sku: string; category: string; sellingPrice: number; description: string; imagePath: string; quantity: number }) {
    if (!mysqlPool) return;
    const { localId, name, sku, category, sellingPrice, description, imagePath, quantity } = p;
    const [[existing]]: any = await mysqlPool.query('SELECT id FROM products WHERE le_local_id = ?', [localId]);
    if (existing) {
        await mysqlPool.query('UPDATE products SET name=?, price=?, description=?, image=?, is_visible=1 WHERE le_local_id=?', [name, sellingPrice, description, imagePath, localId]);
        await mysqlPool.query('UPDATE products SET quantity=? WHERE le_local_id=?', [quantity, localId]);
    } else {
        const id = `le-${localId}-${Date.now()}`;
        await mysqlPool.query('INSERT IGNORE INTO products (id, le_local_id, name, price, description, image, is_visible) VALUES (?,?,?,?,?,?,1)', [id, localId, name, sellingPrice, description, imagePath]);
        if (category) await mysqlPool.query('INSERT IGNORE INTO product_categories (product_id, category_name) VALUES (?,?)', [id, category]);
    }
}
async function syncStockToMySQL(localId: number, soldQty: number) {
    if (!mysqlPool) return;
    await mysqlPool.query('UPDATE products SET quantity = GREATEST(quantity - ?, 0) WHERE le_local_id = ?', [soldQty, localId]).catch(() => { });
}

// ── In-memory presence stores ─────────────────────────────────────────────────
const userPresence: Map<number, number> = new Map();
const userTyping: Map<string, number> = new Map();

// ── Supabase audit helper ─────────────────────────────────────────────────────
async function writeAuditLog(params: { module: string; action: string; entity_type?: string; entity_id?: string | number; description?: string; old_value?: any; new_value?: any; performed_by: string }) {
    await supabase.from('system_audit_log').insert({
        module: params.module, action: params.action,
        entity_type: params.entity_type || null,
        entity_id: params.entity_id != null ? String(params.entity_id) : null,
        description: params.description || null,
        old_value: params.old_value != null ? JSON.stringify(params.old_value) : null,
        new_value: params.new_value != null ? JSON.stringify(params.new_value) : null,
        performed_by: params.performed_by,
    }).catch(() => { });
}

// ─────────────────────────────────────────────────────────────────────────────
export function registerHandlers() {

    // ═══ GROUPS ══════════════════════════════════════════════════════════════════

    ipcMain.handle('get-groups', async () => {
        const { data, error } = await supabase.from('groups').select('*, parent:groups!parent_group_id(name)').order('name');
        if (error) throw error;
        return (data || []).map((g: any) => ({ ...g, parent_name: g.parent?.name || null }));
    });

    ipcMain.handle('create-group', async (_e, group) => {
        const { name, parent, nature } = group;
        let parentId: number | null = null;
        if (parent && parent !== 'Primary') {
            const { data } = await supabase.from('groups').select('id').eq('name', parent).maybeSingle();
            parentId = data?.id || null;
        }
        const { data, error } = await supabase.from('groups').insert({ name, parent_group_id: parentId, nature: nature || null, company_id: 1 }).select('id').single();
        if (error) throw error;
        return { success: true, id: data.id };
    });

    ipcMain.handle('delete-group', async (_e, id: number) => {
        const { error } = await supabase.from('groups').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    // ═══ LEDGERS ═════════════════════════════════════════════════════════════════

    ipcMain.handle('get-ledgers', async () => {
        const { data, error } = await supabase.from('ledgers').select('*, group:groups(name)').order('name');
        if (error) throw error;
        return (data || []).map((l: any) => ({ ...l, group_name: l.group?.name || null }));
    });

    ipcMain.handle('create-ledger', async (_e, ledger) => {
        const { name, group, openingBalance, type, mailingName, address, gstin } = ledger;
        const { data: grp } = await supabase.from('groups').select('id').eq('name', group).maybeSingle();
        const { data, error } = await supabase.from('ledgers').insert({ name, group_id: grp?.id || null, opening_balance: openingBalance || 0, opening_balance_type: type || 'Dr', mailing_name: mailingName || '', address: address || '', tax_reg_no: gstin || '', company_id: 1 }).select('id').single();
        if (error) throw error;
        return { success: true, id: data.id };
    });

    ipcMain.handle('delete-ledger', async (_e, id: number) => {
        const { error } = await supabase.from('ledgers').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    // ═══ VOUCHERS ════════════════════════════════════════════════════════════════

    ipcMain.handle('get-vouchers', async () => {
        const { data, error } = await supabase.from('vouchers').select('*, voucher_entries(ledger_id, amount, type, ledger:ledgers(name))').order('date', { ascending: false }).order('id', { ascending: false });
        if (error) throw error;
        return (data || []).map((v: any) => ({ ...v, particulars: v.voucher_entries?.map((e: any) => e.ledger?.name).filter(Boolean).join(', ') || '' }));
    });

    ipcMain.handle('create-voucher', async (_e, voucher) => {
        const { voucherType, voucherDate, narration, rows } = voucher;
        const { data: maxRow } = await supabase.from('vouchers').select('voucher_number').eq('voucher_type', voucherType).order('id', { ascending: false }).limit(1).maybeSingle();
        const voucherNumber = String((parseInt(maxRow?.voucher_number || '0') || 0) + 1);
        const totalAmount = rows.reduce((s: number, r: any) => s + Math.max(Number(r.debit) || 0, Number(r.credit) || 0), 0) / 2;
        const { data: vData, error: vErr } = await supabase.from('vouchers').insert({ voucher_type: voucherType, voucher_number: voucherNumber, date: voucherDate, narration, total_amount: totalAmount, company_id: 1 }).select('id').single();
        if (vErr) throw vErr;
        for (const row of rows) {
            const { data: lRow } = await supabase.from('ledgers').select('id').eq('name', row.particulars).maybeSingle();
            const amount = row.type === 'Dr' ? Number(row.debit) : Number(row.credit);
            await supabase.from('voucher_entries').insert({ voucher_id: vData.id, ledger_id: lRow?.id || null, amount, type: row.type });
        }
        return { success: true, id: vData.id, voucherNumber };
    });

    ipcMain.handle('delete-voucher', async (_e, id: number) => {
        await supabase.from('voucher_entries').delete().eq('voucher_id', id);
        const { error } = await supabase.from('vouchers').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    // ═══ INVENTORY — UNITS ═══════════════════════════════════════════════════════

    ipcMain.handle('get-units', async () => {
        const { data, error } = await supabase.from('units').select('*').order('name');
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('create-unit', async (_e, unit) => {
        const { data, error } = await supabase.from('units').insert({ name: unit.name, symbol: unit.symbol, precision: unit.precision || 0, company_id: 1 }).select('id').single();
        if (error) throw error;
        return { success: true, id: data.id };
    });

    ipcMain.handle('delete-unit', async (_e, id: number) => {
        const { error } = await supabase.from('units').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    // ═══ INVENTORY — STOCK GROUPS ════════════════════════════════════════════════

    ipcMain.handle('get-stock-groups', async () => {
        const { data, error } = await supabase.from('stock_groups').select('*, parent:stock_groups!parent_id(name)').order('name');
        if (error) throw error;
        return (data || []).map((g: any) => ({ ...g, parent_name: g.parent?.name || null }));
    });

    ipcMain.handle('create-stock-group', async (_e, group) => {
        let parentId: number | null = null;
        if (group.parent && group.parent !== 'Primary') {
            const { data } = await supabase.from('stock_groups').select('id').eq('name', group.parent).maybeSingle();
            parentId = data?.id || null;
        }
        const { data, error } = await supabase.from('stock_groups').insert({ name: group.name, parent_id: parentId, company_id: 1 }).select('id').single();
        if (error) throw error;
        return { success: true, id: data.id };
    });

    ipcMain.handle('delete-stock-group', async (_e, id: number) => {
        const { error } = await supabase.from('stock_groups').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    // ═══ INVENTORY — STOCK ITEMS ═════════════════════════════════════════════════

    ipcMain.handle('get-stock-items', async () => {
        const { data, error } = await supabase.from('stock_items').select('*, group:stock_groups(name), unit:units(name,symbol)').order('name');
        if (error) throw error;
        return (data || []).map((i: any) => ({ ...i, group_name: i.group?.name || null, unit_name: i.unit?.name || null, unit_symbol: i.unit?.symbol || null }));
    });

    ipcMain.handle('create-stock-item', async (_e, item) => {
        const { name, group, unit, openingQty, openingRate } = item;
        const { data: uRow } = await supabase.from('units').select('id').eq('name', unit).maybeSingle();
        const { data: gRow } = await supabase.from('stock_groups').select('id').eq('name', group).maybeSingle();
        const openValue = (Number(openingQty) || 0) * (Number(openingRate) || 0);
        const { data, error } = await supabase.from('stock_items').insert({ name, group_id: gRow?.id || null, unit_id: uRow?.id || null, opening_qty: openingQty || 0, opening_rate: openingRate || 0, opening_value: openValue, company_id: 1 }).select('id').single();
        if (error) throw error;
        return { success: true, id: data.id };
    });

    ipcMain.handle('delete-stock-item', async (_e, id: number) => {
        const { error } = await supabase.from('stock_items').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    // ═══ COMPANIES ════════════════════════════════════════════════════════════════

    ipcMain.handle('get-companies', async () => {
        const { data, error } = await supabase.from('companies').select('*').order('name');
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('create-company', async (_e, c) => {
        const { data, error } = await supabase.from('companies').insert({ name: c.name, mailing_name: c.mailingName || c.name, address: c.address || '', country: c.country || 'Bangladesh', state: c.state || '', phone: c.phone || '', email: c.email || '', financial_year_from: c.financialYearFrom || '', books_begin_from: c.booksBeginFrom || '', base_currency_symbol: c.currencySymbol || '৳' }).select('id').single();
        if (error) throw error;
        return { success: true, id: data.id };
    });

    // ═══ DASHBOARD ════════════════════════════════════════════════════════════════

    ipcMain.handle('get-dashboard-stats', async () => {
        const [ledgers, groups, vouchers, stockItems, products, bills, recentV] = await Promise.all([
            supabase.from('ledgers').select('id', { count: 'exact', head: true }),
            supabase.from('groups').select('id', { count: 'exact', head: true }),
            supabase.from('vouchers').select('id,total_amount'),
            supabase.from('stock_items').select('id', { count: 'exact', head: true }),
            supabase.from('products').select('id', { count: 'exact', head: true }),
            supabase.from('bills').select('grand_total'),
            supabase.from('vouchers').select('*').order('date', { ascending: false }).order('id', { ascending: false }).limit(5),
        ]);
        return {
            ledgerCount: ledgers.count || 0,
            groupCount: groups.count || 0,
            voucherCount: (vouchers.data || []).length,
            totalTransactions: (vouchers.data || []).reduce((s: number, v: any) => s + (v.total_amount || 0), 0),
            stockItemCount: stockItems.count || 0,
            productCount: products.count || 0,
            totalRevenue: (bills.data || []).reduce((s: number, b: any) => s + (b.grand_total || 0), 0),
            recentVouchers: recentV.data || [],
        };
    });

    // ═══ PRODUCTS ════════════════════════════════════════════════════════════════

    ipcMain.handle('get-products', async () => {
        const { data, error } = await supabase.from('products').select('*, unit:units(name,symbol), group:stock_groups(name)').order('name');
        if (error) throw error;
        return (data || []).map((p: any) => ({ ...p, unit_name: p.unit?.name || null, unit_symbol: p.unit?.symbol || null, group_name: p.group?.name || null }));
    });

    ipcMain.handle('get-product', async (_e, id: number) => {
        const { data, error } = await supabase.from('products').select('*, unit:units(name,symbol), group:stock_groups(name)').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return { ...data, unit_name: data.unit?.name || null, unit_symbol: data.unit?.symbol || null, group_name: data.group?.name || null };
    });

    ipcMain.handle('create-product', async (_e, product) => {
        const { name, sku, category, purchasePrice, sellingPrice, taxRate, hsnCode, description, unit, stockGroup, imagePath, quantity } = product;
        const { data: uRow } = await supabase.from('units').select('id').eq('name', unit).maybeSingle();
        const { data: gRow } = await supabase.from('stock_groups').select('id').eq('name', stockGroup).maybeSingle();
        const { data, error } = await supabase.from('products').insert({ name, sku: sku || '', category: category || '', purchase_price: purchasePrice || 0, selling_price: sellingPrice || 0, tax_rate: taxRate || 0, hsn_code: hsnCode || '', description: description || '', unit_id: uRow?.id || null, stock_group_id: gRow?.id || null, company_id: 1, image_path: imagePath || '', quantity: quantity || 0 }).select('id').single();
        if (error) throw error;
        syncProductToMySQL({ localId: data.id, name, sku: sku || '', category: category || '', sellingPrice: sellingPrice || 0, description: description || '', imagePath: imagePath || '', quantity: quantity || 0 });
        return { success: true, id: data.id };
    });

    ipcMain.handle('update-product', async (_e, product) => {
        const { id, name, sku, category, purchasePrice, sellingPrice, taxRate, hsnCode, description, unit, stockGroup, imagePath, quantity } = product;
        const { data: uRow } = await supabase.from('units').select('id').eq('name', unit).maybeSingle();
        const { data: gRow } = await supabase.from('stock_groups').select('id').eq('name', stockGroup).maybeSingle();
        const { error } = await supabase.from('products').update({ name, sku: sku || '', category: category || '', purchase_price: purchasePrice || 0, selling_price: sellingPrice || 0, tax_rate: taxRate || 0, hsn_code: hsnCode || '', description: description || '', unit_id: uRow?.id || null, stock_group_id: gRow?.id || null, image_path: imagePath || '', quantity: quantity || 0 }).eq('id', id);
        if (error) throw error;
        syncProductToMySQL({ localId: id, name, sku: sku || '', category: category || '', sellingPrice: sellingPrice || 0, description: description || '', imagePath: imagePath || '', quantity: quantity || 0 });
        return { success: true };
    });

    ipcMain.handle('delete-product', async (_e, id: number) => {
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('search-products-detailed', async (_e, query: string) => {
        const q = `%${query}%`;
        const { data, error } = await supabase.from('products').select('*, unit:units(symbol), group:stock_groups(name)').or(`name.ilike.${q},sku.ilike.${q},category.ilike.${q}`).limit(20);
        if (error) throw error;
        return (data || []).map((p: any) => ({ ...p, unit_symbol: p.unit?.symbol || null, group_name: p.group?.name || null }));
    });

    // ═══ BILLING / POS ═══════════════════════════════════════════════════════════

    ipcMain.handle('search-billing-customers', async (_e, query: string) => {
        const q = `%${query}%`;
        const { data } = await supabase.from('billing_customers').select('*').or(`phone.ilike.${q},name.ilike.${q}`).order('name').limit(10);
        return data || [];
    });

    ipcMain.handle('create-billing-customer', async (_e, customer) => {
        const { name, phone, email, address } = customer;
        if (phone) {
            const { data: existing } = await supabase.from('billing_customers').select('*').eq('phone', phone).maybeSingle();
            if (existing) {
                await supabase.from('billing_customers').update({ name: name || existing.name, email: email || existing.email, address: address || existing.address }).eq('id', existing.id);
                return { ...existing, name: name || existing.name };
            }
        }
        const { data, error } = await supabase.from('billing_customers').insert({ name, phone: phone || null, email: email || '', address: address || '', total_bills: 0 }).select('*').single();
        if (error) throw error;
        return data;
    });

    ipcMain.handle('create-bill', async (_e, billData) => {
        const { customer_id, billed_by, items, subtotal, discount_total, grand_total } = billData;
        const now = new Date();
        const dateStr = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        const { data: cust } = await supabase.from('billing_customers').select('phone').eq('id', customer_id).maybeSingle();
        const phoneLast4 = cust?.phone ? cust.phone.slice(-4) : '0000';
        const { count } = await supabase.from('bills').select('id', { count: 'exact', head: true }).ilike('invoice_number', `${dateStr}%`);
        const serial = String((count || 0) + 1).padStart(3, '0');
        const invoiceNumber = `${dateStr}-${phoneLast4}-${serial}`;
        const { data: bill, error: bErr } = await supabase.from('bills').insert({ invoice_number: invoiceNumber, customer_id, billed_by: billed_by || 'Admin', subtotal, discount_total, grand_total }).select('id').single();
        if (bErr) throw bErr;
        if (items.length > 0) {
            await supabase.from('bill_items').insert(items.map((item: any) => ({ bill_id: bill.id, product_id: item.product_id, product_name: item.product_name, sku: item.sku || '', quantity: item.quantity, mrp: item.mrp, discount_pct: item.discount_pct || 0, discount_amt: item.discount_amt || 0, price: item.price })));
            for (const item of items) {
                if (item.product_id && item.quantity) {
                    await supabase.rpc('decrement_product_qty', { p_id: item.product_id, qty: item.quantity }).catch(() => { });
                    syncStockToMySQL(item.product_id, item.quantity);
                }
            }
        }
        await supabase.from('billing_customers').update({ total_bills: (supabase as any).sql`total_bills + 1` }).eq('id', customer_id).catch(() => { });
        return { success: true, id: bill.id, invoice_number: invoiceNumber };
    });

    ipcMain.handle('get-bills', async () => {
        const { data, error } = await supabase.from('bills').select('*, customer:billing_customers(name,phone)').order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map((b: any) => ({ ...b, customer_name: b.customer?.name || null, customer_phone: b.customer?.phone || null }));
    });

    ipcMain.handle('get-bill-details', async (_e, billId: number) => {
        const { data: bill } = await supabase.from('bills').select('*, customer:billing_customers(name,phone,email,address)').eq('id', billId).maybeSingle();
        if (!bill) return null;
        const { data: items } = await supabase.from('bill_items').select('*, product:products(image_path)').eq('bill_id', billId);
        return { ...bill, customer_name: bill.customer?.name, customer_phone: bill.customer?.phone, customer_email: bill.customer?.email, customer_address: bill.customer?.address, items: (items || []).map((i: any) => ({ ...i, image_path: i.product?.image_path || null })) };
    });

    ipcMain.handle('update-bill', async (_e, billData: any) => {
        const { bill_id, items, subtotal, discount_total, grand_total, changed_by } = billData;
        const { data: oldBill } = await supabase.from('bills').select('*').eq('id', bill_id).maybeSingle();
        if (!oldBill) return { success: false, error: 'Bill not found' };
        const { data: oldItems } = await supabase.from('bill_items').select('*').eq('bill_id', bill_id);
        // Audit
        const auditRows: any[] = [];
        if (Math.abs(oldBill.subtotal - subtotal) > 0.01) auditRows.push({ bill_id, field_changed: 'subtotal', old_value: String(oldBill.subtotal), new_value: String(subtotal), changed_by });
        if (Math.abs(oldBill.grand_total - grand_total) > 0.01) auditRows.push({ bill_id, field_changed: 'grand_total', old_value: String(oldBill.grand_total), new_value: String(grand_total), changed_by });
        if (auditRows.length) await supabase.from('bill_audit').insert(auditRows);
        // Restore old stock
        for (const oi of (oldItems || [])) {
            await supabase.from('products').update({ quantity: (supabase as any).sql`quantity + ${oi.quantity}` }).eq('id', oi.product_id).catch(() => { });
        }
        // Update bill
        await supabase.from('bills').update({ subtotal, discount_total, grand_total }).eq('id', bill_id);
        // Replace items
        await supabase.from('bill_items').delete().eq('bill_id', bill_id);
        if (items.length) {
            await supabase.from('bill_items').insert(items.map((i: any) => ({ bill_id, product_id: i.product_id, product_name: i.product_name, sku: i.sku || '', quantity: i.quantity, mrp: i.mrp, discount_pct: i.discount_pct || 0, discount_amt: i.discount_amt || 0, price: i.price })));
            for (const i of items) {
                await supabase.from('products').update({ quantity: (supabase as any).sql`GREATEST(quantity - ${i.quantity}, 0)` }).eq('id', i.product_id).catch(() => { });
            }
        }
        return { success: true };
    });

    ipcMain.handle('get-bill-audit', async (_e, billId: number) => {
        const { data } = await supabase.from('bill_audit').select('*').eq('bill_id', billId).order('changed_at', { ascending: false });
        return data || [];
    });

    // ═══ PURCHASE BILLS ═══════════════════════════════════════════════════════════

    ipcMain.handle('get-purchase-bills', async () => {
        const { data, error } = await supabase.from('purchase_bills').select('*, supplier:ledgers(name)').order('bill_date', { ascending: false }).order('id', { ascending: false });
        if (error) throw error;
        return (data || []).map((b: any) => ({ ...b, supplier_name: b.supplier?.name || null }));
    });

    ipcMain.handle('create-purchase-bill', async (_e, bill) => {
        const { billNumber, billDate, dueDate, supplierLedgerId, narration, items } = bill;
        let subtotal = 0, taxTotal = 0;
        (items || []).forEach((item: any) => { const la = (Number(item.qty) || 0) * (Number(item.rate) || 0); subtotal += la; taxTotal += la * ((Number(item.taxRate) || 0) / 100); });
        const { data: pb, error } = await supabase.from('purchase_bills').insert({ bill_number: billNumber, bill_date: billDate, due_date: dueDate || '', supplier_ledger_id: supplierLedgerId || null, narration: narration || '', subtotal, tax_total: taxTotal, grand_total: subtotal + taxTotal, company_id: 1 }).select('id').single();
        if (error) throw error;
        if ((items || []).length) {
            await supabase.from('purchase_bill_items').insert((items as any[]).map((item: any) => { const la = (Number(item.qty) || 0) * (Number(item.rate) || 0); const lt = la * ((Number(item.taxRate) || 0) / 100); return { bill_id: pb.id, product_id: item.productId || null, description: item.description || '', qty: item.qty || 0, rate: item.rate || 0, tax_rate: item.taxRate || 0, tax_amount: lt, amount: la + lt }; }));
        }
        return { success: true, id: pb.id };
    });

    ipcMain.handle('delete-purchase-bill', async (_e, id: number) => {
        await supabase.from('purchase_bill_items').delete().eq('bill_id', id);
        const { error } = await supabase.from('purchase_bills').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });


    // ═══ CHANGE PASSWORD ══════════════════════════════════════════════════════
    ipcMain.handle('change-password', async (_e, data: { id: number; currentPassword: string; newPassword: string }) => {
        const id = Number(data?.id);
        const currentPassword = typeof data?.currentPassword === 'string' ? data.currentPassword : '';
        const newPassword = typeof data?.newPassword === 'string' ? data.newPassword : '';
        if (!id || !currentPassword || newPassword.length < 6) return { success: false, error: 'New password must be at least 6 characters' };
        const { data: row } = await supabase.from('users').select('id,password_hash').eq('id', id).maybeSingle();
        if (!row) return { success: false, error: 'User not found' };
        const stored = row.password_hash || '';
        let matches = stored.startsWith('$2b$') || stored.startsWith('$2a$') ? await bcrypt.compare(currentPassword, stored) : stored === currentPassword;
        if (!matches) return { success: false, error: 'Incorrect current password' };
        const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await supabase.from('users').update({ password_hash: newHash }).eq('id', id);
        return { success: true };
    });

    // ═══ USERS ════════════════════════════════════════════════════════════════
    ipcMain.handle('get-users', async () => {
        const { data, error } = await supabase.from('users').select('id,username,full_name,role,email,phone,is_active,created_at').order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('create-user', async (_e, user) => {
        const { username, password, fullName, role, email, phone } = user;
        if (!username?.trim()) return { success: false, error: 'Username is required' };
        if (!password || password.length < 6) return { success: false, error: 'Password must be at least 6 characters' };
        const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const { data, error } = await supabase.from('users').insert({ username: username.trim(), password_hash: hash, full_name: fullName || '', role: role || 'operator', email: email || '', phone: phone || '' }).select('id').single();
        if (error) return { success: false, error: error.message?.includes('unique') ? 'Username already exists' : error.message };
        return { success: true, id: data.id };
    });

    ipcMain.handle('update-user', async (_e, user) => {
        const { id, fullName, role, email, phone, isActive } = user;
        const { error } = await supabase.from('users').update({ full_name: fullName, role, email: email || '', phone: phone || '', is_active: isActive !== undefined ? isActive : 1 }).eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('delete-user', async (_e, id: number) => {
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('authenticate-user', async (_e, credentials) => {
        const username = typeof credentials?.username === 'string' ? credentials.username.trim() : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        if (!username || !password) return { success: false, error: 'Invalid credentials' };
        const bf = checkBruteForce(username);
        if (bf.locked) return { success: false, error: `Too many failed attempts. Try again in ${bf.remaining} minute(s).` };
        const { data: row } = await supabase.from('users').select('id,username,password_hash,full_name,role,email,is_active').eq('username', username).eq('is_active', 1).maybeSingle();
        if (!row) { recordFailedLogin(username); await bcrypt.hash('dummy', 4); return { success: false, error: 'Invalid credentials or account disabled' }; }
        const stored = row.password_hash || '';
        let valid = stored.startsWith('$2b$') || stored.startsWith('$2a$') ? await bcrypt.compare(password, stored) : stored === password;
        if (!valid && !(stored.startsWith('$2b$') || stored.startsWith('$2a$')) && stored === password) {
            const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
            await supabase.from('users').update({ password_hash: newHash }).eq('id', row.id);
            valid = true;
        }
        if (!valid) { recordFailedLogin(username); return { success: false, error: 'Invalid credentials or account disabled' }; }
        resetLoginAttempts(username);
        const { password_hash: _omit, ...safeUser } = row;
        return { success: true, user: safeUser };
    });

    // ═══ SETTINGS ═════════════════════════════════════════════════════════════
    ipcMain.handle('get-settings', async () => {
        const { data } = await supabase.from('companies').select('*').eq('id', 1).maybeSingle();
        return data || {};
    });

    ipcMain.handle('update-settings', async (_e, s) => {
        const { error } = await supabase.from('companies').update({ name: s.name, mailing_name: s.mailingName || '', address: s.address || '', country: s.country || 'Bangladesh', state: s.state || '', phone: s.phone || '', email: s.email || '', financial_year_from: s.financialYearFrom || '', books_begin_from: s.booksBeginFrom || '', base_currency_symbol: s.currencySymbol || '৳' }).eq('id', 1);
        if (error) throw error;
        return { success: true };
    });

    // ═══ USER GROUPS ══════════════════════════════════════════════════════════
    ipcMain.handle('get-user-groups', async () => {
        const { data, error } = await supabase.from('user_groups').select('*').order('id');
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('create-user-group', async (_e, group) => {
        const { data, error } = await supabase.from('user_groups').insert({ name: group.name, description: group.description || '', permissions: JSON.stringify(group.permissions || {}) }).select('id').single();
        if (error) throw error;
        return { success: true, id: data.id };
    });

    ipcMain.handle('update-user-group', async (_e, group) => {
        const { error } = await supabase.from('user_groups').update({ name: group.name, description: group.description || '', permissions: JSON.stringify(group.permissions || {}) }).eq('id', group.id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('delete-user-group', async (_e, id: number) => {
        const { error } = await supabase.from('user_groups').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    // ═══ NOTIFICATIONS ════════════════════════════════════════════════════════
    ipcMain.handle('get-notifications', async (_e, userId: number) => {
        const { data, error } = await supabase.from('notifications').select('*, sender:users!sender_id(full_name)').or(`recipient_id.eq.${userId},recipient_id.is.null`).order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        return (data || []).map((n: any) => ({ ...n, sender_name: n.sender?.full_name || null }));
    });

    ipcMain.handle('send-notification', async (_e, notification: any) => {
        const { title, message, senderId, recipientIds } = notification;
        if (!recipientIds || recipientIds.length === 0) {
            const { data, error } = await supabase.from('notifications').insert({ title, message, sender_id: senderId, recipient_id: null }).select('id').single();
            if (error) throw error;
            return { success: true, id: data.id };
        }
        const rows = recipientIds.map((rid: number) => ({ title, message, sender_id: senderId, recipient_id: rid }));
        const { error } = await supabase.from('notifications').insert(rows);
        if (error) throw error;
        return { success: true, count: recipientIds.length };
    });

    ipcMain.handle('mark-notification-read', async (_e, id: number) => {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
        return { success: true };
    });

    ipcMain.handle('mark-all-notifications-read', async (_e, userId: number) => {
        await supabase.from('notifications').update({ is_read: true }).or(`recipient_id.eq.${userId},recipient_id.is.null`).eq('is_read', false);
        return { success: true };
    });

    ipcMain.handle('delete-notification', async (_e, id: number) => {
        await supabase.from('notifications').delete().eq('id', id);
        return { success: true };
    });

    // ═══ FILE PICKERS ═════════════════════════════════════════════════════════
    ipcMain.handle('pick-image', async () => {
        const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }] });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('pick-chat-file', async () => {
        const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'All Files', extensions: ['*'] }, { name: 'Images', extensions: ['jpg', 'png', 'gif', 'webp'] }, { name: 'Docs', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'] }] });
        if (result.canceled || result.filePaths.length === 0) return null;
        return { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
    });


    // ═══ REPORTS ════════════════════════════════════════════════════════

    ipcMain.handle('report-trial-balance', async () => {
        const { data: ledgers } = await supabase.from('ledgers').select('id,name,opening_balance,opening_balance_type,group:groups(name,nature)').order('name');
        const { data: entries } = await supabase.from('voucher_entries').select('ledger_id,amount,type');
        const entryMap: Record<number, { dr: number; cr: number }> = {};
        for (const e of (entries || [])) {
            if (!entryMap[e.ledger_id]) entryMap[e.ledger_id] = { dr: 0, cr: 0 };
            if (e.type === 'Dr') entryMap[e.ledger_id].dr += e.amount; else entryMap[e.ledger_id].cr += e.amount;
        }
        return (ledgers || []).map((l: any) => ({ ...l, group_name: l.group?.name, nature: l.group?.nature, total_debit: entryMap[l.id]?.dr || 0, total_credit: entryMap[l.id]?.cr || 0 }));
    });

    ipcMain.handle('report-balance-sheet', async () => {
        const { data } = await supabase.from('ledgers').select('id,name,opening_balance,opening_balance_type,group:groups!inner(name,nature)').in('groups.nature', ['Assets', 'Liabilities']).order('name');
        const { data: entries } = await supabase.from('voucher_entries').select('ledger_id,amount,type');
        const em: Record<number, { dr: number; cr: number }> = {};
        for (const e of (entries || [])) { if (!em[e.ledger_id]) em[e.ledger_id] = { dr: 0, cr: 0 }; if (e.type === 'Dr') em[e.ledger_id].dr += e.amount; else em[e.ledger_id].cr += e.amount; }
        return (data || []).map((l: any) => ({ ...l, group_name: l.group?.name, nature: l.group?.nature, total_debit: em[l.id]?.dr || 0, total_credit: em[l.id]?.cr || 0 }));
    });

    ipcMain.handle('report-profit-and-loss', async () => {
        const { data } = await supabase.from('ledgers').select('id,name,opening_balance,opening_balance_type,group:groups!inner(name,nature)').in('groups.nature', ['Income', 'Expenses']).order('name');
        const { data: entries } = await supabase.from('voucher_entries').select('ledger_id,amount,type');
        const em: Record<number, { dr: number; cr: number }> = {};
        for (const e of (entries || [])) { if (!em[e.ledger_id]) em[e.ledger_id] = { dr: 0, cr: 0 }; if (e.type === 'Dr') em[e.ledger_id].dr += e.amount; else em[e.ledger_id].cr += e.amount; }
        return (data || []).map((l: any) => ({ ...l, group_name: l.group?.name, nature: l.group?.nature, total_debit: em[l.id]?.dr || 0, total_credit: em[l.id]?.cr || 0 }));
    });

    ipcMain.handle('report-stock-summary', async () => {
        const { data: products } = await supabase.from('products').select('id,name,sku,category,quantity,purchase_price,selling_price,image_path,unit:units(symbol)').order('name');
        const { data: pbi } = await supabase.from('purchase_bill_items').select('product_id,qty,amount');
        const pbiMap: Record<number, { qty: number; value: number }> = {};
        for (const i of (pbi || [])) { if (!pbiMap[i.product_id]) pbiMap[i.product_id] = { qty: 0, value: 0 }; pbiMap[i.product_id].qty += i.qty || 0; pbiMap[i.product_id].value += i.amount || 0; }
        return (products || []).map((p: any) => ({ ...p, unit_symbol: p.unit?.symbol || null, purchased_qty: pbiMap[p.id]?.qty || 0, purchased_value: pbiMap[p.id]?.value || 0 }));
    });

    ipcMain.handle('report-day-book', async (_e, params) => {
        const { fromDate, toDate } = params || {};
        let q = supabase.from('vouchers').select('id,voucher_type,voucher_number,date,narration,total_amount,voucher_entries(amount,type,ledger:ledgers(name))').order('date', { ascending: false }).order('id', { ascending: false });
        if (fromDate && toDate) q = q.gte('date', fromDate).lte('date', toDate);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []).flatMap((v: any) =>
            (v.voucher_entries || []).map((e: any) => ({ id: v.id, voucher_type: v.voucher_type, voucher_number: v.voucher_number, date: v.date, narration: v.narration, total_amount: v.total_amount, entry_amount: e.amount, entry_type: e.type, ledger_name: e.ledger?.name || null }))
        );
    });

    // ═══ INTERNAL CHAT & PRESENCE ════════════════════════════════════════

    ipcMain.handle('get-chat-messages', async (_e, { senderId, receiverId }) => {
        const { data, error } = await supabase.from('internal_messages').select('*').or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`).order('created_at');
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('send-chat-message', async (_e, message) => {
        const { senderId, receiverId, messageType, content, fileName } = message;
        const { data, error } = await supabase.from('internal_messages').insert({ sender_id: senderId, receiver_id: receiverId, message_type: messageType || 'text', content, file_name: fileName || null }).select('id,created_at').single();
        if (error) throw error;
        return { success: true, id: data.id, created_at: data.created_at };
    });

    ipcMain.handle('update-user-presence', async (_e, userId: number) => {
        userPresence.set(userId, Date.now());
        return { success: true };
    });

    ipcMain.handle('get-online-users', async () => {
        const now = Date.now();
        const onlineIds: number[] = [];
        userPresence.forEach((ts, uid) => { if (now - ts < 15000) onlineIds.push(uid); });
        return onlineIds;
    });

    ipcMain.handle('set-typing-status', async (_e, { senderId, receiverId, isTyping }: { senderId: number; receiverId: number; isTyping: boolean }) => {
        const key = `${senderId}->${receiverId}`;
        if (isTyping) userTyping.set(key, Date.now()); else userTyping.delete(key);
        return { success: true };
    });

    ipcMain.handle('get-typing-status', async (_e, { receiverId }: { receiverId: number }) => {
        const now = Date.now();
        const typingUsers: number[] = [];
        userTyping.forEach((ts, key) => { const [sender, recv] = key.split('->').map(Number); if (recv === receiverId && now - ts < 3000) typingUsers.push(sender); });
        return typingUsers;
    });

    // ═══ MAKE MODULE ══════════════════════════════════════════════════════

    ipcMain.handle('get-make-orders', async () => {
        const { data, error } = await supabase.from('make_orders').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('create-make-order', async (_e, order) => {
        const { data, error } = await supabase.from('make_orders').insert({ furniture_name: order.furniture_name, description: order.description || '', quantity: order.quantity || 1, designer_name: order.designer_name, status: 'Placed', priority: order.priority || 'Normal' }).select('id').single();
        if (error) throw error;
        await supabase.from('make_order_updates').insert({ order_id: data.id, status: 'Placed', note: 'Order placed', updated_by: order.designer_name });
        return { id: data.id };
    });

    ipcMain.handle('update-make-order-status', async (_e, { orderId, status, note, updatedBy }) => {
        await supabase.from('make_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId);
        await supabase.from('make_order_updates').insert({ order_id: orderId, status, note: note || '', updated_by: updatedBy });
        return { success: true };
    });

    ipcMain.handle('get-make-order-updates', async (_e, orderId) => {
        const { data } = await supabase.from('make_order_updates').select('*').eq('order_id', orderId).order('created_at');
        return data || [];
    });

    ipcMain.handle('delete-make-order', async (_e, id) => {
        await supabase.from('make_order_updates').delete().eq('order_id', id);
        await supabase.from('make_orders').delete().eq('id', id);
        return { success: true };
    });

    ipcMain.handle('get-make-furniture-names', async () => {
        const { data } = await supabase.from('make_orders').select('furniture_name').order('furniture_name');
        return [...new Set((data || []).map((r: any) => r.furniture_name))];
    });

    // ═══ PRINTERS ═════════════════════════════════════════════════════════

    ipcMain.handle('get-printers', async () => {
        try {
            const mainWin = BrowserWindow.getAllWindows()[0];
            if (!mainWin) return [];
            const printers = await mainWin.webContents.getPrintersAsync();
            return printers.map((p: any) => ({ name: p.name, isDefault: p.isDefault || p.status === 0 }));
        } catch { return []; }
    });

    // ═══ AUDIT LOG ════════════════════════════════════════════════════════

    ipcMain.handle('get-audit-log', async (_e, { module, limit }: any) => {
        let q = supabase.from('system_audit_log').select('*').order('performed_at', { ascending: false }).limit(limit || 200);
        if (module) q = q.eq('module', module);
        const { data } = await q;
        return data || [];
    });


    // ═══ BILL ALTER APPROVAL ══════════════════════════════════════════════

    ipcMain.handle('stage-bill-alteration', async (_e, { billId, changes, reason, changedBy }: any) => {
        const { data: currentBill } = await supabase.from('bills').select('*').eq('id', billId).maybeSingle();
        const { data: items } = await supabase.from('bill_items').select('*').eq('bill_id', billId);
        const snapshot = { ...currentBill, items: items || [] };
        const { data, error } = await supabase.from('bill_audit').insert({ bill_id: billId, field_changed: 'items', old_value: JSON.stringify(snapshot), staged_data: JSON.stringify(changes), alter_reason: reason || '', alter_status: 'pending_approval', changed_by: changedBy }).select('id').single();
        if (error) throw error;
        await writeAuditLog({ module: 'Billing', action: 'BILL_ALTER_REQUESTED', entity_type: 'bill', entity_id: billId, description: `Alteration requested by ${changedBy}. Reason: ${reason}`, old_value: snapshot, new_value: changes, performed_by: changedBy });
        return { success: true, audit_id: data.id };
    });

    ipcMain.handle('get-pending-alterations', async () => {
        const { data, error } = await supabase.from('bill_audit').select('*, bill:bills(invoice_number, customer:billing_customers(name))').eq('alter_status', 'pending_approval').order('changed_at', { ascending: false });
        if (error) throw error;
        return (data || []).map((r: any) => ({ ...r, invoice_number: r.bill?.invoice_number, customer_name: r.bill?.customer?.name }));
    });

    ipcMain.handle('approve-alteration', async (_e, { auditId, reviewedBy }: any) => {
        const { data: audit } = await supabase.from('bill_audit').select('*').eq('id', auditId).maybeSingle();
        if (!audit?.staged_data) throw new Error('Alteration not found');
        const staged = JSON.parse(audit.staged_data);
        const items: any[] = staged.items || [];
        await supabase.from('bill_items').delete().eq('bill_id', audit.bill_id);
        if (items.length) {
            await supabase.from('bill_items').insert(items.map((i: any) => ({ bill_id: audit.bill_id, product_id: i.product_id || null, product_name: i.product_name, sku: i.sku || '', quantity: i.quantity, mrp: i.mrp, discount_pct: i.discount_pct || 0, discount_amt: i.discount_amt || 0, price: i.price })));
            const subtotal = items.reduce((s: number, i: any) => s + i.mrp * i.quantity, 0);
            const discountTotal = items.reduce((s: number, i: any) => s + (i.discount_amt || 0), 0);
            await supabase.from('bills').update({ subtotal, discount_total: discountTotal, grand_total: staged.grand_total || (subtotal - discountTotal) }).eq('id', audit.bill_id);
        }
        await supabase.from('bill_audit').update({ alter_status: 'approved', reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() }).eq('id', auditId);
        await writeAuditLog({ module: 'Billing', action: 'BILL_ALTER_APPROVED', entity_type: 'bill', entity_id: audit.bill_id, description: `Approved by ${reviewedBy}`, performed_by: reviewedBy });
        return { success: true };
    });

    ipcMain.handle('reject-alteration', async (_e, { auditId, reviewedBy, rejectReason }: any) => {
        const { data: audit } = await supabase.from('bill_audit').select('bill_id,alter_reason').eq('id', auditId).maybeSingle();
        await supabase.from('bill_audit').update({ alter_status: 'rejected', reviewed_by: reviewedBy, reviewed_at: new Date().toISOString(), alter_reason: `${audit?.alter_reason || ''} | Rejected: ${rejectReason || ''}` }).eq('id', auditId);
        await writeAuditLog({ module: 'Billing', action: 'BILL_ALTER_REJECTED', entity_type: 'bill', entity_id: audit?.bill_id, description: `Rejected by ${reviewedBy}. Reason: ${rejectReason}`, performed_by: reviewedBy });
        return { success: true };
    });

    // ═══ SHIPPING ═════════════════════════════════════════════════════════

    ipcMain.handle('add-bill-shipping', async (_e, data: any) => {
        const { data: sh, error } = await supabase.from('bill_shipping').upsert({ bill_id: data.bill_id, ship_to_name: data.ship_to_name, ship_to_address: data.ship_to_address, ship_to_phone: data.ship_to_phone || '', ship_from_name: data.ship_from_name || '', ship_from_address: data.ship_from_address || '', shipping_charge: data.shipping_charge || 0, updated_by: data.updated_by, status: 'pending_payment' }, { onConflict: 'bill_id' }).select('id').single();
        if (error) throw error;
        await supabase.from('shipping_status_log').insert({ shipment_id: sh.id, bill_id: data.bill_id, status: 'pending_payment', note: 'Shipping order created', updated_by: data.updated_by, updated_by_role: data.user_role || 'cashier' });
        await writeAuditLog({ module: 'Shipping', action: 'SHIPPING_CREATED', entity_type: 'bill', entity_id: data.bill_id, description: `Shipping added. Destination: ${data.ship_to_address}`, new_value: data, performed_by: data.updated_by });
        return { success: true, id: sh.id };
    });

    ipcMain.handle('get-bill-shipping', async (_e, billId: number) => {
        const { data } = await supabase.from('bill_shipping').select('*').eq('bill_id', billId).maybeSingle();
        return data || null;
    });

    ipcMain.handle('get-all-shipments', async (_e, { status }: any = {}) => {
        let q = supabase.from('bill_shipping').select('*, bill:bills(invoice_number,grand_total,created_at,customer:billing_customers(name,phone))').order('created_at', { ascending: false });
        if (status) q = q.eq('status', status);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []).map((s: any) => ({ ...s, invoice_number: s.bill?.invoice_number, bill_date: s.bill?.created_at, customer_name: s.bill?.customer?.name, customer_phone: s.bill?.customer?.phone }));
    });

    ipcMain.handle('get-shipment-history', async (_e, shipmentId: number) => {
        const { data } = await supabase.from('shipping_status_log').select('*').eq('shipment_id', shipmentId).order('created_at');
        return data || [];
    });

    ipcMain.handle('update-shipment-status', async (_e, { shipmentId, billId, status, note, updatedBy, userRole, imagePath }: any) => {
        const upd: any = { status, updated_by: updatedBy, updated_at: new Date().toISOString() };
        if (imagePath) upd.packaging_image_path = imagePath;
        if (note) upd.delivery_note = note;
        await supabase.from('bill_shipping').update(upd).eq('id', shipmentId);
        await supabase.from('shipping_status_log').insert({ shipment_id: shipmentId, bill_id: billId, status, note: note || '', image_path: imagePath || null, updated_by: updatedBy, updated_by_role: userRole });
        await writeAuditLog({ module: 'Shipping', action: 'SHIPPING_STATUS_UPDATED', entity_type: 'shipment', entity_id: shipmentId, description: `Status → "${status}" by ${updatedBy}`, new_value: { status, note }, performed_by: updatedBy });
        return { success: true };
    });

    ipcMain.handle('upload-packaging-image', async (_e, { shipmentId, billId, imageBase64, updatedBy, userRole }: any) => {
        try {
            const imgDir = path.join(app.getPath('userData'), 'packaging_images');
            if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
            const filename = `ship_${shipmentId}_${Date.now()}.jpg`;
            const imgPath = path.join(imgDir, filename);
            fs.writeFileSync(imgPath, Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
            await supabase.from('bill_shipping').update({ packaging_image_path: imgPath, updated_by: updatedBy, status: 'ready_to_ship', updated_at: new Date().toISOString() }).eq('id', shipmentId);
            await supabase.from('shipping_status_log').insert({ shipment_id: shipmentId, bill_id: billId, status: 'ready_to_ship', note: 'Packaging photo uploaded, ready to ship', image_path: imgPath, updated_by: updatedBy, updated_by_role: userRole });
            await writeAuditLog({ module: 'Shipping', action: 'PACKAGING_IMAGE_UPLOADED', entity_type: 'shipment', entity_id: shipmentId, description: `Photo uploaded by ${updatedBy}`, performed_by: updatedBy });
            return { success: true, imagePath: imgPath };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // ═══ LICENSE ══════════════════════════════════════════════════════════

    ipcMain.handle('get-machine-id', async () => licenseManager.getMachineId());
    ipcMain.handle('check-license', async () => licenseManager.isLicensed());
    ipcMain.handle('activate-license', async (_e, key: string) => {
        if (!key || typeof key !== 'string' || key.trim().length < 10) return { success: false, error: 'Invalid license key format' };
        return licenseManager.saveLicense(key.trim());
    });

    // ═══ DB MONITORING ════════════════════════════════════════════════════

    ipcMain.handle('get-db-monitoring', async () => {
        const [products, bills, users, vouchers, makeOrders] = await Promise.all([
            supabase.from('products').select('id', { count: 'exact', head: true }),
            supabase.from('bills').select('id', { count: 'exact', head: true }),
            supabase.from('users').select('id', { count: 'exact', head: true }),
            supabase.from('vouchers').select('id', { count: 'exact', head: true }),
            supabase.from('make_orders').select('id', { count: 'exact', head: true }),
        ]);
        return { products: products.count || 0, bills: bills.count || 0, users: users.count || 0, vouchers: vouchers.count || 0, makeOrders: makeOrders.count || 0, lastChecked: new Date().toISOString() };
    });

    // ═══ DB BACKUP (Supabase JSON export) ═════════════════════════════════

    function getBackupDir(): string {
        const d = path.join(app.getPath('userData'), 'backups');
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        return d;
    }

    ipcMain.handle('create-db-backup', async () => {
        try {
            const tables = ['groups', 'ledgers', 'vouchers', 'voucher_entries', 'products', 'bills', 'bill_items', 'billing_customers', 'purchase_bills', 'purchase_bill_items', 'users', 'notifications'];
            const backup: Record<string, any[]> = {};
            for (const t of tables) { const { data } = await supabase.from(t).select('*'); backup[t] = data || []; }
            const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const backupFile = path.join(getBackupDir(), `le-soft-backup-${ts}.json`);
            fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), 'utf-8');
            const files = fs.readdirSync(getBackupDir()).filter((f: string) => f.startsWith('le-soft-backup-') && f.endsWith('.json')).sort().reverse();
            files.slice(10).forEach((f: string) => { try { fs.unlinkSync(path.join(getBackupDir(), f)); } catch { } });
            return { success: true, path: backupFile, time: new Date().toISOString() };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('list-db-backups', async () => {
        try {
            return fs.readdirSync(getBackupDir()).filter((f: string) => f.startsWith('le-soft-backup-') && f.endsWith('.json')).map((f: string) => { const st = fs.statSync(path.join(getBackupDir(), f)); return { name: f, size: st.size, date: st.mtime.toISOString() }; }).sort((a: any, b: any) => b.date.localeCompare(a.date));
        } catch { return []; }
    });

    ipcMain.handle('restore-db-backup', async (_e, backupName: string) => {
        try {
            const backupPath = path.join(getBackupDir(), backupName);
            if (!fs.existsSync(backupPath)) return { success: false, error: 'Backup file not found' };
            const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
            for (const [table, rows] of Object.entries(backup)) {
                if (!Array.isArray(rows) || rows.length === 0) continue;
                await supabase.from(table).upsert(rows as any[]).catch(() => { });
            }
            return { success: true, message: 'Cloud data restored from backup.' };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // ═══ WOOCOMMERCE CSV IMPORT ════════════════════════════════════════════

    function parseCSVLine(line: string): string[] {
        const result: string[] = []; let current = ''; let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) { if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; } else if (ch === '"') { inQuotes = false; } else { current += ch; } }
            else { if (ch === '"') { inQuotes = true; } else if (ch === ',') { result.push(current); current = ''; } else { current += ch; } }
        }
        result.push(current); return result;
    }
    function stripHTML(html: string) { return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ').trim(); }

    ipcMain.handle('import-woocommerce-csv', async (_e, csvFilePath: string) => {
        try {
            let raw = fs.readFileSync(csvFilePath, 'utf-8');
            if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
            const lines: string[] = []; let cur = ''; let inQ = false;
            for (const ch of raw) { if (ch === '"') inQ = !inQ; if ((ch === '\n' || ch === '\r') && !inQ) { if (cur.trim()) lines.push(cur); cur = ''; } else if (ch !== '\r' || inQ) { cur += ch; } }
            if (cur.trim()) lines.push(cur);
            if (lines.length < 2) return { imported: 0, skipped: 0, errors: ['CSV has no data rows'] };
            const headers = parseCSVLine(lines[0]);
            const col = (n: string) => headers.indexOf(n);
            const iTitle = col('post_title'), iSku = col('sku'), iPrice = col('regular_price'), iSalePrice = col('sale_price'), iStock = col('stock'), iParent = col('post_parent'), iExcerpt = col('post_excerpt'), iImages = col('images'), iCategory = col('tax:product_cat'), iType = col('tax:product_type');
            // Ensure unit
            let unitId: number;
            const { data: uRow } = await supabase.from('units').select('id').or(`symbol.eq.pcs,name.eq.Pieces`).maybeSingle();
            if (uRow) { unitId = uRow.id; } else { const { data: nu } = await supabase.from('units').insert({ name: 'Pieces', symbol: 'pcs', precision: 0, company_id: 1 }).select('id').single(); unitId = nu!.id; }
            const { data: existingGroups } = await supabase.from('stock_groups').select('id,name');
            const categoryMap: Map<string, number> = new Map();
            (existingGroups || []).forEach((g: any) => categoryMap.set(g.name.toLowerCase(), g.id));
            const allCats = new Set<string>();
            for (let i = 1; i < lines.length; i++) { const f = parseCSVLine(lines[i]); if (iCategory >= 0 && f[iCategory]) { f[iCategory].split('|').forEach((c: string) => c.split('>').forEach((p: string) => { if (p.trim()) allCats.add(p.trim()); })); } }
            for (const cat of allCats) { if (!categoryMap.has(cat.toLowerCase())) { const { data: ng } = await supabase.from('stock_groups').insert({ name: cat, company_id: 1 }).select('id').single(); if (ng) categoryMap.set(cat.toLowerCase(), ng.id); } }
            let imported = 0, skipped = 0; const errors: string[] = [];
            const insertRows: any[] = [];
            for (let i = 1; i < lines.length; i++) {
                try {
                    const f = parseCSVLine(lines[i]);
                    const title = f[iTitle]?.trim(); if (!title) { skipped++; continue; }
                    const parent = f[iParent]?.trim(); if (parent && parent !== '' && parent !== '0') { skipped++; continue; }
                    const pType = iType >= 0 ? f[iType]?.trim().toLowerCase() : ''; if (pType === 'variation') { skipped++; continue; }
                    const sku = f[iSku]?.trim() || '';
                    const price = parseFloat(f[iPrice]?.trim() || f[iSalePrice]?.trim() || '0') || 0;
                    const stock = parseInt(f[iStock]?.trim() || '0') || 0;
                    const description = iExcerpt >= 0 ? stripHTML(f[iExcerpt] || '').substring(0, 500) : '';
                    let imagePath = ''; if (iImages >= 0 && f[iImages]) { imagePath = f[iImages].trim().split('|')[0].trim().split('!')[0].trim(); }
                    const category = iCategory >= 0 ? (f[iCategory]?.trim() || '').replace(/\|/g, ', ') : '';
                    let stockGroupId: number | null = null;
                    if (iCategory >= 0 && f[iCategory]) { const first = f[iCategory].split('|')[0].split('>').map((s: string) => s.trim()).filter(Boolean); const primary = first[first.length - 1]; if (primary && categoryMap.has(primary.toLowerCase())) stockGroupId = categoryMap.get(primary.toLowerCase()) || null; }
                    insertRows.push({ name: title, sku, category, purchase_price: 0, selling_price: price, tax_rate: 0, description, unit_id: unitId, stock_group_id: stockGroupId, company_id: 1, image_path: imagePath, quantity: stock });
                    imported++;
                } catch (e: any) { errors.push(`Row ${i}: ${e.message}`); skipped++; }
            }
            if (insertRows.length) { const { error } = await supabase.from('products').insert(insertRows); if (error) return { imported: 0, skipped: lines.length - 1, errors: [error.message] }; }
            return { imported, skipped, errors: errors.slice(0, 20) };
        } catch (e: any) { return { imported: 0, skipped: 0, errors: [e.message] }; }
    });

    // ═══ BULK SYNC TO WEBSITE ═════════════════════════════════════════════

    ipcMain.handle('sync-products-to-website', async () => {
        if (!mysqlPool) return { success: false, error: 'MySQL not connected', synced: 0, failed: 0 };
        const { data: rows } = await supabase.from('products').select('id,name,sku,category,selling_price,description,image_path,quantity');
        if (!rows || rows.length === 0) return { success: true, synced: 0, failed: 0 };
        let synced = 0, failed = 0;
        for (const row of rows) { try { await syncProductToMySQL({ localId: row.id, name: row.name, sku: row.sku || '', category: row.category || '', sellingPrice: row.selling_price || 0, description: row.description || '', imagePath: row.image_path || '', quantity: row.quantity || 0 }); synced++; } catch { failed++; } }
        return { success: true, synced, failed, total: rows.length };
    });

    // ═══ DEVICE MONITORING ════════════════════════════════════════════════

    ipcMain.handle('get-connected-devices', async () => getConnectedDevices());
    ipcMain.handle('set-backup-node', async (_e, deviceId: string) => setBackupNode(deviceId));
    ipcMain.handle('get-device-id', async () => DEVICE_ID);

    // ═══ APP / AUTO-UPDATE ════════════════════════════════════════════════

    ipcMain.handle('get-app-version', async () => app.getVersion());
    ipcMain.handle('restart-app', () => { app.relaunch(); app.exit(); });

    // Auto-update wiring (electron-updater optional)
    let autoUpdater: any = null;
    try {
        autoUpdater = require('electron-updater').autoUpdater;
        autoUpdater.autoDownload = false; autoUpdater.autoInstallOnAppQuit = true;
        const broadcast = (payload: any) => BrowserWindow.getAllWindows().forEach(w => w.webContents.send('update-status', payload));
        autoUpdater.on('update-available', (info: any) => broadcast({ status: 'available', info }));
        autoUpdater.on('update-not-available', () => broadcast({ status: 'up-to-date' }));
        autoUpdater.on('download-progress', (progress: any) => broadcast({ status: 'downloading', progress }));
        autoUpdater.on('update-downloaded', () => broadcast({ status: 'ready' }));
        autoUpdater.on('error', (err: any) => broadcast({ status: 'error', error: err?.message || 'Update failed' }));
        setTimeout(() => { try { autoUpdater.checkForUpdates(); } catch { } }, 10_000);
    } catch { console.warn('electron-updater not available'); }

    ipcMain.handle('check-for-update', async () => { if (!autoUpdater) return { status: 'unavailable' }; try { await autoUpdater.checkForUpdates(); return { status: 'checking' }; } catch (e: any) { return { status: 'error', message: e.message }; } });
    ipcMain.handle('download-update', async () => { if (!autoUpdater) return { status: 'unavailable' }; try { await autoUpdater.downloadUpdate(); return { status: 'downloading' }; } catch (e: any) { return { status: 'error', message: e.message }; } });
    ipcMain.handle('install-update', async () => { if (!autoUpdater) return { status: 'unavailable' }; autoUpdater.quitAndInstall(); return { status: 'installing' }; });

    // ═══ NETWORK CONFIG (no-op stubs for Supabase-first mode) ═════════════
    ipcMain.handle('get-network-config', async () => ({}));
    ipcMain.handle('save-network-config', async () => ({ success: true }));
    ipcMain.handle('test-server-connection', async () => ({ success: false, error: 'Network config not applicable in Supabase mode' }));
    ipcMain.handle('get-local-ip', async () => {
        const ifaces = os.networkInterfaces();
        for (const name of Object.keys(ifaces)) { for (const iface of ifaces[name] || []) { if (iface.family === 'IPv4' && !iface.internal) return iface.address; } }
        return '127.0.0.1';
    });

} // end registerHandlers
