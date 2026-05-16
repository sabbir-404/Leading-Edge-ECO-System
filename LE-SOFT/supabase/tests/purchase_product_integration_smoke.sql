-- Purchase/Product integration smoke test
-- Run manually in Supabase SQL editor. This test intentionally ROLLBACKs,
-- so it validates schema integration without keeping test data.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'low_stock_threshold'
    ) THEN
        RAISE EXCEPTION 'Missing products.low_stock_threshold. Run migration 042_low_stock_alerts_and_notification_routes.sql before this smoke test.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'low_stock_alert_enabled'
    ) THEN
        RAISE EXCEPTION 'Missing products.low_stock_alert_enabled. Run migration 042_low_stock_alerts_and_notification_routes.sql before this smoke test.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'action_path'
    ) THEN
        RAISE EXCEPTION 'Missing notifications.action_path. Run migration 042_low_stock_alerts_and_notification_routes.sql before this smoke test.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'product_origins'
    ) THEN
        RAISE EXCEPTION 'Missing product_origins table. Run migration 040_dynamic_product_origins.sql before this smoke test.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'damaged_goods'
    ) THEN
        RAISE EXCEPTION 'Missing damaged_goods table. Run migration 041_damaged_goods_workflow.sql before this smoke test.';
    END IF;
END $$;

WITH company_row AS (
    INSERT INTO companies (name)
    VALUES ('LE-SOFT Smoke Test Company')
    RETURNING id
),
unit_row AS (
    INSERT INTO units (name, symbol, company_id)
    SELECT 'Smoke Piece', 'spc', id FROM company_row
    RETURNING id
),
stock_group_row AS (
    INSERT INTO stock_groups (name, company_id)
    SELECT 'Smoke Hardware', id FROM company_row
    RETURNING id
),
origin_row AS (
    INSERT INTO product_origins (name, origin_key, requires_superadmin, is_active, company_id)
    SELECT 'Smoke Local', 'SMOKE_LOCAL', FALSE, TRUE, id FROM company_row
    ON CONFLICT (origin_key) DO UPDATE SET is_active = EXCLUDED.is_active
    RETURNING origin_key
),
model_rule_row AS (
    INSERT INTO product_model_rules (
        name,
        origin_type,
        origin_code,
        stock_group_id,
        group_code,
        batch_sequence,
        company_id
    )
    SELECT 'Smoke Model Rule', origin_key, '99', stock_group_row.id, '88', 1, company_row.id
    FROM origin_row, stock_group_row, company_row
    RETURNING id
),
product_row AS (
    INSERT INTO products (
        name,
        sku,
        product_code,
        model_number,
        origin_type,
        import_type_code,
        model_group_code,
        batch_code,
        serial_number,
        unit_id,
        stock_group_id,
        quantity,
        low_stock_threshold,
        low_stock_alert_enabled,
        company_id
    )
    SELECT
        'Smoke Product',
        '99.88.01.0001',
        '99.88.01.0001',
        '99.88.01.0001',
        origin_row.origin_key,
        '99',
        '88',
        '01',
        1,
        unit_row.id,
        stock_group_row.id,
        2,
        5,
        TRUE,
        company_row.id
    FROM origin_row, unit_row, stock_group_row, company_row
    RETURNING id
),
supplier_group_row AS (
    INSERT INTO groups (name, nature, company_id)
    SELECT 'Smoke Sundry Creditors', 'Liabilities', id FROM company_row
    RETURNING id
),
supplier_row AS (
    INSERT INTO ledgers (name, group_id, company_id)
    SELECT 'Smoke Supplier', supplier_group_row.id, company_row.id
    FROM supplier_group_row, company_row
    RETURNING id
),
requisition_row AS (
    INSERT INTO purchase_requisitions (
        requisition_number,
        product_id,
        quantity,
        quantity_unit,
        priority_level,
        status,
        required_delivery_date,
        company_id
    )
    SELECT
        'REQ-SMOKE-0001',
        product_row.id,
        10,
        'spc',
        'MEDIUM',
        'PENDING_ESTIMATE',
        CURRENT_DATE + INTERVAL '7 day',
        company_row.id
    FROM product_row, company_row
    RETURNING id
),
item_row AS (
    INSERT INTO purchase_requisition_items (
        requisition_id,
        line_no,
        product_id,
        quantity,
        quantity_unit,
        company_id
    )
    SELECT requisition_row.id, 1, product_row.id, 10, 'spc', company_row.id
    FROM requisition_row, product_row, company_row
    RETURNING id
),
quote_row AS (
    INSERT INTO purchase_requisition_quotes (
        requisition_id,
        supplier_ledger_id,
        estimated_price,
        remarks
    )
    SELECT requisition_row.id, supplier_row.id, 1234.56, 'Smoke estimate'
    FROM requisition_row, supplier_row
    RETURNING id
),
damage_row AS (
    INSERT INTO damaged_goods (
        product_id,
        source_requisition_id,
        source_type,
        quantity,
        status,
        damage_notes,
        reported_by_name,
        company_id
    )
    SELECT product_row.id, requisition_row.id, 'PURCHASE_RECEIPT', 2, 'DAMAGED', 'Smoke damaged goods', 'smoke-test', company_row.id
    FROM product_row, requisition_row, company_row
    RETURNING id
),
notification_row AS (
    INSERT INTO notifications (
        title,
        message,
        action_path,
        action_label,
        notification_key,
        metadata
    )
    SELECT
        'Smoke low stock',
        'Smoke Product is below threshold',
        '/masters/products/' || product_row.id || '/ledger',
        'Open product ledger',
        'smoke-low-stock-' || product_row.id,
        jsonb_build_object('type', 'low_stock', 'product_id', product_row.id)
    FROM product_row
    RETURNING id
)
SELECT
    product_row.id AS product_id,
    requisition_row.id AS requisition_id,
    item_row.id AS item_id,
    quote_row.id AS quote_id,
    damage_row.id AS damage_id,
    notification_row.id AS notification_id
FROM product_row, requisition_row, item_row, quote_row, damage_row, notification_row;

ROLLBACK;
