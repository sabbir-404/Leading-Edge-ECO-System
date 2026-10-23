-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 075 — Supabase 3 GB Buffer Quota Target, Product Blueprint & Single Size
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Schema Extensions for MAKE Catalog
ALTER TABLE make_products ADD COLUMN IF NOT EXISTS blueprint_url TEXT;
ALTER TABLE make_products ADD COLUMN IF NOT EXISTS size_id BIGINT REFERENCES make_product_sizes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_make_products_size_id ON make_products(size_id);

-- Non-destructive backfill: Populate size_id from existing junction links if empty
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'make_product_size_links') THEN
        UPDATE make_products p
        SET size_id = (
            SELECT size_id
            FROM make_product_size_links l
            WHERE l.product_id = p.id
            ORDER BY l.id ASC
            LIMIT 1
        )
        WHERE p.size_id IS NULL
          AND EXISTS (SELECT 1 FROM make_product_size_links l WHERE l.product_id = p.id);
    END IF;
END $$;

-- 2. Forward Migration of Atomic Quota Capacity Reservation RPC (3 GB Soft Target)
CREATE OR REPLACE FUNCTION public.reserve_buffer_capacity(
    p_reservation_id TEXT,
    p_client_id TEXT,
    p_resource_type TEXT,
    p_bytes BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    -- Application-managed buffer targets (3,000,000,000 bytes soft target)
    TARGET_BUFFER_BYTES CONSTANT BIGINT := 3000000000;    -- 3 GB soft operational target
    STORAGE_CEILING CONSTANT BIGINT := 2200000000;       -- 2.2 GB operational storage allocation
    DATABASE_CEILING CONSTANT BIGINT := 500000000;       -- 500 MB operational database allocation
    HARD_CEILING CONSTANT BIGINT := 3000000000;          -- 3,000,000,000 bytes
    CRITICAL_RESERVE CONSTANT BIGINT := 300000000;       -- 300 MB reserve floor
    MAX_SINGLE_ITEM CONSTANT BIGINT := 50000000;         -- 50 MB max single item

    v_caller TEXT;
    v_total_storage BIGINT := 0;
    v_total_db BIGINT := 0;
    v_grand_total BIGINT := 0;
    v_expires_at TIMESTAMPTZ;
    v_existing_client TEXT;
    v_existing_status TEXT;
    v_existing_bytes BIGINT;
    v_existing_resource_type TEXT;
    v_is_existing_reservation BOOLEAN := FALSE;
    v_accelerated_needed BOOLEAN := FALSE;
BEGIN
    -- 1. Input Validation & Trusted Identity Resolution
    IF p_reservation_id IS NULL OR TRIM(p_reservation_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_RESERVATION_ID');
    END IF;

    -- Authoritative client identity: strictly bound to authenticated auth.uid() when present,
    -- or explicit validated client identity for authenticated desktop client machines.
    -- Anonymous unauthenticated callers are strictly prohibited from consuming buffer quota.
    IF auth.uid() IS NOT NULL THEN
        v_caller := auth.uid()::text;
        IF p_client_id IS NOT NULL AND TRIM(p_client_id) <> '' AND TRIM(p_client_id) <> v_caller THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason', 'CLIENT_IDENTITY_MISMATCH',
                'detail', 'Caller cannot reserve capacity on behalf of a different client ID'
            );
        END IF;
    ELSIF (COALESCE(auth.jwt() ->> 'role', '') IN ('authenticated', 'service_role')) OR session_user IN ('postgres', 'supabase_admin') THEN
        IF p_client_id IS NOT NULL AND TRIM(p_client_id) <> '' THEN
            v_caller := TRIM(p_client_id);
        ELSE
            v_caller := COALESCE(auth.jwt() ->> 'role', 'service_role');
        END IF;
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'AUTHENTICATION_REQUIRED',
            'detail', 'Anonymous quota reservations are prohibited'
        );
    END IF;

    IF v_caller IS NULL OR TRIM(v_caller) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_CLIENT_ID');
    END IF;

    IF p_resource_type NOT IN ('storage', 'database') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_RESOURCE_TYPE');
    END IF;

    IF p_bytes <= 0 THEN
        RETURN jsonb_build_object('success', true, 'reservation_id', p_reservation_id, 'bytes_reserved', 0);
    END IF;

    IF p_bytes > MAX_SINGLE_ITEM THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'SINGLE_ITEM_LIMIT_EXCEEDED',
            'detail', format('Payload size of %s bytes exceeds single item limit of %s bytes', p_bytes, MAX_SINGLE_ITEM)
        );
    END IF;

    -- 2. Concurrency Control: Advisory Transaction Lock
    PERFORM pg_advisory_xact_lock(hashtext('supabase_buffer_quota_lock'));

    -- 3. Check for existing reservation with this ID
    SELECT client_id, status, bytes_reserved, resource_type
    INTO v_existing_client, v_existing_status, v_existing_bytes, v_existing_resource_type
    FROM public.supabase_buffer_reservations
    WHERE id = p_reservation_id;

    IF FOUND THEN
        v_is_existing_reservation := TRUE;

        -- Verify ownership
        IF v_existing_client <> v_caller THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason', 'UNAUTHORIZED_RESERVATION_OWNER',
                'detail', 'Reservation ID already exists and belongs to a different client identity'
            );
        END IF;

        -- Reject mutation of already committed reservation
        IF v_existing_status = 'committed' THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason', 'CANNOT_REOPEN_COMMITTED_RESERVATION',
                'detail', 'A committed reservation cannot be reopened as active without verified reconciliation and pruning'
            );
        END IF;

        -- Reject reservation-ID reuse for closed states
        IF v_existing_status IN ('released', 'pruned', 'expired') THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason', 'RESERVATION_ALREADY_CLOSED',
                'detail', 'Closed reservation ID cannot be reused for new reservations'
            );
        END IF;
    END IF;

    -- 4. Expire stale active reservations (> 5 minutes old)
    UPDATE public.supabase_buffer_reservations
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'active' AND expires_at < NOW();

    -- 5. Calculate cumulative active + committed storage usage
    SELECT COALESCE(SUM(bytes_reserved), 0)
    INTO v_total_storage
    FROM public.supabase_buffer_reservations
    WHERE status IN ('active', 'committed') AND resource_type = 'storage';

    -- 6. Calculate cumulative active + committed database usage
    SELECT COALESCE(SUM(bytes_reserved), 0)
    INTO v_total_db
    FROM public.supabase_buffer_reservations
    WHERE status IN ('active', 'committed') AND resource_type = 'database';

    -- If this is an existing active reservation renewal by the same client, subtract its previous contribution
    IF v_is_existing_reservation AND v_existing_status = 'active' THEN
        IF p_resource_type = 'storage' THEN
            v_total_storage := GREATEST(0, v_total_storage - v_existing_bytes);
        ELSE
            v_total_db := GREATEST(0, v_total_db - v_existing_bytes);
        END IF;
    END IF;

    v_grand_total := v_total_storage + v_total_db;

    -- Check if approaching or crossing 3 GB soft operational target
    IF (v_grand_total + p_bytes) >= TARGET_BUFFER_BYTES THEN
        v_accelerated_needed := TRUE;
    END IF;

    -- 7. Verify Buffer Limits
    -- Soft Operational Target Policy: Crossing 3 GB does not arbitrarily fail uploads
    -- if provider storage has capacity, but flags accelerated reconciliation.
    -- Hard safety limit protects extreme runaway writes beyond 3.5 GB.
    IF (v_grand_total + p_bytes) > (TARGET_BUFFER_BYTES + 500000000) THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'TOTAL_BUFFER_LIMIT_EXCEEDED',
            'grand_total_bytes', v_grand_total,
            'requested_bytes', p_bytes,
            'target_buffer_bytes', TARGET_BUFFER_BYTES,
            'accelerated_reconciliation', true
        );
    END IF;

    -- 8. Upsert Atomic Reservation Record
    v_expires_at := NOW() + INTERVAL '5 minutes';

    INSERT INTO public.supabase_buffer_reservations (
        id, client_id, resource_type, bytes_reserved, status, expires_at, created_at, updated_at
    )
    VALUES (
        p_reservation_id, v_caller, p_resource_type, p_bytes, 'active', v_expires_at, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        bytes_reserved = EXCLUDED.bytes_reserved,
        resource_type = EXCLUDED.resource_type,
        status = 'active',
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', p_reservation_id,
        'bytes_reserved', p_bytes,
        'expires_at', v_expires_at,
        'total_buffered_bytes', v_grand_total + p_bytes,
        'target_buffer_bytes', TARGET_BUFFER_BYTES,
        'accelerated_reconciliation', v_accelerated_needed
    );
END;
$$;

-- 3. Forward Migration of Buffer Quota Status Telemetry RPC
CREATE OR REPLACE FUNCTION public.get_buffer_quota_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_storage BIGINT;
    v_total_db BIGINT;
    v_grand_total BIGINT;
BEGIN
    IF COALESCE(auth.jwt() ->> 'role', '') NOT IN ('authenticated', 'service_role')
       AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'AUTHENTICATION_REQUIRED',
            'detail', 'Anonymous quota telemetry queries are prohibited'
        );
    END IF;

    SELECT
        COALESCE(SUM(CASE WHEN resource_type = 'storage' THEN bytes_reserved ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN resource_type = 'database' THEN bytes_reserved ELSE 0 END), 0)
    INTO v_total_storage, v_total_db
    FROM public.supabase_buffer_reservations
    WHERE status IN ('active', 'committed');

    v_grand_total := v_total_storage + v_total_db;

    RETURN jsonb_build_object(
        'success', true,
        'storage_bytes_used', v_total_storage,
        'storage_ceiling_bytes', 2200000000,
        'database_bytes_used', v_total_db,
        'database_ceiling_bytes', 500000000,
        'total_bytes_used', v_grand_total,
        'hard_ceiling_bytes', 3000000000,
        'target_buffer_bytes', 3000000000,
        'accelerated_reconciliation_needed', v_grand_total >= 2400000000
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_buffer_capacity(TEXT, TEXT, TEXT, BIGINT) TO authenticated, service_role;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'release_buffer_capacity'
    ) THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.release_buffer_capacity(TEXT, TEXT, TEXT, BIGINT) TO authenticated, service_role';
    END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.get_buffer_quota_status() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
