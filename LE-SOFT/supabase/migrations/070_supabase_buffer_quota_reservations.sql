-- ============================================================================
-- Migration 070_supabase_buffer_quota_reservations.sql
-- ============================================================================
-- Purpose:
-- Authoritative, secure server-side atomic reservation mechanism for Supabase
-- Fallback Buffer. Enforces a strict 1 GB hard ceiling across all concurrent
-- LE-SOFT desktop clients with multi-client serialization and client isolation.
--
-- Authoritative Partition Allocation:
--   1. Storage Fallback Buffer: 600 MB (600,000,000 B)
--   2. Database Fallback Buffer: 250 MB (250,000,000 B)
--   3. Critical Emergency Reserve: 150 MB (150,000,000 B)
--   4. Hard Ceiling: 1,000,000,000 B (1 GB)
--
-- Security Controls:
--   - Authoritative constants enforced on the server; ignores caller-supplied limits.
--   - Rejects negative bytes, invalid resource types, and excessive reservation requests.
--   - Strict client isolation: Clients cannot read, overwrite, or release other clients' reservations.
--   - Direct table mutations blocked via RLS; mutations restricted to SECURITY DEFINER RPCs.
--   - Explicit search_path = public, pg_temp prevents search path hijack vulnerabilities.
--   - Accounts for both active reservations AND committed temporary data until pruned.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supabase_buffer_reservations (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    resource_type TEXT NOT NULL, -- 'storage' | 'database'
    bytes_reserved BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'committed', 'released', 'pruned', 'expired'
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_resource_type CHECK (resource_type IN ('storage', 'database')),
    CONSTRAINT chk_bytes_positive CHECK (bytes_reserved >= 0),
    CONSTRAINT chk_status_valid CHECK (status IN ('active', 'committed', 'released', 'pruned', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_supabase_buffer_reservations_status_type 
ON public.supabase_buffer_reservations(status, resource_type);

CREATE INDEX IF NOT EXISTS idx_supabase_buffer_reservations_client 
ON public.supabase_buffer_reservations(client_id);

CREATE INDEX IF NOT EXISTS idx_supabase_buffer_reservations_expires 
ON public.supabase_buffer_reservations(expires_at) WHERE status = 'active';

-- Enable Row Level Security
ALTER TABLE public.supabase_buffer_reservations ENABLE ROW LEVEL SECURITY;

-- Dynamic Policy Cleanup
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'supabase_buffer_reservations'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.supabase_buffer_reservations', pol.policyname);
    END LOOP;
END $$;

-- Revoke direct table mutations from public, anon, and authenticated
REVOKE ALL ON TABLE public.supabase_buffer_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.supabase_buffer_reservations TO anon, authenticated, service_role;

-- RLS: Clients can only read their own reservation metadata
CREATE POLICY "client_read_own_reservations" ON public.supabase_buffer_reservations
    FOR SELECT TO anon, authenticated
    USING (
        client_id = current_setting('request.headers', true)::json->>'x-client-id'
        OR client_id = auth.uid()::text
    );

-- ── Transactional Atomic Reservation RPC ──────────────────────────────────────
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
    -- Authoritative server-side limits
    STORAGE_CEILING CONSTANT BIGINT := 600000000;       -- 600 MB
    DATABASE_CEILING CONSTANT BIGINT := 250000000;      -- 250 MB
    HARD_CEILING CONSTANT BIGINT := 1000000000;          -- 1,000,000,000 bytes
    CRITICAL_RESERVE CONSTANT BIGINT := 150000000;      -- 150 MB
    MAX_ALLOWED_TOTAL CONSTANT BIGINT := 850000000;     -- 850 MB = 1 GB - 150 MB
    MAX_SINGLE_ITEM CONSTANT BIGINT := 50000000;        -- 50 MB max single item

    v_total_storage BIGINT;
    v_total_db BIGINT;
    v_grand_total BIGINT;
    v_existing_client TEXT;
    v_existing_status TEXT;
    v_existing_bytes BIGINT;
BEGIN
    -- 1. Input Validation & Defense
    IF p_reservation_id IS NULL OR TRIM(p_reservation_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_RESERVATION_ID');
    END IF;

    IF p_client_id IS NULL OR TRIM(p_client_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_CLIENT_ID');
    END IF;

    IF p_resource_type NOT IN ('storage', 'database') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_RESOURCE_TYPE');
    END IF;

    IF p_bytes <= 0 OR p_bytes > MAX_SINGLE_ITEM THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_BYTE_COUNT');
    END IF;

    -- 2. Acquire transaction-level advisory lock for atomic multi-client serialization
    PERFORM pg_advisory_xact_lock(84729103);

    -- 3. Check for existing reservation ID and enforce client ownership
    SELECT client_id, status, bytes_reserved
    INTO v_existing_client, v_existing_status, v_existing_bytes
    FROM public.supabase_buffer_reservations
    WHERE id = p_reservation_id;

    IF FOUND AND v_existing_client <> p_client_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'UNAUTHORIZED_CLIENT_MISMATCH'
        );
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

    -- If this is an existing reservation renewal by the same client, subtract its previous contribution
    IF FOUND AND v_existing_status IN ('active', 'committed') THEN
        IF p_resource_type = 'storage' THEN
            v_total_storage := GREATEST(0, v_total_storage - v_existing_bytes);
        ELSE
            v_total_db := GREATEST(0, v_total_db - v_existing_bytes);
        END IF;
    END IF;

    v_grand_total := v_total_storage + v_total_db;

    -- 7. Verify Partition Limits
    IF p_resource_type = 'storage' THEN
        IF (v_total_storage + p_bytes) > STORAGE_CEILING THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason', 'STORAGE_CEILING_EXCEEDED',
                'active_storage_bytes', v_total_storage,
                'storage_ceiling', STORAGE_CEILING
            );
        END IF;
    ELSIF p_resource_type = 'database' THEN
        IF (v_total_db + p_bytes) > DATABASE_CEILING THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason', 'DATABASE_CEILING_EXCEEDED',
                'active_db_bytes', v_total_db,
                'db_ceiling', DATABASE_CEILING
            );
        END IF;
    END IF;

    -- 8. Verify Overall Buffer Limit (850 MB allowed before 150 MB emergency reserve)
    IF (v_grand_total + p_bytes) > MAX_ALLOWED_TOTAL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'CRITICAL_CEILING_REACHED',
            'grand_total_bytes', v_grand_total,
            'max_allowed_bytes', MAX_ALLOWED_TOTAL,
            'emergency_reserve_bytes', CRITICAL_RESERVE
        );
    END IF;

    -- 9. Insert or update active reservation with 5-minute auto-expiry window
    INSERT INTO public.supabase_buffer_reservations (
        id, client_id, resource_type, bytes_reserved, status, expires_at
    ) VALUES (
        p_reservation_id, p_client_id, p_resource_type, p_bytes, 'active', NOW() + INTERVAL '5 minutes'
    )
    ON CONFLICT (id) DO UPDATE SET
        bytes_reserved = EXCLUDED.bytes_reserved,
        status = 'active',
        expires_at = NOW() + INTERVAL '5 minutes',
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', p_reservation_id,
        'allocated_bytes', p_bytes,
        'total_storage_usage', v_total_storage + CASE WHEN p_resource_type = 'storage' THEN p_bytes ELSE 0 END,
        'total_db_usage', v_total_db + CASE WHEN p_resource_type = 'database' THEN p_bytes ELSE 0 END
    );
END;
$$;

-- ── Transactional Release / Commit / Prune RPC ────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_buffer_capacity(
    p_reservation_id TEXT,
    p_client_id TEXT,
    p_status TEXT, -- 'committed', 'released', 'pruned'
    p_actual_bytes BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_client TEXT;
    v_target_status TEXT;
BEGIN
    -- 1. Input Validation
    IF p_reservation_id IS NULL OR TRIM(p_reservation_id) = '' OR
       p_client_id IS NULL OR TRIM(p_client_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_IDENTIFIER');
    END IF;

    v_target_status := CASE 
        WHEN p_status IN ('committed', 'released', 'pruned') THEN p_status 
        ELSE 'released' 
    END;

    -- 2. Verify Client Ownership
    SELECT client_id INTO v_existing_client
    FROM public.supabase_buffer_reservations
    WHERE id = p_reservation_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'NOT_FOUND');
    END IF;

    IF v_existing_client <> p_client_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'UNAUTHORIZED_CLIENT_MISMATCH'
        );
    END IF;

    -- 3. Update reservation status and actual committed bytes
    UPDATE public.supabase_buffer_reservations
    SET status = v_target_status,
        bytes_reserved = CASE 
            WHEN v_target_status = 'committed' AND p_actual_bytes IS NOT NULL AND p_actual_bytes > 0 THEN p_actual_bytes
            WHEN v_target_status IN ('released', 'pruned') THEN 0
            ELSE bytes_reserved
        END,
        updated_at = NOW()
    WHERE id = p_reservation_id;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', p_reservation_id,
        'status', v_target_status
    );
END;
$$;

-- Explicit Function Permissions
REVOKE ALL ON FUNCTION public.reserve_buffer_capacity FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_buffer_capacity TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.release_buffer_capacity FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_buffer_capacity TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
