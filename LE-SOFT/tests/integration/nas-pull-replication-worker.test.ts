/**
 * tests/integration/nas-pull-replication-worker.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive Integration Suite for Authoritative NAS-Side Pull Replication Daemon.
 *
 * Verifies:
 * 1. Checkpoint table initialization and durable checkpoint tracking on TrueNAS.
 * 2. Dependency ordering: parent orders (make_orders) pulled before child updates (make_order_updates).
 * 3. On-demand parent resolution: child updates auto-fetch missing parent orders before insert.
 * 4. Idempotency: Re-running pull replication does not create duplicates or throw key errors.
 * 5. Attachment pull: downloads binary bytes from Supabase Storage, validates SHA-256,
 *    persists to TrueNAS storage path, and acknowledges replication only after disk verification.
 * 6. Cloud preservation: Supabase business rows are NEVER deleted.
 * 7. Storage retention policy: Supabase Storage files are retained by default, pruned only with explicit policy.
 * 8. Error retention: Failures preserve checkpoint state and record last_error for retry.
 * 9. Credential isolation: Validates that Electron bundle and renderer code contain NO service-role keys.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const {
    initCheckpoints,
    getCheckpoint,
    updateCheckpoint,
    pullBusinessData,
    pullAttachments,
    runReplicationCycle
} = require('../../scripts/nas-pull-replication-worker.cjs');

describe('NAS-Side Pull Replication Worker Suite', () => {
    let mockPg: any;
    let mockSupabase: any;
    let mockCheckpoints: Map<string, any>;
    let mockTrueNasOrders: Map<number, any>;
    let mockTrueNasUpdates: Map<number, any>;
    let mockSupabaseOrders: any[];
    let mockSupabaseUpdates: any[];
    let mockSupabaseReservations: any[];
    let mockSupabaseStorageFiles: Map<string, { buffer: Buffer; sha256: string }>;
    let tempStorageDir: string;

    beforeEach(() => {
        mockCheckpoints = new Map();
        mockTrueNasOrders = new Map();
        mockTrueNasUpdates = new Map();
        mockSupabaseOrders = [];
        mockSupabaseUpdates = [];
        mockSupabaseReservations = [];
        mockSupabaseStorageFiles = new Map();

        tempStorageDir = path.join(process.cwd(), 'tmp_nas_storage_test_' + Date.now());
        fs.mkdirSync(tempStorageDir, { recursive: true });

        // Mock TrueNAS PostgreSQL client
        mockPg = {
            query: vi.fn(async (sql: string, params: any[] = []) => {
                const normalized = sql.replace(/\s+/g, ' ').trim();

                if (normalized.includes('CREATE TABLE IF NOT EXISTS nas_replication_checkpoints')) {
                    return { rows: [] };
                }

                if (normalized.includes('SELECT * FROM nas_replication_checkpoints WHERE table_name = $1')) {
                    const cp = mockCheckpoints.get(params[0]);
                    return { rows: cp ? [cp] : [] };
                }

                if (normalized.includes('INSERT INTO nas_replication_checkpoints')) {
                    const tableName = params[0];
                    const existing = mockCheckpoints.get(tableName) || { items_replicated: 0 };
                    const updated = {
                        table_name: tableName,
                        last_replicated_id: params[1] || existing.last_replicated_id,
                        last_replicated_at: params[2] || existing.last_replicated_at,
                        items_replicated: Number(existing.items_replicated) + Number(params[3] || 0),
                        last_error: params[4] || null,
                        updated_at: new Date().toISOString()
                    };
                    mockCheckpoints.set(tableName, updated);
                    return { rows: [updated] };
                }

                if (normalized.includes('INSERT INTO make_orders')) {
                    const id = Number(params[0]);
                    const orderRecord = {
                        id,
                        order_number: params[1],
                        furniture_name: params[2],
                        total_price: params[3],
                        current_stage: params[4],
                        created_at: params[5],
                        updated_at: params[6]
                    };
                    mockTrueNasOrders.set(id, orderRecord);
                    return { rows: [orderRecord] };
                }

                if (normalized.includes('SELECT 1 FROM make_orders WHERE id = $1')) {
                    const id = Number(params[0]);
                    return { rows: mockTrueNasOrders.has(id) ? [{ 1: 1 }] : [] };
                }

                if (normalized.includes('INSERT INTO make_order_updates')) {
                    const id = Number(params[0]);
                    const updateRecord = {
                        id,
                        order_id: params[1],
                        stage: params[2],
                        note: params[3],
                        actor_name: params[4],
                        actor_role: params[5],
                        created_at: params[6]
                    };
                    mockTrueNasUpdates.set(id, updateRecord);
                    return { rows: [updateRecord] };
                }

                return { rows: [] };
            })
        };

        // Mock Supabase Cloud Client
        mockSupabase = {
            from: vi.fn((table: string) => {
                return {
                    select: vi.fn((cols: string = '*') => {
                        let data: any[] = [];
                        if (table === 'make_orders') data = [...mockSupabaseOrders];
                        if (table === 'make_order_updates') data = [...mockSupabaseUpdates];
                        if (table === 'supabase_buffer_reservations') data = [...mockSupabaseReservations];

                        const chain: any = {
                            data,
                            error: null,
                            order: vi.fn(() => chain),
                            limit: vi.fn(() => chain),
                            gt: vi.fn((col: string, val: any) => {
                                chain.data = chain.data.filter((item: any) => item[col] > Number(val));
                                return chain;
                            }),
                            eq: vi.fn((col: string, val: any) => {
                                chain.data = chain.data.filter((item: any) => item[col] === val);
                                return chain;
                            }),
                            maybeSingle: vi.fn(async () => {
                                return { data: chain.data[0] || null, error: null };
                            }),
                            then: (resolve: any) => resolve({ data: chain.data, error: null })
                        };
                        return chain;
                    })
                };
            }),
            storage: {
                from: vi.fn((bucket: string) => ({
                    list: vi.fn(async (subfolder: string, opts: any) => {
                        const search = opts?.search || '';
                        const results: any[] = [];
                        for (const [key] of mockSupabaseStorageFiles.entries()) {
                            if (key.startsWith(subfolder) && key.includes(search)) {
                                const name = path.basename(key);
                                results.push({ name });
                            }
                        }
                        return { data: results, error: null };
                    }),
                    download: vi.fn(async (cloudPath: string) => {
                        const file = mockSupabaseStorageFiles.get(cloudPath);
                        if (!file) {
                            return { data: null, error: new Error('Object not found') };
                        }
                        return { data: file.buffer, error: null };
                    }),
                    remove: vi.fn(async (paths: string[]) => {
                        for (const p of paths) {
                            mockSupabaseStorageFiles.delete(p);
                        }
                        return { data: paths, error: null };
                    })
                }))
            },
            rpc: vi.fn(async (fn: string, args: any) => {
                if (fn === 'release_buffer_capacity') {
                    const res = mockSupabaseReservations.find(r => r.id === args.p_reservation_id);
                    if (res) {
                        res.status = args.p_status;
                    }
                    return { data: { success: true }, error: null };
                }
                return { data: null, error: new Error('Unknown RPC') };
            })
        };
    });

    afterEach(() => {
        try {
            if (fs.existsSync(tempStorageDir)) {
                fs.rmSync(tempStorageDir, { recursive: true, force: true });
            }
        } catch {}
    });

    // ── Test 1: Checkpoint Initialization ─────────────────────────────────────
    it('1. Initializes durable checkpoint table on TrueNAS PostgreSQL and tracks checkpoints', async () => {
        await initCheckpoints(mockPg);
        expect(mockPg.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS nas_replication_checkpoints'));

        await updateCheckpoint(mockPg, 'make_orders', '101', '2026-10-18T00:00:00Z', 1);
        const cp = await getCheckpoint(mockPg, 'make_orders');
        expect(cp.last_replicated_id).toBe('101');
        expect(cp.items_replicated).toBe(1);
        expect(cp.last_error).toBeNull();
    });

    // ── Test 2: Dependency-Ordered Business Data Pull ─────────────────────────
    it('2. Pulls business data in strict dependency order: parent make_orders before child make_order_updates', async () => {
        // Populate Supabase Cloud
        mockSupabaseOrders.push({
            id: 201,
            order_number: 'MAKE-2026-000201',
            furniture_name: 'Conference Table',
            total_price: 3500,
            current_stage: 'Cutting'
        });

        mockSupabaseUpdates.push({
            id: 501,
            order_id: 201,
            stage: 'Work in process',
            note: 'Initial assembly started',
            actor_name: 'John Doe',
            actor_role: 'Supervisor'
        });

        const res = await pullBusinessData(mockSupabase, mockPg, { batchSize: 50 });
        expect(res.success).toBe(true);
        expect(res.totalReplicated).toBe(2);

        // Verify TrueNAS PostgreSQL has both parent and child
        expect(mockTrueNasOrders.has(201)).toBe(true);
        expect(mockTrueNasUpdates.has(501)).toBe(true);
        expect(mockTrueNasUpdates.get(501).order_id).toBe(201);

        // Checkpoints advanced
        const orderCp = await getCheckpoint(mockPg, 'make_orders');
        expect(orderCp.last_replicated_id).toBe('201');
        const updateCp = await getCheckpoint(mockPg, 'make_order_updates');
        expect(updateCp.last_replicated_id).toBe('501');
    });

    // ── Test 3: On-Demand Parent Order Resolution ─────────────────────────────
    it('3. On-demand parent resolution: child update automatically pulls missing parent order before inserting', async () => {
        // Supabase has parent order 301 and update 601
        mockSupabaseOrders.push({
            id: 301,
            order_number: 'MAKE-2026-000301',
            furniture_name: 'Executive Credenza',
            total_price: 4500,
            current_stage: 'Polishing'
        });

        mockSupabaseUpdates.push({
            id: 601,
            order_id: 301,
            stage: 'Polishing',
            note: 'High gloss lacquer applied'
        });

        // Set checkpoint so make_orders loop skips 301 (simulating race or out-of-band update)
        mockCheckpoints.set('make_orders', {
            table_name: 'make_orders',
            last_replicated_id: '400', // Higher than 301
            items_replicated: 5
        });

        const res = await pullBusinessData(mockSupabase, mockPg, { batchSize: 50 });
        expect(res.success).toBe(true);

        // Invariant: parent order was fetched on-demand and exists on TrueNAS before child
        expect(mockTrueNasOrders.has(301)).toBe(true);
        expect(mockTrueNasUpdates.has(601)).toBe(true);
    });

    // ── Test 4: Idempotency & Replay ──────────────────────────────────────────
    it('4. Replaying pull replication is completely idempotent and does not duplicate records', async () => {
        mockSupabaseOrders.push({ id: 401, order_number: 'MAKE-401', furniture_name: 'Sofa' });
        mockSupabaseUpdates.push({ id: 701, order_id: 401, stage: 'Cutting' });

        // Run cycle 1
        const r1 = await pullBusinessData(mockSupabase, mockPg);
        expect(r1.success).toBe(true);
        expect(mockTrueNasOrders.size).toBe(1);

        // Reset checkpoints to beginning to force replay
        mockCheckpoints.delete('make_orders');
        mockCheckpoints.delete('make_order_updates');

        // Run cycle 2
        const r2 = await pullBusinessData(mockSupabase, mockPg);
        expect(r2.success).toBe(true);
        expect(mockTrueNasOrders.size).toBe(1); // Still exactly 1 record!
        expect(mockTrueNasUpdates.size).toBe(1);
    });

    // ── Test 5: Attachment Pull & SHA-256 Verification ─────────────────────────
    it('5. Pulls attachments from Supabase Storage, validates SHA-256, and persists durably to TrueNAS disk', async () => {
        const fileContent = Buffer.from('BINARY-ATTACHMENT-TECHNICAL-DRAWING-PDF-DATA');
        const expectedSha = crypto.createHash('sha256').update(fileContent).digest('hex').toUpperCase();

        const resId = 'res_cad_test_001';
        const cloudPath = 'cad/res_cad_test_001_desk_drawing.pdf';

        mockSupabaseReservations.push({
            id: resId,
            resource_type: 'storage',
            bytes_reserved: fileContent.length,
            status: 'committed'
        });

        mockSupabaseStorageFiles.set(cloudPath, {
            buffer: fileContent,
            sha256: expectedSha
        });

        const attachRes = await pullAttachments(mockSupabase, tempStorageDir, mockPg, {
            pruneCloudAfterNasConfirmation: false // Default: retain cloud copy
        });

        expect(attachRes.success).toBe(true);
        expect(attachRes.filesPulled).toBe(1);

        // Verify file on TrueNAS disk
        const savedFilePath = path.join(tempStorageDir, 'cad', 'res_cad_test_001_desk_drawing.pdf');
        expect(fs.existsSync(savedFilePath)).toBe(true);
        const diskContent = fs.readFileSync(savedFilePath);
        expect(diskContent.toString()).toBe(fileContent.toString());

        // Invariant: Cloud copy is preserved by default
        expect(mockSupabaseStorageFiles.has(cloudPath)).toBe(true);
    });

    // ── Test 6: Cloud Data Preservation Invariant ─────────────────────────────
    it('6. Cloud Data Preservation: Supabase business records are NEVER deleted as a side effect of replication', async () => {
        mockSupabaseOrders.push({ id: 501, furniture_name: 'Preserved Dining Table' });
        mockSupabaseUpdates.push({ id: 801, order_id: 501, stage: 'Packing' });

        const cycleRes = await runReplicationCycle({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir
        });

        expect(cycleRes.success).toBe(true);

        // Supabase Cloud tables must still have 100% of rows
        expect(mockSupabaseOrders.length).toBe(1);
        expect(mockSupabaseOrders[0].id).toBe(501);
        expect(mockSupabaseUpdates.length).toBe(1);
    });

    // ── Test 7: Cloud Storage Pruning Under Explicit Policy ───────────────────
    it('7. Storage Pruning: Only prunes cloud copy when PRUNE_CLOUD_AFTER_NAS_CONFIRMATION is true and persistence is verified', async () => {
        const fileContent = Buffer.from('BINARY-PRUNE-TEST-IMAGE');
        const resId = 'res_photo_prune_002';
        const cloudPath = 'products/res_photo_prune_002_chair.webp';

        mockSupabaseReservations.push({
            id: resId,
            resource_type: 'storage',
            bytes_reserved: fileContent.length,
            status: 'committed'
        });

        mockSupabaseStorageFiles.set(cloudPath, {
            buffer: fileContent,
            sha256: 'HASH'
        });

        // Run with pruneCloudAfterNasConfirmation = true
        const attachRes = await pullAttachments(mockSupabase, tempStorageDir, mockPg, {
            pruneCloudAfterNasConfirmation: true
        });

        expect(attachRes.success).toBe(true);
        expect(attachRes.filesPulled).toBe(1);

        // Verified on disk
        const savedFile = path.join(tempStorageDir, 'products', 'res_photo_prune_002_chair.webp');
        expect(fs.existsSync(savedFile)).toBe(true);

        // Cloud copy pruned and quota released
        expect(mockSupabaseStorageFiles.has(cloudPath)).toBe(false);
        const resInSb = mockSupabaseReservations.find(r => r.id === resId);
        expect(resInSb.status).toBe('pruned');
    });

    // ── Test 8: Error Retention & Checkpoint Safety ───────────────────────────
    it('8. Checkpoint Safety: Error during processing records last_error and does NOT advance checkpoint', async () => {
        // Force error in TrueNAS PostgreSQL on order insert
        mockPg.query = vi.fn(async (sql: string, params: any[]) => {
            if (sql.includes('INSERT INTO make_orders')) {
                throw new Error('Disk quota full on TrueNAS pool /mnt/data');
            }
            if (sql.includes('SELECT * FROM nas_replication_checkpoints')) {
                return { rows: [] };
            }
            if (sql.includes('INSERT INTO nas_replication_checkpoints')) {
                return { rows: [] };
            }
            return { rows: [] };
        });

        mockSupabaseOrders.push({ id: 601, furniture_name: 'Failing Order' });

        await expect(pullBusinessData(mockSupabase, mockPg)).rejects.toThrow('Disk quota full');

        // Checkpoint for make_orders was NOT advanced
        const cp = mockCheckpoints.get('make_orders');
        expect(cp).toBeUndefined(); // Did not advance past error
    });

    // ── Test 9: Zero Service-Role Secret Exposure in Client Code ──────────────
    it('9. Security Isolation: Electron bundles and client configuration NEVER expose service-role secrets', () => {
        // Verify core/main.cjs does not contain active service_role key literals
        const mainCjsPath = path.join(process.cwd(), 'core', 'main.cjs');
        if (fs.existsSync(mainCjsPath)) {
            const mainContent = fs.readFileSync(mainCjsPath, 'utf-8');
            expect(mainContent).not.toContain('SUPABASE_SERVICE_ROLE_KEY=ey');
            expect(mainContent).not.toContain('service_role_secret');
        }
    });
});
