-- Migration 010: Quotation Module
-- Run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS quotations (
  id           BIGSERIAL PRIMARY KEY,
  quote_number TEXT NOT NULL,
  quote_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until  DATE,

  -- Customer
  company_name TEXT,
  customer_name TEXT,
  customer_address TEXT,
  customer_mobile TEXT,
  customer_email TEXT,

  -- Concerned person / sales rep
  concerned_name TEXT,
  concerned_phone TEXT,
  concerned_email TEXT,

  -- Totals
  fitting_charge  NUMERIC DEFAULT 0,
  delivery_charge NUMERIC DEFAULT 0,
  discount        NUMERIC DEFAULT 0,
  grand_total     NUMERIC DEFAULT 0,

  -- Meta
  prepared_by     TEXT,
  prepared_by_role TEXT,
  terms_json      JSONB,   -- array of term strings
  notes           TEXT,
  status          TEXT DEFAULT 'Draft',  -- Draft, Sent, Accepted, Rejected

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id             BIGSERIAL PRIMARY KEY,
  quotation_id   BIGINT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  sl_no          INTEGER NOT NULL,
  image_path     TEXT,
  specification  TEXT,
  unit           TEXT DEFAULT 'pcs',
  quantity       NUMERIC DEFAULT 1,
  rate           NUMERIC DEFAULT 0,
  amount         NUMERIC GENERATED ALWAYS AS (quantity * rate) STORED
);

-- Auto-number trigger: quote numbers like Q-20241-001
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
DECLARE
  yr TEXT;
  seq INT;
BEGIN
  yr  := TO_CHAR(NOW(), 'YYYY');
  SELECT COALESCE(MAX(CAST(SPLIT_PART(quote_number, '-', 3) AS INT)), 0) + 1
    INTO seq
    FROM quotations
   WHERE quote_number LIKE 'Q-' || yr || '-%';
  NEW.quote_number := 'Q-' || yr || '-' || LPAD(seq::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_quote_number ON quotations;
CREATE TRIGGER trg_quote_number
  BEFORE INSERT ON quotations
  FOR EACH ROW
  WHEN (NEW.quote_number IS NULL OR NEW.quote_number = '')
  EXECUTE FUNCTION generate_quote_number();
