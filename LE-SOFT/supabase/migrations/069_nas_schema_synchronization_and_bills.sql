-- ============================================================================
-- Migration 069_nas_schema_synchronization_and_bills.sql
-- ============================================================================
-- Purpose:
-- Synchronizes the TrueNAS PostgreSQL schema with Supabase Cloud schema for:
--  1. bills.installation_charge (NUMERIC DEFAULT 0) & bills.installation_note (TEXT)
--  2. customer_addresses & customer_payments tables (Ledger and Multi-Address support)
--  3. exchange_orders & exchange_items tables
--  4. Explicitly refreshes the PostgREST schema cache via NOTIFY pgrst
--
-- Safety Guarantees:
--  - Idempotent: Uses IF NOT EXISTS for all tables, columns, and indexes.
--  - Zero downtime: Non-locking metadata additions.
--  - Non-destructive: Does not drop, alter, or modify existing columns or data.
-- ============================================================================

-- 1. Modify `bills` table for installation charge & notes
ALTER TABLE bills ADD COLUMN IF NOT EXISTS installation_charge NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS installation_note TEXT;

-- 2. Create `customer_addresses` table (if not already present on NAS)
CREATE TABLE IF NOT EXISTS customer_addresses (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    address TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id);

-- 3. Create `customer_payments` table for Ledger (Credit) tracking
CREATE TABLE IF NOT EXISTS customer_payments (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL DEFAULT 0,
    payment_mode TEXT NOT NULL DEFAULT 'cash',
    reference TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_id ON customer_payments(customer_id);

-- 4. Create `exchange_orders` table
CREATE TABLE IF NOT EXISTS exchange_orders (
    id SERIAL PRIMARY KEY,
    exchange_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES billing_customers(id),
    original_bill_id INTEGER REFERENCES bills(id),
    total_return_value NUMERIC DEFAULT 0,
    total_new_value NUMERIC DEFAULT 0,
    difference_amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exchange_orders_customer_id ON exchange_orders(customer_id);

-- 5. Create `exchange_items` table
CREATE TABLE IF NOT EXISTS exchange_items (
    id SERIAL PRIMARY KEY,
    exchange_id INTEGER NOT NULL REFERENCES exchange_orders(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL,
    product_id INTEGER REFERENCES products(id),
    product_name TEXT,
    sku TEXT,
    quantity NUMERIC DEFAULT 1,
    rate NUMERIC DEFAULT 0,
    amount NUMERIC DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_exchange_items_exchange_id ON exchange_items(exchange_id);

-- 6. Trigger PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
