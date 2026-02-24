import sqlite3 from 'sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { createDbClient } from './db-client';
import { decryptDatabaseOnStartup } from './db-encryption';

const CONFIG_FILE = path.join(app.getPath('userData'), 'network-config.json');
let config: any = { mode: 'server' }; // Default to server if no config

try {
    if (fs.existsSync(CONFIG_FILE)) {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
} catch (e) { }

const dbPath = path.join(app.getPath('userData'), 'le_soft.db');
let db: any;

if (config.mode === 'client' && config.serverAddress) {
    console.log('Database Mode: CLIENT (Remote at ' + config.serverAddress + ')');
    db = createDbClient(config.serverAddress, config.apiKey || '', config.port || 3456);
} else {
    // SECURITY: Decrypt database before opening if it was encrypted at rest
    decryptDatabaseOnStartup();
    console.log('Database Mode: SERVER (Local)');
    db = new sqlite3.Database(dbPath);
}

export const initDB = () => {
    // Only run migrations/seeding if we are the server
    if (config.mode === 'client') return;

    db.serialize(() => {
        // Companies Table
        db.run(`CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            mailing_name TEXT,
            address TEXT,
            country TEXT,
            state TEXT,
            phone TEXT,
            email TEXT,
            financial_year_from TEXT,
            books_begin_from TEXT,
            base_currency_symbol TEXT DEFAULT '৳',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Groups Table
        db.run(`CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_group_id INTEGER,
            nature TEXT, -- Assets, Liabilities, Income, Expenses
            company_id INTEGER,
            FOREIGN KEY(company_id) REFERENCES companies(id)
        )`);

        // Ledgers Table
        db.run(`CREATE TABLE IF NOT EXISTS ledgers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            group_id INTEGER,
            opening_balance REAL DEFAULT 0,
            opening_balance_type TEXT CHECK(opening_balance_type IN ('Dr', 'Cr')),
            mailing_name TEXT,
            address TEXT,
            tax_reg_no TEXT,
            company_id INTEGER,
            FOREIGN KEY(group_id) REFERENCES groups(id),
            FOREIGN KEY(company_id) REFERENCES companies(id)
        )`);

        // Vouchers Table
        db.run(`CREATE TABLE IF NOT EXISTS vouchers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_type TEXT NOT NULL, -- Payment, Receipt, Journal, Contra, Sales, Purchase
            voucher_number TEXT NOT NULL,
            date TEXT NOT NULL,
            narration TEXT,
            total_amount REAL,
            company_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(company_id) REFERENCES companies(id)
        )`);

        // Voucher Entries Table (Credits and Debits)
        db.run(`CREATE TABLE IF NOT EXISTS voucher_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_id INTEGER,
            ledger_id INTEGER,
            amount REAL NOT NULL,
            type TEXT CHECK(type IN ('Dr', 'Cr')),
            FOREIGN KEY(ledger_id) REFERENCES ledgers(id)
        )`);

        // Units Table
        db.run(`CREATE TABLE IF NOT EXISTS units (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL, -- e.g., Kilogram, Pieces
            symbol TEXT NOT NULL, -- e.g., kg, pcs
            precision INTEGER DEFAULT 0, -- Decimal places
            company_id INTEGER,
            FOREIGN KEY(company_id) REFERENCES companies(id)
        )`);

        // Stock Groups Table
        db.run(`CREATE TABLE IF NOT EXISTS stock_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER,
            company_id INTEGER,
            FOREIGN KEY(company_id) REFERENCES companies(id)
        )`);

        // Stock Items Table
        db.run(`CREATE TABLE IF NOT EXISTS stock_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            group_id INTEGER,
            unit_id INTEGER,
            opening_qty REAL DEFAULT 0,
            opening_rate REAL DEFAULT 0,
            opening_value REAL DEFAULT 0,
            costing_method TEXT DEFAULT 'Avg Cost',
            company_id INTEGER,
            FOREIGN KEY(group_id) REFERENCES stock_groups(id),
            FOREIGN KEY(unit_id) REFERENCES units(id),
            FOREIGN KEY(company_id) REFERENCES companies(id)
        )`);

        // Products Table
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sku TEXT,
            category TEXT,
            purchase_price REAL DEFAULT 0,
            selling_price REAL DEFAULT 0,
            tax_rate REAL DEFAULT 0,
            hsn_code TEXT,
            description TEXT,
            unit_id INTEGER,
            stock_group_id INTEGER,
            company_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(unit_id) REFERENCES units(id),
            FOREIGN KEY(stock_group_id) REFERENCES stock_groups(id),
            FOREIGN KEY(company_id) REFERENCES companies(id)
        )`);

        // Purchase Bills Table
        db.run(`CREATE TABLE IF NOT EXISTS purchase_bills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_number TEXT NOT NULL,
            bill_date TEXT NOT NULL,
            due_date TEXT,
            supplier_ledger_id INTEGER,
            narration TEXT,
            subtotal REAL DEFAULT 0,
            tax_total REAL DEFAULT 0,
            grand_total REAL DEFAULT 0,
            status TEXT DEFAULT 'Pending',
            company_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(supplier_ledger_id) REFERENCES ledgers(id),
            FOREIGN KEY(company_id) REFERENCES companies(id)
        )`);

        // Purchase Bill Items Table
        db.run(`CREATE TABLE IF NOT EXISTS purchase_bill_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_id INTEGER NOT NULL,
            product_id INTEGER,
            description TEXT,
            qty REAL DEFAULT 0,
            rate REAL DEFAULT 0,
            tax_rate REAL DEFAULT 0,
            tax_amount REAL DEFAULT 0,
            amount REAL DEFAULT 0,
            FOREIGN KEY(bill_id) REFERENCES purchase_bills(id),
            FOREIGN KEY(product_id) REFERENCES products(id)
        )`);

        // User Groups Table
        db.run(`CREATE TABLE IF NOT EXISTS user_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            permissions TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            role TEXT DEFAULT 'operator',
            group_id INTEGER,
            email TEXT,
            phone TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(group_id) REFERENCES user_groups(id)
        )`);

        // Notifications Table
        db.run(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            message TEXT,
            sender_id INTEGER,
            recipient_id INTEGER,
            is_read INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY(sender_id) REFERENCES users(id),
            FOREIGN KEY(recipient_id) REFERENCES users(id)
        )`);

        // Add columns to products if missing (migration-safe)
        db.run(`ALTER TABLE products ADD COLUMN image_path TEXT`, () => { });
        db.run(`ALTER TABLE products ADD COLUMN quantity INTEGER DEFAULT 0`, () => { });

        // Billing Customers Table
        db.run(`CREATE TABLE IF NOT EXISTS billing_customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT UNIQUE,
            email TEXT,
            address TEXT,
            total_bills INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Bills Table
        db.run(`CREATE TABLE IF NOT EXISTS bills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number TEXT UNIQUE NOT NULL,
            customer_id INTEGER,
            billed_by TEXT,
            subtotal REAL DEFAULT 0,
            discount_total REAL DEFAULT 0,
            grand_total REAL DEFAULT 0,
            company_id INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(customer_id) REFERENCES billing_customers(id),
            FOREIGN KEY(company_id) REFERENCES companies(id)
        )`);

        // Bill Items Table
        db.run(`CREATE TABLE IF NOT EXISTS bill_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_id INTEGER NOT NULL,
            product_id INTEGER,
            product_name TEXT,
            sku TEXT,
            quantity REAL DEFAULT 1,
            mrp REAL DEFAULT 0,
            discount_pct REAL DEFAULT 0,
            discount_amt REAL DEFAULT 0,
            price REAL DEFAULT 0,
            FOREIGN KEY(bill_id) REFERENCES bills(id),
            FOREIGN KEY(product_id) REFERENCES products(id)
        )`);

        // Bill Audit Table
        db.run(`CREATE TABLE IF NOT EXISTS bill_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_id INTEGER NOT NULL,
            field_changed TEXT,
            old_value TEXT,
            new_value TEXT,
            staged_data TEXT,
            alter_reason TEXT,
            alter_status TEXT DEFAULT 'approved',
            reviewed_by TEXT,
            reviewed_at TEXT,
            changed_by TEXT,
            changed_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY(bill_id) REFERENCES bills(id)
        )`);

        // Evolve existing bill_audit rows (safe ALTER — ignored if column exists)
        const billAuditCols = ['staged_data TEXT', 'alter_reason TEXT', "alter_status TEXT DEFAULT 'approved'", 'reviewed_by TEXT', 'reviewed_at TEXT'];
        billAuditCols.forEach(col => {
            db.run(`ALTER TABLE bill_audit ADD COLUMN ${col}`, () => { });
        });

        // ═══════════════════════════════════════════════
        //  SYSTEM-WIDE AUDIT LOG (immutable append-only)
        // ═══════════════════════════════════════════════
        db.run(`CREATE TABLE IF NOT EXISTS system_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            module TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id TEXT,
            description TEXT,
            old_value TEXT,
            new_value TEXT,
            performed_by TEXT NOT NULL,
            performed_at TEXT DEFAULT (datetime('now','localtime')),
            ip_address TEXT
        )`);

        // ═══════════════════════════════════════════════
        //  SHIPPING MODULE
        // ═══════════════════════════════════════════════
        db.run(`CREATE TABLE IF NOT EXISTS bill_shipping (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_id INTEGER NOT NULL UNIQUE,
            ship_to_name TEXT NOT NULL,
            ship_to_address TEXT NOT NULL,
            ship_to_phone TEXT,
            ship_from_name TEXT,
            ship_from_address TEXT,
            shipping_charge REAL DEFAULT 0,
            status TEXT DEFAULT 'pending_payment',
            packaging_image_path TEXT,
            delivery_note TEXT,
            updated_by TEXT,
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY(bill_id) REFERENCES bills(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS shipping_status_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shipment_id INTEGER NOT NULL,
            bill_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            note TEXT,
            image_path TEXT,
            updated_by TEXT NOT NULL,
            updated_by_role TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY(shipment_id) REFERENCES bill_shipping(id)
        )`);

        // Internal Messages Table
        db.run(`CREATE TABLE IF NOT EXISTS internal_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER, -- NULL for broadcast/all (future)
            message_type TEXT DEFAULT 'text', -- 'text', 'image', 'file'
            content TEXT,
            file_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sender_id) REFERENCES users(id),
            FOREIGN KEY(receiver_id) REFERENCES users(id)
        )`);

        // ═══════════════════════════════════════════════
        //  MAKE MODULE — Metal Furniture Order Management
        // ═══════════════════════════════════════════════
        db.run(`CREATE TABLE IF NOT EXISTS make_orders (

            id INTEGER PRIMARY KEY AUTOINCREMENT,
            furniture_name TEXT NOT NULL,
            description TEXT,
            quantity INTEGER DEFAULT 1,
            designer_name TEXT NOT NULL,
            status TEXT DEFAULT 'Placed',
            priority TEXT DEFAULT 'Normal',
            created_at DATETIME DEFAULT (datetime('now','localtime')),
            updated_at DATETIME DEFAULT (datetime('now','localtime'))
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS make_order_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            note TEXT,
            updated_by TEXT NOT NULL,
            created_at DATETIME DEFAULT (datetime('now','localtime')),
            FOREIGN KEY(order_id) REFERENCES make_orders(id)
        )`);

        // Seed Initial Groups (Simplified Tally List)
        db.get("SELECT count(*) as count FROM groups", (err, row: any) => {
            if (err) console.error('Error checking groups count:', err);
            if (row && row.count === 0) {
                const groups = [
                    ['Capital Account', null, 'Liabilities', 1],
                    ['Current Assets', null, 'Assets', 1],
                    ['Current Liabilities', null, 'Liabilities', 1],
                    ['Fixed Assets', null, 'Assets', 1],
                    ['Direct Expenses', null, 'Expenses', 1],
                    ['Indirect Expenses', null, 'Expenses', 1],
                    ['Sales Accounts', null, 'Income', 1],
                    ['Purchase Accounts', null, 'Expenses', 1],
                    ['Cash-in-hand', 2, 'Assets', 1], // Under Current Assets
                    ['Bank Accounts', 2, 'Assets', 1], // Under Current Assets
                    ['Sundry Debtors', 2, 'Assets', 1], // Under Current Assets
                    ['Sundry Creditors', 3, 'Liabilities', 1], // Under Current Liabilities
                ];

                const stmt = db.prepare("INSERT INTO groups (name, parent_group_id, nature, company_id) VALUES (?, ?, ?, ?)");
                groups.forEach(g => stmt.run(g, (err) => {
                    if (err) console.error('Failed to seed group:', g[0], err);
                }));
                stmt.finalize(() => {
                    console.log('Seeded Groups');
                });
            }
        });

        // Seed Default Company
        db.get("SELECT count(*) as count FROM companies", (err, row: any) => {
            if (err) console.error('Error checking companies count:', err);
            if (row && row.count === 0) {
                db.run(`INSERT INTO companies (name, mailing_name, country, base_currency_symbol) VALUES ('Leading Edge Demo', 'Leading Edge', 'Bangladesh', '৳')`, (err) => {
                    if (err) console.error('Failed to seed company:', err);
                    else console.log('Seeded Default Company');
                });
            }
        });

        // Seed Default User Groups
        db.get("SELECT count(*) as count FROM user_groups", (err, row: any) => {
            if (err) console.error('Error checking user_groups count:', err);
            if (row && row.count === 0) {
                const groups = [
                    ['Admin Full Access', 'Full access to all features', JSON.stringify({ masters: true, vouchers: true, inventory: true, users: true, settings: true, website: true, reports: true })],
                    ['Manager', 'Access to masters, vouchers, inventory, and reports', JSON.stringify({ masters: true, vouchers: true, inventory: true, users: false, settings: false, website: true, reports: true })],
                    ['Operator', 'Basic data entry access', JSON.stringify({ masters: true, vouchers: true, inventory: true, users: false, settings: false, website: false, reports: false })],
                ];
                const stmt = db.prepare("INSERT INTO user_groups (name, description, permissions) VALUES (?, ?, ?)");
                groups.forEach(g => stmt.run(g, (err) => { if (err) console.error('Failed to seed user group:', g[0], err); }));
                stmt.finalize(() => console.log('Seeded User Groups'));
            }
        });

        // Seed Default Admin User
        db.get("SELECT count(*) as count FROM users", (err, row: any) => {
            if (err) console.error('Error checking users count:', err);
            if (row && row.count === 0) {
                db.run(`INSERT INTO users (username, password_hash, full_name, role, group_id, email) VALUES ('admin', 'admin', 'Administrator', 'admin', 1, 'admin@leadingedge.com')`, (err) => {
                    if (err) console.error('Failed to seed admin:', err);
                    else console.log('Seeded Default Admin User');
                });
            }
        });
    });
};

export default db;

