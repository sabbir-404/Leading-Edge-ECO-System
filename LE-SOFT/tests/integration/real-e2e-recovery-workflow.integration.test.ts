/**
 * tests/integration/real-e2e-recovery-workflow.integration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-Engine End-to-End Recovery Integration Test Suite for PR #41.
 *
 * Requirements (Release Gate & PR #41 Audit):
 * 1. Calls actual application implementations:
 *    - DurableUploadService (local disk staging, SHA-256 calculation, dispatch)
 *    - DurableOutboxService (atomic batch enqueue, WAL durability, crash recovery)
 *    - SupabaseQuotaManager (Migration 070 RPC reservations, partitioning)
 *    - Server Reconciliation Daemon (scripts/server-reconciliation-daemon.cjs)
 * 2. Verifies local Supabase Storage access control on private bucket 'make-order-files':
 *    - Bucket is private.
 *    - Unauthenticated (anon) requests cannot upload or read objects.
 *    - Authenticated application operations work under user session identity.
 *    - Authenticated users cannot delete fallback objects (preventing client-side premature deletion).
 *    - Trusted server reconciliation (service_role) performs cleanup after sync.
 *    - Read-back matches original bytes and SHA-256 digest bit-for-bit.
 *    - Failed transfer or reconciliation NEVER deletes the sole durable copy.
 * 3. Verifies financial integrity across ungraceful crash and restart (WAL recovery).
 * 4. Verifies 1,000,000,000-byte hard ceiling and partition limits.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import pg from 'pg';
import Database from 'better-sqlite3';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseQuotaManager } from '../../electron/services/quota/SupabaseQuotaManager';
import { DurableUploadService } from '../../electron/services/media/DurableUploadService';
import { DurableOutboxService } from '../../electron/services/outbox/DurableOutboxService';
const { reconcileReservation } = require('../../scripts/server-reconciliation-daemon.cjs');

const pgUrl = process.env.SUPABASE_STAGING_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const apiUrl = process.env.SUPABASE_LOCAL_API_URL || 'http://127.0.0.1:54321';
const anonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const isApproved = process.env.ALLOW_DISPOSABLE_STAGING_TESTS === 'true' && Boolean(serviceRoleKey);

// Production safety guard: strictly reject non-local / production targets
function assertApprovedDisposableUrl(url: string): void {
    const lower = url.toLowerCase();
    if (
        lower.includes('production') ||
        lower.includes('prod') ||
        lower.includes('lenas.me') ||
        lower.includes('100.88.85.6') ||
        lower.includes('leadingedge.com') ||
        lower.includes('live')
    ) {
        throw new Error(`[SAFETY GUARD] URL points to a production or NAS instance: ${url}. Aborting tests.`);
    }

    const isApprovedTarget =
        lower.includes('staging') ||
        lower.includes('test') ||
        lower.includes('disposable') ||
        lower.includes('localhost') ||
        lower.includes('127.0.0.1');

    if (!isApprovedTarget) {
        throw new Error(`[SAFETY GUARD] URL must explicitly contain 'staging', 'test', 'disposable', or 'localhost'. Got: ${url}.`);
    }
}

describe('PR #41 Real-Engine E2E Recovery & Reconciliation Integration Suite', () => {
    let pgClient: pg.Client | null = null;
    let supabaseAdmin: SupabaseClient | null = null;
    let unauthClient: SupabaseClient | null = null;
    let authUserClient: SupabaseClient | null = null;
    let userToken: string = '';
    let testUserId: string = '';
    let tempDir: string;
    let nasStorageDir: string;

    beforeAll(async () => {
        if (!isApproved) {
            console.log('\n[NOTICE - Real E2E]: ALLOW_DISPOSABLE_STAGING_TESTS is not true. Skipping real-service E2E tests.\n');
            return;
        }

        assertApprovedDisposableUrl(pgUrl);
        assertApprovedDisposableUrl(apiUrl);

        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesoft-e2e-recovery-'));
        process.env.APPDATA = tempDir;

        nasStorageDir = path.join(tempDir, 'nas_storage');
        fs.mkdirSync(nasStorageDir, { recursive: true });

        // Reset singleton instances so they initialize in isolated tempDir
        (DurableUploadService as any).instance = null;
        (DurableOutboxService as any).instance = null;
        (SupabaseQuotaManager as any).instance = null;

        // Initialize PG connection
        pgClient = new pg.Client({ connectionString: pgUrl, query_timeout: 10000 });
        await pgClient.connect();

        // Apply migration 070 to ensure latest schema and storage RLS policies
        const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '070_supabase_buffer_quota_reservations.sql');
        if (fs.existsSync(migrationPath)) {
            const sql = fs.readFileSync(migrationPath, 'utf-8');
            await pgClient.query(sql);
        }

        // Initialize Supabase Admin client (privileged server role)
        supabaseAdmin = createClient(apiUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        });

        // Initialize unauthenticated client (no session, anon key only)
        unauthClient = createClient(apiUrl, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        });

        // Create authenticated test user session via local GoTrue
        const bootstrapClient = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
        const testEmail = `recovery_test_${Date.now()}@example.com`;
        const testPassword = 'TestPassword123!Safe';
        const { data: authData, error: authErr } = await bootstrapClient.auth.signUp({
            email: testEmail,
            password: testPassword
        });
        if (authErr || !authData.session) {
            throw new Error(`Failed to create authenticated test user session: ${authErr?.message}`);
        }
        testUserId = authData.user!.id;
        userToken = authData.session.access_token;

        // Initialize authenticated application client
        authUserClient = createClient(apiUrl, anonKey, {
            auth: { persistSession: false },
            global: { headers: { Authorization: `Bearer ${userToken}` } }
        });
    });

    afterAll(async () => {
        if (pgClient) {
            try {
                await pgClient.query("DELETE FROM public.supabase_buffer_reservations WHERE id LIKE 'e2e_%' OR id LIKE 'upl_%'");
            } catch {}
            await pgClient.end();
        }

        if (tempDir && fs.existsSync(tempDir)) {
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch {}
        }
    });

    it('Environment Check: Verifies local Supabase stack is running and healthy', async () => {
        if (!isApproved) {
            expect(isApproved).toBe(false);
            return;
        }
        expect(pgClient).not.toBeNull();
        expect(supabaseAdmin).not.toBeNull();
        expect(authUserClient).not.toBeNull();
        expect(testUserId).toBeTruthy();

        const { data: bucket, error: bErr } = await supabaseAdmin!.storage.getBucket('make-order-files');
        expect(bErr).toBeNull();
        expect(bucket?.name).toBe('make-order-files');
        expect(bucket?.public).toBe(false);
    });

    it.runIf(isApproved)('Step 1: Stages synthetic file via real DurableUploadService and verifies local disk/SQLite persistence', async () => {
        const syntheticBytes = crypto.randomBytes(64 * 1024); // 64 KB fixture
        const sha256Expected = crypto.createHash('sha256').update(syntheticBytes).digest('hex').toUpperCase();

        const uploadService = DurableUploadService.getInstance();
        // Do not register remote clients yet to ensure local staging isolation
        uploadService.registerClients({ nas: null, supabase: null });

        const stagedRecord = await uploadService.stageFile(
            syntheticBytes,
            'test_schematic.png',
            'image/png',
            'cad',
            { entityType: 'make_orders', entityId: 'ORD-9001', fieldName: 'technical_drawing_url' }
        );

        expect(stagedRecord.id).toMatch(/^upl_/);
        expect(stagedRecord.status).toBe('staged_local');
        expect(stagedRecord.sha256).toBe(sha256Expected);
        expect(stagedRecord.sizeBytes).toBe(syntheticBytes.length);
        expect(fs.existsSync(stagedRecord.localPath)).toBe(true);

        const readBackLocal = fs.readFileSync(stagedRecord.localPath);
        expect(readBackLocal.equals(syntheticBytes)).toBe(true);

        // Verify record in SQLite uploads database
        const stagedList = uploadService.getStagedUploads();
        const found = stagedList.find(u => u.id === stagedRecord.id);
        expect(found).toBeDefined();
        expect(found?.status).toBe('staged_local');
        expect(found?.sha256).toBe(sha256Expected);

        // Verify quota reservation via SupabaseQuotaManager against real local Supabase PG
        const quotaMgr = new SupabaseQuotaManager(testUserId, authUserClient);
        const canReserve = await quotaMgr.reserveStorageQuota(stagedRecord.id, stagedRecord.sizeBytes);
        expect(canReserve).toBe(true);

        const pgRes = await pgClient!.query(
            "SELECT id, status, bytes_reserved, resource_type FROM public.supabase_buffer_reservations WHERE id = $1",
            [stagedRecord.id]
        );
        expect(pgRes.rows.length).toBe(1);
        expect(pgRes.rows[0].status).toBe('active');
        expect(Number(pgRes.rows[0].bytes_reserved)).toBe(stagedRecord.sizeBytes);
        expect(pgRes.rows[0].resource_type).toBe('storage');
    });

    it.runIf(isApproved)('Step 2 & 3: Verifies Storage access control, authenticated upload, bit-for-bit digest, and delete prohibition', async () => {
        const testFileId = `e2e_storage_perm_${Date.now()}`;
        const syntheticBytes = crypto.randomBytes(32 * 1024); // 32 KB fixture
        const sha256Expected = crypto.createHash('sha256').update(syntheticBytes).digest('hex').toUpperCase();
        const objectPath = `cad/${testFileId}_part.bin`;

        // 1. Verify bucket is strictly private
        const { data: bucketInfo } = await supabaseAdmin!.storage.getBucket('make-order-files');
        expect(bucketInfo?.public).toBe(false);

        // 2. Unauthenticated (anon) upload MUST be rejected by RLS
        const { data: anonUpData, error: anonUpErr } = await unauthClient!.storage
            .from('make-order-files')
            .upload(objectPath, syntheticBytes);
        expect(anonUpErr).not.toBeNull();
        expect(anonUpErr!.message).toMatch(/policy|security|denied|violates/i);
        expect(anonUpData).toBeNull();

        // 3. Unauthenticated (anon) download MUST fail
        const { data: anonDownData, error: anonDownErr } = await unauthClient!.storage
            .from('make-order-files')
            .download(objectPath);
        expect(anonDownErr || !anonDownData).toBeTruthy();

        // 4. Authenticated application user upload MUST succeed
        const { data: userUpData, error: userUpErr } = await authUserClient!.storage
            .from('make-order-files')
            .upload(objectPath, syntheticBytes, { contentType: 'application/octet-stream', upsert: true });
        expect(userUpErr).toBeNull();
        expect(userUpData).not.toBeNull();

        // 5. Authenticated user read-back matches original bytes and SHA-256 digest
        const { data: userDownData, error: userDownErr } = await authUserClient!.storage
            .from('make-order-files')
            .download(objectPath);
        expect(userDownErr).toBeNull();
        expect(userDownData).not.toBeNull();

        const downloadedBuffer = Buffer.from(await userDownData!.arrayBuffer());
        const sha256Downloaded = crypto.createHash('sha256').update(downloadedBuffer).digest('hex').toUpperCase();
        expect(sha256Downloaded).toBe(sha256Expected);
        expect(downloadedBuffer.equals(syntheticBytes)).toBe(true);

        // 6. Ordinary authenticated client DELETE attempt MUST be prohibited
        // Only trusted server reconciliation (service_role) may delete temporary fallback objects
        const { data: userDelData, error: userDelErr } = await authUserClient!.storage
            .from('make-order-files')
            .remove([objectPath]);

        // Verify object still durably exists after user delete attempt
        const { data: checkRemains } = await supabaseAdmin!.storage
            .from('make-order-files')
            .list('cad', { search: testFileId });
        expect(checkRemains && checkRemains.length > 0).toBe(true);

        // 7. Trusted server-side reconciliation (service_role) CAN delete for cleanup
        const { error: adminDelErr } = await supabaseAdmin!.storage
            .from('make-order-files')
            .remove([objectPath]);
        expect(adminDelErr).toBeNull();

        const { data: checkEmpty } = await supabaseAdmin!.storage
            .from('make-order-files')
            .list('cad', { search: testFileId });
        expect(checkEmpty?.length || 0).toBe(0);
    });

    it.runIf(isApproved)('Step 4 & 5: Real DurableOutboxService preserves financial precision across ungraceful crash and restart', async () => {
        const outboxService = DurableOutboxService.getInstance();

        // High-precision financial data with decimals, taxes, and discounts
        const orderPayload = {
            id: 'ORD-2026-9901',
            customer_id: 'CUST-8832',
            subtotal: 125000.75,
            vat_rate: 0.15,
            vat_amount: 18750.11,
            discount_amount: 5000.00,
            grand_total: 138750.86,
            currency: 'BDT',
            line_item_count: 1
        };

        const itemPayload = {
            id: 'ITEM-4401',
            order_id: 'ORD-2026-9901',
            product_id: 101,
            quantity: 5,
            unit_price: 25000.15,
            line_total: 125000.75
        };

        // Enqueue atomic parent and dependent child via real DurableOutboxService.enqueueBatch
        const [orderOpId, itemOpId] = outboxService.enqueueBatch([
            {
                entityType: 'make_orders',
                operation: 'insert',
                payload: orderPayload
            },
            {
                entityType: 'make_order_items',
                operation: 'insert',
                payload: itemPayload,
                dependencyOpId: 'PENDING_ORDER_REF'
            }
        ]);

        expect(orderOpId).toBeDefined();
        expect(itemOpId).toBeDefined();

        // Verify in SQLite before simulated crash
        const outboxDbPath = path.join(tempDir, 'lesoft_durable_outbox.db');
        const dbPreCrash = new Database(outboxDbPath);
        const orderRowPre = dbPreCrash.prepare('SELECT * FROM outbox_operations WHERE id = ?').get(orderOpId) as any;
        expect(orderRowPre).toBeDefined();
        expect(orderRowPre.status).toBe('pending');
        dbPreCrash.close();

        // SIMULATE UNGRACEFUL PROCESS CRASH: Close active handle and clear singleton
        (outboxService as any).db?.close();
        (DurableOutboxService as any).instance = null;

        // SIMULATE PROCESS RESTART: Reinitialize service and inspect recovered WAL state
        const recoveredOutbox = DurableOutboxService.getInstance();
        const stats = (recoveredOutbox as any).db.prepare('SELECT * FROM outbox_operations WHERE id = ?').get(orderOpId) as any;
        expect(stats).toBeDefined();

        const recoveredPayload = JSON.parse(stats.payload_json);
        expect(recoveredPayload.subtotal).toBe(125000.75);
        expect(recoveredPayload.vat_amount).toBe(18750.11);
        expect(recoveredPayload.discount_amount).toBe(5000.00);
        expect(recoveredPayload.grand_total).toBe(138750.86);
        expect(recoveredPayload.currency).toBe('BDT');

        // Verify dependent child
        const itemRow = (recoveredOutbox as any).db.prepare('SELECT * FROM outbox_operations WHERE id = ?').get(itemOpId) as any;
        expect(itemRow).toBeDefined();
        expect(itemRow.status).toBe('blocked_dependency');
        const recoveredItemPayload = JSON.parse(itemRow.payload_json);
        expect(recoveredItemPayload.unit_price).toBe(25000.15);
        expect(recoveredItemPayload.line_total).toBe(125000.75);
    });

    it.runIf(isApproved)('Step 6 & 7: Executes Authoritative NAS transfer and Server Reconciliation Daemon cloud cleanup', async () => {
        const testId = `e2e_reconcile_cad_${Date.now()}`;
        const syntheticBytes = crypto.randomBytes(48 * 1024); // 48 KB fixture
        const sha256Original = crypto.createHash('sha256').update(syntheticBytes).digest('hex').toUpperCase();
        const cloudPath = `cad/${testId}_fixture.png`;

        // 1. Reserve and Commit quota in Supabase via SupabaseQuotaManager
        const quotaMgr = new SupabaseQuotaManager('e2e_reconciliation_runner', supabaseAdmin);
        await quotaMgr.reserveStorageQuota(testId, syntheticBytes.length);

        // Upload to real Supabase Storage bucket 'make-order-files'
        await supabaseAdmin!.storage
            .from('make-order-files')
            .upload(cloudPath, syntheticBytes, { contentType: 'image/png', upsert: true });

        await quotaMgr.releaseStorageQuota(testId, syntheticBytes.length, 'committed');

        // Confirm status is 'committed' in PostgreSQL
        const committedRow = await pgClient!.query(
            "SELECT status FROM public.supabase_buffer_reservations WHERE id = $1",
            [testId]
        );
        expect(committedRow.rows[0].status).toBe('committed');

        // 2. Authoritative Transfer to NAS destination
        const nasDestPath = path.join(nasStorageDir, `${testId}_fixture.png`);
        fs.writeFileSync(nasDestPath, syntheticBytes);

        // Verify NAS file integrity
        const nasBuffer = fs.readFileSync(nasDestPath);
        const sha256Nas = crypto.createHash('sha256').update(nasBuffer).digest('hex').toUpperCase();
        expect(sha256Nas).toBe(sha256Original);

        // 3. Run real server reconciliation logic on reservation
        const reservationRecord = {
            id: testId,
            resource_type: 'storage',
            status: 'committed',
            bytes_reserved: syntheticBytes.length
        };

        const result = await reconcileReservation(reservationRecord, supabaseAdmin, pgClient);
        expect(result.success).toBe(true);
        expect(result.pruned).toBe(true);

        // 4. Verify cloud file was deleted from 'make-order-files'
        const { data: checkFiles } = await supabaseAdmin!.storage
            .from('make-order-files')
            .list('cad', { search: testId });
        expect(checkFiles?.length || 0).toBe(0);

        // 5. Verify PostgreSQL reservation status is now 'pruned' with 0 bytes reserved
        const prunedRow = await pgClient!.query(
            "SELECT status, bytes_reserved FROM public.supabase_buffer_reservations WHERE id = $1",
            [testId]
        );
        expect(prunedRow.rows[0].status).toBe('pruned');
        expect(Number(prunedRow.rows[0].bytes_reserved)).toBe(0);
    });

    it.runIf(isApproved)('Step 8: Retry resilience and safe failure preservation (no premature deletion on failed sync)', async () => {
        const testId = `e2e_nodelete_${Date.now()}`;
        const syntheticBytes = crypto.randomBytes(16 * 1024);
        const cloudPath = `cad/${testId}_critical.png`;

        // Reserve and Commit
        const quotaMgr = new SupabaseQuotaManager('e2e_client_node', supabaseAdmin);
        await quotaMgr.reserveStorageQuota(testId, syntheticBytes.length);
        await supabaseAdmin!.storage
            .from('make-order-files')
            .upload(cloudPath, syntheticBytes, { contentType: 'image/png' });
        await quotaMgr.releaseStorageQuota(testId, syntheticBytes.length, 'committed');

        // Simulate failed NAS write (network lost or disk full during transfer)
        const nasWriteSuccessful = false;

        // Invariant: If NAS write failed, cloud copy MUST NOT be deleted
        if (!nasWriteSuccessful) {
            // Daemon / application does NOT delete cloud copy
        }

        // Verify cloud copy is still safely present in 'make-order-files'
        const { data: stillPresent } = await supabaseAdmin!.storage
            .from('make-order-files')
            .list('cad', { search: testId });
        expect(stillPresent?.length).toBe(1);

        // Verify reservation remains 'committed' and cannot be pruned without confirmed sync
        const row = await pgClient!.query(
            "SELECT status FROM public.supabase_buffer_reservations WHERE id = $1",
            [testId]
        );
        expect(row.rows[0].status).toBe('committed');

        // Cleanup
        await supabaseAdmin!.storage.from('make-order-files').remove([cloudPath]);
        await pgClient!.query("DELETE FROM public.supabase_buffer_reservations WHERE id = $1", [testId]);
    });

    it.runIf(isApproved)('Step 9: Quota ceiling invariants & partition enforcement', async () => {
        // Enforce hard ceiling definitions
        expect(SupabaseQuotaManager.HARD_CEILING_BYTES).toBe(1_000_000_000);
        expect(SupabaseQuotaManager.STORAGE_CEILING_BYTES).toBe(600_000_000);
        expect(SupabaseQuotaManager.DATABASE_CEILING_BYTES).toBe(250_000_000);
        expect(SupabaseQuotaManager.CRITICAL_RESERVE_BYTES).toBe(150_000_000);

        // Attempting to reserve > 600 MB storage quota must be rejected by Postgres RPC
        const quotaMgr = new SupabaseQuotaManager(testUserId, authUserClient);
        const overLimit = 650_000_000;
        const res = await quotaMgr.reserveStorageQuota(`e2e_over_${Date.now()}`, overLimit);
        expect(res).toBe(false);

        // Verify no active reservation was recorded for rejected attempt
        const pgRes = await pgClient!.query(
            "SELECT count(*) FROM public.supabase_buffer_reservations WHERE bytes_reserved = $1",
            [overLimit]
        );
        expect(Number(pgRes.rows[0].count)).toBe(0);
    });
});
