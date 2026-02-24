-- LE-SOFT Initial Schema Migration for Supabase
-- Run this in: Supabase Dashboard → SQL Editor → New Query

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════
-- COMPANIES
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════
-- GROUPS (Ledger Groups)
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    parent_group_id INTEGER REFERENCES groups(id),
    nature TEXT, -- Assets, Liabilities, Income, Expenses
    company_id INTEGER REFERENCES companies(id)
);

-- ═══════════════════════════════════
-- LEDGERS
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS ledgers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    group_id INTEGER REFERENCES groups(id),
    opening_balance NUMERIC DEFAULT 0,
    opening_balance_type TEXT CHECK(opening_balance_type IN ('Dr', 'Cr')),
    mailing_name TEXT,
    address TEXT,
    tax_reg_no TEXT,
    company_id INTEGER REFERENCES companies(id)
);

-- ═══════════════════════════════════
-- VOUCHERS
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS vouchers (
    id SERIAL PRIMARY KEY,
    voucher_type TEXT NOT NULL,
    voucher_number TEXT NOT NULL,
    date TEXT NOT NULL,
    narration TEXT,
    total_amount NUMERIC,
    company_id INTEGER REFERENCES companies(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voucher_entries (
    id SERIAL PRIMARY KEY,
    voucher_id INTEGER REFERENCES vouchers(id) ON DELETE CASCADE,
    ledger_id INTEGER REFERENCES ledgers(id),
    amount NUMERIC NOT NULL,
    type TEXT CHECK(type IN ('Dr', 'Cr'))
);

-- ═══════════════════════════════════
-- INVENTORY
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS units (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    precision INTEGER DEFAULT 0,
    company_id INTEGER REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS stock_groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES stock_groups(id),
    company_id INTEGER REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS stock_items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    group_id INTEGER REFERENCES stock_groups(id),
    unit_id INTEGER REFERENCES units(id),
    opening_qty NUMERIC DEFAULT 0,
    opening_rate NUMERIC DEFAULT 0,
    opening_value NUMERIC DEFAULT 0,
    costing_method TEXT DEFAULT 'Avg Cost',
    company_id INTEGER REFERENCES companies(id)
);

-- ═══════════════════════════════════
-- PRODUCTS
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT,
    category TEXT,
    purchase_price NUMERIC DEFAULT 0,
    selling_price NUMERIC DEFAULT 0,
    tax_rate NUMERIC DEFAULT 0,
    hsn_code TEXT,
    description TEXT,
    image_path TEXT,
    quantity INTEGER DEFAULT 0,
    unit_id INTEGER REFERENCES units(id),
    stock_group_id INTEGER REFERENCES stock_groups(id),
    company_id INTEGER REFERENCES companies(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════
-- PURCHASE BILLS
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS purchase_bills (
    id SERIAL PRIMARY KEY,
    bill_number TEXT NOT NULL,
    bill_date TEXT NOT NULL,
    due_date TEXT,
    supplier_ledger_id INTEGER REFERENCES ledgers(id),
    narration TEXT,
    subtotal NUMERIC DEFAULT 0,
    tax_total NUMERIC DEFAULT 0,
    grand_total NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'Pending',
    company_id INTEGER REFERENCES companies(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_bill_items (
    id SERIAL PRIMARY KEY,
    bill_id INTEGER NOT NULL REFERENCES purchase_bills(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    description TEXT,
    qty NUMERIC DEFAULT 0,
    rate NUMERIC DEFAULT 0,
    tax_rate NUMERIC DEFAULT 0,
    tax_amount NUMERIC DEFAULT 0,
    amount NUMERIC DEFAULT 0
);

-- ═══════════════════════════════════
-- USER GROUPS & USERS
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS user_groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'operator',
    group_id INTEGER REFERENCES user_groups(id),
    email TEXT,
    phone TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════
-- NOTIFICATIONS
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT,
    sender_id INTEGER REFERENCES users(id),
    recipient_id INTEGER REFERENCES users(id),
    is_read INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════
-- BILLING
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS billing_customers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    email TEXT,
    address TEXT,
    total_bills INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bills (
    id SERIAL PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES billing_customers(id),
    billed_by TEXT,
    subtotal NUMERIC DEFAULT 0,
    discount_total NUMERIC DEFAULT 0,
    grand_total NUMERIC DEFAULT 0,
    company_id INTEGER DEFAULT 1 REFERENCES companies(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bill_items (
    id SERIAL PRIMARY KEY,
    bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name TEXT,
    sku TEXT,
    quantity NUMERIC DEFAULT 1,
    mrp NUMERIC DEFAULT 0,
    discount_pct NUMERIC DEFAULT 0,
    discount_amt NUMERIC DEFAULT 0,
    price NUMERIC DEFAULT 0
);

-- ═══════════════════════════════════
-- AUDIT LOGS
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS bill_audit (
    id SERIAL PRIMARY KEY,
    bill_id INTEGER NOT NULL REFERENCES bills(id),
    field_changed TEXT,
    old_value TEXT,
    new_value TEXT,
    staged_data TEXT,
    alter_reason TEXT,
    alter_status TEXT DEFAULT 'approved',
    reviewed_by TEXT,
    reviewed_at TEXT,
    changed_by TEXT,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_audit_log (
    id SERIAL PRIMARY KEY,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    description TEXT,
    old_value TEXT,
    new_value TEXT,
    performed_by TEXT NOT NULL,
    performed_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT
);

-- ═══════════════════════════════════
-- SHIPPING
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS bill_shipping (
    id SERIAL PRIMARY KEY,
    bill_id INTEGER NOT NULL UNIQUE REFERENCES bills(id),
    ship_to_name TEXT NOT NULL,
    ship_to_address TEXT NOT NULL,
    ship_to_phone TEXT,
    ship_from_name TEXT,
    ship_from_address TEXT,
    shipping_charge NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'pending_payment',
    packaging_image_path TEXT,
    delivery_note TEXT,
    updated_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipping_status_log (
    id SERIAL PRIMARY KEY,
    shipment_id INTEGER NOT NULL REFERENCES bill_shipping(id),
    bill_id INTEGER NOT NULL REFERENCES bills(id),
    status TEXT NOT NULL,
    note TEXT,
    image_path TEXT,
    updated_by TEXT NOT NULL,
    updated_by_role TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════
-- INTERNAL MESSAGES
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS internal_messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    receiver_id INTEGER REFERENCES users(id),
    message_type TEXT DEFAULT 'text',
    content TEXT,
    file_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════
-- MAKE MODULE
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS make_orders (
    id SERIAL PRIMARY KEY,
    furniture_name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 1,
    designer_name TEXT NOT NULL,
    status TEXT DEFAULT 'Placed',
    priority TEXT DEFAULT 'Normal',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS make_order_updates (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES make_orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    note TEXT,
    updated_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════
-- DEVICE MONITORING (NEW)
-- ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS device_sessions (
    id SERIAL PRIMARY KEY,
    device_id TEXT NOT NULL UNIQUE,      -- machine ID (hardware fingerprint)
    device_name TEXT,                     -- PC hostname
    ip_address TEXT,
    platform TEXT,                        -- win32, darwin, linux
    app_version TEXT,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    is_backup_node BOOLEAN DEFAULT FALSE, -- Is this PC the local backup node?
    username TEXT                         -- last logged in user
);

-- ═══════════════════════════════════
-- DEFAULT SEED DATA
-- ═══════════════════════════════════

-- Default Company
INSERT INTO companies (name, mailing_name, country, base_currency_symbol)
VALUES ('Leading Edge Demo', 'Leading Edge', 'Bangladesh', '৳')
ON CONFLICT DO NOTHING;

-- Ledger Groups
INSERT INTO groups (name, parent_group_id, nature, company_id) VALUES
('Capital Account', NULL, 'Liabilities', 1),
('Current Assets', NULL, 'Assets', 1),
('Current Liabilities', NULL, 'Liabilities', 1),
('Fixed Assets', NULL, 'Assets', 1),
('Direct Expenses', NULL, 'Expenses', 1),
('Indirect Expenses', NULL, 'Expenses', 1),
('Sales Accounts', NULL, 'Income', 1),
('Purchase Accounts', NULL, 'Expenses', 1),
('Cash-in-hand', 2, 'Assets', 1),
('Bank Accounts', 2, 'Assets', 1),
('Sundry Debtors', 2, 'Assets', 1),
('Sundry Creditors', 3, 'Liabilities', 1)
ON CONFLICT DO NOTHING;

-- User Groups
INSERT INTO user_groups (name, description, permissions) VALUES
('Admin Full Access', 'Full access to all features', '{"masters":true,"vouchers":true,"inventory":true,"users":true,"settings":true,"website":true,"reports":true}'),
('Manager', 'Access to masters, vouchers, inventory, and reports', '{"masters":true,"vouchers":true,"inventory":true,"users":false,"settings":false,"website":true,"reports":true}'),
('Operator', 'Basic data entry access', '{"masters":true,"vouchers":true,"inventory":true,"users":false,"settings":false,"website":false,"reports":false}')
ON CONFLICT (name) DO NOTHING;

-- Default Admin User (password: admin — change immediately!)
INSERT INTO users (username, password_hash, full_name, role, group_id, email)
VALUES ('admin', 'admin', 'Administrator', 'admin', 1, 'admin@leadingedge.com')
ON CONFLICT (username) DO NOTHING;
