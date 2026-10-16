-- ============================================================================
-- MySQL Deployment Prerequisite: mysql_001_stock_sync_idempotency.sql
-- ============================================================================
-- Purpose:
-- Provisions the destination-enforced idempotency tracking table on external
-- MySQL databases (e.g. WooCommerce/WordPress/eCommerce inventory database).
--
-- Guarantees:
--   - Destination-enforced dedup marker: prevents duplicate stock decrements
--     across application restarts, retries, or partial crashes after remote commit.
--   - High concurrency: transactional SELECT ... FOR UPDATE row-level locking.
--   - Fast indexing: dedup_key as VARCHAR(191) primary key compatible with
--     utf8mb4 index length constraints (767 bytes max in MySQL 5.7+).
--
-- Deployment Instructions:
-- Execute this script against the external MySQL database prior to enabling
-- background MySQL stock synchronization in LE-SOFT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS le_stock_sync_idempotency (
    dedup_key VARCHAR(191) NOT NULL,
    invoice_number VARCHAR(100) DEFAULT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (dedup_key),
    INDEX idx_mysql_idempotency_invoice (invoice_number),
    INDEX idx_mysql_idempotency_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
