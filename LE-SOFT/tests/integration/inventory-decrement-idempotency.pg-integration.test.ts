import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

const connectionString = process.env.TEST_POSTGRES_URL;
const postgresDescribe = connectionString ? describe : describe.skip;

postgresDescribe('inventory decrement idempotency RPC (PostgreSQL)', () => {
    let admin: Client;
    let secondary: Client;

    const migrationPath = path.join(
        process.cwd(),
        'supabase/migrations/20261106163000_inventory_decrement_idempotency.sql'
    );

    beforeAll(async () => {
        admin = new Client({ connectionString });
        await admin.connect();

        await admin.query(`
            DO $roles$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    CREATE ROLE anon NOLOGIN;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    CREATE ROLE authenticated NOLOGIN;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
                    CREATE ROLE service_role NOLOGIN;
                END IF;
            END
            $roles$;

            CREATE SCHEMA IF NOT EXISTS auth;
            CREATE OR REPLACE FUNCTION auth.role()
            RETURNS TEXT
            LANGUAGE SQL
            STABLE
            AS $role$
                SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
            $role$;

            CREATE TABLE IF NOT EXISTS public.products (
                id BIGINT PRIMARY KEY,
                quantity INTEGER NOT NULL DEFAULT 0
            );

            DROP FUNCTION IF EXISTS public.apply_inventory_decrement(TEXT, BIGINT, INTEGER);
            DROP TABLE IF EXISTS public.inventory_decrement_operations CASCADE;
        `);

        const migration = fs.readFileSync(migrationPath, 'utf-8');
        await admin.query(migration);
    });

    beforeEach(async () => {
        await admin.query("SET request.jwt.claim.role = 'authenticated'");
        await admin.query('TRUNCATE TABLE public.inventory_decrement_operations');
        await admin.query(`
            INSERT INTO public.products (id, quantity)
            VALUES (1, 50), (2, 50)
            ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity
        `);
    });

    afterAll(async () => {
        if (secondary) await secondary.end();
        if (admin) await admin.end();
    });

    it('applies the same operation ID once when the acknowledgement is retried', async () => {
        const first = await admin.query(
            'SELECT public.apply_inventory_decrement($1, $2, $3) AS result',
            ['same-operation-1', 1, 5]
        );
        const retry = await admin.query(
            'SELECT public.apply_inventory_decrement($1, $2, $3) AS result',
            ['same-operation-1', 1, 5]
        );
        const quantity = await admin.query('SELECT quantity FROM public.products WHERE id = 1');

        expect(first.rows[0].result).toMatchObject({
            success: true,
            already_applied: false,
            quantity_after: 45
        });
        expect(retry.rows[0].result).toMatchObject({
            success: true,
            already_applied: true,
            quantity_after: 45
        });
        expect(quantity.rows[0].quantity).toBe(45);
    });

    it('rejects reusing an operation ID with different product or quantity values', async () => {
        await admin.query(
            'SELECT public.apply_inventory_decrement($1, $2, $3)',
            ['conflicting-operation', 1, 5]
        );

        await expect(admin.query(
            'SELECT public.apply_inventory_decrement($1, $2, $3)',
            ['conflicting-operation', 1, 7]
        )).rejects.toThrow(/reused with different parameters/i);

        const quantity = await admin.query('SELECT quantity FROM public.products WHERE id = 1');
        expect(quantity.rows[0].quantity).toBe(45);
    });

    it('serializes two concurrent requests using the same operation ID', async () => {
        const clientA = new Client({ connectionString });
        const clientB = new Client({ connectionString });
        await Promise.all([clientA.connect(), clientB.connect()]);
        try {
            await Promise.all([
                clientA.query("SET request.jwt.claim.role = 'authenticated'"),
                clientB.query("SET request.jwt.claim.role = 'authenticated'")
            ]);

            const results = await Promise.all([
                clientA.query(
                    'SELECT public.apply_inventory_decrement($1, $2, $3) AS result',
                    ['concurrent-same-op', 1, 10]
                ),
                clientB.query(
                    'SELECT public.apply_inventory_decrement($1, $2, $3) AS result',
                    ['concurrent-same-op', 1, 10]
                )
            ]);

            const quantity = await admin.query('SELECT quantity FROM public.products WHERE id = 1');
            const appliedFlags = results.map(x => x.rows[0].result.already_applied).sort();

            expect(appliedFlags).toEqual([false, true]);
            expect(quantity.rows[0].quantity).toBe(40);
        } finally {
            await Promise.all([clientA.end(), clientB.end()]);
        }
    });

    it('serializes different decrements for one product without losing an update', async () => {
        const clientA = new Client({ connectionString });
        const clientB = new Client({ connectionString });
        await Promise.all([clientA.connect(), clientB.connect()]);
        try {
            await Promise.all([
                clientA.query("SET request.jwt.claim.role = 'authenticated'"),
                clientB.query("SET request.jwt.claim.role = 'authenticated'")
            ]);

            await Promise.all([
                clientA.query(
                    'SELECT public.apply_inventory_decrement($1, $2, $3)',
                    ['concurrent-op-a', 2, 10]
                ),
                clientB.query(
                    'SELECT public.apply_inventory_decrement($1, $2, $3)',
                    ['concurrent-op-b', 2, 15]
                )
            ]);

            const quantity = await admin.query('SELECT quantity FROM public.products WHERE id = 2');
            expect(quantity.rows[0].quantity).toBe(25);
        } finally {
            await Promise.all([clientA.end(), clientB.end()]);
        }
    });

    it('rejects calls from unauthenticated roles', async () => {
        await admin.query("SET request.jwt.claim.role = 'anon'");
        await expect(admin.query(
            'SELECT public.apply_inventory_decrement($1, $2, $3)',
            ['anonymous-operation', 1, 1]
        )).rejects.toThrow(/authenticated application session/i);
    });

    it('rejects invalid quantities and missing products without writing idempotency markers', async () => {
        await expect(admin.query(
            'SELECT public.apply_inventory_decrement($1, $2, $3)',
            ['invalid-quantity', 1, 0]
        )).rejects.toThrow(/positive integer decrement quantity/i);

        await expect(admin.query(
            'SELECT public.apply_inventory_decrement($1, $2, $3)',
            ['missing-product', 9999, 1]
        )).rejects.toThrow(/does not exist/i);

        const markers = await admin.query(
            'SELECT operation_id FROM public.inventory_decrement_operations ORDER BY operation_id'
        );
        expect(markers.rows).toEqual([]);
    });
});
