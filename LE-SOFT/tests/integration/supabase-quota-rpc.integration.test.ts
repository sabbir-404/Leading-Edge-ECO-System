/**
 * tests/integration/supabase-quota-rpc.integration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * [UNIT SIMULATION TEST]
 * Simulation of Migration 070 Supabase Quota Reservation PL/pgSQL Logic.
 *
 * NOTE: This is an in-memory TypeScript unit simulation of the PostgreSQL RPCs:
 *   - reserve_buffer_capacity(reservation_id, client_id, resource_type, bytes)
 *   - release_buffer_capacity(reservation_id, client_id, status, actual_bytes)
 *
 * For live integration tests against an actual PostgreSQL/Supabase staging database,
 * see: tests/integration/supabase-quota-rpc.pg-integration.test.ts.
 *
 * Covers:
 *   1. Authoritative limits (600 MB storage, 250 MB db, 150 MB emergency reserve).
 *   2. Strict client isolation and ownership enforcement (UNAUTHORIZED_CLIENT_MISMATCH).
 *   3. Caller-supplied identity mismatch rejection (CLIENT_IDENTITY_MISMATCH).
 *   4. Client pruning restriction: clients cannot prune; only trusted reconciliation can (UNAUTHORIZED_PRUNING_DENIED).
 *   5. Concurrent capacity race between independent clients.
 *   6. Committed quota retention: committed data continues to count until pruned.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeEach } from 'vitest';

interface ReservationRow {
    id: string;
    client_id: string;
    resource_type: 'storage' | 'database';
    bytes_reserved: number;
    status: 'active' | 'committed' | 'released' | 'pruned' | 'expired';
    expires_at: number;
    created_at: number;
    updated_at: number;
}

class StagingPostgresQuotaEnvironment {
    private reservations = new Map<string, ReservationRow>();

    // Server-authoritative constants from Migration 070
    public static readonly STORAGE_CEILING = 600_000_000;
    public static readonly DATABASE_CEILING = 250_000_000;
    public static readonly HARD_CEILING = 1_000_000_000;
    public static readonly CRITICAL_RESERVE = 150_000_000;
    public static readonly MAX_ALLOWED_TOTAL = 850_000_000;
    public static readonly MAX_SINGLE_ITEM = 50_000_000;

    public reset(): void {
        this.reservations.clear();
    }

    /**
     * Exact simulation of public.reserve_buffer_capacity PostgreSQL RPC
     */
    public reserveBufferCapacity(
        reservationId: string,
        clientId: string,
        resourceType: string,
        bytes: number,
        authUid?: string
    ): { success: boolean; reason?: string; allocated_bytes?: number; total_storage_usage?: number; total_db_usage?: number } {
        // 1. Input Validation & Identity Resolution
        if (!reservationId || reservationId.trim() === '') {
            return { success: false, reason: 'INVALID_RESERVATION_ID' };
        }

        // Enforce authoritative identity resolution
        let caller = '';
        if (authUid) {
            caller = authUid;
            if (clientId && clientId.trim() !== '' && clientId.trim() !== caller) {
                return { success: false, reason: 'CLIENT_IDENTITY_MISMATCH' };
            }
        } else {
            caller = clientId ? clientId.trim() : '';
        }

        if (!caller) {
            return { success: false, reason: 'AUTHENTICATION_REQUIRED' };
        }

        if (resourceType !== 'storage' && resourceType !== 'database') {
            return { success: false, reason: 'INVALID_RESOURCE_TYPE' };
        }

        if (bytes <= 0 || bytes > StagingPostgresQuotaEnvironment.MAX_SINGLE_ITEM) {
            return { success: false, reason: 'INVALID_BYTE_COUNT' };
        }

        // 2. Client Ownership Check
        const existing = this.reservations.get(reservationId);
        if (existing && existing.client_id !== caller) {
            return { success: false, reason: 'UNAUTHORIZED_CLIENT_MISMATCH' };
        }

        // 3. Expire stale active reservations (> 5 minutes old)
        const now = Date.now();
        for (const res of this.reservations.values()) {
            if (res.status === 'active' && res.expires_at < now) {
                res.status = 'expired';
                res.updated_at = now;
            }
        }

        // 4. Calculate cumulative active + committed storage usage
        let totalStorage = 0;
        let totalDb = 0;
        for (const res of this.reservations.values()) {
            if (res.status === 'active' || res.status === 'committed') {
                if (res.resource_type === 'storage') totalStorage += res.bytes_reserved;
                if (res.resource_type === 'database') totalDb += res.bytes_reserved;
            }
        }

        // If renewing existing reservation, subtract previous contribution
        if (existing && (existing.status === 'active' || existing.status === 'committed')) {
            if (resourceType === 'storage') totalStorage = Math.max(0, totalStorage - existing.bytes_reserved);
            if (resourceType === 'database') totalDb = Math.max(0, totalDb - existing.bytes_reserved);
        }

        const grandTotal = totalStorage + totalDb;

        // 5. Partition Limit Verification
        if (resourceType === 'storage') {
            if (totalStorage + bytes > StagingPostgresQuotaEnvironment.STORAGE_CEILING) {
                return { success: false, reason: 'STORAGE_CEILING_EXCEEDED' };
            }
        } else if (resourceType === 'database') {
            if (totalDb + bytes > StagingPostgresQuotaEnvironment.DATABASE_CEILING) {
                return { success: false, reason: 'DATABASE_CEILING_EXCEEDED' };
            }
        }

        // 6. Overall Buffer Verification (850 MB before 150 MB emergency reserve)
        if (grandTotal + bytes > StagingPostgresQuotaEnvironment.MAX_ALLOWED_TOTAL) {
            return { success: false, reason: 'CRITICAL_CEILING_REACHED' };
        }

        // 7. Insert or update active reservation
        this.reservations.set(reservationId, {
            id: reservationId,
            client_id: caller,
            resource_type: resourceType as 'storage' | 'database',
            bytes_reserved: bytes,
            status: 'active',
            expires_at: now + 5 * 60 * 1000,
            created_at: existing ? existing.created_at : now,
            updated_at: now
        });

        return {
            success: true,
            allocated_bytes: bytes,
            total_storage_usage: totalStorage + (resourceType === 'storage' ? bytes : 0),
            total_db_usage: totalDb + (resourceType === 'database' ? bytes : 0)
        };
    }

    /**
     * Exact simulation of public.release_buffer_capacity PostgreSQL RPC
     */
    public releaseBufferCapacity(
        reservationId: string,
        clientId: string,
        status: string,
        actualBytes?: number,
        authUid?: string,
        isTrustedReconciliation = false
    ): { success: boolean; reason?: string; status?: string } {
        if (!reservationId) {
            return { success: false, reason: 'INVALID_IDENTIFIER' };
        }

        let caller = '';
        if (authUid) {
            caller = authUid;
            if (clientId && clientId.trim() !== '' && clientId.trim() !== caller) {
                return { success: false, reason: 'CLIENT_IDENTITY_MISMATCH' };
            }
        } else {
            caller = clientId ? clientId.trim() : '';
        }

        if (!caller) {
            return { success: false, reason: 'AUTHENTICATION_REQUIRED' };
        }

        const targetStatus = (status === 'committed' || status === 'released' || status === 'pruned')
            ? status
            : 'released';

        // Pruning restriction
        if (targetStatus === 'pruned' && !isTrustedReconciliation) {
            return { success: false, reason: 'UNAUTHORIZED_PRUNING_DENIED' };
        }

        const existing = this.reservations.get(reservationId);
        if (!existing) {
            return { success: false, reason: 'NOT_FOUND' };
        }

        if (existing.client_id !== caller && !isTrustedReconciliation) {
            return { success: false, reason: 'UNAUTHORIZED_CLIENT_MISMATCH' };
        }

        // State Machine Transition Enforcement
        if (existing.status === 'active') {
            if (targetStatus !== 'committed' && targetStatus !== 'released') {
                return { success: false, reason: 'INVALID_STATUS_TRANSITION' };
            }
        } else if (existing.status === 'committed') {
            if (targetStatus !== 'pruned') {
                return { success: false, reason: 'COMMITTED_QUOTA_CAN_ONLY_BE_PRUNED' };
            }
        } else if (existing.status === 'released' || existing.status === 'pruned' || existing.status === 'expired') {
            return { success: false, reason: 'RESERVATION_ALREADY_CLOSED' };
        }

        existing.status = targetStatus;
        if (targetStatus === 'committed') {
            existing.bytes_reserved = (actualBytes !== undefined && actualBytes > 0) ? actualBytes : existing.bytes_reserved;
        } else if (targetStatus === 'released' || targetStatus === 'pruned') {
            existing.bytes_reserved = 0;
        }
        existing.updated_at = Date.now();

        return { success: true, status: targetStatus };
    }

    public getCommittedUsage(resourceType: 'storage' | 'database'): number {
        let sum = 0;
        for (const res of this.reservations.values()) {
            if (res.status === 'committed' && res.resource_type === resourceType) {
                sum += res.bytes_reserved;
            }
        }
        return sum;
    }
}

describe('[Unit Simulation] Migration 070 Supabase Quota Reservation Logic', () => {
    let stagingEnv: StagingPostgresQuotaEnvironment;

    beforeEach(() => {
        stagingEnv = new StagingPostgresQuotaEnvironment();
    });

    it('1. Enforces authoritative server ceilings and rejects client over-allocation', () => {
        // Attempt reserving 55 MB in single call (exceeds MAX_SINGLE_ITEM = 50 MB)
        const resOver = stagingEnv.reserveBufferCapacity('res_1', 'client_1', 'storage', 55_000_000);
        expect(resOver.success).toBe(false);
        expect(resOver.reason).toBe('INVALID_BYTE_COUNT');

        // Normal 40 MB reservation succeeds
        const resValid = stagingEnv.reserveBufferCapacity('res_2', 'client_1', 'storage', 40_000_000);
        expect(resValid.success).toBe(true);
        expect(resValid.allocated_bytes).toBe(40_000_000);
    });

    it('2. Enforces strict client isolation and rejects unauthorized client hijacking', () => {
        // Client A reserves 10 MB
        const resA = stagingEnv.reserveBufferCapacity('res_client_a', 'client_A', 'database', 10_000_000);
        expect(resA.success).toBe(true);

        // Client B attempts to overwrite or renew Client A's reservation
        const resB = stagingEnv.reserveBufferCapacity('res_client_a', 'client_B', 'database', 10_000_000);
        expect(resB.success).toBe(false);
        expect(resB.reason).toBe('UNAUTHORIZED_CLIENT_MISMATCH');

        // Client B attempts to release Client A's reservation
        const relB = stagingEnv.releaseBufferCapacity('res_client_a', 'client_B', 'released');
        expect(relB.success).toBe(false);
        expect(relB.reason).toBe('UNAUTHORIZED_CLIENT_MISMATCH');
    });

    it('3. Simulates concurrent client capacity race for final available quota', () => {
        // Fill database storage up to 240 MB (limit is 250 MB)
        for (let i = 0; i < 6; i++) {
            const r = stagingEnv.reserveBufferCapacity(`res_fill_${i}`, 'client_1', 'database', 40_000_000);
            expect(r.success).toBe(true);
            stagingEnv.releaseBufferCapacity(`res_fill_${i}`, 'client_1', 'committed', 40_000_000);
        }

        // Remaining DB capacity is exactly 10 MB
        // Client X requests 8 MB -> succeeds
        const resX = stagingEnv.reserveBufferCapacity('race_x', 'client_X', 'database', 8_000_000);
        expect(resX.success).toBe(true);

        // Client Y concurrently requests 5 MB -> rejected with DATABASE_CEILING_EXCEEDED
        const resY = stagingEnv.reserveBufferCapacity('race_y', 'client_Y', 'database', 5_000_000);
        expect(resY.success).toBe(false);
        expect(resY.reason).toBe('DATABASE_CEILING_EXCEEDED');
    });

    it('4. Enforces committed quota retention: committed data counts until pruned', () => {
        // Reserve and commit 30 MB of storage
        stagingEnv.reserveBufferCapacity('comm_1', 'client_1', 'storage', 30_000_000);
        const commitRes = stagingEnv.releaseBufferCapacity('comm_1', 'client_1', 'committed', 30_000_000);
        expect(commitRes.success).toBe(true);
        expect(commitRes.status).toBe('committed');

        expect(stagingEnv.getCommittedUsage('storage')).toBe(30_000_000);

        // Client attempts to call release on committed quota -> rejected!
        const relAttempt = stagingEnv.releaseBufferCapacity('comm_1', 'client_1', 'released');
        expect(relAttempt.success).toBe(false);
        expect(relAttempt.reason).toBe('COMMITTED_QUOTA_CAN_ONLY_BE_PRUNED');

        // Quota is still counted
        expect(stagingEnv.getCommittedUsage('storage')).toBe(30_000_000);

        // Only after NAS reconciliation and file removal by trusted operator can it transition to 'pruned'
        const pruneRes = stagingEnv.releaseBufferCapacity('comm_1', 'client_1', 'pruned', 0, undefined, true);
        expect(pruneRes.success).toBe(true);
        expect(pruneRes.status).toBe('pruned');
        expect(stagingEnv.getCommittedUsage('storage')).toBe(0);
    });

    it('5. Rejects spoofed client_id when authenticated user mismatch occurs', () => {
        // Authenticated user 'user_auth_123' passes spoofed client_id 'victim_456'
        const res = stagingEnv.reserveBufferCapacity('spoof_1', 'victim_456', 'database', 1_000_000, 'user_auth_123');
        expect(res.success).toBe(false);
        expect(res.reason).toBe('CLIENT_IDENTITY_MISMATCH');
    });

    it('6. Rejects client attempt to prune committed buffer quota without trusted reconciliation credentials', () => {
        stagingEnv.reserveBufferCapacity('comm_prune_test', 'client_1', 'storage', 10_000_000);
        stagingEnv.releaseBufferCapacity('comm_prune_test', 'client_1', 'committed', 10_000_000);

        // Standard client tries to mark as 'pruned' -> denied!
        const clientPrune = stagingEnv.releaseBufferCapacity('comm_prune_test', 'client_1', 'pruned', 0, undefined, false);
        expect(clientPrune.success).toBe(false);
        expect(clientPrune.reason).toBe('UNAUTHORIZED_PRUNING_DENIED');

        // Trusted reconciliation operator succeeds
        const trustedPrune = stagingEnv.releaseBufferCapacity('comm_prune_test', 'client_1', 'pruned', 0, undefined, true);
        expect(trustedPrune.success).toBe(true);
        expect(trustedPrune.status).toBe('pruned');
    });
});

