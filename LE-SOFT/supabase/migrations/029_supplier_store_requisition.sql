-- Migration 029: Supplier Store details and Requisition Supplier Info

ALTER TABLE ledgers
    ADD COLUMN store_name VARCHAR(255),
    ADD COLUMN payment_method VARCHAR(100);

ALTER TABLE purchase_requisitions
    ADD COLUMN estimated_price NUMERIC(12, 2),
    ADD COLUMN supplier_ledger_id INTEGER REFERENCES ledgers(id) ON DELETE SET NULL;
