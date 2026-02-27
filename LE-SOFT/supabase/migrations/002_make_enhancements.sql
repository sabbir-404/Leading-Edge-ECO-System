-- ═══════════════════════════════════════════════════════════════
--  Migration 002 — MAKE Section Enhancements
--  Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. PDF attachments array on make_orders
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS pdf_urls TEXT[] DEFAULT '{}';

-- 2. Parts / Dimensions per order
CREATE TABLE IF NOT EXISTS make_order_parts (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES make_orders(id) ON DELETE CASCADE,
  part_name   TEXT NOT NULL,
  length      TEXT DEFAULT '',
  width       TEXT DEFAULT '',
  height      TEXT DEFAULT '',
  notes       TEXT DEFAULT '',
  sort_order  INT  DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mop_order_id ON make_order_parts(order_id);

-- 3. Alteration audit log
CREATE TABLE IF NOT EXISTS make_order_alteration_log (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES make_orders(id) ON DELETE CASCADE,
  altered_by  TEXT NOT NULL,
  user_role   TEXT NOT NULL,
  field_name  TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  altered_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_moal_order_id ON make_order_alteration_log(order_id);

-- 4. Cloud license table (one row ever)
CREATE TABLE IF NOT EXISTS app_license (
  id            BIGSERIAL PRIMARY KEY,
  license_key   TEXT NOT NULL,
  activated_by  TEXT,            -- machine ID that activated first
  app_version   TEXT,
  activated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Supabase Storage bucket for Make order PDFs
-- Create bucket 'make-order-files' (run in Supabase dashboard or via Management API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('make-order-files', 'make-order-files', false)
-- ON CONFLICT DO NOTHING;
