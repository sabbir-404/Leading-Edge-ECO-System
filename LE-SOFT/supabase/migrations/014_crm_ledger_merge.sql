-- Migration 014_crm_ledger_merge.sql
-- Merges the CRM Customers into the central Billing Customers (Customer Ledger) table
-- Allows a unified Customer base where Leads can be tracked, and sales automatically reflect.

-- 1. Add CRM Fields to the central billing_customers table
ALTER TABLE billing_customers 
    ADD COLUMN IF NOT EXISTS company TEXT,
    ADD COLUMN IF NOT EXISTS crm_interested_products TEXT,
    ADD COLUMN IF NOT EXISTS crm_state TEXT DEFAULT 'Lead', -- e.g., 'Lead', 'Interested', 'Will Contact', 'Converted', 'Lost'
    ADD COLUMN IF NOT EXISTS crm_next_appointment DATE,
    ADD COLUMN IF NOT EXISTS crm_description TEXT;

-- 2. Modify crm_tracking table to point to billing_customers
-- Since LE-SOFT is early in dev we can safely drop the old foreign key and re-attach to billing_customers.
-- If crm_tracking is empty, this is a clean cutover.
ALTER TABLE crm_tracking 
    DROP CONSTRAINT IF EXISTS crm_tracking_customer_id_fkey,
    ADD CONSTRAINT crm_tracking_customer_id_fkey 
        FOREIGN KEY (customer_id) 
        REFERENCES billing_customers(id) 
        ON DELETE CASCADE;

-- 3. We do NOT drop crm_customers just in case legacy data exists, 
-- but we consider it DEPRECATED. The frontend will no longer read/write from it.
