-- Migration 060: HRM Holiday Calendar
-- Used for tracking public/government/company holidays
-- These holidays will be excluded from working-day delivery calculations

CREATE TABLE IF NOT EXISTS hrm_holidays (
  id BIGSERIAL PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  holiday_name TEXT NOT NULL,
  holiday_type TEXT DEFAULT 'Public',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE hrm_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access to HRM Holidays" ON hrm_holidays;
CREATE POLICY "Allow authenticated full access to HRM Holidays"
  ON hrm_holidays FOR ALL USING (auth.role() = 'authenticated');
