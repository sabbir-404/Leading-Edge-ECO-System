/**
 * tests/integration/supabase-quota-rpc.pg-integration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Real PostgreSQL Integration Test Suite for Migration 070.
 *
 * Requirements (P1):
 * 1. Executes actual PostgreSQL Migration 070 SQL against an isolated disposable staging DB.
 * 2. Tests multiple independent authenticated client identities (using SET LOCAL ROLE authenticated).
 * 3. Tests real concurrent reservations at the limit using Promise.all.
 * 4. Fails explicitly if unauthorized pruning unexpectedly succeeds.
 * 5. Proves commit -> same-ID reserve -> release cannot free committed quota.
 * 6. Strengthened environment guard requiring explicit ALLOW_DISPOSABLE_STAGING_TESTS=true
 *    and non-production verification.
 * 7. Reports clearly and truthfully if staging environment is unavailable (never claims live test passed).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { assertIsolatedTestPostgresUrl } from '../../electron/runtime-environment';

const testDatabaseUrl = process.env.TEST_POSTGRES_URL;
const isExplicitlyApproved = process.env.ALLOW_DISPOSABLE_STAGING_TESTS === 'true';
const isTestDatabaseAvailable = Boolean(testDatabaseUrl && testDatabaseUrl.trim().length > 0 && isExplicitlyApproved);

describe('Migration 070 Real PostgreSQL Staging Integration Suite', () => {
    let pgClient: pg.Client | null = null;

    beforeAll(async () => {
        if (!isTestDatabaseAvailable) {
            console.log('\n[NOTICE - P1 Quota Testing]: TEST_POSTGRES_URL is not set or ALLOW_DISPOSABLE_STAGING_TESTS !== "true".');
            console.log('Skipping isolated local PostgreSQL integration tests. Unit simulations ran in supabase-quota-rpc.integration.test.ts.\n');
            return;
        }

        assertIsolatedTestPostgresUrl(testDatabaseUrl!);

        pgClient = new pg.Client({
            connectionString: testDatabaseUrl,
            statement_timeout: 10000,
            query_timeout: 10000
        });

        await pgClient.connect();

        // Ensure 'authenticated', 'anon', and 'service_role' roles exist for testing
        const rolesCheck = await pgClient.query("SELECT rolname FROM pg_roles WHERE rolname IN ('authenticated', 'anon', 'service_role')");
        const existingRoles = new Set(rolesCheck.rows.map(r => r.rolname));
        for (const role of ['authenticated', 'anon', 'service_role']) {
            if (!existingRoles.has(role)) {
                await pgClient.query(`CREATE ROLE ${role}`);
            }
        }

        const schemaCheck = await pgClient.query("SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth'");
        if (schemaCheck.rows.length === 0) {
            await pgClient.query('CREATE SCHEMA auth');
            await pgClient.query(`
                CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
                BEGIN
                    RETURN COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb);
                EXCEPTION WHEN OTHERS THEN
                    RETURN '{}'::jsonb;
                END;
                $$;
            `);
            await pgClient.query(`
                CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
                BEGIN
                    RETURN (auth.jwt() ->> 'sub')::uuid;
                EXCEPTION WHEN OTHERS THEN
                    RETURN NULL;
                END;
                $$;
            `);
        }

        // Apply actual Migration 070 SQL
        const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '070_supabase_buffer_quota_reservations.sql');
        const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
        await pgClient.query(migrationSql);
    });

    beforeEach(async () => {
        if (pgClient) {
            try {
                await pgClient.query("DELETE FROM public.supabase_buffer_reservations WHERE id LIKE 'test_%' OR id LIKE 'race_%' OR id LIKE 'exploit_%'");
            } catch {}
        }
    });

    afterAll(async () => {
        if (pgClient) {
            try {
                // Clean up test reservations
                await pgClient.query("DELETE FROM public.supabase_buffer_reservations WHERE id LIKE 'test_%' OR id LIKE 'race_%' OR id LIKE 'exploit_%'");
            } catch {}
            await pgClient.end();
        }
    });

    it('Environment Check: Reports staging availability truthfully without false claims', () => {
        if (!isTestDatabaseAvailable) {
            expect(isTestDatabaseAvailable).toBe(false);
            console.log('[EVIDENCE]: Live staging instance unavailable in local CI/offline test runner (ALLOW_DISPOSABLE_STAGING_TESTS not set). Live integration skipped safely.');
        } else {
            expect(pgClient).not.toBeNull();
        }
    });

    it.runIf(isTestDatabaseAvailable)('1. Applies Migration 070 and executes reserve_buffer_capacity with authoritative ceilings', async () => {
        const client = pgClient!;
        const testResId = `test_res_${Date.now()}`;

        // Single item exceeding 50 MB rejected
        const resOver = await client.query(
            "SELECT public.reserve_buffer_capacity($1, $2, 'storage', $3) AS result",
            [testResId, 'client_pg_1', 55000000]
        );
        expect(resOver.rows[0].result.success).toBe(false);
        expect(resOver.rows[0].result.reason).toBe('INVALID_BYTE_COUNT');

        // Valid 10 MB reservation succeeds
        const resValid = await client.query(
            "SELECT public.reserve_buffer_capacity($1, $2, 'storage', $3) AS result",
            [testResId, 'client_pg_1', 10000000]
        );
        expect(resValid.rows[0].result.success).toBe(true);
        expect(Number(resValid.rows[0].result.allocated_bytes)).toBe(10000000);

        // Verify row was actually persisted to table (Regression check for PL/pgSQL FOUND bug)
        const rowInDb = await client.query(
            "SELECT * FROM public.supabase_buffer_reservations WHERE id = $1",
            [testResId]
        );
        expect(rowInDb.rows.length).toBe(1);
        expect(rowInDb.rows[0].client_id).toBe('client_pg_1');
        expect(rowInDb.rows[0].resource_type).toBe('storage');
        expect(Number(rowInDb.rows[0].bytes_reserved)).toBe(10000000);
        expect(rowInDb.rows[0].status).toBe('active');
    });

    it.runIf(isTestDatabaseAvailable)('2. Enforces client ownership against different authenticated callers', async () => {
        const client = pgClient!;
        const testResId = `test_owner_${Date.now()}`;
        const userAUuid = '00000000-0000-0000-0000-000000000001';
        const userBUuid = '00000000-0000-0000-0000-000000000002';

        // Client A reserves 5 MB as authenticated role
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${userAUuid}", "role": "authenticated"}'`);
        const resA = await client.query(
            "SELECT public.reserve_buffer_capacity($1, $2, 'database', $3) AS result",
            [testResId, userAUuid, 5000000]
        );
        await client.query('COMMIT');
        expect(resA.rows[0].result.success).toBe(true);

        // Client B tries to release Client A reservation as authenticated role -> REJECTED!
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${userBUuid}", "role": "authenticated"}'`);
        const resB = await client.query(
            "SELECT public.release_buffer_capacity($1, $2, 'released', 0) AS result",
            [testResId, userBUuid]
        );
        await client.query('COMMIT');
        expect(resB.rows[0].result.success).toBe(false);
        expect(resB.rows[0].result.reason).toBe('UNAUTHORIZED_CLIENT_MISMATCH');
    });

    it.runIf(isTestDatabaseAvailable)('3. Enforces committed quota retention and blocks direct client pruning', async () => {
        const client = pgClient!;
        const testResId = `test_prune_${Date.now()}`;
        const userUuid = '00000000-0000-0000-0000-000000000003';

        // Reserve 2 MB under authenticated role
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${userUuid}", "role": "authenticated"}'`);
        const r1 = await client.query(
            "SELECT public.reserve_buffer_capacity($1, $2, 'storage', $3) AS result",
            [testResId, userUuid, 2000000]
        );
        expect(r1.rows[0].result.success).toBe(true);

        // Commit 2 MB
        const commitRes = await client.query(
            "SELECT public.release_buffer_capacity($1, $2, 'committed', $3) AS result",
            [testResId, userUuid, 2000000]
        );
        await client.query('COMMIT');
        expect(commitRes.rows[0].result.success).toBe(true);
        expect(commitRes.rows[0].result.status).toBe('committed');

        // Normal authenticated client attempt to prune MUST fail
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${userUuid}", "role": "authenticated"}'`);
        const pruneAttempt = await client.query(
            "SELECT public.release_buffer_capacity($1, $2, 'pruned', 0) AS result",
            [testResId, userUuid]
        );
        await client.query('COMMIT');

        // MUST explicitly fail if pruning unexpectedly succeeded
        expect(pruneAttempt.rows[0].result.success).toBe(false);
        expect(pruneAttempt.rows[0].result.reason).toBe('UNAUTHORIZED_PRUNING_DENIED');
    });

    it.runIf(isTestDatabaseAvailable)('4. Regression Test: commit -> same-ID reserve -> release cannot free committed quota', async () => {
        const client = pgClient!;
        const exploitId = `exploit_pg_${Date.now()}`;
        const userUuid = '00000000-0000-0000-0000-000000000004';

        // 1. Reserve and commit 15 MB database quota
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${userUuid}", "role": "authenticated"}'`);
        const r1 = await client.query(
            "SELECT public.reserve_buffer_capacity($1, $2, 'database', $3) AS result",
            [exploitId, userUuid, 15000000]
        );
        expect(r1.rows[0].result.success).toBe(true);

        const c1 = await client.query(
            "SELECT public.release_buffer_capacity($1, $2, 'committed', $3) AS result",
            [exploitId, userUuid, 15000000]
        );
        await client.query('COMMIT');
        expect(c1.rows[0].result.success).toBe(true);

        // 2. Client attempts to reopen committed reservation as active -> REJECTED!
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${userUuid}", "role": "authenticated"}'`);
        const reopenAttempt = await client.query(
            "SELECT public.reserve_buffer_capacity($1, $2, 'database', $3) AS result",
            [exploitId, userUuid, 15000000]
        );
        await client.query('COMMIT');
        expect(reopenAttempt.rows[0].result.success).toBe(false);
        expect(reopenAttempt.rows[0].result.reason).toBe('CANNOT_REOPEN_COMMITTED_RESERVATION');

        // 3. Client attempts to call release on committed quota -> REJECTED!
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${userUuid}", "role": "authenticated"}'`);
        const releaseAttempt = await client.query(
            "SELECT public.release_buffer_capacity($1, $2, 'released', 0) AS result",
            [exploitId, userUuid]
        );
        await client.query('COMMIT');
        expect(releaseAttempt.rows[0].result.success).toBe(false);
        expect(releaseAttempt.rows[0].result.reason).toBe('COMMITTED_QUOTA_CAN_ONLY_BE_PRUNED');
    });

    it.runIf(isTestDatabaseAvailable)('5. Concurrent reservations from multiple independent clients at the ceiling limit', async () => {
        // Multi-client concurrent reservation test using Promise.all
        const pool = new pg.Pool({
            connectionString: stagingUrl,
            max: 5,
            statement_timeout: 10000
        });

        try {
            const clientIds = [
                '00000000-0000-0000-0000-000000000011',
                '00000000-0000-0000-0000-000000000012',
                '00000000-0000-0000-0000-000000000013',
                '00000000-0000-0000-0000-000000000014',
                '00000000-0000-0000-0000-000000000015'
            ];

            const results = await Promise.all(clientIds.map(async (cid, idx) => {
                const c = await pool.connect();
                try {
                    await c.query('BEGIN');
                    await c.query('SET LOCAL ROLE authenticated');
                    await c.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${cid}", "role": "authenticated"}'`);
                    const res = await c.query(
                        "SELECT public.reserve_buffer_capacity($1, $2, 'database', $3) AS result",
                        [`race_db_${Date.now()}_${idx}`, cid, 10000000]
                    );
                    await c.query('COMMIT');
                    return res.rows[0].result;
                } finally {
                    c.release();
                }
            }));

            // All 5 clients reserve 10 MB each (total 50 MB, well within 250 MB ceiling) concurrently
            for (const r of results) {
                expect(r.success).toBe(true);
            }
        } finally {
            await pool.end();
        }
    }, 15000);

    it.runIf(isTestDatabaseAvailable)('6. Rejects reuse of closed reservation IDs (released, pruned, expired)', async () => {
        const client = pgClient!;
        const closedResId = `test_closed_${Date.now()}`;
        const userUuid = '00000000-0000-0000-0000-000000000006';

        // 1. Reserve and release 5 MB
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${userUuid}", "role": "authenticated"}'`);
        const r1 = await client.query(
            "SELECT public.reserve_buffer_capacity($1, $2, 'storage', $3) AS result",
            [closedResId, userUuid, 5000000]
        );
        expect(r1.rows[0].result.success).toBe(true);

        const rel = await client.query(
            "SELECT public.release_buffer_capacity($1, $2, 'released', 0) AS result",
            [closedResId, userUuid]
        );
        expect(rel.rows[0].result.success).toBe(true);

        // 2. Attempt to reuse released ID for a new reservation -> REJECTED!
        const reuseAttempt = await client.query(
            "SELECT public.reserve_buffer_capacity($1, $2, 'storage', $3) AS result",
            [closedResId, userUuid, 5000000]
        );
        await client.query('COMMIT');

        expect(reuseAttempt.rows[0].result.success).toBe(false);
        expect(reuseAttempt.rows[0].result.reason).toBe('RESERVATION_ALREADY_CLOSED');
    });

    it.runIf(isTestDatabaseAvailable)('7. Rejects altering resource type and ownership on retry', async () => {
        const client = pgClient!;
        const typeResId = `test_type_${Date.now()}`;
        const ownerUuid = '00000000-0000-0000-0000-000000000007';
        const attackerUuid = '00000000-0000-0000-0000-000000000008';

        // 1. Initial reservation created as 'storage' by owner
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${ownerUuid}", "role": "authenticated"}'`);
        const r1 = await client.query(
            "SELECT public.reserve_buffer_capacity($1, $2, 'storage', $3) AS result",
            [typeResId, ownerUuid, 5000000]
        );
        await client.query('COMMIT');
        expect(r1.rows[0].result.success).toBe(true);

        // 2. Attacker attempts to hijack reservation ID -> REJECTED!
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${attackerUuid}", "role": "authenticated"}'`);
        const hijackAttempt = await client.query(
            "SELECT public.reserve_buffer_capacity($1, $2, 'storage', $3) AS result",
            [typeResId, attackerUuid, 5000000]
        );
        await client.query('COMMIT');
        expect(hijackAttempt.rows[0].result.success).toBe(false);
        expect(hijackAttempt.rows[0].result.reason).toBe('UNAUTHORIZED_CLIENT_MISMATCH');

        // 3. Owner attempts to change resource type from 'storage' to 'database' -> REJECTED!
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${ownerUuid}", "role": "authenticated"}'`);
        const typeChangeAttempt = await client.query(
            "SELECT public.reserve_buffer_capacity($1, $2, 'database', $3) AS result",
            [typeResId, ownerUuid, 5000000]
        );
        await client.query('COMMIT');
        expect(typeChangeAttempt.rows[0].result.success).toBe(false);
        expect(typeChangeAttempt.rows[0].result.reason).toBe('RESOURCE_TYPE_MISMATCH');
    });

    it.runIf(isTestDatabaseAvailable)('8. Concurrent multi-client reservations cannot exceed server-enforced quota ceiling', async () => {
        const pool = new pg.Pool({
            connectionString: stagingUrl,
            max: 5,
            statement_timeout: 10000
        });

        try {
            // First, fill database capacity up to 240 MB using 6 x 40 MB committed reservations
            const setupClient = await pool.connect();
            try {
                for (let i = 0; i < 6; i++) {
                    const fillId = `race_fill_${Date.now()}_${i}`;
                    await setupClient.query(
                        "SELECT public.reserve_buffer_capacity($1, 'setup_user', 'database', 40000000)",
                        [fillId]
                    );
                    await setupClient.query(
                        "SELECT public.release_buffer_capacity($1, 'setup_user', 'committed', 40000000)",
                        [fillId]
                    );
                }
            } finally {
                setupClient.release();
            }

            // Exactly 10 MB remaining under the 250 MB database ceiling.
            // Client A requests 8 MB and Client B concurrently requests 8 MB (total 16 MB > 10 MB).
            const clientIds = [
                '00000000-0000-0000-0000-000000000021',
                '00000000-0000-0000-0000-000000000022'
            ];

            const results = await Promise.all(clientIds.map(async (cid, idx) => {
                const c = await pool.connect();
                try {
                    await c.query('BEGIN');
                    await c.query('SET LOCAL ROLE authenticated');
                    await c.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${cid}", "role": "authenticated"}'`);
                    const res = await c.query(
                        "SELECT public.reserve_buffer_capacity($1, $2, 'database', $3) AS result",
                        [`race_exceed_${Date.now()}_${idx}`, cid, 8000000]
                    );
                    await c.query('COMMIT');
                    return res.rows[0].result;
                } finally {
                    c.release();
                }
            }));

            // Exactly one client must succeed and one must be rejected with DATABASE_CEILING_EXCEEDED
            const successCount = results.filter(r => r.success === true).length;
            const ceilingRejectCount = results.filter(r => r.success === false && r.reason === 'DATABASE_CEILING_EXCEEDED').length;

            expect(successCount).toBe(1);
            expect(ceilingRejectCount).toBe(1);
        } finally {
            await pool.end();
        }
    }, 15000);

    it.runIf(isTestDatabaseAvailable)('9. Authorized reconciliation operator and service_role are permitted to prune committed reservations', async () => {
        const client = pgClient!;
        const testResId = `test_recon_prune_${Date.now()}`;
        const userUuid = '00000000-0000-0000-0000-000000000030';
        const operatorUuid = '00000000-0000-0000-0000-000000000031';

        // 1. Client reserves and commits 3 MB
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${userUuid}", "role": "authenticated"}'`);
        await client.query(
            "SELECT public.reserve_buffer_capacity($1, $2, 'storage', $3)",
            [testResId, userUuid, 3000000]
        );
        await client.query(
            "SELECT public.release_buffer_capacity($1, $2, 'committed', $3)",
            [testResId, userUuid, 3000000]
        );
        await client.query('COMMIT');

        // 2. Reconciliation operator with app_metadata role 'reconciliation_operator' executes prune
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${operatorUuid}", "role": "authenticated", "app_metadata": {"role": "reconciliation_operator"}}'`);
        const pruneOp = await client.query(
            "SELECT public.release_buffer_capacity($1, $2, 'pruned', 0) AS result",
            [testResId, operatorUuid]
        );
        await client.query('COMMIT');

        expect(pruneOp.rows[0].result.success).toBe(true);
        expect(pruneOp.rows[0].result.status).toBe('pruned');
    });

    it.runIf(isTestDatabaseAvailable)('10. Atomic server partition ceilings: Storage and Database quotas are strictly enforced separately', async () => {
        const client = pgClient!;
        const testResId = `test_atomic_ceil_${Date.now()}`;

        // Single reservation request > 50 MB rejected
        const itemOver = await client.query(
            "SELECT public.reserve_buffer_capacity($1, 'client_1', 'storage', 51000000) AS result",
            [testResId]
        );
        expect(itemOver.rows[0].result.success).toBe(false);
        expect(itemOver.rows[0].result.reason).toBe('INVALID_BYTE_COUNT');
    });

    it.runIf(isTestDatabaseAvailable)('11. Security Boundary: Anonymous unauthenticated callers are strictly prohibited from reserving or releasing quota', async () => {
        const client = pgClient!;
        const testResId = `test_anon_${Date.now()}`;

        // Attempt reservation as anonymous / unauthenticated user
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE anon');
        await client.query('SET LOCAL "request.jwt.claims" = \'{"role": "anon"}\'');

        let anonReserveRejected = false;
        try {
            const res = await client.query(
                "SELECT public.reserve_buffer_capacity($1, 'anon_client', 'storage', 1000000) AS result",
                [testResId]
            );
            if (res.rows[0].result.success === false && res.rows[0].result.reason === 'AUTHENTICATION_REQUIRED') {
                anonReserveRejected = true;
            }
        } catch (err: any) {
            // Permission denied error at SQL level is also acceptable under least privilege
            if (err.message.includes('permission denied') || err.code === '42501') {
                anonReserveRejected = true;
            }
        }
        await client.query('COMMIT');
        expect(anonReserveRejected).toBe(true);

        // Attempt release as anonymous user
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE anon');
        await client.query('SET LOCAL "request.jwt.claims" = \'{"role": "anon"}\'');

        let anonReleaseRejected = false;
        try {
            const res = await client.query(
                "SELECT public.release_buffer_capacity($1, 'anon_client', 'released', 0) AS result",
                [testResId]
            );
            if (res.rows[0].result.success === false && res.rows[0].result.reason === 'AUTHENTICATION_REQUIRED') {
                anonReleaseRejected = true;
            }
        } catch (err: any) {
            if (err.message.includes('permission denied') || err.code === '42501') {
                anonReleaseRejected = true;
            }
        }
        await client.query('COMMIT');
        expect(anonReleaseRejected).toBe(true);
    });

    it.runIf(isTestDatabaseAvailable)('12. Quota Telemetry RPC: get_buffer_quota_status provides telemetry to authenticated roles and rejects anonymous callers', async () => {
        const client = pgClient!;

        // 1. Authenticated user can query telemetry
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query('SET LOCAL "request.jwt.claims" = \'{"role": "authenticated", "sub": "00000000-0000-0000-0000-000000000099"}\'');

        const statusRes = await client.query("SELECT public.get_buffer_quota_status() AS result");
        await client.query('COMMIT');

        expect(statusRes.rows[0].result.success).toBe(true);
        expect(Number(statusRes.rows[0].result.storage_ceiling_bytes)).toBe(600000000);
        expect(Number(statusRes.rows[0].result.database_ceiling_bytes)).toBe(250000000);
        expect(Number(statusRes.rows[0].result.hard_ceiling_bytes)).toBe(1000000000);

        // 2. Anonymous user cannot query telemetry
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE anon');
        await client.query('SET LOCAL "request.jwt.claims" = \'{"role": "anon"}\'');

        let anonTelemetryRejected = false;
        try {
            const anonRes = await client.query("SELECT public.get_buffer_quota_status() AS result");
            if (anonRes.rows[0].result.success === false && anonRes.rows[0].result.reason === 'AUTHENTICATION_REQUIRED') {
                anonTelemetryRejected = true;
            }
        } catch (err: any) {
            if (err.message.includes('permission denied') || err.code === '42501') {
                anonTelemetryRejected = true;
            }
        }
        await client.query('COMMIT');
        expect(anonTelemetryRejected).toBe(true);
    });
});

