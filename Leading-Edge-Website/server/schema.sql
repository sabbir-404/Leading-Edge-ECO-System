
CREATE DATABASE IF NOT EXISTS furniture_shop;
USE furniture_shop;

CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    image TEXT,
    parent_id VARCHAR(50),
    is_featured BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    sale_price DECIMAL(10, 2),
    on_sale BOOLEAN DEFAULT FALSE,
    description TEXT,
    short_description TEXT,
    model_number VARCHAR(100),
    image LONGTEXT, 
    is_visible BOOLEAN DEFAULT TRUE,
    extra_data LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS related_products (
    product_id VARCHAR(50),
    related_product_id VARCHAR(50),
    PRIMARY KEY (product_id, related_product_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (related_product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_categories (
    product_id VARCHAR(50),
    category_name VARCHAR(255),
    PRIMARY KEY (product_id, category_name),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id VARCHAR(50),
    image_url LONGTEXT, 
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    role ENUM('admin', 'customer', 'moderator', 'customer_service') DEFAULT 'customer',
    phone VARCHAR(50),
    address TEXT,
    join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50),
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),
    shipping_address TEXT,
    subtotal DECIMAL(10, 2),
    shipping_cost DECIMAL(10, 2),
    tax DECIMAL(10, 2),
    total DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'Pending',
    payment_status VARCHAR(50) DEFAULT 'Unpaid',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(50),
    product_id VARCHAR(50),
    product_name VARCHAR(255),
    quantity INT,
    price DECIMAL(10, 2),
    image LONGTEXT, 
    selected_variation LONGTEXT, 
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255),
    description TEXT,
    cover_image LONGTEXT, 
    client VARCHAR(255),
    completion_date VARCHAR(50),
    images LONGTEXT
);

CREATE TABLE IF NOT EXISTS site_config (
    id VARCHAR(50) PRIMARY KEY,
    config_data LONGTEXT
);

CREATE TABLE IF NOT EXISTS custom_pages (
    id VARCHAR(50) PRIMARY KEY,
    slug VARCHAR(255) UNIQUE,
    title VARCHAR(255),
    content_json LONGTEXT
);

CREATE TABLE IF NOT EXISTS shipping_areas (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS shipping_methods (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255),
    type VARCHAR(50),
    flat_rate DECIMAL(10, 2),
    is_global BOOLEAN DEFAULT TRUE,
    area_ids LONGTEXT, 
    weight_rates LONGTEXT 
);

CREATE TABLE IF NOT EXISTS newsletter_campaigns (
    id VARCHAR(50) PRIMARY KEY,
    subject VARCHAR(255),
    content LONGTEXT, 
    sent_date DATE,
    recipient_count INT,
    status VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_email VARCHAR(255),
    action_type VARCHAR(50),
    target_id VARCHAR(50),
    details TEXT,
    changes LONGTEXT, 
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_library (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_name VARCHAR(255),
    file_path TEXT,
    folder VARCHAR(50),
    file_size INT,
    mime_type VARCHAR(50),
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- LE SOFT: Tally-like Accounting & Inventory Extension
-- ==========================================

-- 1. Company Management
CREATE TABLE IF NOT EXISTS companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    country VARCHAR(100) DEFAULT 'Bangladesh',
    phone VARCHAR(50),
    email VARCHAR(100),
    website VARCHAR(100),
    financial_year_start DATE NOT NULL,
    books_beginning_from DATE NOT NULL,
    base_currency_symbol VARCHAR(10) DEFAULT '৳',
    base_currency_name VARCHAR(50) DEFAULT 'BDT',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Accounting Masters & Vouchers
CREATE TABLE IF NOT EXISTS ac_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id INT NULL, 
    company_id INT NOT NULL, 
    nature ENUM('Assets', 'Liabilities', 'Income', 'Expenses') NULL, 
    FOREIGN KEY (parent_id) REFERENCES ac_groups(id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ac_ledgers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    group_id INT NOT NULL,
    opening_balance DECIMAL(15, 2) DEFAULT 0.00,
    opening_balance_type ENUM('Dr', 'Cr') DEFAULT 'Dr',
    current_balance DECIMAL(15, 2) DEFAULT 0.00, 
    company_id INT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES ac_groups(id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ac_cost_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    company_id INT NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ac_cost_centers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category_id INT NOT NULL,
    company_id INT NOT NULL,
    FOREIGN KEY (category_id) REFERENCES ac_cost_categories(id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ac_vouchers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    voucher_type ENUM('Payment', 'Receipt', 'Contra', 'Journal', 'Sales', 'Purchase', 'Credit Note', 'Debit Note') NOT NULL,
    voucher_number VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    narration TEXT,
    company_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ac_voucher_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    voucher_id INT NOT NULL,
    ledger_id INT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    type ENUM('Dr', 'Cr') NOT NULL,
    FOREIGN KEY (voucher_id) REFERENCES ac_vouchers(id) ON DELETE CASCADE,
    FOREIGN KEY (ledger_id) REFERENCES ac_ledgers(id)
);

CREATE TABLE IF NOT EXISTS ac_voucher_cost_allocations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entry_id INT NOT NULL,
    cost_center_id INT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    FOREIGN KEY (entry_id) REFERENCES ac_voucher_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (cost_center_id) REFERENCES ac_cost_centers(id)
);

-- 3. Inventory Masters & Vouchers
CREATE TABLE IF NOT EXISTS inv_units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL, 
    symbol VARCHAR(20) NOT NULL, 
    company_id INT NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inv_godowns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    company_id INT NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inv_stock_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id INT NULL,
    company_id INT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES inv_stock_groups(id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inv_stock_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id INT NULL, 
    unit_id INT NULL,
    opening_qty DECIMAL(10, 3) DEFAULT 0,
    opening_rate DECIMAL(15, 2) DEFAULT 0,
    opening_value DECIMAL(15, 2) DEFAULT 0,
    company_id INT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES inv_stock_groups(id),
    FOREIGN KEY (unit_id) REFERENCES inv_units(id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inv_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    voucher_id INT NOT NULL, 
    item_id INT NOT NULL,
    godown_id INT NULL,
    batch_name VARCHAR(100) NULL,
    expiry_date DATE NULL,
    qty_in DECIMAL(10, 3) DEFAULT 0,
    qty_out DECIMAL(10, 3) DEFAULT 0,
    rate DECIMAL(15, 2) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    FOREIGN KEY (voucher_id) REFERENCES ac_vouchers(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES inv_stock_items(id),
    FOREIGN KEY (godown_id) REFERENCES inv_godowns(id)
);

-- 4. Payroll
CREATE TABLE IF NOT EXISTS pay_employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    department VARCHAR(100),
    designation VARCHAR(100),
    date_of_joining DATE,
    company_id INT NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pay_heads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL, -- Basic, HRA, PF
    type ENUM('Earnings', 'Deductions') NOT NULL,
    company_id INT NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pay_attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    date DATE NOT NULL,
    status ENUM('Present', 'Absent', 'Leave') NOT NULL,
    value DECIMAL(4, 2) DEFAULT 1, -- 1 day, 0.5 day
    FOREIGN KEY (employee_id) REFERENCES pay_employees(id) ON DELETE CASCADE
);

-- 5. Taxation
CREATE TABLE IF NOT EXISTS tax_rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100), 
    rate_percent DECIMAL(5, 2) NOT NULL,
    type ENUM('IGST', 'CGST', 'SGST', 'VAT') DEFAULT 'VAT',
    company_id INT NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
