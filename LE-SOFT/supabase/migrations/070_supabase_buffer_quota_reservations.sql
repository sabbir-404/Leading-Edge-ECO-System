-- ============================================================================
-- Migration 070_supabase_buffer_quota_reservations.sql
-- ============================================================================
-- Purpose:
-- Shared server-side atomic reservation mechanism for Supabase Fallback Buffer.
-- Prevents concurrent LE-SOFT desktop clients from exceeding the 1 GB ceiling
-- (600 MB Storage / 250 MB Database / 150 MB Emergency Reserve).
--
-- Features:
--  1. supabase_buffer_reservations table with auto-expiration timestamp.
--  2. Transactional advisory lock serialized RPC: reserve_buffer_capacity().
--  3. Safe reservation release RPC: release_buffer_capacity().
--  4. Anonymous and authenticated client access via RLS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supabase_buffer_reservations (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    resource_type TEXT NOT NULL, -- 'storage' | 'database'
    bytes_reserved BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'committed', 'released', 'expired'
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supabase_buffer_reservations_status_expires 
ON public.supabase_buffer_reservations(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_supabase_buffer_reservations_client 
ON public.supabase_buffer_reservations(client_id);

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

-- Policies allowing client desktop applications to manage buffer reservations
CREATE POLICY "anon_select_buffer_reservations" ON public.supabase_buffer_reservations
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "anon_insert_buffer_reservations" ON public.supabase_buffer_reservations
    FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "anon_update_buffer_reservations" ON public.supabase_buffer_reservations
    FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ── Transactional Reservation RPC ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reserve_buffer_capacity(
    p_reservation_id TEXT,
    p_client_id TEXT,
    p_resource_type TEXT,
    p_bytes BIGINT,
    p_storage_ceiling BIGINT,
    p_db_ceiling BIGINT,
    p_total_ceiling BIGINT,
    p_critical_reserve BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_storage BIGINT;
    v_total_db BIGINT;
    v_grand_total BIGINT;
    v_max_allowed BIGINT;
BEGIN
    -- Acquire exclusive transaction-level advisory lock to serialize concurrent client reservations
    PERFORM pg_advisory_xact_lock(84729103);

    -- 1. Expire stale active reservations (older than expires_at)
    UPDATE public.supabase_buffer_reservations
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'active' AND expires_at < NOW();

    -- 2. Calculate currently active unexpired storage reservations
    SELECT COALESCE(SUM(bytes_reserved), 0)
    INTO v_total_storage
    FROM public.supabase_buffer_reservations
    WHERE status = 'active' AND resource_type = 'storage';

    -- 3. Calculate currently active unexpired database reservations
    SELECT COALESCE(SUM(bytes_reserved), 0)
    INTO v_total_db
    FROM public.supabase_buffer_reservations
    WHERE status = 'active' AND resource_type = 'database';

    -- 4. Calculate effective limits taking into account emergency reserve
    v_max_allowed := p_total_ceiling - p_critical_reserve;
    v_grand_total := v_total_storage + v_total_db;

    -- 5. Check if prospective reservation exceeds partition or total ceiling
    IF p_resource_type = 'storage' THEN
        IF (v_total_storage + p_bytes) > p_storage_ceiling THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason', 'STORAGE_CEILING_EXCEEDED',
                'active_storage_bytes', v_total_storage,
                'storage_ceiling', p_storage_ceiling
            );
        END IF;
    ELSIF p_resource_type = 'database' THEN
        IF (v_total_db + p_bytes) > p_db_ceiling THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason', 'DATABASE_CEILING_EXCEEDED',
                'active_db_bytes', v_total_db,
                'db_ceiling', p_db_ceiling
            );
        END IF;
    END IF;

    IF (v_grand_total + p_bytes) > v_max_allowed THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'CRITICAL_CEILING_REACHED',
            'grand_total_bytes', v_grand_total,
            'max_allowed_bytes', v_max_allowed
        );
    END IF;

    -- 6. Insert or renew active reservation with 5-minute auto-expiry window
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
        'total_active_storage', v_total_storage + CASE WHEN p_resource_type = 'storage' THEN p_bytes ELSE 0 END,
        'total_active_db', v_total_db + CASE WHEN p_resource_type = 'database' THEN p_bytes ELSE 0 END
    );
END;
$$;

-- ── Transactional Release RPC ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_buffer_capacity(
    p_reservation_id TEXT,
    p_status TEXT -- 'committed' or 'released'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.supabase_buffer_reservations
    SET status = CASE WHEN p_status IN ('committed', 'released') THEN p_status ELSE 'released' END,
        updated_at = NOW()
    WHERE id = p_reservation_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

NOTIFY pgrst, 'reload schema';
