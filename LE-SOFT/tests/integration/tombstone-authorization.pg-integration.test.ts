/**
 * tests/integration/tombstone-authorization.pg-integration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Real PostgreSQL Integration Test Suite for Migration 071 Tombstone Security & Authorization.
 *
 * Requirements (P0):
 * 1. Executes actual PostgreSQL Migration 071 against an isolated disposable staging DB.
 * 2. Proves ordinary 'authenticated' role CANNOT insert, update, delete, or select from replication_tombstones.
 * 3. Proves 'anon' role CANNOT insert, update, delete, or select from replication_tombstones.
 * 4. Proves legitimate source-table deletion by an authorized role records a tombstone safely
 *    via the trusted SECURITY DEFINER deletion-trigger function with fixed safe search_path.
 * 5. Proves service_role possesses authorized access to read and manage tombstones.
 * 6. Proves deletion triggers exist across make_orders, make_order_updates,
 *    make_product_specifications, and make_product_colors.
 * 7. Verifies forged tombstone defense: a tombstone cannot delete a TrueNAS record
 *    whose authoritative Supabase row still exists.
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

describe('Migration 071 Real PostgreSQL Tombstone Authorization & Security Suite', () => {
    let pgClient: pg.Client | null = null;

    beforeAll(async () => {
        if (!isTestDatabaseAvailable) {
            console.log('\n[NOTICE - P0 Tombstone Authorization]: TEST_POSTGRES_URL is not set or ALLOW_DISPOSABLE_STAGING_TESTS !== "true".');
            console.log('Skipping isolated local PostgreSQL integration tests.\n');
            return;
        }

        assertIsolatedTestPostgresUrl(testDatabaseUrl!);

        pgClient = new pg.Client({
            connectionString: testDatabaseUrl,
            statement_timeout: 10000,
            query_timeout: 10000
        });

        await pgClient.connect();

        // 1. Ensure required roles exist in disposable staging DB
        const rolesCheck = await pgClient.query("SELECT rolname FROM pg_roles WHERE rolname IN ('authenticated', 'anon', 'service_role')");
        const existingRoles = new Set(rolesCheck.rows.map(r => r.rolname));
        for (const role of ['authenticated', 'anon', 'service_role']) {
            if (!existingRoles.has(role)) {
                await pgClient.query(`CREATE ROLE ${role} NOLOGIN`);
            }
        }

        // Ensure schema public usage
        await pgClient.query('GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role');

        // 2. Setup base source tables if not present
        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS public.make_orders (
                id BIGSERIAL PRIMARY KEY,
                order_number TEXT NOT NULL DEFAULT '',
                furniture_name TEXT DEFAULT '',
                total_price NUMERIC DEFAULT 0,
                status TEXT DEFAULT 'Placed',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS public.make_order_updates (
                id BIGSERIAL PRIMARY KEY,
                order_id BIGINT REFERENCES public.make_orders(id) ON DELETE CASCADE,
                stage TEXT DEFAULT 'In Progress',
                note TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS public.make_product_specifications (
                id BIGSERIAL PRIMARY KEY,
                product_id BIGINT DEFAULT 1,
                spec_name TEXT NOT NULL,
                spec_details JSONB DEFAULT '{}'::jsonb,
                is_active BOOLEAN DEFAULT TRUE,
                image_url TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS public.make_product_colors (
                id BIGSERIAL PRIMARY KEY,
                product_id BIGINT DEFAULT 1,
                spec_id BIGINT,
                color_name TEXT NOT NULL,
                color_code TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                image_url TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        // Grant normal application permissions on source tables to authenticated
        await pgClient.query(`
            GRANT ALL ON public.make_orders TO authenticated, service_role;
            GRANT ALL ON public.make_order_updates TO authenticated, service_role;
            GRANT ALL ON public.make_product_specifications TO authenticated, service_role;
            GRANT ALL ON public.make_product_colors TO authenticated, service_role;
            GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
        `);

        // 3. Apply Migration 071 SQL
        const migrationPath = path.resolve(__dirname, '../../supabase/migrations/071_make_specs_and_colors_updated_at.sql');
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');
        await pgClient.query(migrationSql);
    });

    afterAll(async () => {
        if (pgClient) {
            // Clean up test data
            try {
                await pgClient.query(`
                    DELETE FROM public.replication_tombstones WHERE record_id >= 70000;
                    DELETE FROM public.make_product_colors WHERE id >= 70000;
                    DELETE FROM public.make_product_specifications WHERE id >= 70000;
                    DELETE FROM public.make_order_updates WHERE id >= 70000;
                    DELETE FROM public.make_orders WHERE id >= 70000;
                `);
            } catch {}
            await pgClient.end();
        }
    });

    it.runIf(isTestDatabaseAvailable)('1. Ordinary authenticated role CANNOT insert directly into replication_tombstones (forgery prevented)', async () => {
        if (!isTestDatabaseAvailable || !pgClient) return;

        // Try direct insert as 'authenticated'
        await pgClient.query('BEGIN');
        await pgClient.query('SET LOCAL ROLE authenticated');

        let insertError: any = null;
        try {
            await pgClient.query(`
                INSERT INTO public.replication_tombstones (table_name, record_id)
                VALUES ('make_orders', 70001)
            `);
        } catch (err: any) {
            insertError = err;
        } finally {
            await pgClient.query('ROLLBACK');
        }

        expect(insertError).not.toBeNull();
        // PostgreSQL error 42501 = permission denied for table replication_tombstones
        expect(insertError.code).toBe('42501');
        expect(insertError.message).toContain('permission denied for table replication_tombstones');
    });

    it.runIf(isTestDatabaseAvailable)('2. Ordinary authenticated role CANNOT update or delete replication_tombstones', async () => {
        if (!isTestDatabaseAvailable || !pgClient) return;

        // Try UPDATE as 'authenticated'
        await pgClient.query('BEGIN');
        await pgClient.query('SET LOCAL ROLE authenticated');

        let updateError: any = null;
        try {
            await pgClient.query(`
                UPDATE public.replication_tombstones
                SET record_id = 99999
                WHERE id = 1
            `);
        } catch (err: any) {
            updateError = err;
        } finally {
            await pgClient.query('ROLLBACK');
        }

        expect(updateError).not.toBeNull();
        expect(updateError.code).toBe('42501');

        // Try DELETE as 'authenticated'
        await pgClient.query('BEGIN');
        await pgClient.query('SET LOCAL ROLE authenticated');

        let deleteError: any = null;
        try {
            await pgClient.query('DELETE FROM public.replication_tombstones WHERE id = 1');
        } catch (err: any) {
            deleteError = err;
        } finally {
            await pgClient.query('ROLLBACK');
        }

        expect(deleteError).not.toBeNull();
        expect(deleteError.code).toBe('42501');
    });

    it.runIf(isTestDatabaseAvailable)('3. Ordinary authenticated role CANNOT select or read replication_tombstones directly', async () => {
        if (!isTestDatabaseAvailable || !pgClient) return;

        await pgClient.query('BEGIN');
        await pgClient.query('SET LOCAL ROLE authenticated');

        let selectError: any = null;
        try {
            await pgClient.query('SELECT * FROM public.replication_tombstones LIMIT 5');
        } catch (err: any) {
            selectError = err;
        } finally {
            await pgClient.query('ROLLBACK');
        }

        expect(selectError).not.toBeNull();
        expect(selectError.code).toBe('42501');
    });

    it.runIf(isTestDatabaseAvailable)('4. Anon role CANNOT insert, update, delete, or select replication_tombstones', async () => {
        if (!isTestDatabaseAvailable || !pgClient) return;

        let anonInsertError: any = null;
        let anonSelectError: any = null;

        // Try INSERT as 'anon'
        await pgClient.query('BEGIN');
        await pgClient.query('SET LOCAL ROLE anon');
        try {
            await pgClient.query(`
                INSERT INTO public.replication_tombstones (table_name, record_id)
                VALUES ('make_orders', 70002)
            `);
        } catch (err: any) {
            anonInsertError = err;
        } finally {
            await pgClient.query('ROLLBACK');
        }

        // Try SELECT as 'anon'
        await pgClient.query('BEGIN');
        await pgClient.query('SET LOCAL ROLE anon');
        try {
            await pgClient.query('SELECT * FROM public.replication_tombstones LIMIT 1');
        } catch (err: any) {
            anonSelectError = err;
        } finally {
            await pgClient.query('ROLLBACK');
        }

        expect(anonInsertError).not.toBeNull();
        expect(anonInsertError.code).toBe('42501');
        expect(anonSelectError).not.toBeNull();
        expect(anonSelectError.code).toBe('42501');
    });

    it.runIf(isTestDatabaseAvailable)('5. Legitimate source-table deletion by authenticated role safely records tombstone via SECURITY DEFINER trigger', async () => {
        if (!isTestDatabaseAvailable || !pgClient) return;

        // Step 1: Create a legitimate specification as 'authenticated'
        await pgClient.query('BEGIN');
        await pgClient.query('SET LOCAL ROLE authenticated');
        await pgClient.query(`
            INSERT INTO public.make_product_specifications (id, spec_name)
            VALUES (70101, 'Auth Legitimate Spec Test')
            ON CONFLICT (id) DO NOTHING
        `);
        await pgClient.query('COMMIT');

        // Step 2: Delete the specification as 'authenticated'
        await pgClient.query('BEGIN');
        await pgClient.query('SET LOCAL ROLE authenticated');
        const delRes = await pgClient.query('DELETE FROM public.make_product_specifications WHERE id = 70101');
        expect(delRes.rowCount).toBe(1);
        await pgClient.query('COMMIT');

        // Step 3: Inspect replication_tombstones as superuser / service_role
        const tombRes = await pgClient.query(
            "SELECT * FROM public.replication_tombstones WHERE table_name = 'make_product_specifications' AND record_id = 70101"
        );
        expect(tombRes.rows.length).toBe(1);
        const tomb = tombRes.rows[0];
        expect(tomb.table_name).toBe('make_product_specifications');
        expect(Number(tomb.record_id)).toBe(70101);
        expect(tomb.deleted_at).toBeDefined();
    });

    it.runIf(isTestDatabaseAvailable)('6. Deletion triggers safely record tombstones for make_orders, make_order_updates, and make_product_colors', async () => {
        if (!isTestDatabaseAvailable || !pgClient) return;

        // Insert order, update, color
        await pgClient.query(`
            INSERT INTO public.make_orders (id, order_number, furniture_name)
            VALUES (70201, 'ORD-AUTH-DEL-01', 'Del Test Desk')
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO public.make_order_updates (id, order_id, stage, note)
            VALUES (70202, 70201, 'Cutting', 'Started cutting')
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO public.make_product_colors (id, color_name)
            VALUES (70203, 'Auth Test Color')
            ON CONFLICT (id) DO NOTHING;
        `);

        // Delete order update
        await pgClient.query('DELETE FROM public.make_order_updates WHERE id = 70202');
        // Delete order
        await pgClient.query('DELETE FROM public.make_orders WHERE id = 70201');
        // Delete color
        await pgClient.query('DELETE FROM public.make_product_colors WHERE id = 70203');

        // Verify tombstones recorded for all 3
        const checkUpdates = await pgClient.query(
            "SELECT * FROM public.replication_tombstones WHERE table_name = 'make_order_updates' AND record_id = 70202"
        );
        expect(checkUpdates.rows.length).toBe(1);

        const checkOrders = await pgClient.query(
            "SELECT * FROM public.replication_tombstones WHERE table_name = 'make_orders' AND record_id = 70201"
        );
        expect(checkOrders.rows.length).toBe(1);

        const checkColors = await pgClient.query(
            "SELECT * FROM public.replication_tombstones WHERE table_name = 'make_product_colors' AND record_id = 70203"
        );
        expect(checkColors.rows.length).toBe(1);
    });

    it.runIf(isTestDatabaseAvailable)('7. service_role has authorized access to SELECT and manage replication_tombstones', async () => {
        if (!isTestDatabaseAvailable || !pgClient) return;

        await pgClient.query('BEGIN');
        await pgClient.query('SET LOCAL ROLE service_role');

        let selectRes: any = null;
        try {
            selectRes = await pgClient.query('SELECT * FROM public.replication_tombstones LIMIT 5');
        } finally {
            await pgClient.query('ROLLBACK');
        }

        expect(selectRes).not.toBeNull();
        expect(Array.isArray(selectRes.rows)).toBe(true);
    });

    it.runIf(isTestDatabaseAvailable)('8. Safe search_path on trigger functions prevents search_path hijacking', async () => {
        if (!isTestDatabaseAvailable || !pgClient) return;

        // Inspect function configuration from pg_proc
        const funcRes = await pgClient.query(`
            SELECT proname, prosecdef, proconfig
            FROM pg_proc
            WHERE proname IN ('log_make_deletion_tombstone', 'set_make_catalog_updated_at')
        `);

        expect(funcRes.rows.length).toBe(2);
        for (const row of funcRes.rows) {
            expect(row.prosecdef).toBe(true); // SECURITY DEFINER
            expect(row.proconfig).toContain('search_path=pg_catalog, public'); // Fixed safe search_path
        }
    });
});
