-- Migration 012_customer_ledger.sql
-- Adds tables and fields for Customer Ledger, Multiple Addresses, and Exchange Orders.

-- 1. Modify `bills` table for installation charge
ALTER TABLE bills ADD COLUMN IF NOT EXISTS installation_charge NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS installation_note TEXT;

-- 2. Create `customer_addresses` table
CREATE TABLE IF NOT EXISTS customer_addresses (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,
    label TEXT NOT NULL, -- e.g. "Home", "Office", "Site A"
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
    payment_mode TEXT NOT NULL DEFAULT 'cash', -- 'cash', 'bank', 'card', 'mobile_banking'
    reference TEXT, -- check number, tx id
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_id ON customer_payments(customer_id);

-- 4. Create `exchange_orders` table
CREATE TABLE IF NOT EXISTS exchange_orders (
    id SERIAL PRIMARY KEY,
    exchange_number TEXT UNIQUE NOT NULL, -- e.g. EXC-2024-001
    customer_id INTEGER REFERENCES billing_customers(id),
    original_bill_id INTEGER REFERENCES bills(id), -- Optional reference to original bill
    total_return_value NUMERIC DEFAULT 0, -- Value of products brought back
    total_new_value NUMERIC DEFAULT 0, -- Value of new products taken
    difference_amount NUMERIC DEFAULT 0, -- new - return (Positive = customer owes us, Negative = we owe customer)
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exchange_orders_customer_id ON exchange_orders(customer_id);

-- 5. Create `exchange_items` table
CREATE TABLE IF NOT EXISTS exchange_items (
    id SERIAL PRIMARY KEY,
    exchange_id INTEGER NOT NULL REFERENCES exchange_orders(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL, -- 'RETURNED' or 'NEW'
    product_id INTEGER REFERENCES products(id),
    product_name TEXT,
    sku TEXT,
    quantity NUMERIC DEFAULT 1,
    rate NUMERIC DEFAULT 0,
    amount NUMERIC DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_exchange_items_exchange_id ON exchange_items(exchange_id);

-- 6. Trigger for generating unique exchange numbers (similar to bills/quotations)
CREATE OR REPLACE FUNCTION generate_exchange_number()
RETURNS trigger AS $$
DECLARE
    next_id INT;
    prefix TEXT := 'EXC-' || to_char(CURRENT_DATE, 'IYYY') || '-';
BEGIN
    IF NEW.exchange_number IS NULL OR NEW.exchange_number = '' THEN
        -- Safely get the next ID sequence or rely on counting existing records this year
        SELECT COUNT(*) + 1 INTO next_id
        FROM public.exchange_orders
        WHERE exchange_number LIKE prefix || '%';
        
        NEW.exchange_number := prefix || LPAD(next_id::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_exchange_number ON exchange_orders;
CREATE TRIGGER trg_generate_exchange_number
    BEFORE INSERT ON exchange_orders
    FOR EACH ROW
    EXECUTE PROCEDURE generate_exchange_number();

-- 7. Enable RLS and add basic authenticated policies
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to customer_addresses" ON customer_addresses FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated full access to customer_payments" ON customer_payments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated full access to exchange_orders" ON exchange_orders FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated full access to exchange_items" ON exchange_items FOR ALL USING (auth.role() = 'authenticated');
