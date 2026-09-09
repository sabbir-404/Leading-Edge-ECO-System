-- Database Query Optimization Indexes for LE-SOFT NAS & Cloud Storage

-- 1. Products Indexes (Fast Search by SKU, Barcode, Category, Name)
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

-- 2. Bills & Invoices Indexes (Fast Customer & Date Filtering)
CREATE INDEX IF NOT EXISTS idx_bills_invoice_number ON bills(invoice_number);
CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON bills(created_at);

-- 3. Ledgers & Financial Accounts Indexes
CREATE INDEX IF NOT EXISTS idx_ledgers_group_id ON ledgers(group_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_name ON ledgers(name);

-- 4. Stock Items & Warehouses Indexes
CREATE INDEX IF NOT EXISTS idx_stock_items_product_id ON stock_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_godown_id ON stock_items(godown_id);

-- 5. Journal Entries & Financial Audit Indexes
CREATE INDEX IF NOT EXISTS idx_journal_entries_posting_date ON journal_entries(posting_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_voucher_type ON journal_entries(voucher_type);
