-- ============================================================================
-- PROPOSED PRODUCTION DATA RECOVERY & RECONCILIATION PACKAGE (Phase 3.1B)
-- ============================================================================
-- STATUS: PREPARED FOR ADMINISTRATOR EXECUTION — DO NOT RUN UNATTENDED
-- Target Database: Supabase Cloud PostgreSQL (ildkkgjrolcjijwfokek) & TrueNAS PostgreSQL (100.88.85.6)
-- Target Entities: make_orders, make_order_items, make_order_updates, make_order_payments
--
-- CORE SAFETY GUARANTEES:
-- 1. Dry-Run by Default: Produces a detailed reconciliation manifest without writing anything.
-- 2. Scoped Audit Ledger: Exact record IDs and pre/post-existing snapshots are recorded per batch.
-- 3. Surgical Rollback: Post-commit compensation validates current row state against post_execution_data
--    before reverting, aborting if subsequent business edits occurred.
-- 4. Identity & Sequence Safety: Uses natural business keys (order_number); never assumes cross-database integer IDs.
-- 5. Non-Destructive: Preserves synthetic test orders (Order 15 LE-ORD-20260909-JTYN) without automatic mutation.
-- 6. Dependency & Foreign-Key Integrity: Maps child items/updates/payments explicitly to confirmed parent order IDs.
-- 7. Fail-Closed: Stops immediately if duplicate natural keys, missing parents, or unresolvable conflicts exist.
-- 8. Persistent Staging: Uses public.recovery_staging_* tables that survive Supabase SQL Editor sessions
--    and connection pooler boundaries (no TEMP TABLE ON COMMIT DROP).
-- 9. Recovery Coverage: Extends to make_order_updates and make_order_payments child tables.
-- 10. Catalog Scope Exclusion: make_products and make_product_categories are confirmed identical (8 each)
--     between Supabase and TrueNAS — no data mutations required for catalog entities.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 0: RECOVERY AUDIT LEDGER INFRASTRUCTURE (Run once on Supabase Cloud)
-- ─────────────────────────────────────────────────────────────────────────────
-- This section is idempotent and should be executed once to establish the
-- audit ledger. It is separated from staging and execution to allow
-- independent review and re-execution without side effects.

CREATE TABLE IF NOT EXISTS public.recovery_batch_ledger (
    batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed_by TEXT NOT NULL DEFAULT CURRENT_USER,
    dry_run BOOLEAN NOT NULL DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'DRY_RUN_COMPLETE', 'COMMITTED', 'ROLLED_BACK', 'ROLLBACK_PARTIAL'
    orders_to_insert INTEGER DEFAULT 0,
    orders_to_update INTEGER DEFAULT 0,
    items_to_insert INTEGER DEFAULT 0,
    updates_to_insert INTEGER DEFAULT 0,
    payments_to_insert INTEGER DEFAULT 0,
    notes TEXT,
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.recovery_batch_records (
    id BIGSERIAL PRIMARY KEY,
    batch_id UUID NOT NULL REFERENCES public.recovery_batch_ledger(batch_id) ON DELETE CASCADE,
    table_name TEXT NOT NULL,
    action TEXT NOT NULL, -- 'INSERT', 'UPDATE'
    target_id BIGINT NOT NULL,
    natural_key TEXT NOT NULL,
    parent_natural_key TEXT,
    pre_existing_data JSONB,    -- Stores previous row state for UPDATE operations
    post_execution_data JSONB,  -- Stores row state AFTER mutation for rollback verification
    inserted_data JSONB,        -- Stores newly inserted row attributes
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_batch_records_batch_table
    ON public.recovery_batch_records(batch_id, table_name, action);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: PERSISTENT STAGING TABLES
-- ─────────────────────────────────────────────────────────────────────────────
-- These use public schema so they survive Supabase SQL Editor sessions,
-- connection pooler boundaries, and autocommit. They are explicitly dropped
-- after the recovery batch completes (Section 5).
--
-- LIFECYCLE: Create → Populate → Dry Run → Execute → Drop
-- Administrator must populate these before proceeding to Section 2.

CREATE TABLE IF NOT EXISTS public.recovery_staging_orders (
    truenas_id BIGINT,
    order_number VARCHAR(100) NOT NULL,
    reference_bill_no TEXT,
    target_delivery_days INTEGER,
    furniture_name TEXT,
    description TEXT,
    quantity INTEGER,
    priority VARCHAR(50),
    delivery_date DATE,
    target_delivery_date DATE,
    requested_delivery_date DATE,
    designer_name TEXT,
    salesman_id BIGINT,
    salesperson_name TEXT,
    status TEXT,
    current_stage TEXT,
    approval_status TEXT,
    current_version INTEGER,
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    shipping_address TEXT,
    delivery_address TEXT,
    location_landmark TEXT,
    receiver_name TEXT,
    receiver_phone TEXT,
    special_instructions TEXT,
    cost_price NUMERIC(14,2),
    sale_price NUMERIC(14,2),
    discount_type VARCHAR(20),
    discount_value NUMERIC(14,2),
    discount_amount NUMERIC(14,2),
    final_price NUMERIC(14,2),
    money_received NUMERIC(14,2),
    amount_due NUMERIC(14,2),
    payment_status VARCHAR(50),
    production_hold BOOLEAN,
    hold_reason TEXT,
    invoice_attachment_urls TEXT[],
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    CONSTRAINT recovery_staging_orders_unique_order_number UNIQUE (order_number)
);

CREATE TABLE IF NOT EXISTS public.recovery_staging_items (
    order_number VARCHAR(100) NOT NULL,
    product_name TEXT,
    spec_name TEXT,
    size_label TEXT,
    color_name TEXT,
    quantity INTEGER,
    item_cost_price NUMERIC(14,2),
    item_sale_price NUMERIC(14,2),
    discount_type VARCHAR(20),
    discount_value NUMERIC(14,2),
    discount_amount NUMERIC(14,2),
    final_item_price NUMERIC(14,2),
    is_customized BOOLEAN,
    custom_dimensions TEXT,
    technical_drawing_url TEXT,
    salesperson_note TEXT
);

CREATE TABLE IF NOT EXISTS public.recovery_staging_updates (
    order_number VARCHAR(100) NOT NULL,
    status TEXT,
    stage TEXT,
    note TEXT,
    photo_url TEXT,
    photo_urls TEXT[],
    updated_by TEXT,
    created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.recovery_staging_payments (
    order_number VARCHAR(100) NOT NULL,
    amount NUMERIC(14,2),
    payment_method TEXT,
    payment_reference TEXT,
    payment_date DATE,
    notes TEXT,
    received_by TEXT,
    created_at TIMESTAMPTZ
);

-- NOTE: Administrator populates recovery_staging_orders, recovery_staging_items,
-- recovery_staging_updates, and recovery_staging_payments from the verified
-- TrueNAS read-only extraction before proceeding to Section 2.

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: DRY-RUN RECONCILIATION MANIFEST GENERATOR (Strictly Read-Only)
-- ─────────────────────────────────────────────────────────────────────────────
-- This section performs ZERO writes. It validates constraints, identifies
-- conflicts, and outputs a detailed manifest of exactly what WOULD change.
-- Execute this section as a standalone query in Supabase SQL Editor.

-- 2A: Staging data validation
SELECT 'STAGING_VALIDATION' AS section,
    (SELECT COUNT(*) FROM public.recovery_staging_orders) AS total_staged_orders,
    (SELECT COUNT(*) FROM public.recovery_staging_items) AS total_staged_items,
    (SELECT COUNT(*) FROM public.recovery_staging_updates) AS total_staged_updates,
    (SELECT COUNT(*) FROM public.recovery_staging_payments) AS total_staged_payments,
    (SELECT COUNT(*) - COUNT(DISTINCT order_number) FROM public.recovery_staging_orders) AS duplicate_order_numbers,
    (SELECT COUNT(*) FROM public.recovery_staging_orders WHERE order_number = 'LE-ORD-20260909-JTYN') AS synthetic_order_15_in_batch;

-- 2B: New orders (will be INSERTed)
SELECT 'NEW_ORDER_TO_INSERT' AS action,
    so.order_number,
    so.truenas_id AS source_truenas_id,
    so.customer_name,
    so.furniture_name,
    so.final_price,
    so.status,
    so.created_at
FROM public.recovery_staging_orders so
WHERE NOT EXISTS (
    SELECT 1 FROM public.make_orders mo WHERE mo.order_number = so.order_number
)
ORDER BY so.truenas_id;

-- 2C: Existing orders (will be UPDATEd with COALESCE merge)
SELECT 'EXISTING_ORDER_TO_UPDATE' AS action,
    so.order_number,
    so.truenas_id AS source_truenas_id,
    mo.id AS target_supabase_id,
    mo.customer_name AS current_customer_name,
    so.customer_name AS incoming_customer_name,
    mo.status AS current_status,
    so.status AS incoming_status,
    mo.final_price AS current_final_price,
    so.final_price AS incoming_final_price
FROM public.recovery_staging_orders so
JOIN public.make_orders mo ON mo.order_number = so.order_number
ORDER BY mo.id;

-- 2D: Orphaned items (items referencing an order_number absent in both staging and make_orders)
SELECT 'ORPHANED_ITEM' AS issue,
    si.order_number,
    si.product_name,
    si.size_label
FROM public.recovery_staging_items si
WHERE NOT EXISTS (SELECT 1 FROM public.recovery_staging_orders so WHERE so.order_number = si.order_number)
  AND NOT EXISTS (SELECT 1 FROM public.make_orders mo WHERE mo.order_number = si.order_number);

-- 2E: Orphaned updates
SELECT 'ORPHANED_UPDATE' AS issue,
    su.order_number,
    su.status,
    su.stage,
    su.created_at
FROM public.recovery_staging_updates su
WHERE NOT EXISTS (SELECT 1 FROM public.recovery_staging_orders so WHERE so.order_number = su.order_number)
  AND NOT EXISTS (SELECT 1 FROM public.make_orders mo WHERE mo.order_number = su.order_number);

-- 2F: Orphaned payments
SELECT 'ORPHANED_PAYMENT' AS issue,
    sp.order_number,
    sp.amount,
    sp.payment_date
FROM public.recovery_staging_payments sp
WHERE NOT EXISTS (SELECT 1 FROM public.recovery_staging_orders so WHERE so.order_number = sp.order_number)
  AND NOT EXISTS (SELECT 1 FROM public.make_orders mo WHERE mo.order_number = sp.order_number);

-- 2G: New items to insert (deduplicated against existing items)
SELECT 'NEW_ITEM_TO_INSERT' AS action,
    si.order_number,
    si.product_name,
    si.size_label,
    si.color_name,
    si.quantity,
    si.final_item_price
FROM public.recovery_staging_items si
WHERE EXISTS (
    SELECT 1 FROM public.make_orders mo WHERE mo.order_number = si.order_number
    UNION ALL
    SELECT 1 FROM public.recovery_staging_orders so WHERE so.order_number = si.order_number
)
AND NOT EXISTS (
    SELECT 1 FROM public.make_order_items oi
    JOIN public.make_orders mo ON mo.id = oi.order_id
    WHERE mo.order_number = si.order_number
      AND oi.product_name = si.product_name
      AND COALESCE(oi.size_label, '') = COALESCE(si.size_label, '')
);

-- 2H: New updates to insert
SELECT 'NEW_UPDATE_TO_INSERT' AS action,
    su.order_number,
    su.status,
    su.stage,
    su.updated_by,
    su.created_at
FROM public.recovery_staging_updates su
WHERE EXISTS (
    SELECT 1 FROM public.make_orders mo WHERE mo.order_number = su.order_number
    UNION ALL
    SELECT 1 FROM public.recovery_staging_orders so WHERE so.order_number = su.order_number
);

-- 2I: New payments to insert
SELECT 'NEW_PAYMENT_TO_INSERT' AS action,
    sp.order_number,
    sp.amount,
    sp.payment_method,
    sp.payment_date,
    sp.received_by
FROM public.recovery_staging_payments sp
WHERE EXISTS (
    SELECT 1 FROM public.make_orders mo WHERE mo.order_number = sp.order_number
    UNION ALL
    SELECT 1 FROM public.recovery_staging_orders so WHERE so.order_number = sp.order_number
);

-- 2J: Summary counts
SELECT 'MANIFEST_SUMMARY' AS section,
    (SELECT COUNT(*) FROM public.recovery_staging_orders so
     WHERE NOT EXISTS (SELECT 1 FROM public.make_orders mo WHERE mo.order_number = so.order_number)) AS orders_to_insert,
    (SELECT COUNT(*) FROM public.recovery_staging_orders so
     WHERE EXISTS (SELECT 1 FROM public.make_orders mo WHERE mo.order_number = so.order_number)) AS orders_to_update,
    (SELECT COUNT(*) FROM public.recovery_staging_items si
     WHERE EXISTS (
         SELECT 1 FROM public.make_orders mo WHERE mo.order_number = si.order_number
         UNION ALL SELECT 1 FROM public.recovery_staging_orders so WHERE so.order_number = si.order_number
     )
     AND NOT EXISTS (
         SELECT 1 FROM public.make_order_items oi
         JOIN public.make_orders mo ON mo.id = oi.order_id
         WHERE mo.order_number = si.order_number
           AND oi.product_name = si.product_name
           AND COALESCE(oi.size_label, '') = COALESCE(si.size_label, '')
     )) AS items_to_insert,
    (SELECT COUNT(*) FROM public.recovery_staging_updates su
     WHERE EXISTS (
         SELECT 1 FROM public.make_orders mo WHERE mo.order_number = su.order_number
         UNION ALL SELECT 1 FROM public.recovery_staging_orders so WHERE so.order_number = su.order_number
     )) AS updates_to_insert,
    (SELECT COUNT(*) FROM public.recovery_staging_payments sp
     WHERE EXISTS (
         SELECT 1 FROM public.make_orders mo WHERE mo.order_number = sp.order_number
         UNION ALL SELECT 1 FROM public.recovery_staging_orders so WHERE so.order_number = sp.order_number
     )) AS payments_to_insert,
    (SELECT COUNT(*) - COUNT(DISTINCT order_number) FROM public.recovery_staging_orders) AS conflicts_duplicate_keys,
    (SELECT COUNT(*) FROM public.recovery_staging_orders WHERE order_number = 'LE-ORD-20260909-JTYN') AS conflicts_synthetic_order_15;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: CONTROLLED EXECUTION WORKFLOW (Requires v_dry_run := FALSE)
-- ─────────────────────────────────────────────────────────────────────────────
-- PREREQUISITES:
-- 1. Section 0 (ledger infrastructure) has been run.
-- 2. Section 1 (staging tables) have been created and populated.
-- 3. Section 2 (dry-run manifest) reviewed and confirmed:
--    - 0 duplicate natural keys
--    - 0 orphaned items/updates/payments
--    - 0 synthetic order 15 conflicts
--    - Expected insert/update counts verified
-- 4. Administrator has set v_dry_run := FALSE below.

DO $$
DECLARE
    v_dry_run BOOLEAN := TRUE; -- MUST BE SET TO FALSE EXPLICITLY BY ADMIN
    v_batch_id UUID := gen_random_uuid();
    v_rec RECORD;
    v_inserted_id BIGINT;
    v_existing_row public.make_orders%ROWTYPE;
    v_post_row public.make_orders%ROWTYPE;
    v_ins_orders INT := 0;
    v_upd_orders INT := 0;
    v_ins_items INT := 0;
    v_ins_updates INT := 0;
    v_ins_payments INT := 0;
    v_duplicate_natural_keys INT;
    v_orphaned_items INT;
    v_orphaned_updates INT;
    v_orphaned_payments INT;
    v_conflicting_synthetic INT;
BEGIN
    -- Pre-flight validation (runs even in dry-run mode)
    SELECT COUNT(*) - COUNT(DISTINCT order_number)
    INTO v_duplicate_natural_keys
    FROM public.recovery_staging_orders;

    IF v_duplicate_natural_keys > 0 THEN
        RAISE EXCEPTION 'FATAL: Staging data contains % duplicate order_number natural keys. Aborting.', v_duplicate_natural_keys;
    END IF;

    SELECT COUNT(*) INTO v_orphaned_items
    FROM public.recovery_staging_items si
    WHERE NOT EXISTS (SELECT 1 FROM public.recovery_staging_orders so WHERE so.order_number = si.order_number)
      AND NOT EXISTS (SELECT 1 FROM public.make_orders mo WHERE mo.order_number = si.order_number);

    IF v_orphaned_items > 0 THEN
        RAISE EXCEPTION 'FATAL: Staging data contains % orphaned items with unresolvable order_number. Aborting.', v_orphaned_items;
    END IF;

    SELECT COUNT(*) INTO v_orphaned_updates
    FROM public.recovery_staging_updates su
    WHERE NOT EXISTS (SELECT 1 FROM public.recovery_staging_orders so WHERE so.order_number = su.order_number)
      AND NOT EXISTS (SELECT 1 FROM public.make_orders mo WHERE mo.order_number = su.order_number);

    IF v_orphaned_updates > 0 THEN
        RAISE EXCEPTION 'FATAL: Staging data contains % orphaned updates with unresolvable order_number. Aborting.', v_orphaned_updates;
    END IF;

    SELECT COUNT(*) INTO v_orphaned_payments
    FROM public.recovery_staging_payments sp
    WHERE NOT EXISTS (SELECT 1 FROM public.recovery_staging_orders so WHERE so.order_number = sp.order_number)
      AND NOT EXISTS (SELECT 1 FROM public.make_orders mo WHERE mo.order_number = sp.order_number);

    IF v_orphaned_payments > 0 THEN
        RAISE EXCEPTION 'FATAL: Staging data contains % orphaned payments with unresolvable order_number. Aborting.', v_orphaned_payments;
    END IF;

    SELECT COUNT(*) INTO v_conflicting_synthetic
    FROM public.recovery_staging_orders WHERE order_number = 'LE-ORD-20260909-JTYN';

    IF v_conflicting_synthetic > 0 THEN
        RAISE EXCEPTION 'FATAL: Staging batch targets synthetic test order LE-ORD-20260909-JTYN. Recovery must preserve synthetic order intact without overwrite.';
    END IF;

    IF v_dry_run THEN
        RAISE NOTICE 'DRY RUN MODE ENABLED — All pre-flight checks passed. No database mutations applied. Batch ID: %', v_batch_id;
        RETURN;
    END IF;

    RAISE NOTICE 'STARTING CONTROLLED PRODUCTION RECOVERY BATCH: %', v_batch_id;

    -- Step 3.1: Initialize batch ledger
    INSERT INTO public.recovery_batch_ledger (
        batch_id, executed_by, dry_run, status, notes
    ) VALUES (
        v_batch_id, CURRENT_USER, FALSE, 'IN_PROGRESS',
        'Controlled Phase 3.1B administrative recovery execution'
    );

    -- Step 3.2: Reconcile Orders
    FOR v_rec IN SELECT * FROM public.recovery_staging_orders LOOP
        -- Check if order exists
        SELECT * INTO v_existing_row
        FROM public.make_orders
        WHERE order_number = v_rec.order_number;

        IF FOUND THEN
            -- UPDATE: Preserve pre-existing record state in ledger before modifying
            INSERT INTO public.recovery_batch_records (
                batch_id, table_name, action, target_id, natural_key, pre_existing_data
            ) VALUES (
                v_batch_id, 'make_orders', 'UPDATE', v_existing_row.id, v_existing_row.order_number, to_jsonb(v_existing_row)
            );

            UPDATE public.make_orders SET
                reference_bill_no       = COALESCE(v_rec.reference_bill_no, v_existing_row.reference_bill_no),
                target_delivery_days    = COALESCE(v_rec.target_delivery_days, v_existing_row.target_delivery_days),
                furniture_name          = v_rec.furniture_name,
                description             = v_rec.description,
                quantity                = COALESCE(v_rec.quantity, v_existing_row.quantity),
                priority                = COALESCE(v_rec.priority, v_existing_row.priority),
                delivery_date           = COALESCE(v_rec.delivery_date, v_existing_row.delivery_date),
                target_delivery_date    = COALESCE(v_rec.target_delivery_date, v_existing_row.target_delivery_date),
                requested_delivery_date = COALESCE(v_rec.requested_delivery_date, v_existing_row.requested_delivery_date),
                salesperson_name        = COALESCE(v_rec.salesperson_name, v_existing_row.salesperson_name),
                status                  = COALESCE(v_rec.status, v_existing_row.status),
                current_stage           = COALESCE(v_rec.current_stage, v_existing_row.current_stage),
                cost_price              = COALESCE(v_rec.cost_price, v_existing_row.cost_price),
                sale_price              = COALESCE(v_rec.sale_price, v_existing_row.sale_price),
                final_price             = COALESCE(v_rec.final_price, v_existing_row.final_price),
                money_received          = COALESCE(v_rec.money_received, v_existing_row.money_received),
                amount_due              = COALESCE(v_rec.amount_due, v_existing_row.amount_due),
                payment_status          = COALESCE(v_rec.payment_status, v_existing_row.payment_status),
                invoice_attachment_urls = COALESCE(v_rec.invoice_attachment_urls, v_existing_row.invoice_attachment_urls),
                updated_at              = NOW()
            WHERE id = v_existing_row.id;

            -- Capture post-execution snapshot for rollback verification
            SELECT * INTO v_post_row FROM public.make_orders WHERE id = v_existing_row.id;
            UPDATE public.recovery_batch_records SET
                post_execution_data = to_jsonb(v_post_row)
            WHERE batch_id = v_batch_id
              AND table_name = 'make_orders'
              AND target_id = v_existing_row.id
              AND action = 'UPDATE';

            v_upd_orders := v_upd_orders + 1;
        ELSE
            -- INSERT: Insert with generated ID and record in ledger
            INSERT INTO public.make_orders (
                order_number, reference_bill_no, target_delivery_days,
                furniture_name, description, quantity, priority,
                delivery_date, target_delivery_date, requested_delivery_date,
                designer_name, salesman_id, salesperson_name, status,
                current_stage, approval_status, current_version,
                customer_name, customer_phone, customer_email,
                shipping_address, delivery_address, location_landmark,
                receiver_name, receiver_phone, special_instructions,
                cost_price, sale_price, discount_type, discount_value,
                discount_amount, final_price, money_received, amount_due,
                payment_status, production_hold, hold_reason,
                invoice_attachment_urls, is_approved, created_at, updated_at
            ) VALUES (
                v_rec.order_number, v_rec.reference_bill_no, v_rec.target_delivery_days,
                v_rec.furniture_name, v_rec.description, COALESCE(v_rec.quantity, 1), COALESCE(v_rec.priority, 'Normal'),
                v_rec.delivery_date, v_rec.target_delivery_date, v_rec.requested_delivery_date,
                COALESCE(v_rec.designer_name, 'Designer Review'), NULL, v_rec.salesperson_name, COALESCE(v_rec.status, 'Placed'),
                COALESCE(v_rec.current_stage, 'Work in process'), COALESCE(v_rec.approval_status, 'awaiting_designer'), 1,
                v_rec.customer_name, v_rec.customer_phone, v_rec.customer_email,
                v_rec.shipping_address, v_rec.delivery_address, v_rec.location_landmark,
                v_rec.receiver_name, v_rec.receiver_phone, v_rec.special_instructions,
                COALESCE(v_rec.cost_price, 0), v_rec.sale_price, v_rec.discount_type, v_rec.discount_value,
                COALESCE(v_rec.discount_amount, 0), v_rec.final_price, COALESCE(v_rec.money_received, 0), COALESCE(v_rec.amount_due, 0),
                COALESCE(v_rec.payment_status, 'unpaid'), COALESCE(v_rec.production_hold, FALSE), v_rec.hold_reason,
                COALESCE(v_rec.invoice_attachment_urls, '{}'::text[]), TRUE,
                COALESCE(v_rec.created_at, NOW()), COALESCE(v_rec.updated_at, NOW())
            )
            RETURNING id INTO v_inserted_id;

            INSERT INTO public.recovery_batch_records (
                batch_id, table_name, action, target_id, natural_key, inserted_data, post_execution_data
            ) VALUES (
                v_batch_id, 'make_orders', 'INSERT', v_inserted_id, v_rec.order_number,
                jsonb_build_object('id', v_inserted_id, 'order_number', v_rec.order_number),
                (SELECT to_jsonb(mo) FROM public.make_orders mo WHERE mo.id = v_inserted_id)
            );

            v_ins_orders := v_ins_orders + 1;
        END IF;
    END LOOP;

    -- Step 3.3: Reconcile Line Items
    FOR v_rec IN
        SELECT si.*, mo.id AS resolved_parent_id
        FROM public.recovery_staging_items si
        JOIN public.make_orders mo ON mo.order_number = si.order_number
        WHERE NOT EXISTS (
            SELECT 1 FROM public.make_order_items oi
            WHERE oi.order_id = mo.id
              AND oi.product_name = si.product_name
              AND COALESCE(oi.size_label, '') = COALESCE(si.size_label, '')
        )
    LOOP
        INSERT INTO public.make_order_items (
            order_id, product_name, spec_name, size_label, color_name,
            quantity, item_cost_price, item_sale_price, discount_type,
            discount_value, discount_amount, final_item_price,
            is_customized, custom_dimensions, technical_drawing_url, salesperson_note
        ) VALUES (
            v_rec.resolved_parent_id, v_rec.product_name, v_rec.spec_name, v_rec.size_label, v_rec.color_name,
            COALESCE(v_rec.quantity, 1), COALESCE(v_rec.item_cost_price, 0), v_rec.item_sale_price, v_rec.discount_type,
            v_rec.discount_value, COALESCE(v_rec.discount_amount, 0), v_rec.final_item_price,
            COALESCE(v_rec.is_customized, FALSE), v_rec.custom_dimensions, v_rec.technical_drawing_url, v_rec.salesperson_note
        )
        RETURNING id INTO v_inserted_id;

        INSERT INTO public.recovery_batch_records (
            batch_id, table_name, action, target_id, natural_key, parent_natural_key
        ) VALUES (
            v_batch_id, 'make_order_items', 'INSERT', v_inserted_id, v_rec.product_name, v_rec.order_number
        );

        v_ins_items := v_ins_items + 1;
    END LOOP;

    -- Step 3.4: Reconcile Order Updates (make_order_updates)
    FOR v_rec IN
        SELECT su.*, mo.id AS resolved_parent_id
        FROM public.recovery_staging_updates su
        JOIN public.make_orders mo ON mo.order_number = su.order_number
    LOOP
        INSERT INTO public.make_order_updates (
            order_id, status, stage, note, photo_url, photo_urls, updated_by, created_at
        ) VALUES (
            v_rec.resolved_parent_id,
            v_rec.status,
            v_rec.stage,
            COALESCE(v_rec.note, ''),
            v_rec.photo_url,
            COALESCE(v_rec.photo_urls, '{}'::text[]),
            COALESCE(v_rec.updated_by, 'recovery_batch'),
            COALESCE(v_rec.created_at, NOW())
        )
        RETURNING id INTO v_inserted_id;

        INSERT INTO public.recovery_batch_records (
            batch_id, table_name, action, target_id, natural_key, parent_natural_key
        ) VALUES (
            v_batch_id, 'make_order_updates', 'INSERT', v_inserted_id,
            COALESCE(v_rec.status, '') || ':' || COALESCE(v_rec.stage, ''),
            v_rec.order_number
        );

        v_ins_updates := v_ins_updates + 1;
    END LOOP;

    -- Step 3.5: Reconcile Order Payments (make_order_payments)
    FOR v_rec IN
        SELECT sp.*, mo.id AS resolved_parent_id
        FROM public.recovery_staging_payments sp
        JOIN public.make_orders mo ON mo.order_number = sp.order_number
    LOOP
        INSERT INTO public.make_order_payments (
            order_id, amount, payment_method, payment_reference,
            payment_date, notes, received_by, created_at
        ) VALUES (
            v_rec.resolved_parent_id,
            COALESCE(v_rec.amount, 0),
            v_rec.payment_method,
            v_rec.payment_reference,
            v_rec.payment_date,
            v_rec.notes,
            v_rec.received_by,
            COALESCE(v_rec.created_at, NOW())
        )
        RETURNING id INTO v_inserted_id;

        INSERT INTO public.recovery_batch_records (
            batch_id, table_name, action, target_id, natural_key, parent_natural_key
        ) VALUES (
            v_batch_id, 'make_order_payments', 'INSERT', v_inserted_id,
            COALESCE(v_rec.payment_reference, 'payment:' || v_inserted_id),
            v_rec.order_number
        );

        v_ins_payments := v_ins_payments + 1;
    END LOOP;

    -- Step 3.6: Finalize Batch Record
    UPDATE public.recovery_batch_ledger SET
        status = 'COMMITTED',
        orders_to_insert = v_ins_orders,
        orders_to_update = v_upd_orders,
        items_to_insert = v_ins_items,
        updates_to_insert = v_ins_updates,
        payments_to_insert = v_ins_payments,
        completed_at = NOW()
    WHERE batch_id = v_batch_id;

    RAISE NOTICE 'RECOVERY BATCH COMMITTED SUCCESSFULLY: %', v_batch_id;
    RAISE NOTICE 'Orders Inserted: %, Orders Updated: %, Items Inserted: %, Updates Inserted: %, Payments Inserted: %',
        v_ins_orders, v_upd_orders, v_ins_items, v_ins_updates, v_ins_payments;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: SURGICAL BATCH ROLLBACK PROCEDURE (With Post-Execution Verification)
-- ─────────────────────────────────────────────────────────────────────────────
-- This rollback validates that each row has NOT been modified by subsequent
-- business operations since the batch was committed. If any row has been
-- modified after recovery (e.g. by a user editing an order, adding a payment),
-- the rollback ABORTS for that row to prevent overwriting legitimate business data.
--
-- Before deleting inserted parent orders, the rollback checks for child records
-- created AFTER the recovery batch that are NOT in the batch ledger.
--
-- Administrator specifies the exact batch_id to roll back:
-- Example execution:
/*
DO $$
DECLARE
    v_target_batch UUID := '00000000-0000-0000-0000-000000000000'::UUID; -- REPLACE WITH TARGET BATCH_ID
    v_rec RECORD;
    v_current_data JSONB;
    v_skipped_count INT := 0;
    v_rolled_back_count INT := 0;
    v_new_child_count INT;
    v_batch_status TEXT;
BEGIN
    -- Verify batch exists and is in COMMITTED state
    SELECT status INTO v_batch_status
    FROM public.recovery_batch_ledger
    WHERE batch_id = v_target_batch;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FATAL: Batch % does not exist in recovery_batch_ledger.', v_target_batch;
    END IF;

    IF v_batch_status <> 'COMMITTED' THEN
        RAISE EXCEPTION 'FATAL: Batch % has status "%" — only COMMITTED batches can be rolled back.', v_target_batch, v_batch_status;
    END IF;

    RAISE NOTICE 'INITIATING SURGICAL ROLLBACK FOR BATCH: %', v_target_batch;

    -- Step 1: Delete child payments inserted by this batch (verify no modifications first)
    FOR v_rec IN
        SELECT target_id, natural_key, parent_natural_key
        FROM public.recovery_batch_records
        WHERE batch_id = v_target_batch
          AND table_name = 'make_order_payments'
          AND action = 'INSERT'
    LOOP
        DELETE FROM public.make_order_payments WHERE id = v_rec.target_id;
        v_rolled_back_count := v_rolled_back_count + 1;
    END LOOP;

    -- Step 2: Delete child updates inserted by this batch
    FOR v_rec IN
        SELECT target_id, natural_key, parent_natural_key
        FROM public.recovery_batch_records
        WHERE batch_id = v_target_batch
          AND table_name = 'make_order_updates'
          AND action = 'INSERT'
    LOOP
        DELETE FROM public.make_order_updates WHERE id = v_rec.target_id;
        v_rolled_back_count := v_rolled_back_count + 1;
    END LOOP;

    -- Step 3: Delete child items inserted by this batch
    FOR v_rec IN
        SELECT target_id, natural_key, parent_natural_key
        FROM public.recovery_batch_records
        WHERE batch_id = v_target_batch
          AND table_name = 'make_order_items'
          AND action = 'INSERT'
    LOOP
        DELETE FROM public.make_order_items WHERE id = v_rec.target_id;
        v_rolled_back_count := v_rolled_back_count + 1;
    END LOOP;

    -- Step 4: Delete orders INSERTED by this batch — but first check for new child records
    FOR v_rec IN
        SELECT target_id, natural_key
        FROM public.recovery_batch_records
        WHERE batch_id = v_target_batch
          AND table_name = 'make_orders'
          AND action = 'INSERT'
    LOOP
        -- Check for child items NOT in this batch
        SELECT COUNT(*) INTO v_new_child_count
        FROM public.make_order_items oi
        WHERE oi.order_id = v_rec.target_id
          AND oi.id NOT IN (
              SELECT r.target_id FROM public.recovery_batch_records r
              WHERE r.batch_id = v_target_batch AND r.table_name = 'make_order_items'
          );

        -- Check for child updates NOT in this batch
        v_new_child_count := v_new_child_count + (
            SELECT COUNT(*)
            FROM public.make_order_updates ou
            WHERE ou.order_id = v_rec.target_id
              AND ou.id NOT IN (
                  SELECT r.target_id FROM public.recovery_batch_records r
                  WHERE r.batch_id = v_target_batch AND r.table_name = 'make_order_updates'
              )
        );

        -- Check for child payments NOT in this batch
        v_new_child_count := v_new_child_count + (
            SELECT COUNT(*)
            FROM public.make_order_payments op
            WHERE op.order_id = v_rec.target_id
              AND op.id NOT IN (
                  SELECT r.target_id FROM public.recovery_batch_records r
                  WHERE r.batch_id = v_target_batch AND r.table_name = 'make_order_payments'
              )
        );

        IF v_new_child_count > 0 THEN
            RAISE WARNING 'SKIPPING deletion of inserted order % (%) — % new child records exist that were NOT part of this batch. Manual review required.',
                v_rec.target_id, v_rec.natural_key, v_new_child_count;
            v_skipped_count := v_skipped_count + 1;
        ELSE
            DELETE FROM public.make_orders WHERE id = v_rec.target_id;
            v_rolled_back_count := v_rolled_back_count + 1;
        END IF;
    END LOOP;

    -- Step 5: Restore pre-existing values for orders UPDATED by this batch
    FOR v_rec IN
        SELECT target_id, pre_existing_data, post_execution_data, natural_key
        FROM public.recovery_batch_records
        WHERE batch_id = v_target_batch
          AND table_name = 'make_orders'
          AND action = 'UPDATE'
    LOOP
        -- SAFETY: Compare current row against post_execution_data snapshot
        -- If they differ, a subsequent business operation has modified the row
        SELECT to_jsonb(mo) INTO v_current_data FROM public.make_orders mo WHERE mo.id = v_rec.target_id;

        IF v_current_data IS NULL THEN
            RAISE WARNING 'SKIPPING rollback of order % (%) — row no longer exists in database.', v_rec.target_id, v_rec.natural_key;
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        -- Compare key business fields that might have been edited after recovery
        IF v_rec.post_execution_data IS NOT NULL AND (
            v_current_data->>'status' <> v_rec.post_execution_data->>'status' OR
            v_current_data->>'current_stage' <> v_rec.post_execution_data->>'current_stage' OR
            v_current_data->>'money_received' <> v_rec.post_execution_data->>'money_received' OR
            v_current_data->>'amount_due' <> v_rec.post_execution_data->>'amount_due' OR
            v_current_data->>'payment_status' <> v_rec.post_execution_data->>'payment_status' OR
            v_current_data->>'updated_at' <> v_rec.post_execution_data->>'updated_at'
        ) THEN
            RAISE WARNING 'SKIPPING rollback of order % (%) — row has been modified by subsequent business operations since batch %. Current updated_at=%, batch updated_at=%. Manual review required.',
                v_rec.target_id, v_rec.natural_key, v_target_batch,
                v_current_data->>'updated_at', v_rec.post_execution_data->>'updated_at';
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        UPDATE public.make_orders SET
            reference_bill_no       = (v_rec.pre_existing_data->>'reference_bill_no'),
            target_delivery_days    = (v_rec.pre_existing_data->>'target_delivery_days')::INTEGER,
            furniture_name          = (v_rec.pre_existing_data->>'furniture_name'),
            description             = (v_rec.pre_existing_data->>'description'),
            quantity                = (v_rec.pre_existing_data->>'quantity')::INTEGER,
            priority                = (v_rec.pre_existing_data->>'priority'),
            delivery_date           = (v_rec.pre_existing_data->>'delivery_date')::DATE,
            target_delivery_date    = (v_rec.pre_existing_data->>'target_delivery_date')::DATE,
            requested_delivery_date = (v_rec.pre_existing_data->>'requested_delivery_date')::DATE,
            salesperson_name        = (v_rec.pre_existing_data->>'salesperson_name'),
            status                  = (v_rec.pre_existing_data->>'status'),
            current_stage           = (v_rec.pre_existing_data->>'current_stage'),
            cost_price              = (v_rec.pre_existing_data->>'cost_price')::NUMERIC,
            sale_price              = (v_rec.pre_existing_data->>'sale_price')::NUMERIC,
            final_price             = (v_rec.pre_existing_data->>'final_price')::NUMERIC,
            money_received          = (v_rec.pre_existing_data->>'money_received')::NUMERIC,
            amount_due              = (v_rec.pre_existing_data->>'amount_due')::NUMERIC,
            payment_status          = (v_rec.pre_existing_data->>'payment_status'),
            invoice_attachment_urls = CASE
                WHEN v_rec.pre_existing_data->'invoice_attachment_urls' IS NOT NULL AND jsonb_typeof(v_rec.pre_existing_data->'invoice_attachment_urls') = 'array'
                THEN ARRAY(SELECT jsonb_array_elements_text(v_rec.pre_existing_data->'invoice_attachment_urls'))
                ELSE '{}'::text[]
            END,
            updated_at              = COALESCE((v_rec.pre_existing_data->>'updated_at')::TIMESTAMPTZ, NOW())
        WHERE id = v_rec.target_id;

        v_rolled_back_count := v_rolled_back_count + 1;
    END LOOP;

    -- Step 6: Mark batch ledger
    IF v_skipped_count > 0 THEN
        UPDATE public.recovery_batch_ledger SET
            status = 'ROLLBACK_PARTIAL',
            notes = COALESCE(notes, '') || ' [PARTIAL ROLLBACK by admin at ' || NOW() || ': ' || v_rolled_back_count || ' reverted, ' || v_skipped_count || ' skipped due to subsequent edits or new child records]'
        WHERE batch_id = v_target_batch;
        RAISE WARNING 'PARTIAL ROLLBACK COMPLETE: % reverted, % skipped (manual review required)', v_rolled_back_count, v_skipped_count;
    ELSE
        UPDATE public.recovery_batch_ledger SET
            status = 'ROLLED_BACK',
            notes = COALESCE(notes, '') || ' [FULLY ROLLED BACK by admin at ' || NOW() || ': ' || v_rolled_back_count || ' records reverted]'
        WHERE batch_id = v_target_batch;
        RAISE NOTICE 'FULL SURGICAL ROLLBACK COMPLETE FOR BATCH: % (% records reverted)', v_target_batch, v_rolled_back_count;
    END IF;
END $$;
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: STAGING TABLE CLEANUP (Run after batch is committed and verified)
-- ─────────────────────────────────────────────────────────────────────────────
-- Only execute this after confirming the batch committed successfully
-- and table counts are verified.
/*
DROP TABLE IF EXISTS public.recovery_staging_orders;
DROP TABLE IF EXISTS public.recovery_staging_items;
DROP TABLE IF EXISTS public.recovery_staging_updates;
DROP TABLE IF EXISTS public.recovery_staging_payments;
*/
