import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import { initDB } from './database';
import db from './database';
import mysql from 'mysql2/promise';
import * as networkConfig from './network-config';
import { startDbServer, getLocalIp, getDbMonitoringData } from './db-server';
import { testConnection } from './db-client';
import * as licenseManager from './license-manager';
import { encryptDatabaseOnShutdown } from './db-encryption';

// ═══════════════════════════════════════════════
//  SECURITY: Brute-force login protection
//  Tracks failed attempts per username.
//  After 5 failures, account is locked for 15 min.
// ═══════════════════════════════════════════════
const BCRYPT_ROUNDS = 12;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function checkBruteForce(username: string): { locked: boolean; remaining?: number } {
    const entry = loginAttempts.get(username);
    if (!entry) return { locked: false };
    if (Date.now() < entry.lockedUntil) {
        const remaining = Math.ceil((entry.lockedUntil - Date.now()) / 1000 / 60);
        return { locked: true, remaining };
    }
    // Lock expired — reset
    if (entry.lockedUntil > 0 && Date.now() >= entry.lockedUntil) {
        loginAttempts.delete(username);
    }
    return { locked: false };
}

function recordFailedLogin(username: string): void {
    const entry = loginAttempts.get(username) || { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) {
        entry.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    loginAttempts.set(username, entry);
}

function resetLoginAttempts(username: string): void {
    loginAttempts.delete(username);
}

// MySQL connection pool for Leading Edge Website
let mysqlPool: any = null;
try {
    mysqlPool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'furniture_shop',
        port: Number(process.env.DB_PORT) || 3306,
        waitForConnections: true,
        connectionLimit: 5,
    });
    console.log('MySQL pool created for website integration');
    // Auto-migrate: add stock and sku columns if missing
    (async () => {
        try {
            await mysqlPool.query('ALTER TABLE products ADD COLUMN stock INT DEFAULT 0');
            console.log('Added stock column to MySQL products table');
        } catch (e: any) { /* Column likely already exists */ }
        try {
            await mysqlPool.query('ALTER TABLE products ADD COLUMN sku VARCHAR(100)');
            console.log('Added sku column to MySQL products table');
        } catch (e: any) { /* Column likely already exists */ }
    })();
} catch (e) {
    console.warn('MySQL connection failed — website features will be unavailable:', e);
}

// ═══════════════════════════════════════════════
//  SYNC HELPER: Push a local product to MySQL
// ═══════════════════════════════════════════════
async function syncProductToMySQL(product: {
    localId: number; name: string; sku: string; category: string;
    sellingPrice: number; description: string; imagePath: string; quantity: number;
}) {
    if (!mysqlPool) return;
    try {
        const mysqlId = `lesoft-${product.localId}`;

        // ── Resolve image: copy local file to website uploads dir so the website can serve it ──
        let imageUrl = '';
        if (product.imagePath && product.imagePath.length > 0 && !product.imagePath.startsWith('http')) {
            try {
                // Website server/uploads/products lives relative to this binary in dev;
                // Try to copy to a predictable location next to the website server
                const possibleWebsiteServerDirs = [
                    path.join(process.cwd(), '..', 'Leading-Edge-Website', 'server', 'uploads', 'products'),
                    path.join(app.getPath('userData'), '..', '..', 'Leading-Edge-Website', 'server', 'uploads', 'products'),
                    path.join('D:', 'Code', 'Leading Edge', 'Leading-Edge-Website', 'server', 'uploads', 'products'),
                ];
                const ext = path.extname(product.imagePath) || '.jpg';
                const safeFileName = `lesoft-${product.localId}${ext}`;

                const WEBSITE_BASE = process.env.WEBSITE_URL || 'http://localhost:3001';
                let copied = false;
                for (const dir of possibleWebsiteServerDirs) {
                    try {
                        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                        fs.copyFileSync(product.imagePath, path.join(dir, safeFileName));
                        // Store full URL so website frontend can use it directly as <img src>
                        imageUrl = `${WEBSITE_BASE}/uploads/products/${safeFileName}`;
                        copied = true;
                        break;
                    } catch (_) { /* try next */ }
                }
                if (!copied) {
                    // Fallback: store as-is (will only work if website is on same machine and can access the path)
                    imageUrl = product.imagePath;
                }
            } catch (e: any) {
                console.warn('Image copy to website failed:', e.message);
                imageUrl = product.imagePath;
            }
        } else {
            imageUrl = product.imagePath || '';
        }

        const conn = await mysqlPool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                `INSERT INTO products (id, name, price, sale_price, on_sale, description, model_number, image, is_visible, stock, sku)
                 VALUES (?, ?, ?, 0, 0, ?, ?, ?, 1, ?, ?)
                 ON DUPLICATE KEY UPDATE name=VALUES(name), price=VALUES(price), description=VALUES(description),
                 model_number=VALUES(model_number), image=VALUES(image), stock=VALUES(stock), sku=VALUES(sku)`,
                [mysqlId, product.name, product.sellingPrice, product.description,
                    product.sku, imageUrl, product.quantity, product.sku]
            );
            // Sync categories
            await conn.query('DELETE FROM product_categories WHERE product_id = ?', [mysqlId]);
            if (product.category) {
                const cats = product.category.split(',').map((c: string) => c.trim()).filter(Boolean);
                for (const cat of cats) {
                    await conn.query('INSERT IGNORE INTO product_categories (product_id, category_name) VALUES (?, ?)', [mysqlId, cat]);
                }
            }
            await conn.commit();
            console.log(`Synced product to MySQL: ${product.name} (${mysqlId}), image: ${imageUrl}`);
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    } catch (e: any) {
        console.warn(`Failed to sync product "${product.name}" to MySQL:`, e.message);
    }
}

// Helper: sync stock update to MySQL
async function syncStockToMySQL(localProductId: number, quantitySold: number) {
    if (!mysqlPool) return;
    try {
        const mysqlId = `lesoft-${localProductId}`;
        await mysqlPool.query('UPDATE products SET stock = GREATEST(stock - ?, 0) WHERE id = ?', [quantitySold, mysqlId]);
        console.log(`Synced stock decrement to MySQL: product ${mysqlId}, qty -${quantitySold}`);
    } catch (e: any) {
        console.warn(`Failed to sync stock for product ${localProductId}:`, e.message);
    }
}

// ═══════════════════════════════════════════════
//  IN-MEMORY PRESENCE & TYPING STORES
// ═══════════════════════════════════════════════
const userPresence: Map<number, number> = new Map(); // userId -> last heartbeat timestamp
const userTyping: Map<string, number> = new Map();   // "senderId->receiverId" -> timestamp

function createWindow() {
    // Remove default menu bar (File, Edit, View, Window, Help)
    Menu.setApplicationMenu(null);

    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: false,          // SECURITY: renderer cannot access Node APIs
            contextIsolation: true,           // SECURITY: preload script runs in isolated context
            sandbox: false,                   // keep false so preload.cjs works with contextBridge
            webSecurity: true,               // SECURITY: enforce same-origin policy
            allowRunningInsecureContent: false,
            preload: path.join(__dirname, 'preload.cjs'),
        },
        icon: path.join(__dirname, '../build/icon.ico'),
        backgroundColor: '#0a0a0a',
        show: false,
        frame: true,
        titleBarStyle: 'default'
    });

    // SECURITY: Block DevTools entirely in production
    if (app.isPackaged) {
        win.webContents.on('devtools-opened', () => {
            win.webContents.closeDevTools();
        });
    }

    if (app.isPackaged) {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    } else {
        win.loadURL('http://localhost:5173');
    }

    // If not configured, redirect to network setup
    win.webContents.on('did-finish-load', () => {
        if (!networkConfig.isConfigured()) {
            win.webContents.send('redirect-to', '/network-setup');
        }
    });

    win.once('ready-to-show', () => {
        win.show();
    });

    // Block web-app shortcuts (Ctrl+R, F5, Ctrl+Shift+I, etc.)
    win.webContents.on('before-input-event', (event, input) => {
        const ctrl = input.control || input.meta;
        const shift = input.shift;
        const key = input.key.toLowerCase();

        // Block: Ctrl+R, F5, Ctrl+Shift+R (Reload)
        if ((ctrl && key === 'r') || key === 'f5') { event.preventDefault(); return; }
        // Block: Ctrl+Shift+I (DevTools)
        if (ctrl && shift && key === 'i') { event.preventDefault(); return; }
        // Block: Ctrl+U (View Source)
        if (ctrl && key === 'u') { event.preventDefault(); return; }
        // Block: Ctrl+P (Print)
        if (ctrl && key === 'p') { event.preventDefault(); return; }
        // Block: F12 (DevTools)
        if (key === 'f12') { event.preventDefault(); return; }
        // Block: Ctrl+F (Find) — optional, remove if search is needed
        // if (ctrl && key === 'f') { event.preventDefault(); return; }
    });
}

app.whenReady().then(async () => {
    // Start server if in server mode
    if (networkConfig.isServerMode()) {
        const config = networkConfig.getNetworkConfig();
        try {
            await startDbServer(config.port);
        } catch (e) {
            console.error('Failed to start DB Server:', e);
        }
    }

    initDB();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// SECURITY: Encrypt database when app is quitting
app.on('before-quit', () => {
    try {
        encryptDatabaseOnShutdown();
    } catch (e) {
        console.error('[ENCRYPTION] Shutdown encryption failed:', e);
    }
});

// ═══════════════════════════════════════════════
//  GROUPS — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('get-groups', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT g.*, pg.name as parent_name 
                FROM groups g 
                LEFT JOIN groups pg ON g.parent_group_id = pg.id 
                ORDER BY g.name`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('create-group', async (_event, group) => {
    return new Promise((resolve, reject) => {
        const { name, parent, nature } = group;
        // Lookup parent group ID
        if (parent && parent !== 'Primary') {
            db.get("SELECT id FROM groups WHERE name = ?", [parent], (err, row: any) => {
                if (err) return reject(err);
                const parentId = row ? row.id : null;
                const stmt = db.prepare("INSERT INTO groups (name, parent_group_id, nature, company_id) VALUES (?, ?, ?, 1)");
                stmt.run([name, parentId, nature || null], function (err) {
                    if (err) reject(err);
                    else resolve({ success: true, id: this.lastID });
                });
                stmt.finalize();
            });
        } else {
            const stmt = db.prepare("INSERT INTO groups (name, parent_group_id, nature, company_id) VALUES (?, NULL, ?, 1)");
            stmt.run([name, nature], function (err) {
                if (err) reject(err);
                else resolve({ success: true, id: this.lastID });
            });
            stmt.finalize();
        }
    });
});

ipcMain.handle('delete-group', async (_event, id: number) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM groups WHERE id = ?", [id], function (err) {
            if (err) reject(err);
            else resolve({ success: true, changes: this.changes });
        });
    });
});

// ═══════════════════════════════════════════════
//  LEDGERS — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('get-ledgers', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT l.*, g.name as group_name 
                FROM ledgers l 
                LEFT JOIN groups g ON l.group_id = g.id 
                ORDER BY l.name`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('create-ledger', async (_event, ledger) => {
    return new Promise((resolve, reject) => {
        const { name, group, openingBalance, type, mailingName, address, gstin } = ledger;
        db.get("SELECT id FROM groups WHERE name = ?", [group], (err, row: any) => {
            if (err) return reject(err);
            const groupId = row ? row.id : null;
            const stmt = db.prepare(`INSERT INTO ledgers (name, group_id, opening_balance, opening_balance_type, mailing_name, address, tax_reg_no, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`);
            stmt.run([name, groupId, openingBalance || 0, type || 'Dr', mailingName || '', address || '', gstin || ''], function (err) {
                if (err) reject(err);
                else resolve({ success: true, id: this.lastID });
            });
            stmt.finalize();
        });
    });
});

ipcMain.handle('delete-ledger', async (_event, id: number) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM ledgers WHERE id = ?", [id], function (err) {
            if (err) reject(err);
            else resolve({ success: true, changes: this.changes });
        });
    });
});

// ═══════════════════════════════════════════════
//  VOUCHERS — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('get-vouchers', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT v.*, 
                (SELECT GROUP_CONCAT(l.name, ', ') 
                 FROM voucher_entries ve 
                 JOIN ledgers l ON ve.ledger_id = l.id 
                 WHERE ve.voucher_id = v.id) as particulars
                FROM vouchers v 
                ORDER BY v.date DESC, v.id DESC`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('create-voucher', async (_event, voucher) => {
    return new Promise((resolve, reject) => {
        const { voucherType, voucherDate, narration, rows } = voucher;

        db.serialize(() => {
            // Auto-generate voucher number
            db.get("SELECT COALESCE(MAX(CAST(voucher_number AS INTEGER)), 0) + 1 as next_no FROM vouchers WHERE voucher_type = ?",
                [voucherType], (err, numRow: any) => {
                    if (err) return reject(err);
                    const voucherNumber = String(numRow?.next_no || 1);

                    // Calculate total
                    const totalAmount = rows.reduce((sum: number, r: any) => sum + Math.max(Number(r.debit) || 0, Number(r.credit) || 0), 0) / 2;

                    db.run("BEGIN TRANSACTION");

                    db.run(`INSERT INTO vouchers (voucher_type, voucher_number, date, narration, total_amount, company_id) VALUES (?, ?, ?, ?, ?, 1)`,
                        [voucherType, voucherNumber, voucherDate, narration, totalAmount],
                        function (err) {
                            if (err) {
                                db.run("ROLLBACK");
                                return reject(err);
                            }
                            const voucherId = this.lastID;

                            // Helper to insert entries sequentially
                            let idx = 0;
                            const insertNext = () => {
                                if (idx >= rows.length) {
                                    db.run("COMMIT", (err) => {
                                        if (err) reject(err);
                                        else resolve({ success: true, id: voucherId, voucherNumber });
                                    });
                                    return;
                                }
                                const row = rows[idx];
                                const amount = row.type === 'Dr' ? Number(row.debit) : Number(row.credit);
                                // Lookup ledger ID by name
                                db.get("SELECT id FROM ledgers WHERE name = ?", [row.particulars], (err, ledgerRow: any) => {
                                    if (err) {
                                        db.run("ROLLBACK");
                                        return reject(err);
                                    }
                                    const ledgerId = ledgerRow ? ledgerRow.id : null;
                                    db.run("INSERT INTO voucher_entries (voucher_id, ledger_id, amount, type) VALUES (?, ?, ?, ?)",
                                        [voucherId, ledgerId, amount, row.type], (err) => {
                                            if (err) {
                                                db.run("ROLLBACK");
                                                return reject(err);
                                            }
                                            idx++;
                                            insertNext();
                                        });
                                });
                            };
                            insertNext();
                        }
                    );
                });
        });
    });
});

ipcMain.handle('delete-voucher', async (_event, id: number) => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("DELETE FROM voucher_entries WHERE voucher_id = ?", [id]);
            db.run("DELETE FROM vouchers WHERE id = ?", [id], function (err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            });
        });
    });
});

// ═══════════════════════════════════════════════
//  INVENTORY — IPC Handlers
// ═══════════════════════════════════════════════

// Units
ipcMain.handle('get-units', async () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM units ORDER BY name", (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('create-unit', async (_event, unit) => {
    return new Promise((resolve, reject) => {
        const { name, symbol, precision } = unit;
        const stmt = db.prepare("INSERT INTO units (name, symbol, precision, company_id) VALUES (?, ?, ?, 1)");
        stmt.run([name, symbol, precision || 0], function (err) {
            if (err) reject(err);
            else resolve({ success: true, id: this.lastID });
        });
        stmt.finalize();
    });
});

ipcMain.handle('delete-unit', async (_event, id: number) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM units WHERE id = ?", [id], function (err) {
            if (err) reject(err);
            else resolve({ success: true, changes: this.changes });
        });
    });
});

// Stock Groups
ipcMain.handle('get-stock-groups', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT sg.*, psg.name as parent_name 
                FROM stock_groups sg 
                LEFT JOIN stock_groups psg ON sg.parent_id = psg.id 
                ORDER BY sg.name`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('create-stock-group', async (_event, group) => {
    return new Promise((resolve, reject) => {
        const { name, parent } = group;
        if (parent && parent !== 'Primary') {
            db.get("SELECT id FROM stock_groups WHERE name = ?", [parent], (err, row: any) => {
                if (err) return reject(err);
                const parentId = row ? row.id : null;
                const stmt = db.prepare("INSERT INTO stock_groups (name, parent_id, company_id) VALUES (?, ?, 1)");
                stmt.run([name, parentId], function (err) {
                    if (err) reject(err);
                    else resolve({ success: true, id: this.lastID });
                });
                stmt.finalize();
            });
        } else {
            const stmt = db.prepare("INSERT INTO stock_groups (name, parent_id, company_id) VALUES (?, NULL, 1)");
            stmt.run([name], function (err) {
                if (err) reject(err);
                else resolve({ success: true, id: this.lastID });
            });
            stmt.finalize();
        }
    });
});

ipcMain.handle('delete-stock-group', async (_event, id: number) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM stock_groups WHERE id = ?", [id], function (err) {
            if (err) reject(err);
            else resolve({ success: true, changes: this.changes });
        });
    });
});

// Stock Items
ipcMain.handle('get-stock-items', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT si.*, sg.name as group_name, u.name as unit_name, u.symbol as unit_symbol
                FROM stock_items si 
                LEFT JOIN stock_groups sg ON si.group_id = sg.id 
                LEFT JOIN units u ON si.unit_id = u.id 
                ORDER BY si.name`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('create-stock-item', async (_event, item) => {
    return new Promise((resolve, reject) => {
        const { name, group, unit, openingQty, openingRate } = item;
        db.get("SELECT id FROM units WHERE name = ?", [unit], (err, unitRow: any) => {
            if (err) return reject(err);
            const unitId = unitRow ? unitRow.id : null;
            db.get("SELECT id FROM stock_groups WHERE name = ?", [group], (err, groupRow: any) => {
                if (err) return reject(err);
                const groupId = groupRow ? groupRow.id : null;
                const openValue = (Number(openingQty) || 0) * (Number(openingRate) || 0);
                const stmt = db.prepare("INSERT INTO stock_items (name, group_id, unit_id, opening_qty, opening_rate, opening_value, company_id) VALUES (?, ?, ?, ?, ?, ?, 1)");
                stmt.run([name, groupId, unitId, openingQty || 0, openingRate || 0, openValue], function (err) {
                    if (err) reject(err);
                    else resolve({ success: true, id: this.lastID });
                });
                stmt.finalize();
            });
        });
    });
});

ipcMain.handle('delete-stock-item', async (_event, id: number) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM stock_items WHERE id = ?", [id], function (err) {
            if (err) reject(err);
            else resolve({ success: true, changes: this.changes });
        });
    });
});

// ═══════════════════════════════════════════════
//  COMPANIES — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('get-companies', async () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM companies ORDER BY name", (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('create-company', async (_event, company) => {
    return new Promise((resolve, reject) => {
        const { name, mailingName, address, country, state, phone, email, financialYearFrom, booksBeginFrom, currencySymbol } = company;
        const stmt = db.prepare(`INSERT INTO companies (name, mailing_name, address, country, state, phone, email, financial_year_from, books_begin_from, base_currency_symbol) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        stmt.run([name, mailingName || name, address || '', country || 'Bangladesh', state || '', phone || '', email || '', financialYearFrom || '', booksBeginFrom || '', currencySymbol || '৳'], function (err) {
            if (err) reject(err);
            else resolve({ success: true, id: this.lastID });
        });
        stmt.finalize();
    });
});

// ═══════════════════════════════════════════════
//  DASHBOARD — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('get-dashboard-stats', async () => {
    return new Promise((resolve, reject) => {
        const stats: any = {};
        db.get("SELECT COUNT(*) as count FROM ledgers", (err, row: any) => {
            if (err) return reject(err);
            stats.ledgerCount = row?.count || 0;

            db.get("SELECT COUNT(*) as count FROM groups", (err, row: any) => {
                if (err) return reject(err);
                stats.groupCount = row?.count || 0;

                db.get("SELECT COUNT(*) as count FROM vouchers", (err, row: any) => {
                    if (err) return reject(err);
                    stats.voucherCount = row?.count || 0;

                    db.get("SELECT COALESCE(SUM(total_amount), 0) as total FROM vouchers", (err, row: any) => {
                        if (err) return reject(err);
                        stats.totalTransactions = row?.total || 0;

                        db.get("SELECT COUNT(*) as count FROM stock_items", (err, row: any) => {
                            if (err) return reject(err);
                            stats.stockItemCount = row?.count || 0;

                            db.get("SELECT COUNT(*) as count FROM products", (err, row: any) => {
                                if (err) return reject(err);
                                stats.productCount = row?.count || 0;

                                db.get("SELECT COUNT(*) as count FROM purchase_bills", (err, row: any) => {
                                    if (err) return reject(err);
                                    stats.purchaseBillCount = row?.count || 0;

                                    // Recent vouchers
                                    db.all("SELECT * FROM vouchers ORDER BY date DESC, id DESC LIMIT 5", (err, rows) => {
                                        if (err) return reject(err);
                                        stats.recentVouchers = rows || [];
                                        resolve(stats);
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// ═══════════════════════════════════════════════
//  PRODUCTS — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('get-products', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT p.*, u.name as unit_name, u.symbol as unit_symbol, sg.name as group_name
                FROM products p
                LEFT JOIN units u ON p.unit_id = u.id
                LEFT JOIN stock_groups sg ON p.stock_group_id = sg.id
                ORDER BY p.name`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('create-product', async (_event, product) => {
    return new Promise((resolve, reject) => {
        const { name, sku, category, purchasePrice, sellingPrice, taxRate, hsnCode, description, unit, stockGroup, imagePath, quantity } = product;
        db.get("SELECT id FROM units WHERE name = ?", [unit], (err, unitRow: any) => {
            if (err) return reject(err);
            const unitId = unitRow ? unitRow.id : null;
            db.get("SELECT id FROM stock_groups WHERE name = ?", [stockGroup], (err, groupRow: any) => {
                if (err) return reject(err);
                const groupId = groupRow ? groupRow.id : null;
                const stmt = db.prepare(`INSERT INTO products (name, sku, category, purchase_price, selling_price, tax_rate, hsn_code, description, unit_id, stock_group_id, company_id, image_path, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`);
                stmt.run([name, sku || '', category || '', purchasePrice || 0, sellingPrice || 0, taxRate || 0, hsnCode || '', description || '', unitId, groupId, imagePath || '', quantity || 0], function (err) {
                    if (err) reject(err);
                    else {
                        const newId = this.lastID;
                        // Fire-and-forget sync to website MySQL
                        syncProductToMySQL({
                            localId: newId, name, sku: sku || '', category: category || '',
                            sellingPrice: sellingPrice || 0, description: description || '',
                            imagePath: imagePath || '', quantity: quantity || 0
                        });
                        resolve({ success: true, id: newId });
                    }
                });
                stmt.finalize();
            });
        });
    });
});

ipcMain.handle('delete-product', async (_event, id: number) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM products WHERE id = ?", [id], function (err) {
            if (err) reject(err);
            else resolve({ success: true, changes: this.changes });
        });
    });
});

ipcMain.handle('update-product', async (_event, product) => {
    return new Promise((resolve, reject) => {
        const { id, name, sku, category, purchasePrice, sellingPrice, taxRate, hsnCode, description, unit, stockGroup, imagePath, quantity } = product;
        db.get("SELECT id FROM units WHERE name = ?", [unit], (err: Error | null, unitRow: any) => {
            if (err) return reject(err);
            const unitId = unitRow ? unitRow.id : null;
            db.get("SELECT id FROM stock_groups WHERE name = ?", [stockGroup], (err: Error | null, groupRow: any) => {
                if (err) return reject(err);
                const groupId = groupRow ? groupRow.id : null;
                db.run(
                    `UPDATE products SET name=?, sku=?, category=?, purchase_price=?, selling_price=?, tax_rate=?, hsn_code=?, description=?, unit_id=?, stock_group_id=?, image_path=?, quantity=? WHERE id=?`,
                    [name, sku || '', category || '', purchasePrice || 0, sellingPrice || 0, taxRate || 0, hsnCode || '', description || '', unitId, groupId, imagePath || '', quantity || 0, id],
                    function (err: Error | null) {
                        if (err) return reject(err);
                        // Sync to MySQL
                        syncProductToMySQL({
                            localId: id, name, sku: sku || '', category: category || '',
                            sellingPrice: sellingPrice || 0, description: description || '',
                            imagePath: imagePath || '', quantity: quantity || 0
                        });
                        resolve({ success: true, changes: this.changes });
                    }
                );
            });
        });
    });
});

ipcMain.handle('get-product', async (_event, id: number) => {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT p.*, u.name as unit_name, u.symbol as unit_symbol, sg.name as group_name
             FROM products p
             LEFT JOIN units u ON p.unit_id = u.id
             LEFT JOIN stock_groups sg ON p.stock_group_id = sg.id
             WHERE p.id = ?`,
            [id],
            (err: Error | null, row: any) => {
                if (err) reject(err); else resolve(row || null);
            }
        );
    });
});

// ═══════════════════════════════════════════════
//  BILLING / POS — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('search-billing-customers', async (_event, query: string) => {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT * FROM billing_customers WHERE phone LIKE ? OR name LIKE ? ORDER BY name LIMIT 10`,
            [`%${query}%`, `%${query}%`],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
});

ipcMain.handle('create-billing-customer', async (_event, customer) => {
    return new Promise((resolve, reject) => {
        const { name, phone, email, address } = customer;
        // Try to find existing by phone first
        if (phone) {
            db.get(`SELECT * FROM billing_customers WHERE phone = ?`, [phone], (err, existing: any) => {
                if (err) return reject(err);
                if (existing) {
                    // Update existing customer info
                    db.run(
                        `UPDATE billing_customers SET name = ?, email = ?, address = ? WHERE id = ?`,
                        [name || existing.name, email || existing.email, address || existing.address, existing.id],
                        function (err) {
                            if (err) reject(err);
                            else resolve({ ...existing, name: name || existing.name, email: email || existing.email, address: address || existing.address });
                        }
                    );
                } else {
                    // Create new
                    db.run(
                        `INSERT INTO billing_customers (name, phone, email, address) VALUES (?, ?, ?, ?)`,
                        [name, phone, email || '', address || ''],
                        function (err) {
                            if (err) reject(err);
                            else resolve({ id: this.lastID, name, phone, email, address, total_bills: 0 });
                        }
                    );
                }
            });
        } else {
            // No phone — create without uniqueness check
            db.run(
                `INSERT INTO billing_customers (name, phone, email, address) VALUES (?, ?, ?, ?)`,
                [name, null, email || '', address || ''],
                function (err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, name, phone: null, email, address, total_bills: 0 });
                }
            );
        }
    });
});

ipcMain.handle('create-bill', async (_event, billData) => {
    return new Promise((resolve, reject) => {
        const { customer_id, billed_by, items, subtotal, discount_total, grand_total } = billData;

        // Generate invoice number: YYYYMMDD-XXXX-NNN
        const now = new Date();
        const dateStr = now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0');

        // Get the phone last 4 digits from customer
        db.get(`SELECT phone FROM billing_customers WHERE id = ?`, [customer_id], (err, custRow: any) => {
            if (err) return reject(err);
            const phoneLast4 = custRow?.phone ? custRow.phone.slice(-4) : '0000';

            // Get today's serial count
            db.get(
                `SELECT COUNT(*) as count FROM bills WHERE invoice_number LIKE ?`,
                [`${dateStr}%`],
                (err, countRow: any) => {
                    if (err) return reject(err);
                    const serial = String((countRow?.count || 0) + 1).padStart(3, '0');
                    const invoiceNumber = `${dateStr}-${phoneLast4}-${serial}`;

                    const stmt = db.prepare(
                        `INSERT INTO bills (invoice_number, customer_id, billed_by, subtotal, discount_total, grand_total)
                         VALUES (?, ?, ?, ?, ?, ?)`
                    );
                    stmt.run(
                        [invoiceNumber, customer_id, billed_by || 'Admin', subtotal, discount_total, grand_total],
                        function (err) {
                            if (err) return reject(err);
                            const billId = this.lastID;

                            // Insert bill items
                            const itemStmt = db.prepare(
                                `INSERT INTO bill_items (bill_id, product_id, product_name, sku, quantity, mrp, discount_pct, discount_amt, price)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                            );
                            let completed = 0;
                            const totalItems = items.length;

                            if (totalItems === 0) {
                                // Update customer total_bills
                                db.run(`UPDATE billing_customers SET total_bills = total_bills + 1 WHERE id = ?`, [customer_id]);
                                return resolve({ success: true, id: billId, invoice_number: invoiceNumber });
                            }

                            items.forEach((item: any) => {
                                itemStmt.run(
                                    [billId, item.product_id, item.product_name, item.sku || '', item.quantity, item.mrp, item.discount_pct || 0, item.discount_amt || 0, item.price],
                                    (err: any) => {
                                        if (err) console.error('Failed to insert bill item:', err);

                                        // Decrement stock in SQLite
                                        if (item.product_id && item.quantity) {
                                            db.run(
                                                `UPDATE products SET quantity = MAX(quantity - ?, 0) WHERE id = ?`,
                                                [item.quantity, item.product_id]
                                            );
                                            // Fire-and-forget sync stock to MySQL
                                            syncStockToMySQL(item.product_id, item.quantity);
                                        }

                                        completed++;
                                        if (completed === totalItems) {
                                            itemStmt.finalize();
                                            // Update customer total_bills
                                            db.run(`UPDATE billing_customers SET total_bills = total_bills + 1 WHERE id = ?`, [customer_id]);
                                            resolve({ success: true, id: billId, invoice_number: invoiceNumber });
                                        }
                                    }
                                );
                            });
                        }
                    );
                    stmt.finalize();
                }
            );
        });
    });
});

ipcMain.handle('get-bills', async () => {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT b.*, bc.name as customer_name, bc.phone as customer_phone
             FROM bills b
             LEFT JOIN billing_customers bc ON b.customer_id = bc.id
             ORDER BY b.created_at DESC`,
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
});

ipcMain.handle('get-bill-details', async (_event, billId: number) => {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT b.*, bc.name as customer_name, bc.phone as customer_phone, bc.email as customer_email, bc.address as customer_address
             FROM bills b
             LEFT JOIN billing_customers bc ON b.customer_id = bc.id
             WHERE b.id = ?`,
            [billId],
            (err, bill: any) => {
                if (err) return reject(err);
                if (!bill) return resolve(null);

                db.all(
                    `SELECT bi.*, p.image_path FROM bill_items bi LEFT JOIN products p ON bi.product_id = p.id WHERE bi.bill_id = ?`,
                    [billId],
                    (err, items) => {
                        if (err) return reject(err);
                        resolve({ ...bill, items: items || [] });
                    }
                );
            }
        );
    });
});

// ═══════════════════════════════════════════════
//  CHANGE PASSWORD — IPC Handler
// ═══════════════════════════════════════════════

ipcMain.handle('change-password', async (_event, data: { id: number; currentPassword: string; newPassword: string }) => {
    // SECURITY: Validate inputs
    const id = Number(data?.id);
    const currentPassword = typeof data?.currentPassword === 'string' ? data.currentPassword : '';
    const newPassword = typeof data?.newPassword === 'string' ? data.newPassword : '';
    if (!id || !currentPassword || newPassword.length < 6) {
        return { success: false, error: 'New password must be at least 6 characters' };
    }
    try {
        const row: any = await new Promise((res, rej) =>
            db.get('SELECT id, password_hash FROM users WHERE id = ?', [id], (err: any, r: any) => err ? rej(err) : res(r))
        );
        if (!row) return { success: false, error: 'User not found' };

        // SECURITY: Compare using bcrypt (supports legacy plaintext too)
        const storedHash = row.password_hash || '';
        let matches = false;
        if (storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
            matches = await bcrypt.compare(currentPassword, storedHash);
        } else {
            matches = storedHash === currentPassword;
        }
        if (!matches) return { success: false, error: 'Incorrect current password' };

        const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await new Promise<void>((res, rej) =>
            db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, id], (err: any) => err ? rej(err) : res())
        );
        return { success: true };
    } catch (e: any) {
        return { success: false, error: 'Failed to change password' };
    }
});

// ═══════════════════════════════════════════════
//  UPDATE BILL (ALTER BILL) — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('update-bill', async (_event, billData: any) => {
    return new Promise(async (resolve, reject) => {
        const { bill_id, items, subtotal, discount_total, grand_total, changed_by } = billData;

        try {
            // 1. Fetch old bill data for audit
            const oldBill: any = await new Promise((res, rej) => {
                db.get(`SELECT * FROM bills WHERE id = ?`, [bill_id], (err, row) => {
                    if (err) rej(err); else res(row);
                });
            });
            if (!oldBill) return resolve({ success: false, error: 'Bill not found' });

            const oldItems: any[] = await new Promise((res, rej) => {
                db.all(`SELECT * FROM bill_items WHERE bill_id = ?`, [bill_id], (err, rows) => {
                    if (err) rej(err); else res(rows || []);
                });
            });

            // 2. Record audit for totals changes
            const auditStmt = db.prepare(
                `INSERT INTO bill_audit (bill_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)`
            );

            if (Math.abs(oldBill.subtotal - subtotal) > 0.01) {
                auditStmt.run([bill_id, 'subtotal', String(oldBill.subtotal), String(subtotal), changed_by]);
            }
            if (Math.abs(oldBill.discount_total - discount_total) > 0.01) {
                auditStmt.run([bill_id, 'discount_total', String(oldBill.discount_total), String(discount_total), changed_by]);
            }
            if (Math.abs(oldBill.grand_total - grand_total) > 0.01) {
                auditStmt.run([bill_id, 'grand_total', String(oldBill.grand_total), String(grand_total), changed_by]);
            }

            // 3. Record audit for item changes
            const oldItemMap = new Map(oldItems.map((i: any) => [i.product_id, i]));
            for (const newItem of items) {
                const oldItem = oldItemMap.get(newItem.product_id);
                if (oldItem) {
                    if (oldItem.quantity !== newItem.quantity) {
                        auditStmt.run([bill_id, `item_qty:${newItem.product_name}`, String(oldItem.quantity), String(newItem.quantity), changed_by]);
                    }
                    if (Math.abs(oldItem.discount_pct - (newItem.discount_pct || 0)) > 0.01) {
                        auditStmt.run([bill_id, `item_discount:${newItem.product_name}`, String(oldItem.discount_pct), String(newItem.discount_pct || 0), changed_by]);
                    }
                } else {
                    auditStmt.run([bill_id, `item_added:${newItem.product_name}`, '', String(newItem.quantity), changed_by]);
                }
            }
            // Check for removed items
            for (const oldItem of oldItems) {
                if (!items.find((i: any) => i.product_id === oldItem.product_id)) {
                    auditStmt.run([bill_id, `item_removed:${oldItem.product_name}`, String(oldItem.quantity), '0', changed_by]);
                }
            }
            auditStmt.finalize();

            // 4. Restore old stock and deduct new stock
            for (const oldItem of oldItems) {
                await new Promise<void>((res) => {
                    db.run(`UPDATE products SET quantity = quantity + ? WHERE id = ?`, [oldItem.quantity, oldItem.product_id], () => res());
                });
            }

            // 5. Update bill totals
            await new Promise<void>((res, rej) => {
                db.run(
                    `UPDATE bills SET subtotal = ?, discount_total = ?, grand_total = ? WHERE id = ?`,
                    [subtotal, discount_total, grand_total, bill_id],
                    (err) => { if (err) rej(err); else res(); }
                );
            });

            // 6. Delete old items and insert new
            await new Promise<void>((res, rej) => {
                db.run(`DELETE FROM bill_items WHERE bill_id = ?`, [bill_id], (err) => { if (err) rej(err); else res(); });
            });

            const itemStmt = db.prepare(
                `INSERT INTO bill_items (bill_id, product_id, product_name, sku, quantity, mrp, discount_pct, discount_amt, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            for (const item of items) {
                await new Promise<void>((res) => {
                    itemStmt.run([bill_id, item.product_id, item.product_name, item.sku || '', item.quantity, item.mrp, item.discount_pct || 0, item.discount_amt || 0, item.price], () => res());
                });
                // Deduct new stock
                await new Promise<void>((res) => {
                    db.run(`UPDATE products SET quantity = MAX(quantity - ?, 0) WHERE id = ?`, [item.quantity, item.product_id], () => res());
                });
            }
            itemStmt.finalize();

            resolve({ success: true });
        } catch (e) {
            reject(e);
        }
    });
});

ipcMain.handle('get-bill-audit', async (_event, billId: number) => {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT * FROM bill_audit WHERE bill_id = ? ORDER BY changed_at DESC`,
            [billId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
});

// ═══════════════════════════════════════════════
//  PURCHASE BILLS — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('get-purchase-bills', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT pb.*, l.name as supplier_name
                FROM purchase_bills pb
                LEFT JOIN ledgers l ON pb.supplier_ledger_id = l.id
                ORDER BY pb.bill_date DESC, pb.id DESC`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('create-purchase-bill', async (_event, bill) => {
    return new Promise((resolve, reject) => {
        const { billNumber, billDate, dueDate, supplierLedgerId, narration, items } = bill;

        let subtotal = 0;
        let taxTotal = 0;
        (items || []).forEach((item: any) => {
            const lineAmount = (Number(item.qty) || 0) * (Number(item.rate) || 0);
            const lineTax = lineAmount * ((Number(item.taxRate) || 0) / 100);
            subtotal += lineAmount;
            taxTotal += lineTax;
        });
        const grandTotal = subtotal + taxTotal;

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            db.run(`INSERT INTO purchase_bills (bill_number, bill_date, due_date, supplier_ledger_id, narration, subtotal, tax_total, grand_total, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [billNumber, billDate, dueDate || '', supplierLedgerId || null, narration || '', subtotal, taxTotal, grandTotal],
                function (err) {
                    if (err) {
                        db.run("ROLLBACK");
                        return reject(err);
                    }
                    const billId = this.lastID;

                    let idx = 0;
                    const insertNext = () => {
                        if (idx >= (items || []).length) {
                            db.run("COMMIT", (err) => {
                                if (err) reject(err);
                                else resolve({ success: true, id: billId });
                            });
                            return;
                        }
                        const item = items[idx];
                        const lineAmount = (Number(item.qty) || 0) * (Number(item.rate) || 0);
                        const lineTax = lineAmount * ((Number(item.taxRate) || 0) / 100);
                        db.run(`INSERT INTO purchase_bill_items (bill_id, product_id, description, qty, rate, tax_rate, tax_amount, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                            [billId, item.productId || null, item.description || '', item.qty || 0, item.rate || 0, item.taxRate || 0, lineTax, lineAmount + lineTax],
                            (err) => {
                                if (err) {
                                    db.run("ROLLBACK");
                                    return reject(err);
                                }
                                idx++;
                                insertNext();
                            });
                    };
                    insertNext();
                });
        });
    });
});

ipcMain.handle('delete-purchase-bill', async (_event, id: number) => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("DELETE FROM purchase_bill_items WHERE bill_id = ?", [id]);
            db.run("DELETE FROM purchase_bills WHERE id = ?", [id], function (err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            });
        });
    });
});

// ═══════════════════════════════════════════════
//  USERS — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('get-users', async () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT id, username, full_name, role, email, phone, is_active, created_at FROM users ORDER BY created_at DESC", (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('create-user', async (_event, user) => {
    // SECURITY: Hash the password before storing
    const { username, password, fullName, role, email, phone } = user;
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
        return { success: false, error: 'Username is required' };
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters' };
    }
    try {
        const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        return new Promise((resolve, reject) => {
            const stmt = db.prepare("INSERT INTO users (username, password_hash, full_name, role, email, phone) VALUES (?, ?, ?, ?, ?, ?)");
            stmt.run([username.trim(), hash, fullName || '', role || 'operator', email || '', phone || ''], function (err: any) {
                if (err) {
                    if (err.message?.includes('UNIQUE')) resolve({ success: false, error: 'Username already exists' });
                    else reject(err);
                } else resolve({ success: true, id: this.lastID });
            });
            stmt.finalize();
        });
    } catch (e: any) {
        return { success: false, error: 'Failed to create user' };
    }
});

ipcMain.handle('update-user', async (_event, user) => {
    return new Promise((resolve, reject) => {
        const { id, fullName, role, email, phone, isActive } = user;
        db.run("UPDATE users SET full_name = ?, role = ?, email = ?, phone = ?, is_active = ? WHERE id = ?",
            [fullName, role, email || '', phone || '', isActive !== undefined ? isActive : 1, id],
            function (err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            });
    });
});

ipcMain.handle('delete-user', async (_event, id: number) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
            if (err) reject(err);
            else resolve({ success: true, changes: this.changes });
        });
    });
});

ipcMain.handle('authenticate-user', async (_event, credentials) => {
    // SECURITY: Input validation
    const username = typeof credentials?.username === 'string' ? credentials.username.trim() : '';
    const password = typeof credentials?.password === 'string' ? credentials.password : '';
    if (!username || !password) return { success: false, error: 'Invalid credentials' };

    // SECURITY: Brute-force lockout check
    const bruteCheck = checkBruteForce(username);
    if (bruteCheck.locked) {
        return { success: false, error: `Too many failed attempts. Try again in ${bruteCheck.remaining} minute(s).` };
    }

    return new Promise((resolve, reject) => {
        db.get(
            "SELECT id, username, password_hash, full_name, role, email, is_active FROM users WHERE username = ? AND is_active = 1",
            [username],
            async (err: any, row: any) => {
                if (err) return reject(err);
                if (!row) {
                    recordFailedLogin(username);
                    // SECURITY: constant-time response to prevent user enumeration
                    await bcrypt.hash('dummy', BCRYPT_ROUNDS).catch(() => { });
                    return resolve({ success: false, error: 'Invalid credentials or account disabled' });
                }

                // SECURITY: Support both old plaintext passwords (migration) and new bcrypt hashes
                let passwordValid = false;
                const storedHash = row.password_hash || '';
                if (storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
                    // Bcrypt hash — compare properly
                    passwordValid = await bcrypt.compare(password, storedHash);
                } else {
                    // Legacy plaintext — compare then auto-migrate immediately
                    passwordValid = (storedHash === password);
                    if (passwordValid) {
                        const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
                        db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, row.id]);
                        console.log(`[SECURITY] Migrated plaintext password→bcrypt for user: ${username}`);
                    }
                }

                if (!passwordValid) {
                    recordFailedLogin(username);
                    return resolve({ success: false, error: 'Invalid credentials or account disabled' });
                }

                resetLoginAttempts(username);
                // SECURITY: Never return the password hash to the renderer
                const { password_hash: _omit, ...safeUser } = row;
                resolve({ success: true, user: safeUser });
            }
        );
    });
});

// ═══════════════════════════════════════════════
//  SETTINGS — IPC Handlers (using companies table)
// ═══════════════════════════════════════════════

ipcMain.handle('get-settings', async () => {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM companies WHERE id = 1", (err, row) => {
            if (err) reject(err);
            else resolve(row || {});
        });
    });
});

ipcMain.handle('update-settings', async (_event, settings) => {
    return new Promise((resolve, reject) => {
        const { name, mailingName, address, country, state, phone, email, financialYearFrom, booksBeginFrom, currencySymbol } = settings;
        db.run(`UPDATE companies SET name = ?, mailing_name = ?, address = ?, country = ?, state = ?, phone = ?, email = ?, financial_year_from = ?, books_begin_from = ?, base_currency_symbol = ? WHERE id = 1`,
            [name, mailingName || '', address || '', country || 'Bangladesh', state || '', phone || '', email || '', financialYearFrom || '', booksBeginFrom || '', currencySymbol || '৳'],
            function (err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            });
    });
});

// ═══════════════════════════════════════════════
//  USER GROUPS — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('get-user-groups', async () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM user_groups ORDER BY id", (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('create-user-group', async (_event, group) => {
    return new Promise((resolve, reject) => {
        const { name, description, permissions } = group;
        const stmt = db.prepare("INSERT INTO user_groups (name, description, permissions) VALUES (?, ?, ?)");
        stmt.run([name, description || '', JSON.stringify(permissions || {})], function (err) {
            if (err) reject(err);
            else resolve({ success: true, id: this.lastID });
        });
        stmt.finalize();
    });
});

ipcMain.handle('update-user-group', async (_event, group) => {
    return new Promise((resolve, reject) => {
        const { id, name, description, permissions } = group;
        db.run("UPDATE user_groups SET name = ?, description = ?, permissions = ? WHERE id = ?",
            [name, description || '', JSON.stringify(permissions || {}), id],
            function (err) {
                if (err) reject(err);
                else resolve({ success: true, changes: this.changes });
            });
    });
});

ipcMain.handle('delete-user-group', async (_event, id: number) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM user_groups WHERE id = ?", [id], function (err) {
            if (err) reject(err);
            else resolve({ success: true, changes: this.changes });
        });
    });
});

// ═══════════════════════════════════════════════
//  NOTIFICATIONS — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('get-notifications', async (_event, userId: number) => {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT n.*, u.full_name as sender_name 
             FROM notifications n 
             LEFT JOIN users u ON n.sender_id = u.id
             WHERE n.recipient_id = ? OR n.recipient_id IS NULL
             ORDER BY n.created_at DESC
             LIMIT 100`,
            [userId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
});

ipcMain.handle('send-notification', async (_event, notification: any) => {
    const { title, message, senderId, recipientIds } = notification;
    return new Promise((resolve, reject) => {
        if (!recipientIds || recipientIds.length === 0) {
            // Broadcast to all
            const stmt = db.prepare("INSERT INTO notifications (title, message, sender_id, recipient_id) VALUES (?, ?, ?, NULL)");
            stmt.run([title, message, senderId], function (err) {
                if (err) reject(err);
                else resolve({ success: true, id: this.lastID });
            });
            stmt.finalize();
        } else {
            // Send to each selected user
            const stmt = db.prepare("INSERT INTO notifications (title, message, sender_id, recipient_id) VALUES (?, ?, ?, ?)");
            let lastId = 0;
            let count = 0;
            for (const rid of recipientIds) {
                stmt.run([title, message, senderId, rid], function (err) {
                    if (err) { reject(err); return; }
                    lastId = this.lastID;
                    count++;
                    if (count === recipientIds.length) {
                        resolve({ success: true, count });
                    }
                });
            }
            stmt.finalize();
        }
    });
});

ipcMain.handle('mark-notification-read', async (_event, id: number) => {
    return new Promise((resolve, reject) => {
        db.run("UPDATE notifications SET is_read = 1 WHERE id = ?", [id], function (err) {
            if (err) reject(err);
            else resolve({ success: true });
        });
    });
});

ipcMain.handle('mark-all-notifications-read', async (_event, userId: number) => {
    return new Promise((resolve, reject) => {
        db.run("UPDATE notifications SET is_read = 1 WHERE (recipient_id = ? OR recipient_id IS NULL) AND is_read = 0", [userId], function (err) {
            if (err) reject(err);
            else resolve({ success: true, changes: this.changes });
        });
    });
});

ipcMain.handle('delete-notification', async (_event, id: number) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM notifications WHERE id = ?", [id], function (err) {
            if (err) reject(err);
            else resolve({ success: true });
        });
    });
});

// ═══════════════════════════════════════════════
//  IMAGE PICKER — IPC Handler
// ═══════════════════════════════════════════════

ipcMain.handle('pick-image', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

// ═══════════════════════════════════════════════
//  WEBSITE (MySQL) — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('website-get-products', async () => {
    if (!mysqlPool) return [];
    try {
        const [rows] = await mysqlPool.query(`SELECT p.*, GROUP_CONCAT(pc.category_name) as categories
            FROM products p LEFT JOIN product_categories pc ON p.id = pc.product_id
            GROUP BY p.id ORDER BY p.created_at DESC`);
        return rows;
    } catch (e: any) { console.error('website-get-products error:', e.message); return []; }
});

ipcMain.handle('website-get-orders', async () => {
    if (!mysqlPool) return [];
    try {
        const [rows] = await mysqlPool.query(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 100`);
        // Fetch items for each order to show details
        for (let order of rows as any[]) {
            const [items] = await mysqlPool.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
            order.items = items;
        }
        return rows;
    } catch (e: any) { console.error('website-get-orders error:', e.message); return []; }
});

ipcMain.handle('website-update-order', async (_event, order) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try {
        await mysqlPool.query('UPDATE orders SET status = ?, payment_status = ? WHERE id = ?',
            [order.status, order.paymentStatus, order.id]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('website-get-categories', async () => {
    if (!mysqlPool) return [];
    try {
        const [rows] = await mysqlPool.query('SELECT * FROM categories ORDER BY sort_order, name');
        return rows;
    } catch (e: any) { console.error('website-get-categories error:', e.message); return []; }
});

ipcMain.handle('website-get-dashboard-data', async () => {
    if (!mysqlPool) return { stats: {}, trending: [], logs: [] };
    const stats: any = {};
    try {
        // Month Stats
        const [monthData] = await mysqlPool.query(`
            SELECT COUNT(*) as count, SUM(total) as revenue 
            FROM orders 
            WHERE MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())
        `);
        // @ts-ignore
        stats.totalOrdersMonth = monthData[0]?.count || 0;
        // @ts-ignore
        stats.revenueMonth = monthData[0]?.revenue || 0;

        // Total Visits (Mock for now or fetch if table exists)
        stats.totalVisitsMonth = 3420;

        // Trending Products
        const [trending] = await mysqlPool.query(`
            SELECT p.id, p.name, SUM(oi.quantity) as sales 
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY oi.product_id
            ORDER BY sales DESC
            LIMIT 5
        `);

        // Pending Orders Count
        const [[pendRow]] = await mysqlPool.query('SELECT COUNT(*) as count FROM orders WHERE status = "Pending"');
        // @ts-ignore
        stats.pendingOrders = pendRow?.count || 0;

        // Audit Logs
        const [logs] = await mysqlPool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 20');

        return { stats, trending, logs };
    } catch (e: any) {
        console.error('website-get-dashboard-data error:', e.message);
        return { stats: {}, trending: [], logs: [] };
    }
});

// --- CATEGORIES ---
ipcMain.handle('website-create-category', async (_event, cat) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try {
        await mysqlPool.query('INSERT INTO categories (id, name, slug, image, parent_id, is_featured, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [cat.id, cat.name, cat.slug, cat.image, cat.parentId, cat.isFeatured, cat.sortOrder]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('website-update-category', async (_event, cat) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try {
        await mysqlPool.query('UPDATE categories SET name=?, slug=?, image=?, parent_id=?, is_featured=?, sort_order=? WHERE id=?',
            [cat.name, cat.slug, cat.image, cat.parentId, cat.isFeatured, cat.sortOrder, cat.id]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('website-delete-category', async (_event, id) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try {
        await mysqlPool.query('DELETE FROM categories WHERE id = ?', [id]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

// --- PROJECTS ---
ipcMain.handle('website-get-projects', async () => {
    if (!mysqlPool) return [];
    try {
        const [rows] = await mysqlPool.query('SELECT * FROM projects');
        return rows.map((r: any) => ({ ...r, images: JSON.parse(r.images || '[]') }));
    } catch (e: any) { console.error('website-get-projects error:', e.message); return []; }
});

ipcMain.handle('website-create-project', async (_event, p) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try {
        await mysqlPool.query('INSERT INTO projects (id, title, description, cover_image, client, completion_date, images) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [p.id, p.title, p.description, p.coverImage, p.client, p.date, JSON.stringify(p.images)]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('website-update-project', async (_event, p) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try {
        await mysqlPool.query('UPDATE projects SET title=?, description=?, cover_image=?, client=?, completion_date=?, images=? WHERE id=?',
            [p.title, p.description, p.coverImage, p.client, p.date, JSON.stringify(p.images), p.id]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('website-delete-project', async (_event, id) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try {
        await mysqlPool.query('DELETE FROM projects WHERE id = ?', [id]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

// --- PAGES ---
ipcMain.handle('website-get-pages', async () => {
    if (!mysqlPool) return [];
    try {
        const [rows] = await mysqlPool.query('SELECT * FROM custom_pages');
        return rows.map((r: any) => ({ ...r, content: JSON.parse(r.content_json || '[]') }));
    } catch (e: any) { console.error('website-get-pages error:', e.message); return []; }
});

ipcMain.handle('website-create-page', async (_event, p) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try {
        await mysqlPool.query('INSERT INTO custom_pages (id, slug, title, content_json) VALUES (?, ?, ?, ?)',
            [p.id, p.slug, p.title, JSON.stringify(p.content)]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('website-update-page', async (_event, p) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try {
        await mysqlPool.query('UPDATE custom_pages SET slug=?, title=?, content_json=? WHERE id=?',
            [p.slug, p.title, JSON.stringify(p.content), p.id]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('website-delete-page', async (_event, id) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try {
        await mysqlPool.query('DELETE FROM custom_pages WHERE id = ?', [id]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

// --- MEDIA ---
ipcMain.handle('website-get-media', async () => {
    if (!mysqlPool) return [];
    try {
        const [rows] = await mysqlPool.query('SELECT * FROM media_library ORDER BY upload_date DESC');
        return rows;
    } catch (e: any) { console.error('website-get-media error:', e.message); return []; }
});

// --- SHIPPING ---
ipcMain.handle('website-get-shipping-areas', async () => {
    if (!mysqlPool) return [];
    try { return (await mysqlPool.query('SELECT * FROM shipping_areas'))[0]; } catch (e) { return []; }
});

ipcMain.handle('website-create-shipping-area', async (_event, a) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try { await mysqlPool.query('INSERT INTO shipping_areas (id, name) VALUES (?, ?)', [a.id, a.name]); return { success: true }; } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('website-delete-shipping-area', async (_event, id) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try { await mysqlPool.query('DELETE FROM shipping_areas WHERE id = ?', [id]); return { success: true }; } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('website-get-shipping-methods', async () => {
    if (!mysqlPool) return [];
    try {
        const [rows] = await mysqlPool.query('SELECT * FROM shipping_methods');
        return rows.map((r: any) => ({
            ...r,
            areaIds: JSON.parse(r.area_ids || '[]'),
            weightRates: JSON.parse(r.weight_rates || '[]'),
            isGlobal: Boolean(r.is_global),
            flatRate: r.flat_rate
        }));
    } catch (e) { return []; }
});

ipcMain.handle('website-create-shipping-method', async (_event, m) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try {
        await mysqlPool.query('INSERT INTO shipping_methods (id, name, type, flat_rate, is_global, area_ids, weight_rates) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [m.id, m.name, m.type, m.flatRate, m.isGlobal, JSON.stringify(m.areaIds), JSON.stringify(m.weightRates)]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('website-update-shipping-method', async (_event, m) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try {
        await mysqlPool.query('UPDATE shipping_methods SET name=?, type=?, flat_rate=?, is_global=?, area_ids=?, weight_rates=? WHERE id=?',
            [m.name, m.type, m.flatRate, m.isGlobal, JSON.stringify(m.areaIds), JSON.stringify(m.weightRates), m.id]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('website-delete-shipping-method', async (_event, id) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try { await mysqlPool.query('DELETE FROM shipping_methods WHERE id = ?', [id]); return { success: true }; } catch (e: any) { return { success: false, error: e.message }; }
});

// --- NEWSLETTER ---
ipcMain.handle('website-get-newsletters', async () => {
    if (!mysqlPool) return [];
    try { return (await mysqlPool.query('SELECT * FROM newsletter_campaigns ORDER BY sent_date DESC'))[0]; } catch (e) { return []; }
});

// --- CONFIG ---
ipcMain.handle('website-get-config', async () => {
    if (!mysqlPool) return {};
    try {
        const [rows] = await mysqlPool.query('SELECT config_data FROM site_config WHERE id = "default"');
        // @ts-ignore
        return rows[0] ? JSON.parse(rows[0].config_data) : {};
    } catch (e) { return {}; }
});

ipcMain.handle('website-update-config', async (_event, config) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try {
        const [rows] = await mysqlPool.query('SELECT id FROM site_config WHERE id = "default"');
        // @ts-ignore
        if (rows.length > 0) {
            await mysqlPool.query('UPDATE site_config SET config_data = ? WHERE id = "default"', [JSON.stringify(config)]);
        } else {
            await mysqlPool.query('INSERT INTO site_config (id, config_data) VALUES ("default", ?)', [JSON.stringify(config)]);
        }
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

// USERS
ipcMain.handle('website-get-users', async () => {
    if (!mysqlPool) return [];
    try {
        const [rows] = await mysqlPool.query('SELECT id, name, email, phone, address, role FROM users ORDER BY name');
        return rows;
    } catch (e: any) { return []; }
});

// PRODUCTS CRUD
ipcMain.handle('website-create-product', async (_event, product) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    const conn = await mysqlPool.getConnection();
    try {
        await conn.beginTransaction();
        const { id, name, price, salePrice, onSale, description, modelNumber, image, isVisible, categories } = product;

        // Basic Insert
        await conn.query(
            'INSERT INTO products (id, name, price, sale_price, on_sale, description, model_number, image, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, name, price, salePrice, onSale, description, modelNumber, image, isVisible]
        );

        // Categories
        if (categories && categories.length) {
            for (const cat of categories) {
                await conn.query('INSERT INTO product_categories (product_id, category_name) VALUES (?, ?)', [id, cat]);
            }
        }

        await conn.commit();
        return { success: true };
    } catch (e: any) {
        await conn.rollback();
        return { success: false, error: e.message };
    } finally {
        conn.release();
    }
});

ipcMain.handle('website-update-product', async (_event, product) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    const conn = await mysqlPool.getConnection();
    try {
        await conn.beginTransaction();
        const { id, name, price, salePrice, onSale, description, modelNumber, image, isVisible, categories } = product;

        await conn.query(
            'UPDATE products SET name=?, price=?, sale_price=?, on_sale=?, description=?, model_number=?, image=?, is_visible=? WHERE id=?',
            [name, price, salePrice, onSale, description, modelNumber, image, isVisible, id]
        );

        // Update Categories
        await conn.query('DELETE FROM product_categories WHERE product_id = ?', [id]);
        if (categories && categories.length) {
            for (const cat of categories) {
                await conn.query('INSERT INTO product_categories (product_id, category_name) VALUES (?, ?)', [id, cat]);
            }
        }

        await conn.commit();
        return { success: true };
    } catch (e: any) {
        await conn.rollback();
        return { success: false, error: e.message };
    } finally {
        conn.release();
    }
});

ipcMain.handle('website-update-product-status-bulk', async (_event, { ids, isVisible }) => {
    if (!mysqlPool) return { success: false };
    try {
        await mysqlPool.query('UPDATE products SET is_visible = ? WHERE id IN (?)', [isVisible, ids]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('website-delete-products-bulk', async (_event, ids) => {
    if (!mysqlPool) return { success: false };
    try {
        await mysqlPool.query('DELETE FROM products WHERE id IN (?)', [ids]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

// ORDERS
ipcMain.handle('website-create-order', async (_event, order) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    const conn = await mysqlPool.getConnection();
    try {
        await conn.beginTransaction();
        const { id, customerName, customerEmail, customerPhone, shippingAddress, total, items, date } = order;

        await conn.query(
            'INSERT INTO orders (id, customer_name, customer_email, customer_phone, shipping_address, total, status, payment_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, customerName, customerEmail, customerPhone, shippingAddress, total, 'Pending', 'Unpaid', date]
        );

        for (const item of items) {
            await conn.query(
                'INSERT INTO order_items (order_id, product_id, name, price, quantity) VALUES (?, ?, ?, ?, ?)',
                [id, item.id, item.name, item.price, item.quantity]
            );
        }

        await conn.commit();
        return { success: true };
    } catch (e: any) {
        await conn.rollback();
        return { success: false, error: e.message };
    } finally {
        conn.release();
    }
});

ipcMain.handle('website-delete-product', async (_event, id: string) => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected' };
    try {
        await mysqlPool.query('DELETE FROM products WHERE id = ?', [id]);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

// ═══════════════════════════════════════════════
//  REPORTS — IPC Handlers
// ═══════════════════════════════════════════════

// Trial Balance — all ledgers with net Dr/Cr including opening + voucher entries
ipcMain.handle('report-trial-balance', async () => {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                l.id, l.name, g.name as group_name, g.nature,
                l.opening_balance, l.opening_balance_type,
                COALESCE(SUM(CASE WHEN ve.type = 'Dr' THEN ve.amount ELSE 0 END), 0) as total_debit,
                COALESCE(SUM(CASE WHEN ve.type = 'Cr' THEN ve.amount ELSE 0 END), 0) as total_credit
            FROM ledgers l
            LEFT JOIN groups g ON l.group_id = g.id
            LEFT JOIN voucher_entries ve ON ve.ledger_id = l.id
            GROUP BY l.id
            ORDER BY g.nature, l.name
        `, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

// Balance Sheet — Assets vs Liabilities grouped by nature
ipcMain.handle('report-balance-sheet', async () => {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                g.nature, g.name as group_name, l.name as ledger_name,
                l.opening_balance, l.opening_balance_type,
                COALESCE(SUM(CASE WHEN ve.type = 'Dr' THEN ve.amount ELSE 0 END), 0) as total_debit,
                COALESCE(SUM(CASE WHEN ve.type = 'Cr' THEN ve.amount ELSE 0 END), 0) as total_credit
            FROM ledgers l
            JOIN groups g ON l.group_id = g.id
            LEFT JOIN voucher_entries ve ON ve.ledger_id = l.id
            WHERE g.nature IN ('Assets', 'Liabilities')
            GROUP BY l.id
            ORDER BY g.nature DESC, g.name, l.name
        `, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

// Profit & Loss — Income vs Expenses
ipcMain.handle('report-profit-and-loss', async () => {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                g.nature, g.name as group_name, l.name as ledger_name,
                l.opening_balance, l.opening_balance_type,
                COALESCE(SUM(CASE WHEN ve.type = 'Dr' THEN ve.amount ELSE 0 END), 0) as total_debit,
                COALESCE(SUM(CASE WHEN ve.type = 'Cr' THEN ve.amount ELSE 0 END), 0) as total_credit
            FROM ledgers l
            JOIN groups g ON l.group_id = g.id
            LEFT JOIN voucher_entries ve ON ve.ledger_id = l.id
            WHERE g.nature IN ('Income', 'Expenses')
            GROUP BY l.id
            ORDER BY g.nature, g.name, l.name
        `, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

// Stock Summary — products with purchase bill items aggregation
ipcMain.handle('report-stock-summary', async () => {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                p.id, p.name, p.sku, p.category, p.quantity,
                p.purchase_price, p.selling_price, p.image_path,
                COALESCE(SUM(pbi.qty), 0) as purchased_qty,
                COALESCE(SUM(pbi.amount), 0) as purchased_value,
                u.symbol as unit_symbol
            FROM products p
            LEFT JOIN purchase_bill_items pbi ON pbi.product_id = p.id
            LEFT JOIN units u ON p.unit_id = u.id
            GROUP BY p.id
            ORDER BY p.name
        `, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

// Day Book — all vouchers with entries for a date range
ipcMain.handle('report-day-book', async (_event, params) => {
    const { fromDate, toDate } = params || {};
    return new Promise((resolve, reject) => {
        let query = `
            SELECT 
                v.id, v.voucher_type, v.voucher_number, v.date, v.narration, v.total_amount,
                ve.amount as entry_amount, ve.type as entry_type, l.name as ledger_name
            FROM vouchers v
            LEFT JOIN voucher_entries ve ON ve.voucher_id = v.id
            LEFT JOIN ledgers l ON ve.ledger_id = l.id
        `;
        const args: any[] = [];
        if (fromDate && toDate) {
            query += ' WHERE v.date >= ? AND v.date <= ?';
            args.push(fromDate, toDate);
        }
        query += ' ORDER BY v.date DESC, v.id DESC';
        db.all(query, args, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

// ═══════════════════════════════════════════════
//  INTERNAL CHAT — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('get-chat-messages', async (_event, { senderId, receiverId }) => {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM internal_messages 
            WHERE (sender_id = ? AND receiver_id = ?) 
               OR (sender_id = ? AND receiver_id = ?)
            ORDER BY created_at ASC`,
            [senderId, receiverId, receiverId, senderId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
});

ipcMain.handle('send-chat-message', async (_event, message) => {
    return new Promise((resolve, reject) => {
        const { senderId, receiverId, messageType, content, fileName } = message;
        const stmt = db.prepare("INSERT INTO internal_messages (sender_id, receiver_id, message_type, content, file_name) VALUES (?, ?, ?, ?, ?)");
        stmt.run([senderId, receiverId, messageType || 'text', content, fileName || null], function (err) {
            if (err) reject(err);
            else resolve({ success: true, id: this.lastID, created_at: new Date().toISOString() });
        });
        stmt.finalize();
    });
});

ipcMain.handle('pick-chat-file', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'All Files', extensions: ['*'] },
            { name: 'Images', extensions: ['jpg', 'png', 'gif', 'webp'] },
            { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'] }
        ]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return {
        path: result.filePaths[0],
        name: path.basename(result.filePaths[0])
    };
});

// ═══════════════════════════════════════════════
//  PRODUCT SEARCH — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('search-products-detailed', async (_event, query: string) => {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT p.*, u.symbol as unit_symbol, sg.name as group_name
            FROM products p
            LEFT JOIN units u ON p.unit_id = u.id
            LEFT JOIN stock_groups sg ON p.stock_group_id = sg.id
            WHERE p.name LIKE ? OR p.sku LIKE ? OR p.category LIKE ?
            LIMIT 20
        `;
        const q = `%${query}%`;
        db.all(sql, [q, q, q], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
});

// ═══════════════════════════════════════════════
//  USER PRESENCE & TYPING — IPC Handlers
// ═══════════════════════════════════════════════

// Heartbeat — call every 10s from frontend
ipcMain.handle('update-user-presence', async (_event, userId: number) => {
    userPresence.set(userId, Date.now());
    return { success: true };
});

// Return users with their online status (online if heartbeat within 15s)
ipcMain.handle('get-online-users', async () => {
    const now = Date.now();
    const onlineIds: number[] = [];
    userPresence.forEach((timestamp, uid) => {
        if (now - timestamp < 15000) onlineIds.push(uid);
    });
    return onlineIds;
});

// Mark typing status
ipcMain.handle('set-typing-status', async (_event, { senderId, receiverId, isTyping }: { senderId: number; receiverId: number; isTyping: boolean }) => {
    const key = `${senderId}->${receiverId}`;
    if (isTyping) {
        userTyping.set(key, Date.now());
    } else {
        userTyping.delete(key);
    }
    return { success: true };
});

// Check if someone is typing to you (within 3s)
ipcMain.handle('get-typing-status', async (_event, { receiverId }: { receiverId: number }) => {
    const now = Date.now();
    const typingUsers: number[] = [];
    userTyping.forEach((timestamp, key) => {
        const [sender, recv] = key.split('->').map(Number);
        if (recv === receiverId && now - timestamp < 3000) {
            typingUsers.push(sender);
        }
    });
    return typingUsers;
});

// ═══════════════════════════════════════════════
//  WOOCOMMERCE CSV IMPORT
// ═══════════════════════════════════════════════

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                current += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current);
    return result;
}

function stripHTML(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ').trim();
}

ipcMain.handle('import-woocommerce-csv', async (_event, csvFilePath: string) => {
    return new Promise(async (resolve, reject) => {
        try {
            let raw = fs.readFileSync(csvFilePath, 'utf-8');
            // Strip UTF-8 BOM if present
            if (raw.charCodeAt(0) === 0xFEFF) {
                raw = raw.slice(1);
            }

            // Split into lines, handling multiline quoted fields
            const lines: string[] = [];
            let currentLine = '';
            let inQuotes = false;
            for (const ch of raw) {
                if (ch === '"') inQuotes = !inQuotes;
                if ((ch === '\n' || ch === '\r') && !inQuotes) {
                    if (currentLine.trim()) lines.push(currentLine);
                    currentLine = '';
                } else if (ch !== '\r' || inQuotes) {
                    currentLine += ch;
                }
            }
            if (currentLine.trim()) lines.push(currentLine);

            if (lines.length < 2) return resolve({ imported: 0, skipped: 0, errors: ['CSV has no data rows'] });

            // Parse header
            const headers = parseCSVLine(lines[0]);
            const colIndex = (name: string) => headers.indexOf(name);

            const iTitle = colIndex('post_title');
            const iSku = colIndex('sku');
            const iPrice = colIndex('regular_price');
            const iSalePrice = colIndex('sale_price');
            const iStock = colIndex('stock');
            const iStatus = colIndex('post_status');
            const iParent = colIndex('post_parent');
            const iExcerpt = colIndex('post_excerpt');
            const iImages = colIndex('images');
            const iCategory = colIndex('tax:product_cat');
            const iType = colIndex('tax:product_type');

            // Ensure a "Pieces" unit exists
            const unitId: number = await new Promise((res, rej) => {
                db.get("SELECT id FROM units WHERE symbol = 'pcs' OR name = 'Pieces'", (err, row: any) => {
                    if (err) return rej(err);
                    if (row) return res(row.id);
                    db.run("INSERT INTO units (name, symbol, precision, company_id) VALUES ('Pieces', 'pcs', 0, 1)", function (err) {
                        if (err) return rej(err);
                        res(this.lastID);
                    });
                });
            });

            // Collect unique categories and create stock_groups
            const categoryMap: Map<string, number> = new Map();
            // Load existing stock groups
            const existingGroups: any[] = await new Promise((res, rej) => {
                db.all("SELECT id, name FROM stock_groups", (err, rows) => {
                    if (err) return rej(err);
                    res(rows || []);
                });
            });
            existingGroups.forEach((g: any) => categoryMap.set(g.name.toLowerCase(), g.id));

            // First pass: collect all categories
            const allCategories = new Set<string>();
            for (let i = 1; i < lines.length; i++) {
                const fields = parseCSVLine(lines[i]);
                if (iCategory >= 0 && fields[iCategory]) {
                    const cats = fields[iCategory].split('|').map(c => c.trim()).filter(Boolean);
                    cats.forEach(c => {
                        // Handle hierarchical categories like "Lighting > Chandelier"
                        const parts = c.split('>').map(p => p.trim());
                        parts.forEach(p => { if (p) allCategories.add(p); });
                    });
                }
            }

            // Create missing stock groups
            for (const cat of allCategories) {
                if (!categoryMap.has(cat.toLowerCase())) {
                    const groupId: number = await new Promise((res, rej) => {
                        db.run("INSERT INTO stock_groups (name, company_id) VALUES (?, 1)", [cat], function (err) {
                            if (err) return rej(err);
                            res(this.lastID);
                        });
                    });
                    categoryMap.set(cat.toLowerCase(), groupId);
                }
            }

            // Import products
            let imported = 0;
            let skipped = 0;
            const errors: string[] = [];

            const stmt = db.prepare(`INSERT INTO products (name, sku, category, purchase_price, selling_price, tax_rate, description, unit_id, stock_group_id, company_id, image_path, quantity) VALUES (?, ?, ?, 0, ?, 0, ?, ?, ?, 1, ?, ?)`);

            for (let i = 1; i < lines.length; i++) {
                try {
                    const fields = parseCSVLine(lines[i]);

                    const title = fields[iTitle]?.trim();
                    if (!title) { skipped++; continue; }

                    // Skip variations (have post_parent)
                    const parent = fields[iParent]?.trim();
                    if (parent && parent !== '' && parent !== '0') { skipped++; continue; }

                    // Skip certain product types that aren't standalone
                    const pType = iType >= 0 ? fields[iType]?.trim().toLowerCase() : '';
                    if (pType === 'variation') { skipped++; continue; }

                    const sku = fields[iSku]?.trim() || '';
                    const priceStr = fields[iPrice]?.trim() || fields[iSalePrice]?.trim() || '0';
                    const price = parseFloat(priceStr) || 0;
                    const stockStr = fields[iStock]?.trim() || '0';
                    const stock = parseInt(stockStr) || 0;
                    const excerpt = iExcerpt >= 0 ? stripHTML(fields[iExcerpt] || '') : '';
                    const description = excerpt.substring(0, 500); // Limit description length

                    // Extract first image URL
                    let imagePath = '';
                    if (iImages >= 0 && fields[iImages]) {
                        const imgField = fields[iImages].trim();
                        // Format: URL ! alt : ... ! title : ... | URL2 ...
                        const firstImg = imgField.split('|')[0].trim();
                        imagePath = firstImg.split('!')[0].trim();
                    }

                    // Category
                    const categoryRaw = iCategory >= 0 ? (fields[iCategory]?.trim() || '') : '';
                    const category = categoryRaw.replace(/\|/g, ', ');

                    // Stock group from first category
                    let stockGroupId: number | null = null;
                    if (categoryRaw) {
                        const firstCat = categoryRaw.split('|')[0].split('>').map(s => s.trim()).filter(Boolean);
                        const primary = firstCat[firstCat.length - 1]; // Use most specific
                        if (primary && categoryMap.has(primary.toLowerCase())) {
                            stockGroupId = categoryMap.get(primary.toLowerCase()) || null;
                        }
                    }

                    await new Promise<void>((res, rej) => {
                        stmt.run([title, sku, category, price, description, unitId, stockGroupId, imagePath, stock], (err: any) => {
                            if (err) { errors.push(`Row ${i}: ${err.message}`); skipped++; rej(err); }
                            else { imported++; res(); }
                        });
                    }).catch(() => { }); // Catch to continue on error
                } catch (rowErr: any) {
                    errors.push(`Row ${i}: ${rowErr.message}`);
                    skipped++;
                }
            }

            stmt.finalize();

            console.log(`WooCommerce Import Complete: ${imported} imported, ${skipped} skipped, ${errors.length} errors`);
            resolve({ imported, skipped, errors: errors.slice(0, 20) }); // Return first 20 errors max
        } catch (err: any) {
            reject(err);
        }
    });
});

// ═══════════════════════════════════════════════
//  BULK SYNC: Push all local products to MySQL
// ═══════════════════════════════════════════════

ipcMain.handle('sync-products-to-website', async () => {
    if (!mysqlPool) return { success: false, error: 'MySQL not connected', synced: 0, failed: 0 };

    return new Promise((resolve, reject) => {
        db.all(`SELECT id, name, sku, category, selling_price, description, image_path, quantity FROM products`, async (err, rows: any[]) => {
            if (err) return reject(err);
            if (!rows || rows.length === 0) return resolve({ success: true, synced: 0, failed: 0 });

            let synced = 0;
            let failed = 0;

            for (const row of rows) {
                try {
                    await syncProductToMySQL({
                        localId: row.id,
                        name: row.name,
                        sku: row.sku || '',
                        category: row.category || '',
                        sellingPrice: row.selling_price || 0,
                        description: row.description || '',
                        imagePath: row.image_path || '',
                        quantity: row.quantity || 0
                    });
                    synced++;
                } catch (e) {
                    failed++;
                }
            }

            console.log(`Bulk Sync Complete: ${synced} synced, ${failed} failed out of ${rows.length}`);
            resolve({ success: true, synced, failed, total: rows.length });
        });
    });
});

// ═══════════════════════════════════════════════
//  AUTO-UPDATE — IPC Handlers
// ═══════════════════════════════════════════════

let autoUpdater: any = null;
try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info: any) => {
        BrowserWindow.getAllWindows().forEach(w =>
            w.webContents.send('update-status', { status: 'available', info })
        );
    });
    autoUpdater.on('update-not-available', () => {
        BrowserWindow.getAllWindows().forEach(w =>
            w.webContents.send('update-status', { status: 'up-to-date' })
        );
    });
    autoUpdater.on('download-progress', (progress: any) => {
        BrowserWindow.getAllWindows().forEach(w =>
            w.webContents.send('update-status', { status: 'downloading', progress })
        );
    });
    autoUpdater.on('update-downloaded', () => {
        BrowserWindow.getAllWindows().forEach(w =>
            w.webContents.send('update-status', { status: 'ready' })
        );
    });
    autoUpdater.on('error', (err: any) => {
        BrowserWindow.getAllWindows().forEach(w =>
            w.webContents.send('update-status', { status: 'error', error: err?.message || 'Update failed' })
        );
    });
} catch (e) {
    console.warn('electron-updater not available — auto-update disabled');
}

// SECURITY: Auto-check for updates 10 seconds after app starts
app.whenReady().then(() => {
    setTimeout(() => {
        if (autoUpdater) {
            try {
                console.log('[AUTO-UPDATE] Checking for updates on startup...');
                autoUpdater.checkForUpdates();
            } catch (e) {
                console.warn('[AUTO-UPDATE] Startup check failed:', e);
            }
        }
    }, 10_000); // 10 seconds delay
});

ipcMain.handle('check-for-update', async () => {
    if (!autoUpdater) return { status: 'unavailable', message: 'Auto-updater not configured' };
    try {
        await autoUpdater.checkForUpdates();
        return { status: 'checking' };
    } catch (e: any) {
        return { status: 'error', message: e.message };
    }
});

ipcMain.handle('download-update', async () => {
    if (!autoUpdater) return { status: 'unavailable' };
    try {
        await autoUpdater.downloadUpdate();
        return { status: 'downloading' };
    } catch (e: any) {
        return { status: 'error', message: e.message };
    }
});

ipcMain.handle('install-update', async () => {
    if (!autoUpdater) return { status: 'unavailable' };
    autoUpdater.quitAndInstall();
    return { status: 'installing' };
});

ipcMain.handle('get-app-version', async () => {
    return app.getVersion();
});

// ═══════════════════════════════════════════════
//  NETWORK SETUP — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('get-network-config', async () => {
    return networkConfig.getNetworkConfig();
});

ipcMain.handle('save-network-config', async (_event, config) => {
    networkConfig.saveNetworkConfig(config);
    return { success: true };
});

ipcMain.handle('test-server-connection', async (_event, { address, apiKey, port }) => {
    return testConnection(address, apiKey, port || 3456);
});

ipcMain.handle('get-local-ip', async () => {
    return getLocalIp();
});

ipcMain.handle('restart-app', () => {
    app.relaunch();
    app.exit();
});

// ═══════════════════════════════════════════════
//  MAKE MODULE — Order Management IPC
// ═══════════════════════════════════════════════

ipcMain.handle('get-make-orders', async () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM make_orders ORDER BY created_at DESC", [], (err: Error | null, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
});

ipcMain.handle('create-make-order', async (_event, order) => {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO make_orders (furniture_name, description, quantity, designer_name, status, priority) VALUES (?, ?, ?, ?, 'Placed', ?)`,
            [order.furniture_name, order.description || '', order.quantity || 1, order.designer_name, order.priority || 'Normal'],
            function (this: any, err: Error | null) {
                if (err) reject(err);
                else {
                    const orderId = this.lastID;
                    // Also insert initial status update
                    db.run(
                        `INSERT INTO make_order_updates (order_id, status, note, updated_by) VALUES (?, 'Placed', 'Order placed', ?)`,
                        [orderId, order.designer_name]
                    );
                    resolve({ id: orderId });
                }
            }
        );
    });
});

ipcMain.handle('update-make-order-status', async (_event, { orderId, status, note, updatedBy }) => {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE make_orders SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
            [status, orderId],
            function (err: Error | null) {
                if (err) reject(err);
                else {
                    db.run(
                        `INSERT INTO make_order_updates (order_id, status, note, updated_by) VALUES (?, ?, ?, ?)`,
                        [orderId, status, note || '', updatedBy]
                    );
                    resolve({ success: true });
                }
            }
        );
    });
});

ipcMain.handle('get-make-order-updates', async (_event, orderId) => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM make_order_updates WHERE order_id = ? ORDER BY created_at ASC", [orderId], (err: Error | null, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
});

ipcMain.handle('delete-make-order', async (_event, id) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM make_order_updates WHERE order_id = ?", [id]);
        db.run("DELETE FROM make_orders WHERE id = ?", [id], function (err: Error | null) {
            if (err) reject(err);
            else resolve({ success: true });
        });
    });
});

ipcMain.handle('get-make-furniture-names', async () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT DISTINCT furniture_name FROM make_orders ORDER BY furniture_name", [], (err: Error | null, rows: any[]) => {
            if (err) reject(err);
            else resolve((rows || []).map((r: any) => r.furniture_name));
        });
    });
});

// ═══════════════════════════════════════════════
//  PRINTING — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('get-printers', async () => {
    try {
        const mainWin = BrowserWindow.getAllWindows()[0];
        if (!mainWin) return [];
        const printers = await mainWin.webContents.getPrintersAsync();
        return printers.map((p: any) => ({
            name: p.name,
            isDefault: p.isDefault || p.status === 0,
        }));
    } catch (e) {
        return [];
    }
});

// ═══════════════════════════════════════════════
//  SYSTEM AUDIT LOG — Helper
// ═══════════════════════════════════════════════

function writeAuditLog(params: {
    module: string;
    action: string;
    entity_type?: string;
    entity_id?: string | number;
    description?: string;
    old_value?: any;
    new_value?: any;
    performed_by: string;
}) {
    db.run(
        `INSERT INTO system_audit_log (module, action, entity_type, entity_id, description, old_value, new_value, performed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            params.module,
            params.action,
            params.entity_type || null,
            params.entity_id != null ? String(params.entity_id) : null,
            params.description || null,
            params.old_value != null ? JSON.stringify(params.old_value) : null,
            params.new_value != null ? JSON.stringify(params.new_value) : null,
            params.performed_by,
        ]
    );
}

ipcMain.handle('get-audit-log', async (_event, { module, limit }: any) => {
    return new Promise((resolve, reject) => {
        const sql = module
            ? `SELECT * FROM system_audit_log WHERE module = ? ORDER BY performed_at DESC LIMIT ?`
            : `SELECT * FROM system_audit_log ORDER BY performed_at DESC LIMIT ?`;
        const params = module ? [module, limit || 200] : [limit || 200];
        db.all(sql, params, (err: Error | null, rows: any[]) => {
            if (err) reject(err); else resolve(rows || []);
        });
    });
});

// ═══════════════════════════════════════════════
//  BILL ALTER APPROVAL — IPC Handlers
// ═══════════════════════════════════════════════

// Stage an alteration for admin approval
ipcMain.handle('stage-bill-alteration', async (_event, { billId, changes, reason, changedBy }: any) => {
    return new Promise((resolve, reject) => {
        // First, snapshot the current bill for old_value
        db.get('SELECT b.*, (SELECT json_group_array(json_object("id",id,"product_name",product_name,"quantity",quantity,"mrp",mrp,"discount_pct",discount_pct,"price",price)) FROM bill_items WHERE bill_id = b.id) as items FROM bills b WHERE b.id = ?',
            [billId], (err: Error | null, currentBill: any) => {
                if (err) return reject(err);
                db.run(
                    `INSERT INTO bill_audit (bill_id, field_changed, old_value, staged_data, alter_reason, alter_status, changed_by)
                     VALUES (?, 'items', ?, ?, ?, 'pending_approval', ?)`,
                    [billId, JSON.stringify(currentBill), JSON.stringify(changes), reason || '', changedBy],
                    function (this: any, err2: Error | null) {
                        if (err2) return reject(err2);
                        writeAuditLog({
                            module: 'Billing',
                            action: 'BILL_ALTER_REQUESTED',
                            entity_type: 'bill',
                            entity_id: billId,
                            description: `Bill alteration requested by ${changedBy}. Reason: ${reason}`,
                            old_value: currentBill,
                            new_value: changes,
                            performed_by: changedBy,
                        });
                        resolve({ success: true, audit_id: this.lastID });
                    }
                );
            }
        );
    });
});

// Get all pending alterations (admin only)
ipcMain.handle('get-pending-alterations', async () => {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT ba.*, b.invoice_number, bc.name as customer_name
             FROM bill_audit ba
             JOIN bills b ON b.id = ba.bill_id
             LEFT JOIN billing_customers bc ON bc.id = b.customer_id
             WHERE ba.alter_status = 'pending_approval'
             ORDER BY ba.changed_at DESC`,
            [],
            (err: Error | null, rows: any[]) => { if (err) reject(err); else resolve(rows || []); }
        );
    });
});

// Approve an alteration — applies staged_data to bill
ipcMain.handle('approve-alteration', async (_event, { auditId, reviewedBy }: any) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM bill_audit WHERE id = ?', [auditId], (err: Error | null, audit: any) => {
            if (err) return reject(err);
            if (!audit || !audit.staged_data) return reject(new Error('Alteration not found'));

            const staged = JSON.parse(audit.staged_data);
            // Apply each item change
            const applyChanges = () => {
                const items: any[] = staged.items || [];
                // Delete existing items and re-insert
                db.run('DELETE FROM bill_items WHERE bill_id = ?', [audit.bill_id], (delErr: Error | null) => {
                    if (delErr) return reject(delErr);
                    if (items.length === 0) {
                        finalize();
                        return;
                    }
                    const stmt = db.prepare(
                        'INSERT INTO bill_items (bill_id, product_id, product_name, sku, quantity, mrp, discount_pct, discount_amt, price) VALUES (?,?,?,?,?,?,?,?,?)'
                    );
                    items.forEach((item: any) => {
                        stmt.run([audit.bill_id, item.product_id || null, item.product_name, item.sku || '', item.quantity, item.mrp, item.discount_pct || 0, item.discount_amt || 0, item.price]);
                    });
                    stmt.finalize(() => {
                        // Recalculate bill totals
                        const subtotal = items.reduce((s: number, i: any) => s + i.mrp * i.quantity, 0);
                        const discountTotal = items.reduce((s: number, i: any) => s + (i.discount_amt || 0), 0);
                        const grandTotal = staged.grand_total || (subtotal - discountTotal);
                        db.run('UPDATE bills SET subtotal=?, discount_total=?, grand_total=? WHERE id=?',
                            [subtotal, discountTotal, grandTotal, audit.bill_id], () => finalize());
                    });
                });
            };

            const finalize = () => {
                db.run(
                    `UPDATE bill_audit SET alter_status='approved', reviewed_by=?, reviewed_at=datetime('now','localtime') WHERE id=?`,
                    [reviewedBy, auditId],
                    (upErr: Error | null) => {
                        if (upErr) return reject(upErr);
                        writeAuditLog({
                            module: 'Billing',
                            action: 'BILL_ALTER_APPROVED',
                            entity_type: 'bill',
                            entity_id: audit.bill_id,
                            description: `Bill alteration approved by ${reviewedBy}`,
                            performed_by: reviewedBy,
                        });
                        resolve({ success: true });
                    }
                );
            };

            applyChanges();
        });
    });
});

// Reject an alteration
ipcMain.handle('reject-alteration', async (_event, { auditId, reviewedBy, rejectReason }: any) => {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE bill_audit SET alter_status='rejected', reviewed_by=?, reviewed_at=datetime('now','localtime'), alter_reason=COALESCE(alter_reason||' | Rejected: '||?, alter_reason) WHERE id=?`,
            [reviewedBy, rejectReason || '', auditId],
            (err: Error | null) => {
                if (err) return reject(err);
                db.get('SELECT bill_id FROM bill_audit WHERE id=?', [auditId], (_: any, row: any) => {
                    writeAuditLog({
                        module: 'Billing',
                        action: 'BILL_ALTER_REJECTED',
                        entity_type: 'bill',
                        entity_id: row?.bill_id,
                        description: `Bill alteration rejected by ${reviewedBy}. Reason: ${rejectReason}`,
                        performed_by: reviewedBy,
                    });
                });
                resolve({ success: true });
            }
        );
    });
});

// ═══════════════════════════════════════════════
//  SHIPPING — IPC Handlers
// ═══════════════════════════════════════════════

// Add shipping info to a bill
ipcMain.handle('add-bill-shipping', async (_event, data: any) => {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO bill_shipping (bill_id, ship_to_name, ship_to_address, ship_to_phone, ship_from_name, ship_from_address, shipping_charge, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(bill_id) DO UPDATE SET
               ship_to_name=excluded.ship_to_name, ship_to_address=excluded.ship_to_address,
               ship_to_phone=excluded.ship_to_phone, ship_from_name=excluded.ship_from_name,
               ship_from_address=excluded.ship_from_address, shipping_charge=excluded.shipping_charge,
               updated_by=excluded.updated_by, updated_at=datetime('now','localtime')`,
            [data.bill_id, data.ship_to_name, data.ship_to_address, data.ship_to_phone || '',
            data.ship_from_name || '', data.ship_from_address || '', data.shipping_charge || 0, data.updated_by],
            function (this: any, err: Error | null) {
                if (err) return reject(err);
                // Log initial status entry
                const shipId = this.lastID || 0;
                db.run(
                    `INSERT INTO shipping_status_log (shipment_id, bill_id, status, note, updated_by, updated_by_role)
                     VALUES (?, ?, 'pending_payment', 'Shipping order created', ?, ?)`,
                    [shipId, data.bill_id, data.updated_by, data.user_role || 'cashier']
                );
                writeAuditLog({
                    module: 'Shipping',
                    action: 'SHIPPING_CREATED',
                    entity_type: 'bill',
                    entity_id: data.bill_id,
                    description: `Shipping added for bill. Destination: ${data.ship_to_address}`,
                    new_value: data,
                    performed_by: data.updated_by,
                });
                resolve({ success: true, id: shipId });
            }
        );
    });
});

// Get shipping info for a bill
ipcMain.handle('get-bill-shipping', async (_event, billId: number) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM bill_shipping WHERE bill_id = ?', [billId], (err: Error | null, row: any) => {
            if (err) reject(err); else resolve(row || null);
        });
    });
});

// Get all shipments with bill info
ipcMain.handle('get-all-shipments', async (_event, { status }: any = {}) => {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT bs.*, b.invoice_number, b.grand_total, b.created_at as bill_date,
                   bc.name as customer_name, bc.phone as customer_phone
            FROM bill_shipping bs
            JOIN bills b ON b.id = bs.bill_id
            LEFT JOIN billing_customers bc ON bc.id = b.customer_id
            ${status ? 'WHERE bs.status = ?' : ''}
            ORDER BY bs.created_at DESC`;
        const params = status ? [status] : [];
        db.all(sql, params, (err: Error | null, rows: any[]) => {
            if (err) reject(err); else resolve(rows || []);
        });
    });
});

// Get shipment status history
ipcMain.handle('get-shipment-history', async (_event, shipmentId: number) => {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM shipping_status_log WHERE shipment_id = ? ORDER BY created_at ASC',
            [shipmentId],
            (err: Error | null, rows: any[]) => { if (err) reject(err); else resolve(rows || []); }
        );
    });
});

// Update shipment status (role-gated in frontend, logged here)
ipcMain.handle('update-shipment-status', async (_event, { shipmentId, billId, status, note, updatedBy, userRole, imagePath }: any) => {
    return new Promise((resolve, reject) => {
        const updates: string[] = ['status = ?', 'updated_by = ?', `updated_at = datetime('now','localtime')`];
        const vals: any[] = [status, updatedBy];
        if (imagePath) { updates.push('packaging_image_path = ?'); vals.push(imagePath); }
        if (note) { updates.push('delivery_note = ?'); vals.push(note); }
        vals.push(shipmentId);

        db.run(`UPDATE bill_shipping SET ${updates.join(', ')} WHERE id = ?`, vals, (err: Error | null) => {
            if (err) return reject(err);
            db.run(
                `INSERT INTO shipping_status_log (shipment_id, bill_id, status, note, image_path, updated_by, updated_by_role)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [shipmentId, billId, status, note || '', imagePath || null, updatedBy, userRole],
                () => {
                    writeAuditLog({
                        module: 'Shipping',
                        action: 'SHIPPING_STATUS_UPDATED',
                        entity_type: 'shipment',
                        entity_id: shipmentId,
                        description: `Shipping status updated to "${status}" by ${updatedBy} (${userRole})`,
                        new_value: { status, note },
                        performed_by: updatedBy,
                    });
                    resolve({ success: true });
                }
            );
        });
    });
});

// Upload packaging image (saves file and stores path)
ipcMain.handle('upload-packaging-image', async (_event, { shipmentId, billId, imageBase64, updatedBy, userRole }: any) => {
    try {
        const imgDir = path.join(app.getPath('userData'), 'packaging_images');
        if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
        const filename = `ship_${shipmentId}_${Date.now()}.jpg`;
        const imgPath = path.join(imgDir, filename);
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(imgPath, Buffer.from(base64Data, 'base64'));

        await new Promise<void>((res, rej) => {
            db.run(`UPDATE bill_shipping SET packaging_image_path=?, updated_by=?, status='ready_to_ship', updated_at=datetime('now','localtime') WHERE id=?`,
                [imgPath, updatedBy, shipmentId], (err: Error | null) => { if (err) rej(err); else res(); });
        });
        // Log status change
        db.run(`INSERT INTO shipping_status_log (shipment_id, bill_id, status, note, image_path, updated_by, updated_by_role)
                VALUES (?, ?, 'ready_to_ship', 'Packaging photo uploaded, ready to ship', ?, ?, ?)`,
            [shipmentId, billId, imgPath, updatedBy, userRole]);
        writeAuditLog({
            module: 'Shipping', action: 'PACKAGING_IMAGE_UPLOADED', entity_type: 'shipment',
            entity_id: shipmentId, description: `Packaging photo uploaded by ${updatedBy}`, performed_by: updatedBy,
        });
        return { success: true, imagePath: imgPath };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

// ═══════════════════════════════════════════════
//  LICENSE KEY — IPC Handlers
// ═══════════════════════════════════════════════

ipcMain.handle('get-machine-id', async () => {
    return licenseManager.getMachineId();
});

ipcMain.handle('check-license', async () => {
    return licenseManager.isLicensed();
});

ipcMain.handle('activate-license', async (_event, key: string) => {
    if (!key || typeof key !== 'string' || key.trim().length < 10) {
        return { success: false, error: 'Invalid license key format' };
    }
    return licenseManager.saveLicense(key.trim());
});

// ═══════════════════════════════════════════════
//  DATABASE MONITORING — IPC Handler
// ═══════════════════════════════════════════════

ipcMain.handle('get-db-monitoring', async () => {
    return getDbMonitoringData();
});

// ═══════════════════════════════════════════════
//  DATABASE BACKUP — IPC Handlers
// ═══════════════════════════════════════════════

function getBackupDir(): string {
    const backupDir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    return backupDir;
}

ipcMain.handle('create-db-backup', async () => {
    try {
        const dbPath = path.join(app.getPath('userData'), 'le-soft.db');
        if (!fs.existsSync(dbPath)) return { success: false, error: 'Database file not found' };

        const backupDir = getBackupDir();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const backupFile = path.join(backupDir, `le-soft-backup-${timestamp}.db`);
        fs.copyFileSync(dbPath, backupFile);

        // Only keep last 10 backups
        const files = fs.readdirSync(backupDir)
            .filter((f: string) => f.startsWith('le-soft-backup-') && f.endsWith('.db'))
            .sort()
            .reverse();
        files.slice(10).forEach((f: string) => {
            try { fs.unlinkSync(path.join(backupDir, f)); } catch { }
        });

        return { success: true, path: backupFile, time: new Date().toISOString() };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('list-db-backups', async () => {
    try {
        const backupDir = getBackupDir();
        const files = fs.readdirSync(backupDir)
            .filter((f: string) => f.startsWith('le-soft-backup-') && f.endsWith('.db'))
            .map((f: string) => {
                const stats = fs.statSync(path.join(backupDir, f));
                return { name: f, size: stats.size, date: stats.mtime.toISOString() };
            })
            .sort((a: any, b: any) => b.date.localeCompare(a.date));
        return files;
    } catch { return []; }
});

ipcMain.handle('restore-db-backup', async (_event, backupName: string) => {
    try {
        const backupDir = getBackupDir();
        const backupPath = path.join(backupDir, backupName);
        const dbPath = path.join(app.getPath('userData'), 'le-soft.db');

        if (!fs.existsSync(backupPath)) return { success: false, error: 'Backup file not found' };

        // Create a safety backup before restoring
        const safetyBackup = path.join(backupDir, `pre-restore-${Date.now()}.db`);
        fs.copyFileSync(dbPath, safetyBackup);

        // Close current DB and copy backup over
        fs.copyFileSync(backupPath, dbPath);
        return { success: true, message: 'Database restored. Please restart the application.' };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

// Auto backup: run daily at startup
app.whenReady().then(() => {
    setTimeout(async () => {
        try {
            const backupDir = getBackupDir();
            const files = fs.readdirSync(backupDir)
                .filter((f: string) => f.startsWith('le-soft-backup-') && f.endsWith('.db'))
                .sort().reverse();
            const lastBackup = files[0];
            const shouldBackup = !lastBackup ||
                (Date.now() - fs.statSync(path.join(backupDir, lastBackup)).mtime.getTime()) > 24 * 60 * 60 * 1000;
            if (shouldBackup) {
                const dbPath = path.join(app.getPath('userData'), 'le-soft.db');
                if (fs.existsSync(dbPath)) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
                    fs.copyFileSync(dbPath, path.join(backupDir, `le-soft-backup-${timestamp}.db`));
                    console.log('[BACKUP] Automatic daily backup created.');
                }
            }
        } catch (e) {
            console.warn('[BACKUP] Auto-backup failed:', e);
        }
    }, 15_000);
});

