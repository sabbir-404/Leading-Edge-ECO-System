-- Durable idempotency for stock decrements submitted through the local outbox.
-- Apply to both Supabase Cloud and the authoritative TrueNAS PostgreSQL database.

CREATE TABLE IF NOT EXISTS public.inventory_decrement_operations (
    operation_id TEXT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    quantity_after INTEGER,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_decrement_operations_product
    ON public.inventory_decrement_operations(product_id);

ALTER TABLE public.inventory_decrement_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_decrement_operations FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_inventory_decrement(
    p_operation_id TEXT,
    p_product_id BIGINT,
    p_quantity INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    v_inserted_rows INTEGER;
    v_existing public.inventory_decrement_operations%ROWTYPE;
    v_current_quantity INTEGER;
    v_quantity_after INTEGER;
    v_request_role TEXT;
BEGIN
    v_request_role := COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', TRUE), ''),
        NULLIF(current_setting('request.jwt.claims', TRUE)::JSONB ->> 'role', ''),
        ''
    );

    IF v_request_role NOT IN ('authenticated', 'service_role') THEN
        RAISE EXCEPTION 'Inventory decrement requires an authenticated application session.'
            USING ERRCODE = '42501';
    END IF;

    IF p_operation_id IS NULL OR BTRIM(p_operation_id) = '' OR LENGTH(p_operation_id) > 200 THEN
        RAISE EXCEPTION 'A valid inventory decrement operation ID is required.'
            USING ERRCODE = '22023';
    END IF;

    IF p_product_id IS NULL OR p_product_id <= 0 THEN
        RAISE EXCEPTION 'A positive product ID is required.'
            USING ERRCODE = '22023';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'A positive integer decrement quantity is required.'
            USING ERRCODE = '22023';
    END IF;

    -- The primary key serializes concurrent attempts using the same operation ID.
    INSERT INTO public.inventory_decrement_operations (operation_id, product_id, quantity)
    VALUES (p_operation_id, p_product_id, p_quantity)
    ON CONFLICT (operation_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

    IF v_inserted_rows = 0 THEN
        SELECT *
          INTO v_existing
          FROM public.inventory_decrement_operations
         WHERE operation_id = p_operation_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Inventory decrement idempotency record could not be read.'
                USING ERRCODE = '40001';
        END IF;

        IF v_existing.product_id IS DISTINCT FROM p_product_id
           OR v_existing.quantity IS DISTINCT FROM p_quantity THEN
            RAISE EXCEPTION 'Inventory decrement idempotency key was reused with different parameters.'
                USING ERRCODE = '22023';
        END IF;

        RETURN jsonb_build_object(
            'success', TRUE,
            'already_applied', TRUE,
            'operation_id', p_operation_id,
            'product_id', p_product_id,
            'quantity_after', v_existing.quantity_after
        );
    END IF;

    -- Serialize different decrement operations for the same product row.
    SELECT quantity
      INTO v_current_quantity
      FROM public.products
     WHERE id = p_product_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % does not exist.', p_product_id
            USING ERRCODE = 'P0002';
    END IF;

    v_quantity_after := GREATEST(COALESCE(v_current_quantity, 0) - p_quantity, 0);

    UPDATE public.products
       SET quantity = v_quantity_after
     WHERE id = p_product_id;

    UPDATE public.inventory_decrement_operations
       SET quantity_after = v_quantity_after
     WHERE operation_id = p_operation_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'already_applied', FALSE,
        'operation_id', p_operation_id,
        'product_id', p_product_id,
        'quantity_after', v_quantity_after
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_inventory_decrement(TEXT, BIGINT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_inventory_decrement(TEXT, BIGINT, INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_inventory_decrement(TEXT, BIGINT, INTEGER) IS
    'Atomically decrements product stock once per durable outbox operation ID; safe to retry after ambiguous network acknowledgements.';

NOTIFY pgrst, 'reload schema';
