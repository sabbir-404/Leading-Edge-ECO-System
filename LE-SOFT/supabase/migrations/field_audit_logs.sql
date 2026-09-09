-- Deep Field-Level ERP Audit Trail Schema

CREATE TABLE IF NOT EXISTS field_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    username VARCHAR(100),
    action VARCHAR(50) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(50),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_table_record ON field_audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON field_audit_logs(timestamp);
