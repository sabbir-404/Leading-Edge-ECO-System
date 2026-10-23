-- Restore only the anonymous insert path required by opt-in diagnostics.
-- Operational data remains unavailable to anon; telemetry writes are bounded and cannot be read/updated/deleted.
REVOKE ALL ON TABLE public.client_error_reports FROM PUBLIC, anon;
GRANT INSERT ON TABLE public.client_error_reports TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.client_error_reports_id_seq TO anon;

DROP POLICY IF EXISTS "Allow error report submission" ON public.client_error_reports;
CREATE POLICY "Allow bounded diagnostic submissions"
  ON public.client_error_reports
  FOR INSERT
  TO anon, authenticated, service_role
  WITH CHECK (
    char_length(report_fingerprint) BETWEEN 16 AND 64
    AND char_length(app_version) BETWEEN 1 AND 50
    AND char_length(error_type) BETWEEN 1 AND 100
    AND char_length(error_message_sanitized) <= 4000
    AND (stack_trace_sanitized IS NULL OR char_length(stack_trace_sanitized) <= 12000)
    AND (metadata IS NULL OR (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192))
    AND occurrence_count BETWEEN 1 AND 10000
    AND severity IN ('debug', 'info', 'warning', 'error', 'fatal')
  );
