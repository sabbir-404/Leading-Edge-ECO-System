-- Migration 064: Client Error & Diagnostics Telemetry
-- ─────────────────────────────────────────────────────────────────────────────
-- Provides a dedicated, production-safe error and diagnostic reporting table
-- completely decoupled from operational MAKE data.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_error_reports (
    id BIGSERIAL PRIMARY KEY,
    report_fingerprint VARCHAR(64) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    app_version VARCHAR(50) NOT NULL,
    build_id VARCHAR(100),
    os_name VARCHAR(50),
    os_version VARCHAR(100),
    architecture VARCHAR(50),
    installation_id UUID NOT NULL,
    user_role VARCHAR(50),
    error_type VARCHAR(100) NOT NULL,
    error_message_sanitized TEXT NOT NULL,
    stack_trace_sanitized TEXT,
    source VARCHAR(50) NOT NULL DEFAULT 'unknown',
    severity VARCHAR(20) NOT NULL DEFAULT 'error',
    active_database VARCHAR(20),
    database_state VARCHAR(20),
    failover_reason TEXT,
    operation VARCHAR(100),
    duration_ms NUMERIC,
    retry_count INTEGER DEFAULT 0,
    app_uptime_seconds INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    occurrence_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Targeted indexes for dashboard queries and high-speed aggregation
CREATE INDEX IF NOT EXISTS idx_client_error_reports_occurred_at ON client_error_reports(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_error_reports_fingerprint ON client_error_reports(report_fingerprint);
CREATE INDEX IF NOT EXISTS idx_client_error_reports_app_version ON client_error_reports(app_version);
CREATE INDEX IF NOT EXISTS idx_client_error_reports_installation_id ON client_error_reports(installation_id);
CREATE INDEX IF NOT EXISTS idx_client_error_reports_severity ON client_error_reports(severity);
CREATE INDEX IF NOT EXISTS idx_client_error_reports_active_database ON client_error_reports(active_database);

-- Row Level Security (RLS) enforcement
ALTER TABLE client_error_reports ENABLE ROW LEVEL SECURITY;

-- 1. Submission: Clients (anon and authenticated) may only INSERT sanitized reports
DROP POLICY IF EXISTS "Allow error report submission" ON client_error_reports;
CREATE POLICY "Allow error report submission"
    ON client_error_reports FOR INSERT
    TO anon, authenticated, service_role
    WITH CHECK (true);

-- 2. Reading: Only authenticated administrators and superadmins can read telemetry reports
DROP POLICY IF EXISTS "Allow admin and superadmin to view error reports" ON client_error_reports;
CREATE POLICY "Allow admin and superadmin to view error reports"
    ON client_error_reports FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.auth_id = auth.uid()
            AND users.role IN ('admin', 'superadmin')
        )
    );

-- 3. Service Role: Full access for backend services and migrations
DROP POLICY IF EXISTS "Allow service_role full access to error reports" ON client_error_reports;
CREATE POLICY "Allow service_role full access to error reports"
    ON client_error_reports FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- Explicit privilege grants
GRANT INSERT ON client_error_reports TO anon, authenticated;
GRANT SELECT ON client_error_reports TO authenticated;
GRANT ALL ON client_error_reports TO service_role;
GRANT USAGE, SELECT ON SEQUENCE client_error_reports_id_seq TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Remote Telemetry Retention & Storage Boundary Policy
-- ─────────────────────────────────────────────────────────────────────────────
-- Retains operational diagnostics for 90 days by default (180 days for fatal
-- crash dumps, 30 days for low-severity info/debug logs).
-- Automatically purges expired telemetry records without affecting any
-- operational MAKE data (orders, inventory, catalog, retail transactions, customer accounts).

CREATE OR REPLACE FUNCTION prune_old_client_error_reports(
    default_retention_days INT DEFAULT 90,
    fatal_retention_days INT DEFAULT 180,
    info_retention_days INT DEFAULT 30
)
RETURNS TABLE (deleted_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_deleted BIGINT := 0;
    count_info BIGINT := 0;
    count_general BIGINT := 0;
    count_fatal BIGINT := 0;
BEGIN
    -- 1. Low severity / info test reports (older than info_retention_days)
    DELETE FROM client_error_reports
    WHERE severity IN ('info', 'warning')
      AND occurred_at < (NOW() - (info_retention_days || ' days')::INTERVAL);
    GET DIAGNOSTICS count_info = ROW_COUNT;

    -- 2. General error reports (older than default_retention_days)
    DELETE FROM client_error_reports
    WHERE severity = 'error'
      AND occurred_at < (NOW() - (default_retention_days || ' days')::INTERVAL);
    GET DIAGNOSTICS count_general = ROW_COUNT;

    -- 3. Fatal crashes (older than fatal_retention_days)
    DELETE FROM client_error_reports
    WHERE severity = 'fatal'
      AND occurred_at < (NOW() - (fatal_retention_days || ' days')::INTERVAL);
    GET DIAGNOSTICS count_fatal = ROW_COUNT;

    total_deleted := count_info + count_general + count_fatal;
    RETURN QUERY SELECT total_deleted;
END;
$$;

-- Grant execution to authenticated users and service_role
REVOKE EXECUTE ON FUNCTION prune_old_client_error_reports(INT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prune_old_client_error_reports(INT, INT, INT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

