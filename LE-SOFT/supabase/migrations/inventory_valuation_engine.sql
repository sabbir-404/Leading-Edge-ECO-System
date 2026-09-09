-- Inventory Valuation & Movement Engine Schema

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    warehouse_from BIGINT,
    warehouse_to BIGINT,
    quantity NUMERIC(12, 2) NOT NULL,
    unit_cost NUMERIC(15, 2) NOT NULL,
    valuation_method VARCHAR(20) DEFAULT 'WEIGHTED_AVG', -- 'FIFO' or 'WEIGHTED_AVG'
    transaction_type VARCHAR(50) NOT NULL, -- 'PURCHASE', 'SALE', 'TRANSFER', 'ADJUSTMENT'
    reference_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_product ON inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_type ON inventory_transactions(transaction_type);
