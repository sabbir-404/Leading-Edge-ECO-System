/**
 * ipc-handlers.ts
 * All Electron IPC handlers — rewritten from SQLite to Supabase.
 * Call registerHandlers() once after app is ready.
 */

import { app, ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import supabase, { supabaseAdmin } from './supabase';
import mysql from 'mysql2/promise';
import * as licenseManager from './license-manager';
import { getConnectedDevices, setBackupNode, DEVICE_ID } from './device-monitor';
import { encryptObject, decryptRows, decryptObject, decryptField } from './field-encryption';
import { enqueue, getQueueStats } from './write-queue';
import * as cache from './cache-manager';
import { saveSession, loadSession, clearSession } from './session-vault';

const BCRYPT_ROUNDS = 12;

// ── Super Admin seeder ───────────────────────────────────────────────────────
async function checkAndSeedSuperAdmin() {
    if (!supabaseAdmin) return;
    try {
        // Ensure Super Admin group exists
        // Note: group name is kept as plain text in DB for lookup purposes (it's a structural key)
        let { data: grp } = await supabase.from('user_groups').select('id').eq('name', 'Super Admin').maybeSingle();
        let groupId: number;
        if (!grp) {
            const allPerms = {
                can_create_user: true, can_delete_user: true, can_edit_user: true, can_edit_groups: true,
                can_create_bill: true, can_alter_bill: true, can_delete_bill: true,
                can_create_order: true, can_alter_order: true, can_view_payroll: true, can_approve_leave: true,
            };
            // Encrypt group row (name stays plain — used as lookup key)
            const groupRow = encryptObject(
                { description: 'Full administrative access to all features. Super Admin only.' }
            );
            const { data: newGrp } = await supabase.from('user_groups')
                .insert({ name: 'Super Admin', permissions: allPerms, ...groupRow })
                .select('id').single();
            groupId = newGrp?.id;
        } else {
            groupId = grp.id;
        }

        const DEFAULT_PASSWORD = '123456';
        const DEFAULT_HASH = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

        // Check if the superadmin user exists (username is structural — kept plain)
        const { data: existing } = await supabase.from('users').select('id,password_hash').eq('username', 'sabbirsuperadmin').maybeSingle();
        if (!existing) {
            const email = 'sabbirsuperadmin@lesoft.local';
            const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
                email,
                password: DEFAULT_PASSWORD,
                email_confirm: true,
                user_metadata: { username: 'sabbirsuperadmin', full_name: 'Super Admin', role: 'superadmin' }
            });
            if (!authErr && authUser?.user) {
                // Encrypt all profile fields before writing to Supabase
                const encryptedProfile = encryptObject({
                    full_name: 'Super Administrator',
                    email: email,
                    phone: '',
                });
                await supabase.from('users').update({
                    role: 'superadmin',       // role: not encrypted (structural)
                    group_id: groupId,
                    password_hash: DEFAULT_HASH,  // already hashed
                    is_active: true,
                    ...encryptedProfile,
                }).eq('auth_id', authUser.user.id);
                console.log('[SEED] Super Admin account created with encrypted profile + password hash.');
            }
        } else if (!existing.password_hash || !existing.password_hash.startsWith('$2')) {
            // Fix existing superadmin account that's missing/broken the bcrypt hash
            await supabase.from('users').update({
                password_hash: DEFAULT_HASH,
                group_id: groupId,
                role: 'superadmin',
            }).eq('id', existing.id);
            console.log('[SEED] Super Admin password hash patched.');
        }
    } catch (e: any) {
        console.warn('[SEED] Super Admin seeder skipped:', e.message);
    }
}

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
    try {
        await supabase.from('system_audit_log').insert({
            module: params.module, action: params.action,
            entity_type: params.entity_type || null,
            entity_id: params.entity_id != null ? String(params.entity_id) : null,
            description: params.description || null,
            old_value: params.old_value != null ? JSON.stringify(params.old_value) : null,
            new_value: params.new_value != null ? JSON.stringify(params.new_value) : null,
            performed_by: params.performed_by,
        });
    } catch { }
}

// ─────────────────────────────────────────────────────────────────────────────
export function registerHandlers() {

    // ═══ DATABASE HEALTH ═════════════════════════════════════════════════════
    ipcMain.handle('ping-supabase', async () => {
        try {
            const { error } = await supabase.from('users').select('id').limit(1);
            if (error) return { connected: false, error: error.message };
            return { connected: true };
        } catch (e: any) {
            return { connected: false, error: e.message };
        }
    });

    // ═══ CACHE & PERFORMANCE ════════════════════════════════════════════════
    /**
     * preload-cache — called by the renderer AFTER successful login.
     * Loads all frequently-used data into memory, decrypted.
     * Progress events are pushed via 'cache-load-progress'.
     */
    ipcMain.handle('preload-cache', async () => {
        try {
            await cache.preloadCache();
            return { success: true, stats: cache.getCacheStats() };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('get-cache-stats', async () => {
        return cache.getCacheStats();
    });

    // ═══ WRITE QUEUE STATUS ══════════════════════════════════════════════════
    ipcMain.handle('get-queue-stats', async () => {
        return getQueueStats();
    });

    // ═══ CHAT & PRESENCE ═════════════════════════════════════════════════════
    ipcMain.handle('update-user-presence', async (_e, userId: number) => {
        userPresence.set(userId, Date.now());
        return { success: true };
    });

    ipcMain.handle('get-online-users', async () => {
        const now = Date.now();
        const onlineIds: number[] = [];
        for (const [uid, lastSeen] of userPresence.entries()) {
            if (now - lastSeen < 15000) onlineIds.push(uid);
            else userPresence.delete(uid); // clean up stale
        }
        return onlineIds;
    });

    ipcMain.handle('set-typing-status', async (_e, { senderId, receiverId, isTyping }) => {
        const key = `${senderId}->${receiverId}`;
        if (isTyping) userTyping.set(key, Date.now());
        else userTyping.delete(key);
        return { success: true };
    });

    ipcMain.handle('get-typing-status', async (_e, { receiverId }) => {
        const now = Date.now();
        const typingIds: number[] = [];
        for (const [key, lastTyping] of userTyping.entries()) {
            const [sId, rId] = key.split('->').map(Number);
            if (rId === receiverId) {
                if (now - lastTyping < 4000) typingIds.push(sId);
                else userTyping.delete(key);
            }
        }
        return typingIds;
    });

    ipcMain.handle('get-chat-messages', async (_e, { senderId, receiverId }) => {
        const { data, error } = await supabase.from('internal_messages')
            .select('*')
            .or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return decryptRows(data || []);
    });

    ipcMain.handle('send-chat-message', async (_e, msg) => {
        const { senderId, receiverId, messageType, content, fileName } = msg;

        // Encrypt message content if it's not a file path (though file paths could be encrypted too)
        const encrypted = encryptObject({ content, file_name: fileName || null });

        const { data, error } = await supabase.from('internal_messages').insert({
            sender_id: senderId, 
            receiver_id: receiverId, 
            message_type: messageType || 'text', 
            ...encrypted
        }).select('id').single();

        if (error) throw error;

        // Autogenerate a system notification so the recipient gets alerted immediately
        await supabase.from('notifications').insert({
            title: 'New Chat Message',
            message: messageType === 'text' ? (content.substring(0, 50) + (content.length > 50 ? '...' : '')) : 'Sent you an attachment',
            sender_id: senderId,
            recipient_id: receiverId
        });

        return { success: true, id: data.id };
    });

    // ═══ INTERNAL EMAIL SYSTEM ═══════════════════════════════════════════════
    ipcMain.handle('email-get-inbox', async (_e, userId: number) => {
        const { data, error } = await supabase.from('system_emails').select('*, sender:sender_id(full_name, email)').eq('receiver_id', userId).eq('is_deleted_by_receiver', false).order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('email-get-sent', async (_e, userId: number) => {
        const { data, error } = await supabase.from('system_emails').select('*, receiver:receiver_id(full_name, email)').eq('sender_id', userId).eq('is_deleted_by_sender', false).order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('email-send', async (_e, emailPayload) => {
        const { senderId, receiverId, subject, body } = emailPayload;
        if (!receiverId) return { success: false, error: 'Recipient is required' };
        const { error } = await supabase.from('system_emails').insert({
            sender_id: senderId, receiver_id: receiverId, subject: subject || '(No Subject)', body: body || ''
        });
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('email-mark-read', async (_e, emailId: number) => {
        const { error } = await supabase.from('system_emails').update({ is_read: true }).eq('id', emailId);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('email-delete', async (_e, { emailId, folder }: { emailId: number, folder: 'inbox' | 'sent' }) => {
        const field = folder === 'inbox' ? 'is_deleted_by_receiver' : 'is_deleted_by_sender';
        const { error } = await supabase.from('system_emails').update({ [field]: true }).eq('id', emailId);
        if (error) throw error;
        return { success: true };
    });



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

    ipcMain.handle('get-godowns', async () => {
        const { data, error } = await supabase.from('godowns').select('*').order('name');
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('create-godown', async (_e, g) => {
        const { error } = await supabase.from('godowns').insert({ 
            name: g.name, 
            location: g.location || '', 
            description: g.description || '', 
            total_rows: g.totalRows || 0,
            racks_per_row: g.racksPerRow || 0,
            bins_per_rack: g.binsPerRack || 0,
            company_id: 1 
        });
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('update-godown', async (_e, g) => {
        const { error } = await supabase.from('godowns').update({ 
            name: g.name, 
            location: g.location || '', 
            description: g.description || '',
            total_rows: g.totalRows || 0,
            racks_per_row: g.racksPerRow || 0,
            bins_per_rack: g.binsPerRack || 0
        }).eq('id', g.id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('delete-godown', async (_e, id: number) => {
        const { error } = await supabase.from('godowns').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

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
        const { name, sku, category, purchasePrice, sellingPrice, taxRate, hsnCode, description, unit, stockGroup, imagePath, quantity, locationRow, locationRack, locationBin } = product;
        const { data: uRow } = await supabase.from('units').select('id').eq('name', unit).maybeSingle();
        const { data: gRow } = await supabase.from('stock_groups').select('id').eq('name', stockGroup).maybeSingle();
        const { data, error } = await supabase.from('products').insert({ name, sku: sku || '', category: category || '', purchase_price: purchasePrice || 0, selling_price: sellingPrice || 0, tax_rate: taxRate || 0, hsn_code: hsnCode || '', description: description || '', unit_id: uRow?.id || null, stock_group_id: gRow?.id || null, company_id: 1, image_path: imagePath || '', quantity: quantity || 0, location_row: locationRow || null, location_rack: locationRack || null, location_bin: locationBin || null }).select('id').single();
        if (error) throw error;
        syncProductToMySQL({ localId: data.id, name, sku: sku || '', category: category || '', sellingPrice: sellingPrice || 0, description: description || '', imagePath: imagePath || '', quantity: quantity || 0 });
        return { success: true, id: data.id };
    });

    ipcMain.handle('update-product', async (_e, product) => {
        const { id, name, sku, category, purchasePrice, sellingPrice, taxRate, hsnCode, description, unit, stockGroup, imagePath, quantity, locationRow, locationRack, locationBin } = product;
        const { data: uRow } = await supabase.from('units').select('id').eq('name', unit).maybeSingle();
        const { data: gRow } = await supabase.from('stock_groups').select('id').eq('name', stockGroup).maybeSingle();
        const { error } = await supabase.from('products').update({ name, sku: sku || '', category: category || '', purchase_price: purchasePrice || 0, selling_price: sellingPrice || 0, tax_rate: taxRate || 0, hsn_code: hsnCode || '', description: description || '', unit_id: uRow?.id || null, stock_group_id: gRow?.id || null, image_path: imagePath || '', quantity: quantity || 0, location_row: locationRow || null, location_rack: locationRack || null, location_bin: locationBin || null }).eq('id', id);
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
        // Try cache first for instant response
        const cached = cache.search('billing_customers', ['name', 'phone'], query);
        if (cached) return cached.slice(0, 15);
        // Cache miss — fall back to Supabase (data comes back encrypted, decrypt it)
        const q = `%${query}%`;
        const { data } = await supabase.from('billing_customers').select('*').or(`phone.ilike.${q},name.ilike.${q}`).order('name').limit(15);
        return decryptRows(data || []);
    });

    ipcMain.handle('create-billing-customer', async (_e, customer) => {
        const { name, phone, email, address } = customer;
        // Check cache first
        if (phone) {
            const existing = cache.search('billing_customers', ['phone'], phone)?.find(c => c.phone === phone);
            if (existing) {
                // Update via queue
                const updates = { name: name || existing.name, email: email || existing.email, address: address || existing.address };
                enqueue({ table: 'billing_customers', operation: 'update', data: updates, filter: [{ column: 'id', value: existing.id }] });
                cache.updateOne('billing_customers', r => r.id === existing.id, updates);
                return { ...existing, ...updates };
            }
        }
        // Assign local ID-like reference, add to cache immediately
        const newCustomer = { name, phone: phone || null, email: email || '', address: address || '', total_bills: 0 };
        enqueue({ table: 'billing_customers', operation: 'insert', data: newCustomer });
        cache.addOne('billing_customers', { ...newCustomer, id: Date.now() });
        return newCustomer;
    });

    ipcMain.handle('create-bill', async (_e, billData) => {
        const { customer_id, billed_by, items, subtotal, discount_total, installation_charge, installation_note, grand_total } = billData;
        const now = new Date();
        const dateStr = now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0');

        // Generate invoice number locally — no waiting for Supabase
        const serial = String(Math.floor(Math.random() * 9000) + 1000); // fast local serial
        const phoneLast4 = String(customer_id || '0').slice(-4).padStart(4, '0');
        const invoiceNumber = `${dateStr}-${phoneLast4}-${serial}`;

        const billRow = {
            invoice_number: invoiceNumber,
            customer_id,
            billed_by: billed_by || 'Admin',
            subtotal,
            discount_total,
            installation_charge: installation_charge || 0,
            installation_note: installation_note || '',
            grand_total,
        };

        // Enqueue the bill insert — returns immediately to user
        enqueue({
            table: 'bills',
            operation: 'insert',
            data: billRow,
            onSuccess: async (res) => {
                // After bill is saved, enqueue items write
                if (items && items.length > 0) {
                    // We need the real bill ID — re-fetch from Supabase by invoice number
                    const { data: savedBill } = await supabase
                        .from('bills').select('id').eq('invoice_number', invoiceNumber).maybeSingle();
                    if (savedBill?.id) {
                        const billItems = items.map((item: any) => ({
                            bill_id: savedBill.id,
                            product_id: item.product_id,
                            product_name: item.product_name,
                            sku: item.sku || '',
                            quantity: item.quantity,
                            mrp: item.mrp,
                            discount_pct: item.discount_pct || 0,
                            discount_amt: item.discount_amt || 0,
                            price: item.price,
                        }));
                        enqueue({ table: 'bill_items', operation: 'insert', data: billItems });
                        // Decrement stock per item
                        for (const item of items) {
                            if (item.product_id && item.quantity) {
                                enqueue({
                                    table: 'products',
                                    operation: 'update',
                                    data: {},
                                    filter: [{ column: 'id', value: item.product_id }],
                                    onSuccess: async () => {
                                        try { await supabase.rpc('decrement_product_qty', { p_id: item.product_id, qty: item.quantity }); } catch { }
                                        syncStockToMySQL(item.product_id, item.quantity);
                                    },
                                } as any);
                            }
                        }
                    }
                }
            },
        });

        // Return success immediately — bill is queued for background save
        return { success: true, invoice_number: invoiceNumber, queued: true };
    });

    ipcMain.handle('get-bills', async () => {
        const { data, error } = await supabase.from('bills').select('*, customer:billing_customers(name,phone)').order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map((b: any) => {
            const dec = decryptObject(b);
            // Decrypt nested customer fields if encrypted
            const custName = b.customer?.name ? decryptField(b.customer.name) : null;
            const custPhone = b.customer?.phone ? decryptField(b.customer.phone) : null;
            return { ...dec, customer_name: custName, customer_phone: custPhone };
        });
    });

    ipcMain.handle('get-bill-details', async (_e, billId: number) => {
        const { data: bill } = await supabase.from('bills').select('*, customer:billing_customers(name,phone,email,address)').eq('id', billId).maybeSingle();
        if (!bill) return null;
        const { data: items } = await supabase.from('bill_items').select('*, product:products(image_path)').eq('bill_id', billId);
        const decBill = decryptObject(bill);
        // Decrypt nested customer fields
        const cust = bill.customer || {};
        return { 
            ...decBill, 
            customer_name: decryptField(cust.name) || null, 
            customer_phone: decryptField(cust.phone) || null, 
            customer_email: decryptField(cust.email) || null, 
            customer_address: decryptField(cust.address) || null, 
            items: (items || []).map((i: any) => ({ ...i, image_path: i.product?.image_path || null })) 
        };
    });

    ipcMain.handle('update-bill', async (_e, billData: any) => {
        const { bill_id, items, subtotal, discount_total, installation_charge, installation_note, grand_total, changed_by } = billData;
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
            try { await supabase.from('products').update({ quantity: (supabase as any).sql`quantity + ${oi.quantity}` }).eq('id', oi.product_id); } catch { }
        }
        // Update bill
        await supabase.from('bills').update({ subtotal, discount_total, installation_charge: installation_charge || 0, installation_note: installation_note || '', grand_total }).eq('id', bill_id);
        // Replace items
        await supabase.from('bill_items').delete().eq('bill_id', bill_id);
        if (items.length) {
            await supabase.from('bill_items').insert(items.map((i: any) => ({ bill_id, product_id: i.product_id, product_name: i.product_name, sku: i.sku || '', quantity: i.quantity, mrp: i.mrp, discount_pct: i.discount_pct || 0, discount_amt: i.discount_amt || 0, price: i.price })));
            for (const i of items) {
                try { await supabase.from('products').update({ quantity: (supabase as any).sql`GREATEST(quantity - ${i.quantity}, 0)` }).eq('id', i.product_id); } catch { }
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
        if (!id || !currentPassword || newPassword.length < 4) return { success: false, error: 'New password must be at least 4 characters' };

        // 1. Fetch user to see if they are managed by Auth or have a local hash
        const { data: row } = await supabase.from('users').select('id, password_hash, email, username').eq('id', id).maybeSingle();
        if (!row) return { success: false, error: 'User not found' };

        const stored = row.password_hash || '';
        let matches = false;

        if (stored === 'managed_by_supabase_auth') {
            // Verify with Supabase Auth via temporary sign-in
            const emailToUse = row.email || (row.username?.includes('@') ? row.username : `${row.username}@lesoft.local`);
            const { error: authErr } = await supabase.auth.signInWithPassword({
                email: emailToUse,
                password: currentPassword
            });
            matches = !authErr;
        } else {
            // Verify with local bcrypt hash
            matches = (stored.startsWith('$2b$') || stored.startsWith('$2a$')) 
                ? await bcrypt.compare(currentPassword, stored) 
                : stored === currentPassword;
        }

        if (!matches) return { success: false, error: 'Incorrect current password' };

        // 2. Hash new password and update BOTH local profile and Auth
        const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        
        // Update local users table (RLS might block if not using Admin client, but ipc handlers usually use it for sensitive ops if needed)
        // Here we use the regular 'supabase' client which should work if the user is authenticated, 
        // but for password changes on ANY user (admin list), we might need supabaseAdmin.
        const client = supabaseAdmin || supabase;
        const { error: dbErr } = await client.from('users').update({ password_hash: newHash }).eq('id', id);
        if (dbErr) throw dbErr;

        // Sync to Auth if auth_id exists
        try {
            const { data: prof } = await client.from('users').select('auth_id').eq('id', id).single();
            if (prof?.auth_id && supabaseAdmin) {
                await supabaseAdmin.auth.admin.updateUserById(prof.auth_id, { password: newPassword });
            }
        } catch (e) {
            console.error("Auth password sync failed during profile change-password", e);
        }

        return { success: true };
    });

    // Seed superadmin on first load (non-blocking)
    checkAndSeedSuperAdmin().catch(() => { });

    // ═══ USERS ════════════════════════════════════════════════════════════════
    ipcMain.handle('get-users', async (_e, opts?: { requestingUserId?: number }) => {
        const { data, error } = await supabase.from('users').select('id,username,full_name,role,email,phone,is_active,created_at,group_id').order('created_at', { ascending: false });
        if (error) throw error;

        // Determine if requesting user is superadmin
        let isSuperAdmin = false;
        if (opts?.requestingUserId) {
            const { data: reqUser } = await supabase.from('users').select('role').eq('id', opts.requestingUserId).maybeSingle();
            isSuperAdmin = reqUser?.role === 'superadmin';
        }

        // Filter out superadmin accounts from non-superadmin viewers
        const filtered = (data || []).filter(u => isSuperAdmin || u.role !== 'superadmin');
        
        // Decrypt profile data
        return decryptRows(filtered);
    });

    ipcMain.handle('create-user', async (_e, user) => {
        const { username, password, fullName, role, groupId, email, phone } = user;
        if (!username?.trim()) return { success: false, error: 'Username is required' };
        if (!password || password.length < 4) return { success: false, error: 'Password must be at least 4 characters' };
        if (!supabaseAdmin) return { success: false, error: 'Database Admin Key not configured in settings. Cannot create users.' };

        const emailToUse = email?.trim() || (username.includes('@') ? username.trim() : `${username.trim()}@lesoft.local`);

        // 1. Create in Supabase Auth
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: emailToUse,
            password: password,
            email_confirm: true,
            user_metadata: { username: username.trim(), full_name: fullName, role: role || 'operator' }
        });

        if (authError) return { success: false, error: authError.message };

        // 2. The database trigger automatically creates row in public.users. We update the rest of the fields.
        // Use supabaseAdmin bypass RLS safely
        const { error: updateErr } = await supabaseAdmin.from('users').update({
            group_id: groupId || null,
            phone: phone || '',
            email: emailToUse
        }).eq('auth_id', authData.user.id);

        if (updateErr) console.warn('[CREATE USER] Auth created, but public profile update failed', updateErr);

        // Fetch the generated local ID to return
        const { data: localRow } = await supabase.from('users').select('id').eq('auth_id', authData.user.id).single();

        return { success: true, id: localRow?.id || 0 };
    });

    ipcMain.handle('update-user', async (_e, user) => {
        const { id, fullName, role, email, phone, isActive, password, groupId } = user;
        // Coerce isActive to integer (0 or 1) for Postgres compatibility
        const isActiveValue = (isActive === undefined || isActive === null) ? 1 : (Number(isActive) ? 1 : 0);
        
        if (!supabaseAdmin) throw new Error('Database Admin Key not configured in settings.');
        
        const updatePayload: any = {
            full_name: fullName,
            role,
            email: email || '',
            phone: phone || '',
            is_active: isActiveValue
        };

        if (groupId) {
            updatePayload.group_id = parseInt(groupId);
        }

        if (password && password.trim() !== '') {
            updatePayload.password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
            
            // Also attempt to update the auth password if auth_id exists
            try {
                const { data: row } = await supabaseAdmin.from('users').select('auth_id').eq('id', id).single();
                if (row?.auth_id) {
                    await supabaseAdmin.auth.admin.updateUserById(row.auth_id, { password });
                }
            } catch(e) { console.error("Could not update auth password", e); }
        }

        const { error } = await supabaseAdmin.from('users').update(updatePayload).eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('delete-user', async (_e, id: number) => {
        if (!supabaseAdmin) throw new Error('Database Admin Key not configured in settings.');
        // Find auth_id
        const { data: row } = await supabaseAdmin.from('users').select('auth_id').eq('id', id).single();
        if (row?.auth_id) {
            await supabaseAdmin.auth.admin.deleteUser(row.auth_id);
        }
        const { error } = await supabaseAdmin.from('users').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('authenticate-user', async (_e, credentials) => {
        const username = typeof credentials?.username === 'string' ? credentials.username.trim() : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        if (!username || !password) return { success: false, error: 'Invalid credentials' };

        const bf = checkBruteForce(username);
        if (bf.locked) return { success: false, error: `Too many failed attempts. Try again in ${bf.remaining} minute(s).` };

        // 1. Format username to dummy email if no @ present
        const emailToUse = username.includes('@') ? username : `${username}@lesoft.local`;

        // --- PRIMARY: Supabase Auth Login ---
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: emailToUse,
            password: password
        });

        if (!authError && authData.user) {
            // Auth succeeded — fetch user profile
            const { data: row } = await supabase.from('users').select(`*, user_groups (permissions)`).eq('auth_id', authData.user.id).single();

            if (!row) {
                await supabase.auth.signOut();
                return { success: false, error: 'User profile mapping not found in database.' };
            }

            if (row.is_active === 0) {
                await supabase.auth.signOut();
                return { success: false, error: 'Your account has been disabled.' };
            }

            const { data: lic } = await supabase.from('app_license').select('*').single();
            let licenseWarning = null;
            if (lic) {
                if (!lic.bound_user_id) {
                    await supabase.from('app_license').update({ bound_user_id: row.id }).eq('id', lic.id);
                } else if (lic.bound_user_id !== row.id) {
                    licenseWarning = 'WARNING: This software is licensed to another user. Contact your Administrator.';
                }
            }

            await supabase.from('users').update({ is_online: true, device_type: 'PC' }).eq('id', row.id);

            const { password_hash: _omit, user_groups, ...safeUser } = row;
            safeUser.permissions = user_groups?.permissions || '{}';

            resetLoginAttempts(username);
            await saveSession(row);
            return { success: true, user: safeUser, licenseWarning, offlineMode: false };
        }

        // --- FALLBACK 1: Offline/Network error → encrypted vault ---
        const isOffline = authError?.message?.toLowerCase().includes('fetch') ||
                          authError?.message?.toLowerCase().includes('network') ||
                          authError?.message?.toLowerCase().includes('offline');

        if (isOffline) {
            const vaultRes = await loadSession({ username, password });
            if (vaultRes) {
                resetLoginAttempts(username);
                return { success: true, user: vaultRes.user, offlineMode: true };
            }
        }

        // --- FALLBACK 2: Local bcrypt login for users NOT in Supabase Auth ---
        // (e.g. employees imported in bulk who only have a local DB row with password_hash)
        try {
            const { data: localRow } = await supabase
                .from('users')
                .select(`*, user_groups (permissions)`)
                .or(`username.eq.${username},email.eq.${emailToUse}`)
                .eq('is_active', 1)
                .maybeSingle();

            if (localRow && localRow.password_hash && localRow.password_hash !== 'managed_by_supabase_auth') {
                const stored = localRow.password_hash;
                const bcryptMatch = (stored.startsWith('$2b$') || stored.startsWith('$2a$'))
                    ? await bcrypt.compare(password, stored)
                    : stored === password;

                if (bcryptMatch) {
                    // Promote user to Supabase Auth if supabaseAdmin is available
                    if (supabaseAdmin) {
                        try {
                            const { data: authCreateData } = await supabaseAdmin.auth.admin.createUser({
                                email: emailToUse,
                                password: password,
                                email_confirm: true,
                                user_metadata: { username, full_name: localRow.full_name, role: localRow.role }
                            });
                            if (authCreateData?.user?.id) {
                                await supabaseAdmin.from('users').update({ auth_id: authCreateData.user.id }).eq('id', localRow.id);
                            }
                        } catch (promoteErr) {
                            // Non-fatal: user can still log in locally
                            console.warn('[AUTH] Could not promote user to Supabase Auth:', promoteErr);
                        }
                    }

                    const { data: lic } = await supabase.from('app_license').select('*').single();
                    let licenseWarning = null;
                    if (lic) {
                        if (!lic.bound_user_id) {
                            await supabase.from('app_license').update({ bound_user_id: localRow.id }).eq('id', lic.id);
                        } else if (lic.bound_user_id !== localRow.id) {
                            licenseWarning = 'WARNING: This software is licensed to another user. Contact your Administrator.';
                        }
                    }

                    await supabase.from('users').update({ is_online: true, device_type: 'PC' }).eq('id', localRow.id);

                    const { password_hash: _omit2, user_groups, ...safeUser } = localRow;
                    safeUser.permissions = user_groups?.permissions || '{}';

                    resetLoginAttempts(username);
                    await saveSession(localRow);
                    return { success: true, user: safeUser, licenseWarning, offlineMode: false };
                }
            }
        } catch (localErr) {
            console.warn('[AUTH] Local bcrypt fallback error:', localErr);
        }

        recordFailedLogin(username);
        return { success: false, error: 'Invalid username or password.' };
    });

    // ═══ ACTIVE SESSION KICKING ═══════════════════════════════════════════════
    ipcMain.handle('get-active-sessions', async () => {
        const { data, error } = await supabase.from('users').select('*').eq('is_online', true);
        if (error) return { success: false, error: error.message };
        return { success: true, data };
    });

    ipcMain.handle('verify-admin-password', async (_e, { password }) => {
        if (!password) return { success: false, error: 'Missing password' };

        // Fetch ALL superadmin users and check if password matches any of them
        const { data: superAdmins, error } = await supabase
            .from('users')
            .select('password_hash')
            .eq('role', 'superadmin');

        if (error || !superAdmins || superAdmins.length === 0) {
            return { success: false, error: 'No super admin accounts found' };
        }

        // Check password against each superadmin hash in parallel-safe loop
        for (const sa of superAdmins) {
            if (!sa.password_hash) continue;
            const isValid = sa.password_hash.startsWith('$2')
                ? await bcrypt.compare(password, sa.password_hash)
                : sa.password_hash === password;
            if (isValid) return { success: true };
        }

        return { success: false, error: 'Incorrect password' };
    });

    ipcMain.handle('kick-user-session', async (_e, userId: number) => {
        if (!supabaseAdmin) return { success: false, error: 'Supabase Admin Key not configured' };
        const { error } = await supabaseAdmin.from('users').update({ is_online: false, force_logout: true }).eq('id', userId);
        if (error) return { success: false, error: error.message };
        return { success: true };
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

    ipcMain.handle('get-supabase-config', async () => {
        try {
            const cfgPath = path.join(app.getPath('userData'), 'supabase-config.json');
            if (fs.existsSync(cfgPath)) {
                return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
            }
        } catch (e) {}
        return { 
            url: 'https://ildkkgjrolcjijwfokek.supabase.co', 
            anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzMzMjQsImV4cCI6MjA4NzUwOTMyNH0.Bn6c-87BOumPXyH5F469P04fQSMnI9SjNDZAwgGyTsM' 
        };
    });

    ipcMain.handle('save-supabase-config', async (_e, newConfig) => {
        try {
            const currentConfigPath = path.join(app.getPath('userData'), 'supabase-config.json');
            let configToSave = {
                url: 'https://ildkkgjrolcjijwfokek.supabase.co',
                anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzMzMjQsImV4cCI6MjA4NzUwOTMyNH0.Bn6c-87BOumPXyH5F469P04fQSMnI9SjNDZAwgGyTsM',
                serviceRoleKey: newConfig.serviceRoleKey || ''
            };
            if (fs.existsSync(currentConfigPath)) {
                const existing = JSON.parse(fs.readFileSync(currentConfigPath, 'utf8'));
                configToSave = { ...existing, ...configToSave };
            }
            fs.writeFileSync(currentConfigPath, JSON.stringify(configToSave, null, 2), 'utf8');
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    // ═══ USER GROUPS ══════════════════════════════════════════════════════════
    ipcMain.handle('get-user-groups', async (_e, opts?: { requestingUserId?: number }) => {
        const { data, error } = await supabase.from('user_groups').select('*').order('id');
        if (error) throw error;

        // Determine if requesting user is superadmin
        let isSuperAdmin = false;
        if (opts?.requestingUserId) {
            const { data: reqUser } = await supabase.from('users').select('role').eq('id', opts.requestingUserId).maybeSingle();
            isSuperAdmin = reqUser?.role === 'superadmin';
        }

        // Filter out the Super Admin group from non-superadmin users
        const filtered = (data || []).filter(g => isSuperAdmin || g.name !== 'Super Admin');
        return filtered;
    });

    ipcMain.handle('create-user-group', async (_e, group) => {
        if (!supabaseAdmin) throw new Error('Database Admin Key not configured in settings.');
        const { data, error } = await supabaseAdmin.from('user_groups').insert({ name: group.name, description: group.description || '', permissions: JSON.stringify(group.permissions || {}) }).select('id').single();
        if (error) throw error;
        return { success: true, id: data.id };
    });

    ipcMain.handle('update-user-group', async (_e, group) => {
        if (!supabaseAdmin) throw new Error('Database Admin Key not configured in settings.');
        const { error } = await supabaseAdmin.from('user_groups').update({ name: group.name, description: group.description || '', permissions: JSON.stringify(group.permissions || {}) }).eq('id', group.id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('delete-user-group', async (_e, id: number) => {
        if (!supabaseAdmin) throw new Error('Database Admin Key not configured in settings.');
        const { error } = await supabaseAdmin.from('user_groups').delete().eq('id', id);
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


    // ═══ MAKE MODULE ══════════════════════════════════════════════════════

    ipcMain.handle('get-make-orders', async () => {
        const { data, error } = await supabase.from('make_orders').select('*, salesman:users(full_name)').order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map((o: any) => ({ ...o, salesman_name: o.salesman?.full_name || 'Unassigned' }));
    });

    ipcMain.handle('get-salesmen', async () => {
        // Fetch users in the 'Salesman' group
        const { data: grp } = await supabase.from('user_groups').select('id').eq('name', 'Salesman').maybeSingle();
        if (!grp) return [];
        const { data, error } = await supabase.from('users').select('id, username, full_name, email').eq('group_id', grp.id).eq('is_active', 1);
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('approve-make-order', async (_e, { orderId, approvedBy }) => {
        const { error } = await supabase.from('make_orders').update({ 
            status: 'Placed', 
            is_approved: true,
            updated_at: new Date().toISOString()
        }).eq('id', orderId);
        if (error) throw error;
        
        await supabase.from('make_order_updates').insert({ 
            order_id: orderId, 
            status: 'Placed', 
            note: 'Order approved and placed', 
            updated_by: approvedBy 
        });

        // Notify the creator (designer)
        const { data: order } = await supabase.from('make_orders').select('designer_name, furniture_name').eq('id', orderId).single();
        if (order) {
           const { data: designer } = await supabase.from('users').select('id').eq('full_name', order.designer_name).maybeSingle();
           if (designer) {
               await supabase.from('notifications').insert({
                   title: 'Order Approved',
                   message: `The order for "${order.furniture_name}" has been approved.`,
                   sender_id: null,
                   recipient_id: designer.id
               });
           }
        }

        return { success: true };
    });

    ipcMain.handle('create-make-order', async (_e, order) => {
        const initialStatus = order.salesman_id ? 'Pending Approval' : 'Placed';
        const isApproved = !order.salesman_id;

        const { data, error } = await supabase.from('make_orders').insert({ 
            furniture_name: order.furniture_name, 
            description: order.description || '', 
            quantity: order.quantity || 1, 
            designer_name: order.designer_name, 
            status: initialStatus, 
            priority: order.priority || 'Normal',
            delivery_date: order.delivery_date || null,
            salesman_id: order.salesman_id || null,
            is_approved: isApproved
        }).select('id').single();
        if (error) throw error;

        await supabase.from('make_order_updates').insert({ 
            order_id: data.id, 
            status: initialStatus, 
            note: order.salesman_id ? 'Order created, awaiting salesman approval' : 'Order placed', 
            updated_by: order.designer_name 
        });

        // Notify salesman if assigned
        if (order.salesman_id) {
            await supabase.from('notifications').insert({
                title: 'New Order for Approval',
                message: `You have been assigned to approve the order for "${order.furniture_name}" by ${order.designer_name}.`,
                sender_id: null,
                recipient_id: order.salesman_id
            });
        }

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
        return (data || []).map((r: any) => ({ 
            ...r, 
            invoice_number: decryptField(r.bill?.invoice_number) || r.bill?.invoice_number, 
            customer_name: decryptField(r.bill?.customer?.name) || r.bill?.customer?.name 
        }));
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
            await supabase.from('bills').update({ 
                subtotal, 
                discount_total: discountTotal, 
                grand_total: staged.grand_total || (subtotal - discountTotal),
                is_altered: true 
            }).eq('id', audit.bill_id);
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
        return (data || []).map((s: any) => ({ 
            ...decryptObject(s), 
            invoice_number: decryptField(s.bill?.invoice_number) || s.bill?.invoice_number, 
            bill_date: s.bill?.created_at, 
            customer_name: decryptField(s.bill?.customer?.name) || s.bill?.customer?.name, 
            customer_phone: decryptField(s.bill?.customer?.phone) || s.bill?.customer?.phone 
        }));
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
                try { await supabase.from(table).upsert(rows as any[]); } catch { }
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
    ipcMain.handle('set-backup-node', async (_e, isBackup: boolean) => setBackupNode(isBackup));
    ipcMain.handle('get-device-id', async () => licenseManager.getMachineId());

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


    // ═══ MAKE ORDER — PDF ATTACHMENTS ══════════════════════════════════════

    ipcMain.handle('make-upload-pdf', async (_e, { orderId, filePath }: { orderId: number, filePath?: string }) => {
        let filesToUpload: string[] = [];

        if (filePath) {
            // Direct upload if filePath is provided (staged files)
            filesToUpload = [filePath];
        } else {
            // Open dialog if filePath is not provided
            const win = BrowserWindow.getFocusedWindow();
            if (!win) return { error: 'No window' };
            const result = await dialog.showOpenDialog(win, {
                title: 'Select PDF Files',
                filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
                properties: ['openFile', 'multiSelections'],
            });
            if (result.canceled || result.filePaths.length === 0) return { canceled: true };
            filesToUpload = result.filePaths;
        }

        const uploaded: string[] = [];
        for (const p of filesToUpload) {
            const fileName = path.basename(p);
            const fileBuffer = fs.readFileSync(p);
            const storagePath = `${orderId}/${Date.now()}_${fileName}`;
            const { error: uploadError } = await supabase.storage
                .from('make-order-files')
                .upload(storagePath, fileBuffer, { contentType: 'application/pdf', upsert: false });
            if (uploadError) return { error: uploadError.message };
            uploaded.push(storagePath);
        }

        // Append paths to make_orders.pdf_urls
        const { data: order } = await supabase.from('make_orders').select('pdf_urls').eq('id', orderId).maybeSingle();
        const existing: string[] = order?.pdf_urls || [];
        await supabase.from('make_orders').update({ pdf_urls: [...existing, ...uploaded] }).eq('id', orderId);
        return { success: true, paths: uploaded };
    });

    ipcMain.handle('make-get-pdf-urls', async (_e, orderId: number) => {
        const { data: order } = await supabase.from('make_orders').select('pdf_urls').eq('id', orderId).maybeSingle();
        const paths: string[] = order?.pdf_urls || [];
        const signedUrls = await Promise.all(paths.map(async (p) => {
            const { data } = await supabase.storage.from('make-order-files').createSignedUrl(p, 3600);
            return { path: p, name: path.basename(p).replace(/^\d+_/, ''), url: data?.signedUrl || '' };
        }));
        return signedUrls.filter(u => u.url);
    });

    ipcMain.handle('make-delete-pdf', async (_e, { orderId, storagePath }: { orderId: number; storagePath: string }) => {
        await supabase.storage.from('make-order-files').remove([storagePath]);
        const { data: order } = await supabase.from('make_orders').select('pdf_urls').eq('id', orderId).maybeSingle();
        const remaining = (order?.pdf_urls || []).filter((p: string) => p !== storagePath);
        await supabase.from('make_orders').update({ pdf_urls: remaining }).eq('id', orderId);
        return { success: true };
    });

    ipcMain.handle('make-download-pdf', async (_e, { url, fileName }: { url: string; fileName: string }) => {
        try {
            const https = await import('https');
            const http = await import('http');
            const tmpPath = path.join(app.getPath('temp'), fileName);
            await new Promise<void>((resolve, reject) => {
                const file = fs.createWriteStream(tmpPath);
                const protocol = url.startsWith('https') ? https : http;
                (protocol as any).get(url, (res: any) => { res.pipe(file); file.on('finish', () => { file.close(); resolve(); }); }).on('error', reject);
            });
            const { shell } = await import('electron');
            await shell.openPath(tmpPath);
            return { success: true, path: tmpPath };
        } catch (e: any) {
            return { error: e.message };
        }
    });

    // ═══ MAKE ORDER — PARTS / DIMENSIONS ════════════════════════════════════

    ipcMain.handle('make-get-order-parts', async (_e, orderId: number) => {
        const { data } = await supabase.from('make_order_parts')
            .select('*').eq('order_id', orderId).order('sort_order').order('id');
        return data || [];
    });

    ipcMain.handle('make-upsert-part', async (_e, part: {
        id?: number; order_id: number; part_name: string;
        length?: string; width?: string; height?: string; notes?: string; sort_order?: number;
    }) => {
        if (part.id) {
            const { data, error } = await supabase.from('make_order_parts')
                .update({ part_name: part.part_name, length: part.length, width: part.width, height: part.height, notes: part.notes, sort_order: part.sort_order })
                .eq('id', part.id).select().maybeSingle();
            if (error) return { error: error.message };
            return data;
        } else {
            const { data, error } = await supabase.from('make_order_parts')
                .insert({ order_id: part.order_id, part_name: part.part_name, length: part.length || '', width: part.width || '', height: part.height || '', notes: part.notes || '', sort_order: part.sort_order || 0 })
                .select().maybeSingle();
            if (error) return { error: error.message };
            return data;
        }
    });

    ipcMain.handle('make-delete-part', async (_e, partId: number) => {
        const { error } = await supabase.from('make_order_parts').delete().eq('id', partId);
        return error ? { error: error.message } : { success: true };
    });

    // ═══ MAKE ORDER — ROLE-BASED ALTERATION + LOG ═══════════════════════════

    const ALTERABLE_BY_DESIGNER = ['Placed']; // only Placed: designer can alter
    const ALTERABLE_FIELDS = ['furniture_name', 'description', 'quantity', 'priority', 'delivery_date'];

    ipcMain.handle('make-alter-order', async (_e, {
        orderId, changes, alteredBy, userRole
    }: { orderId: number; changes: Record<string, any>; alteredBy: string; userRole: string }) => {
        // Fetch current order
        const { data: current, error: fetchErr } = await supabase
            .from('make_orders').select('*').eq('id', orderId).maybeSingle();
        if (fetchErr || !current) return { error: 'Order not found' };

        // Enforce stage restriction
        const isAdmin = userRole === 'admin';
        if (!isAdmin && !ALTERABLE_BY_DESIGNER.includes(current.status)) {
            return { error: `Order is in "${current.status}" stage. Only admins can alter it at this point.` };
        }

        // Filter to only allowed fields (non-admins restricted to ALTERABLE_FIELDS)
        const filteredChanges: Record<string, any> = {};
        for (const [field, newVal] of Object.entries(changes)) {
            if (isAdmin || ALTERABLE_FIELDS.includes(field)) {
                if (current[field] !== newVal) filteredChanges[field] = newVal;
            }
        }
        if (Object.keys(filteredChanges).length === 0) return { success: true, message: 'No changes detected' };

        // Write alteration log
        const logRows = Object.entries(filteredChanges).map(([field, newVal]) => ({
            order_id: orderId,
            altered_by: alteredBy,
            user_role: userRole,
            field_name: field,
            old_value: String(current[field] ?? ''),
            new_value: String(newVal ?? ''),
        }));
        await supabase.from('make_order_alteration_log').insert(logRows);

        // Apply changes
        const { error: updateErr } = await supabase
            .from('make_orders').update(filteredChanges).eq('id', orderId);
        if (updateErr) return { error: updateErr.message };

        return { success: true, changed: Object.keys(filteredChanges) };
    });

    ipcMain.handle('make-get-alteration-log', async (_e, orderId: number) => {
        const { data } = await supabase.from('make_order_alteration_log')
            .select('*').eq('order_id', orderId).order('altered_at', { ascending: false });
        return data || [];
    });

    // ═══ MAKE DASHBOARD STATS ════════════════════════════════════════════════

    ipcMain.handle('make-get-dashboard-stats', async () => {
        const { data: allOrders } = await supabase.from('make_orders')
            .select('status, priority, created_at, furniture_name, designer_name, id')
            .order('created_at', { ascending: false });

        const orders = allOrders || [];
        const counts: Record<string, number> = {};
        for (const o of orders) { counts[o.status] = (counts[o.status] || 0) + 1; }

        return {
            total: orders.length,
            pending: (counts['Placed'] || 0) + (counts['In Production'] || 0),
            inProgress: (counts['Welding'] || 0) + (counts['Painting'] || 0),
            readyForDispatch: counts['Ready for Dispatch'] || 0,
            delivered: counts['Delivered'] || 0,
            byStatus: counts,
            recent: orders.slice(0, 10),
            pendingDelivery: orders.filter(o => o.status === 'Ready for Dispatch')
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        };
    });

    // ═══ CLOUD LICENSE ════════════════════════════════════════════════════════

    ipcMain.handle('check-license-cloud', async () => {
        // 1. Check local file first (fast path)
        const localResult = licenseManager.isLicensed();
        if (localResult.valid) return { valid: true, source: 'local', machineId: localResult.machineId };

        // 2. Fall back to Supabase cloud license
        const { data } = await supabase.from('app_license').select('license_key').limit(1).maybeSingle();
        if (!data?.license_key) return { valid: false, machineId: localResult.machineId };

        const cloudKey = data.license_key;
        const isValid = licenseManager.validateLicense(localResult.machineId, cloudKey);
        if (isValid) {
            // Cache locally so next check is instant
            licenseManager.saveLicense(cloudKey);
        }
        return { valid: isValid, source: 'cloud', machineId: localResult.machineId };
    });

    ipcMain.handle('activate-license-cloud', async (_e, { key }: { key: string }) => {
        const machineId = licenseManager.getMachineId();
        const isValid = licenseManager.validateLicense(machineId, key);
        if (!isValid) return { success: false, error: 'Invalid license key for this machine' };

        // Save to Supabase (upsert — only one row ever)
        const { error } = await supabase.from('app_license').upsert({
            id: 1, // enforce single row
            license_key: key.replace(/[\s-]/g, '').toUpperCase(),
            activated_by: machineId,
            app_version: app.getVersion(),
            activated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        if (error) return { success: false, error: error.message };

        // Also save locally
        licenseManager.saveLicense(key);
        return { success: true };
    });


    // ═══ HRM MODULE ═══════════════════════════════════════════════════════════

    // Employees
    ipcMain.handle('hrm-get-employees', async () => {
        const { data, error } = await supabase.from('hrm_employees').select('*').order('name');
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('hrm-upsert-employee', async (_e, emp) => {
        if (emp.id) {
            const { error } = await supabase.from('hrm_employees').update(emp).eq('id', emp.id);
            if (error) throw error;
            return { success: true };
        } else {
            const { data, error } = await supabase.from('hrm_employees').insert(emp).select('id').single();
            if (error) throw error;
            return { success: true, id: data.id };
        }
    });

    ipcMain.handle('hrm-delete-employee', async (_e, id) => {
        const { error } = await supabase.from('hrm_employees').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    // Attendance
    ipcMain.handle('hrm-get-attendance', async (_e, { date }: { date?: string }) => {
        let q = supabase.from('hrm_attendance').select('*, employee:employee_id(name)');
        if (date) q = q.eq('date', date);
        const { data, error } = await q.order('date', { ascending: false });
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('hrm-mark-attendance', async (_e, att) => {
        const { error } = await supabase.from('hrm_attendance').upsert({
            employee_id: att.employee_id,
            date: att.date,
            status: att.status,
            check_in: att.check_in || null,
            check_out: att.check_out || null
        }, { onConflict: 'employee_id,date' });
        if (error) throw error;
        return { success: true };
    });

    // Leaves
    ipcMain.handle('hrm-get-leaves', async () => {
        const { data, error } = await supabase.from('hrm_leaves').select('*, employee:employee_id(name)').order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('hrm-request-leave', async (_e, leave) => {
        const { data, error } = await supabase.from('hrm_leaves').insert(leave).select('id').single();
        if (error) throw error;
        return { success: true, id: data.id };
    });

    ipcMain.handle('hrm-update-leave-status', async (_e, { id, status }) => {
        const { error } = await supabase.from('hrm_leaves').update({ status }).eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    // Payroll
    ipcMain.handle('hrm-get-payroll', async (_e, { month, year }) => {
        let q = supabase.from('hrm_payroll').select('*, employee:employee_id(name)');
        if (month) q = q.eq('month', month);
        if (year) q = q.eq('year', year);
        const { data, error } = await q.order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    });

    // ═══ GODOWNS ════════════════════════════════════════════════════════
    ipcMain.handle('get-godowns', async () => {
        const { data, error } = await supabase.from('godowns').select('*').order('name');
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('create-godown', async (_e, godown) => {
        const { data, error } = await supabase.from('godowns').insert(godown).select('id').single();
        if (error) throw error;
        return { success: true, id: data.id };
    });

    ipcMain.handle('update-godown', async (_e, godown) => {
        const { error } = await supabase.from('godowns').update({ name: godown.name, location: godown.location, description: godown.description }).eq('id', godown.id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('delete-godown', async (_e, id) => {
        const { error } = await supabase.from('godowns').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('hrm-generate-payroll', async (_e, pr) => {
        const net = (parseFloat(pr.basic_salary) || 0) + (parseFloat(pr.bonus) || 0) - (parseFloat(pr.deductions) || 0);
        const { error } = await supabase.from('hrm_payroll').upsert({
            employee_id: pr.employee_id,
            month: pr.month,
            year: pr.year,
            basic_salary: pr.basic_salary,
            bonus: pr.bonus || 0,
            deductions: pr.deductions || 0,
            net_salary: net,
            status: pr.status || 'Pending',
            payment_date: pr.payment_date || null
        }, { onConflict: 'employee_id,month,year' });
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('hrm-mark-payroll-paid', async (_e, id) => {
        const { error } = await supabase.from('hrm_payroll').update({ status: 'Paid', payment_date: new Date().toISOString().split('T')[0] }).eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    // ═══ CRM MODULE ═══════════════════════════════════════════════════════════

    ipcMain.handle('crm-get-customers', async () => {
        const { data, error } = await supabase.from('billing_customers').select('*').order('name');
        if (error) throw error;
        return decryptRows(data || []);
    });

    ipcMain.handle('crm-upsert-customer', async (_e, cust) => {
        const payload = encryptObject(cust);
        if (payload.id) {
            const { error } = await supabase.from('billing_customers').update(payload).eq('id', payload.id);
            if (error) throw error;
            return { success: true };
        } else {
            const { data, error } = await supabase.from('billing_customers').insert(payload).select('id').single();
            if (error) throw error;
            return { success: true, id: data.id };
        }
    });

    ipcMain.handle('crm-get-tracking-logs', async (_e, { customerId }) => {
        const { data, error } = await supabase.from('crm_tracking').select('*, user:user_id(full_name)').eq('customer_id', customerId).order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('crm-add-tracking-log', async (_e, log) => {
        const { data, error } = await supabase.from('crm_tracking').insert(log).select('id').single();
        if (error) throw error;
        return { success: true, id: data.id };
    });

    // ═══ QUOTATION MODULE ══════════════════════════════════════════════════════

    ipcMain.handle('create-quotation', async (_e, payload) => {
        const {
            quoteDate, validUntil, companyName, customerName, customerAddress,
            customerMobile, customerEmail, concernedName, concernedPhone, concernedEmail,
            fittingCharge, deliveryCharge, discount, grandTotal,
            preparedBy, preparedByRole, termsJson, items
        } = payload;

        const quotRow = encryptObject({
            company_name: companyName || '',
            customer_name: customerName || '',
            customer_address: customerAddress || '',
            customer_mobile: customerMobile || '',
            customer_email: customerEmail || '',
            concerned_name: concernedName || '',
            concerned_phone: concernedPhone || '',
            concerned_email: concernedEmail || '',
            prepared_by: preparedBy || '',
            prepared_by_role: preparedByRole || '',
        });

        const { data: quot, error } = await supabase.from('quotations').insert({
            quote_number: '',   // trigger fills this
            quote_date: quoteDate,
            valid_until: validUntil,
            fitting_charge: fittingCharge || 0,
            delivery_charge: deliveryCharge || 0,
            discount: discount || 0,
            grand_total: grandTotal || 0,
            terms_json: termsJson || [],
            status: 'Draft',
            ...quotRow,
        }).select('id,quote_number').single();

        if (error) throw error;

        // Insert items
        if (items && items.length > 0) {
            const itemRows = items
                .filter((i: any) => i.specification || i.rate)
                .map((i: any) => ({
                    quotation_id: quot.id,
                    sl_no: i.sl_no,
                    image_path: i.image_path || null,
                    specification: i.specification || '',
                    unit: i.unit || 'pcs',
                    quantity: i.quantity || 1,
                    rate: i.rate || 0,
                }));
            if (itemRows.length > 0) {
                const { error: itemErr } = await supabase.from('quotation_items').insert(itemRows);
                if (itemErr) console.warn('[Quotation] Item insert error:', itemErr.message);
            }
        }

        return { id: quot.id, quoteNumber: quot.quote_number };
    });

    ipcMain.handle('get-quotations', async () => {
        const { data, error } = await supabase
            .from('quotations')
            .select('id,quote_number,quote_date,valid_until,customer_name,company_name,grand_total,status')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return decryptRows(data || []);
    });

    ipcMain.handle('get-quotation', async (_e, id: number) => {
        const { data: quot, error } = await supabase
            .from('quotations')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;

        const { data: items } = await supabase
            .from('quotation_items')
            .select('*')
            .eq('quotation_id', id)
            .order('sl_no');

        const decrypted = decryptObject(quot);
        return { ...decrypted, items: items || [] };
    });

    ipcMain.handle('delete-quotation', async (_e, id: number) => {
        const { error } = await supabase.from('quotations').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    // ═══ CUSTOMER LEDGER & ADDRESSES ══════════════════════════════════════════
    ipcMain.handle('get-customer-ledger-list', async () => {
        // Try cache first for instant response
        const cached = cache.get('billing_customers');
        if (cached) return cached;

        // Fallback
        const { data: customers, error } = await supabase.from('billing_customers').select('*').order('name');
        if (error) throw error;
        const decryptedCustomers = decryptRows(customers || []);
        
        return decryptedCustomers;
    });

    ipcMain.handle('get-customer-ledger-detail', async (_e, id: number) => {
        const { data: cust } = await supabase.from('billing_customers').select('*').eq('id', id).single();
        if (!cust) return null;
        
        const { data: addresses } = await supabase.from('customer_addresses').select('*').eq('customer_id', id).order('created_at', { ascending: false });
        const { data: payments } = await supabase.from('customer_payments').select('*').eq('customer_id', id).order('created_at', { ascending: false });
        const { data: bills } = await supabase.from('bills').select('*').eq('customer_id', id).order('created_at', { ascending: false });
        const { data: quotations } = await supabase.from('quotations').select('*').eq('customer_id', id).order('created_at', { ascending: false });
        const { data: exchanges } = await supabase.from('exchange_orders').select('*').eq('customer_id', id).order('created_at', { ascending: false });

        return { 
            customer: decryptObject(cust), 
            addresses: addresses || [], 
            payments: payments || [], 
            bills: bills || [], 
            quotations: decryptRows(quotations || []),
            exchanges: exchanges || []
        };
    });

    ipcMain.handle('add-customer-payment', async (_e, payment) => {
        const { error } = await supabase.from('customer_payments').insert(payment);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('add-customer-address', async (_e, address) => {
        const { error } = await supabase.from('customer_addresses').insert(address);
        if (error) throw error;
        return { success: true };
    });

    // ═══ EXCHANGE ORDERS ══════════════════════════════════════════════════════
    ipcMain.handle('create-exchange-order', async (_e, exchangeData) => {
        const { customer_id, original_bill_id, returned_items, new_items, total_return_value, total_new_value, difference_amount } = exchangeData;

        // 1. Create the order wrapper
        const { data: order, error } = await supabase.from('exchange_orders').insert({
            customer_id,
            original_bill_id: original_bill_id || null,
            total_return_value,
            total_new_value,
            difference_amount
        }).select('id, exchange_number').single();

        if (error) throw error;
        const exchangeId = order.id;

        // 2. Format items
        const allItems = [];
        for (const item of returned_items) {
            allItems.push({ exchange_id: exchangeId, item_type: 'RETURNED', product_id: item.product_id, product_name: item.product_name, sku: item.sku, quantity: item.quantity, rate: item.rate, amount: item.amount });
        }
        for (const item of new_items) {
            allItems.push({ exchange_id: exchangeId, item_type: 'NEW', product_id: item.product_id, product_name: item.product_name, sku: item.sku, quantity: item.quantity, rate: item.rate, amount: item.amount });
        }

        // 3. Save items
        if (allItems.length > 0) {
            const { error: itemsErr } = await supabase.from('exchange_items').insert(allItems);
            if (itemsErr) throw itemsErr;

            // 4. Adjust Inventory
            for (const item of returned_items) {
                if (item.product_id) {
                    try { await supabase.from('products').update({ quantity: (supabase as any).sql`quantity + ${item.quantity}` }).eq('id', item.product_id); } catch { }
                }
            }
            for (const item of new_items) {
                if (item.product_id) {
                    try { await supabase.from('products').update({ quantity: (supabase as any).sql`GREATEST(quantity - ${item.quantity}, 0)` }).eq('id', item.product_id); } catch { }
                }
            }
        }

        return { success: true, exchange_number: order.exchange_number };
    });

    ipcMain.handle('get-exchange-orders', async () => {
        const { data, error } = await supabase.from('exchange_orders').select('*, customer:billing_customers(name,phone), bill:bills(invoice_number)').order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map((b: any) => ({ 
            ...b, 
            customer_name: decryptField(b.customer?.name) || b.customer?.name || null, 
            customer_phone: decryptField(b.customer?.phone) || b.customer?.phone || null,
            original_invoice_number: decryptField(b.bill?.invoice_number) || b.bill?.invoice_number || null
        }));
    });
    
    ipcMain.handle('get-exchange-details', async (_e, id: number) => {
        const { data: order } = await supabase.from('exchange_orders').select('*, customer:billing_customers(name,phone,address), bill:bills(invoice_number, created_at)').eq('id', id).single();
        if (!order) return null;
        const { data: items } = await supabase.from('exchange_items').select('*').eq('exchange_id', id);
        return { 
            ...order, 
            customer_name: decryptField(order.customer?.name) || order.customer?.name || null,
            customer_phone: decryptField(order.customer?.phone) || order.customer?.phone || null,
            customer_address: decryptField(order.customer?.address) || order.customer?.address || null,
            original_invoice_number: decryptField(order.bill?.invoice_number) || order.bill?.invoice_number || null,
            items: items || [] 
        };
    });

    // ═══ PERMISSION LEVELS ════════════════════════════════════════════════════
    ipcMain.handle('get-permission-levels', async () => {
        const { data, error } = await supabase
            .from('permission_levels')
            .select('*, approver:approver_user_id(full_name, username)')
            .order('feature_name');
        if (error) throw error;
        // Map approver to include the user's name
        return (data || []).map((p: any) => ({
            ...p,
            approver_user_name: p.approver ? (p.approver.full_name || p.approver.username) : null
        }));
    });

    ipcMain.handle('create-permission-level', async (_e, payload) => {
        const { feature_name, feature_key, description, approver_role, approver_user_id } = payload;
        const { data, error } = await supabase.from('permission_levels').insert({
            feature_name,
            feature_key,
            description: description || '',
            approver_role: approver_role || null,
            approver_user_id: approver_user_id || null,
            is_active: true
        }).select('id').single();
        if (error) throw error;
        return { success: true, id: data.id };
    });

    ipcMain.handle('update-permission-level', async (_e, payload) => {
        const { id, ...updates } = payload;
        updates.updated_at = new Date().toISOString();
        const { error } = await supabase.from('permission_levels').update(updates).eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('delete-permission-level', async (_e, id: number) => {
        const { error } = await supabase.from('permission_levels').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    // ═══ AI MARKET ANALYSIS & WEB SCRAPING ════════════════════════════════════
    ipcMain.handle('save-ai-key', (_e, key: string) => {
        try {
            const cfgPath = path.join(app.getPath('userData'), 'supabase-config.json');
            let cfg: any = {};
            if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
            cfg.geminiKey = key;
            fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('get-ai-key', () => {
        try {
            const cfgPath = path.join(app.getPath('userData'), 'supabase-config.json');
            if (fs.existsSync(cfgPath)) {
                const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
                return cfg.geminiKey || '';
            }
        } catch {}
        return '';
    });

    ipcMain.handle('get-competitor-urls', async (_e, productId: number) => {
        const { data, error } = await supabase.from('product_competitor_urls').select('*').eq('product_id', productId).order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('add-competitor-url', async (_e, data) => {
        const { error } = await supabase.from('product_competitor_urls').insert([data]);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('delete-competitor-url', async (_e, id: number) => {
        const { error } = await supabase.from('product_competitor_urls').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('get-market-analysis-history', async (_e, productId?: number) => {
        let q = supabase.from('market_analysis_history').select('*, product:products(item_name)').order('recorded_at', { ascending: false });
        if (productId) q = q.eq('product_id', productId);
        const { data, error } = await q;
        if (error) throw error;
        // Map product name securely from joined data
        return (data || []).map((row: any) => ({
            ...row,
            product_name: row.product ? row.product.item_name : 'Unknown Product'
        }));
    });

    ipcMain.handle('run-auto-price-scan', async (_e, productId: number) => {
        try {
            // 1. Fetch our product details from the actual DB safely
            const { data: prodData, error: prodErr } = await supabase.from('products').select('*').eq('id', productId).single();
            if (prodErr || !prodData) throw new Error("Could not find source product.");
            
            // It might be encrypted depending on the encryption logic, but products are fully handled by cache generally.
            // Ensure we have plaintext for the AI.
            const ptProduct = decryptObject(prodData);
            const pName = ptProduct.item_name;
            const pGroup = ptProduct.group_id?.toString() || 'General';
            const pDesc = ptProduct.narration || ptProduct.description || 'No description';

            // 2. Fetch configured target URLs
            const { data: urls, error: urlsErr } = await supabase.from('product_competitor_urls').select('*').eq('product_id', productId);
            if (urlsErr || !urls || urls.length === 0) throw new Error("No competitor URLs configured for this product.");

            // 3. Dynamically import the AI Agent to avoid top-level load errors if package missing
            const aiAgent = await import('./ai-agent');

            // 4. Run inferences sequentially to avoid spamming the free tier limits (Rate limiting)
            const results = [];
            for (const urlRecord of urls) {
                try {
                    const analysis = await aiAgent.runMarketAnalysis(
                        urlRecord.url, 
                        pGroup, 
                        pName, 
                        pDesc
                    );

                    // 5. Store result back into Supabase for report rendering
                    const historyRecord = {
                        product_id: productId,
                        competitor_name: urlRecord.competitor_name,
                        competitor_price: analysis.competitor_price,
                        competitor_features: analysis.competitor_features,
                        ai_comparison_insights: analysis.ai_comparison_insights
                    };

                    const { error: insErr } = await supabase.from('market_analysis_history').insert([historyRecord]);
                    if (insErr) console.error("[IPC] Error saving AI history:", insErr);

                    results.push(historyRecord);
                } catch (singleErr: any) {
                    console.error(`[IPC] Failed to analyze ${urlRecord.url}:`, singleErr);
                    // Continue with next URLs even if one fails
                }
            }

            return { success: true, count: results.length };

        } catch (err: any) {
            console.error('[IPC] run-auto-price-scan completely failed:', err);
            return { success: false, error: err.message };
        }
    });

    // ═══ PAYMENT METHODS ══════════════════════════════════════════════════════════
    ipcMain.handle('get-payment-methods', async () => {
        const { data, error } = await supabase.from('payment_methods').select('*').order('name');
        if (error) throw error;
        return data || [];
    });

    ipcMain.handle('create-payment-method', async (_e, method) => {
        const { data, error } = await supabase.from('payment_methods').insert([method]).select('id').single();
        if (error) throw error;
        return { success: true, id: data.id };
    });

    ipcMain.handle('update-payment-method', async (_e, method) => {
        const { id, ...updates } = method;
        const { error } = await supabase.from('payment_methods').update(updates).eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('delete-payment-method', async (_e, id: number) => {
        const { error } = await supabase.from('payment_methods').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('verify-bill-payment', async (_e, { paymentRef, status }) => {
        // Special handler for external automation software to verify payments
        const { error } = await supabase.from('bills').update({ payment_status: status }).eq('payment_ref', paymentRef);
        if (error) throw error;
        return { success: true };
    });

    // ═══ NATIVE WINDOW CONTROLS ═══════════════════════════════════════════════════
    ipcMain.handle('set-theme', (event, theme: string) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;
        
        // Dynamically style the native Windows controls over the React web contents
        if (theme === 'dark') {
            win.setTitleBarOverlay({ color: '#141414', symbolColor: '#f5f5f5' });
        } else {
            win.setTitleBarOverlay({ color: '#c0c0c0', symbolColor: '#111111' });
        }
    });

} // end registerHandlers
