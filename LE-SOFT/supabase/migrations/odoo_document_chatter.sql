-- Odoo Inspired Document State Machine & Audit Chatter Schema

CREATE TABLE IF NOT EXISTS document_chatter_logs (
    id BIGSERIAL PRIMARY KEY,
    document_type VARCHAR(50) NOT NULL, -- 'Bill', 'Quotation', 'MakeOrder', 'Requisition'
    document_id VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'created', 'approved', 'altered', 'status_changed'
    from_state VARCHAR(50),
    to_state VARCHAR(50),
    notes TEXT,
    created_by VARCHAR(100) NOT NULL DEFAULT 'System',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatter_doc ON document_chatter_logs(document_type, document_id);
