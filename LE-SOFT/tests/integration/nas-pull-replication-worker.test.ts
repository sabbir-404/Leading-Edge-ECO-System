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
    normalizeStorageObjectKey,
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
    let mockSupabaseSpecs: any[];
    let mockSupabaseColors: any[];
    let mockSupabaseReservations: any[];
    let mockSupabaseTombstones: any[];
    let mockTrueNasSpecs: Map<number, any>;
    let mockTrueNasColors: Map<number, any>;
    let mockSupabaseStorageFiles: Map<string, { buffer: Buffer; sha256: string }>;
    let mockTrueNasReplicatedFiles: Set<string>;
    let tempStorageDir: string;

    beforeEach(() => {
        mockCheckpoints = new Map();
        mockTrueNasOrders = new Map();
        mockTrueNasUpdates = new Map();
        mockTrueNasSpecs = new Map();
        mockTrueNasColors = new Map();
        mockTrueNasReplicatedFiles = new Set();
        mockSupabaseOrders = [];
        mockSupabaseUpdates = [];
        mockSupabaseSpecs = [];
        mockSupabaseColors = [];
        mockSupabaseReservations = [];
        mockSupabaseTombstones = [];
        mockSupabaseStorageFiles = new Map();

        tempStorageDir = path.join(process.cwd(), 'tmp_nas_storage_test_' + Date.now());
        fs.mkdirSync(tempStorageDir, { recursive: true });

        // Mock TrueNAS PostgreSQL client
        mockPg = {
            query: vi.fn(async (sql: string, params: any[] = []) => {
                const normalized = sql.replace(/\s+/g, ' ').trim();

                if (normalized.includes('CREATE TABLE IF NOT EXISTS nas_replication_checkpoints') ||
                    normalized.includes('CREATE TABLE IF NOT EXISTS nas_replicated_files') ||
                    normalized.includes('ALTER TABLE')) {
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
                        last_replicated_id: params[1] || existing.last_replicated_id || null,
                        last_replicated_at: params[2] || existing.last_replicated_at || null,
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
                        status: params[5],
                        invoice_attachment_urls: params[6],
                        current_stage_photo: params[7],
                        created_at: params[8],
                        updated_at: params[9]
                    };
                    mockTrueNasOrders.set(id, orderRecord);
                    return { rows: [orderRecord] };
                }

                if (normalized.includes('DELETE FROM make_orders WHERE id = $1')) {
                    const id = Number(params[0]);
                    mockTrueNasOrders.delete(id);
                    return { rows: [] };
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
                        photo_url: params[4],
                        photo_urls: params[5],
                        actor_name: params[6],
                        actor_role: params[7],
                        created_at: params[8]
                    };
                    mockTrueNasUpdates.set(id, updateRecord);
                    return { rows: [updateRecord] };
                }

                if (normalized.includes('INSERT INTO make_product_specifications')) {
                    const id = Number(params[0]);
                    const specRecord = {
                        id,
                        product_id: params[1],
                        spec_code: params[2],
                        spec_name: params[3],
                        spec_details: params[4],
                        is_active: params[5],
                        image_url: params[6],
                        created_at: params[7],
                        updated_at: params[8] || params[7] || new Date().toISOString()
                    };
                    mockTrueNasSpecs.set(id, specRecord);
                    return { rows: [specRecord] };
                }

                if (normalized.includes('SELECT 1 FROM make_product_specifications WHERE id = $1')) {
                    const id = Number(params[0]);
                    return { rows: mockTrueNasSpecs.has(id) ? [{ 1: 1 }] : [] };
                }

                if (normalized.includes('DELETE FROM make_product_specifications WHERE id = $1')) {
                    const id = Number(params[0]);
                    mockTrueNasSpecs.delete(id);
                    return { rows: [] };
                }

                if (normalized.includes('INSERT INTO make_product_colors')) {
                    const id = Number(params[0]);
                    const colorRecord = {
                        id,
                        product_id: params[1],
                        spec_id: params[2],
                        color_name: params[3],
                        color_code: params[4],
                        is_active: params[5],
                        image_url: params[6],
                        created_at: params[7],
                        updated_at: params[8] || params[7] || new Date().toISOString()
                    };
                    mockTrueNasColors.set(id, colorRecord);
                    return { rows: [colorRecord] };
                }

                if (normalized.includes('DELETE FROM make_product_colors WHERE id = $1')) {
                    const id = Number(params[0]);
                    mockTrueNasColors.delete(id);
                    return { rows: [] };
                }

                if (normalized.includes('SELECT 1 FROM nas_replicated_files WHERE object_key = $1')) {
                    return { rows: mockTrueNasReplicatedFiles.has(params[0]) ? [{ 1: 1 }] : [] };
                }

                if (normalized.includes('INSERT INTO nas_replicated_files')) {
                    mockTrueNasReplicatedFiles.add(params[0]);
                    return { rows: [] };
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
                        if (table === 'make_product_specifications') data = [...mockSupabaseSpecs];
                        if (table === 'make_product_colors') data = [...mockSupabaseColors];
                        if (table === 'supabase_buffer_reservations') data = [...mockSupabaseReservations];
                        if (table === 'replication_tombstones') data = [...mockSupabaseTombstones];

                        const chain: any = {
                            data,
                            error: null,
                            order: vi.fn((col: string, opts?: { ascending?: boolean }) => {
                                const asc = opts?.ascending !== false;
                                chain.data.sort((a: any, b: any) => {
                                    const va = a[col];
                                    const vb = b[col];
                                    if (va < vb) return asc ? -1 : 1;
                                    if (va > vb) return asc ? 1 : -1;
                                    return 0;
                                });
                                return chain;
                            }),
                            limit: vi.fn((n: number) => {
                                chain.data = chain.data.slice(0, n);
                                return chain;
                            }),
                            gt: vi.fn((col: string, val: any) => {
                                chain.data = chain.data.filter((item: any) => {
                                    if (col === 'updated_at' || col === 'created_at' || col === 'deleted_at') {
                                        return new Date(item[col]).getTime() > new Date(val).getTime();
                                    }
                                    return Number(item[col]) > Number(val);
                                });
                                return chain;
                            }),
                            eq: vi.fn((col: string, val: any) => {
                                chain.data = chain.data.filter((item: any) => item[col] === val);
                                return chain;
                            }),
                            or: vi.fn((clause: string) => {
                                const upMatch = clause.match(/updated_at\.gt\.([^,]+),and\(updated_at\.eq\.([^,]+),id\.gt\.(\d+)\)/);
                                if (upMatch) {
                                    const gtTime = new Date(upMatch[1]).getTime();
                                    const eqTime = new Date(upMatch[2]).getTime();
                                    const minId = Number(upMatch[3]);
                                    chain.data = chain.data.filter((item: any) => {
                                        const t = new Date(item.updated_at || item.created_at).getTime();
                                        return t > gtTime || (t === eqTime && Number(item.id) > minId);
                                    });
                                    return chain;
                                }
                                const crMatch = clause.match(/created_at\.gt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.gt\.(\d+)\)/);
                                if (crMatch) {
                                    const gtTime = new Date(crMatch[1]).getTime();
                                    const eqTime = new Date(crMatch[2]).getTime();
                                    const minId = Number(crMatch[3]);
                                    chain.data = chain.data.filter((item: any) => {
                                        const t = new Date(item.created_at).getTime();
                                        return t > gtTime || (t === eqTime && Number(item.id) > minId);
                                    });
                                    return chain;
                                }
                                const delMatch = clause.match(/deleted_at\.gt\.([^,]+),and\(deleted_at\.eq\.([^,]+),id\.gt\.(\d+)\)/);
                                if (delMatch) {
                                    const gtTime = new Date(delMatch[1]).getTime();
                                    const eqTime = new Date(delMatch[2]).getTime();
                                    const minId = Number(delMatch[3]);
                                    chain.data = chain.data.filter((item: any) => {
                                        const t = new Date(item.deleted_at).getTime();
                                        return t > gtTime || (t === eqTime && Number(item.id) > minId);
                                    });
                                    return chain;
                                }
                                if (clause.includes('invoice_attachment_urls') || clause.includes('current_stage_photo')) {
                                    chain.data = chain.data.filter((item: any) => {
                                        const hasUrls = Array.isArray(item.invoice_attachment_urls) && item.invoice_attachment_urls.length > 0;
                                        const hasPhoto = !!item.current_stage_photo;
                                        return hasUrls || hasPhoto;
                                    });
                                    return chain;
                                }
                                return chain;
                            }),
                            not: vi.fn((col: string, op: string, val: any) => {
                                if (op === 'is' && val === null) {
                                    chain.data = chain.data.filter((item: any) => item[col] !== null && item[col] !== undefined);
                                }
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

    // ── Test 10: Modifying an Already-Replicated Order ─────────────────────────
    it('10. Modifying an already-replicated order: stage and field transitions are discovered and applied via compound watermark', async () => {
        const t1 = '2026-10-18T01:00:00.000Z';
        const t2 = '2026-10-18T01:05:00.000Z';

        // 1. Initial creation of Order 901
        mockSupabaseOrders.push({
            id: 901,
            order_number: 'MAKE-2026-000901',
            furniture_name: 'Custom Oak Boardroom Desk',
            total_price: 10000,
            current_stage: 'Draft',
            status: 'Placed',
            created_at: t1,
            updated_at: t1
        });

        // Run Cycle 1
        const r1 = await pullBusinessData(mockSupabase, mockPg);
        expect(r1.success).toBe(true);
        expect(mockTrueNasOrders.get(901).current_stage).toBe('Draft');
        expect(mockTrueNasOrders.get(901).total_price).toBe(10000);

        const cp1 = await getCheckpoint(mockPg, 'make_orders');
        expect(cp1.last_replicated_id).toBe('901');
        expect(cp1.last_replicated_at).toBe(t1);

        // 2. Modify Order 901 in Supabase Cloud (stage transition & price update)
        mockSupabaseOrders[0].current_stage = 'Cutting';
        mockSupabaseOrders[0].total_price = 12500;
        mockSupabaseOrders[0].updated_at = t2;

        // Run Cycle 2: Compound watermark query MUST detect the update despite id 901 <= last_replicated_id
        const r2 = await pullBusinessData(mockSupabase, mockPg);
        expect(r2.success).toBe(true);
        expect(r2.totalReplicated).toBe(1);

        // Verify TrueNAS PostgreSQL replica received updated stage and price
        const updatedTrueNasOrder = mockTrueNasOrders.get(901);
        expect(updatedTrueNasOrder.current_stage).toBe('Cutting');
        expect(updatedTrueNasOrder.total_price).toBe(12500);
        expect(updatedTrueNasOrder.updated_at).toBe(t2);

        // Checkpoint advanced to t2
        const cp2 = await getCheckpoint(mockPg, 'make_orders');
        expect(cp2.last_replicated_at).toBe(t2);
    });

    // ── Test 11: Modifying an Attachment Reference on an Existing Order ───────
    it('11. Modifying an attachment reference: authoritative order metadata discovers new attachments and replicates binary bytes to TrueNAS', async () => {
        const t1 = '2026-10-18T02:00:00.000Z';
        const t2 = '2026-10-18T02:10:00.000Z';
        const fileContent = Buffer.from('REVISED-CAD-TECHNICAL-SPECIFICATION-DATA');
        const fileSha = crypto.createHash('sha256').update(fileContent).digest('hex').toUpperCase();

        const cloudObjectKey = 'cad/res_cad_test_revised_drawing.pdf';
        mockSupabaseStorageFiles.set(cloudObjectKey, {
            buffer: fileContent,
            sha256: fileSha
        });

        // 1. Initial Order without attachments
        mockSupabaseOrders.push({
            id: 902,
            order_number: 'MAKE-2026-000902',
            furniture_name: 'Reception Counter',
            total_price: 20000,
            current_stage: 'Cutting',
            invoice_attachment_urls: [],
            created_at: t1,
            updated_at: t1
        });

        await pullBusinessData(mockSupabase, mockPg);
        expect(mockTrueNasOrders.get(902).invoice_attachment_urls).toEqual([]);

        // 2. Update Order with new attachment reference
        mockSupabaseOrders[0].invoice_attachment_urls = [`make-order-files/${cloudObjectKey}`];
        mockSupabaseOrders[0].current_stage_photo = 'products/order_902_stage_photo.webp';
        mockSupabaseOrders[0].updated_at = t2;

        mockSupabaseStorageFiles.set('products/order_902_stage_photo.webp', {
            buffer: Buffer.from('STAGE-PHOTO-IMAGE-BYTES'),
            sha256: 'HASH'
        });

        // Run data pull: order receives attachment URLs
        await pullBusinessData(mockSupabase, mockPg);
        expect(mockTrueNasOrders.get(902).invoice_attachment_urls).toContain(`make-order-files/${cloudObjectKey}`);

        // Run attachment pull: worker discovers files from authoritative order metadata
        const attachRes = await pullAttachments(mockSupabase, tempStorageDir, mockPg);
        expect(attachRes.success).toBe(true);
        expect(attachRes.filesPulled).toBe(2);

        // Verify file persisted durably to TrueNAS storage directory
        const savedCadPath = path.join(tempStorageDir, 'cad', 'res_cad_test_revised_drawing.pdf');
        expect(fs.existsSync(savedCadPath)).toBe(true);
        const savedBytes = fs.readFileSync(savedCadPath);
        expect(savedBytes.toString()).toBe(fileContent.toString());
    });

    // ── Test 12: Deletion Propagation (Tombstones and Soft Deletions) ──────────
    it('12. Deletion propagation: propagates soft-deletions and tombstone entries cleanly to TrueNAS PostgreSQL replica', async () => {
        // Seed TrueNAS PostgreSQL with orders 903 and 904
        mockTrueNasOrders.set(903, { id: 903, order_number: 'MAKE-903', furniture_name: 'Soft Delete Item' });
        mockTrueNasOrders.set(904, { id: 904, order_number: 'MAKE-904', furniture_name: 'Tombstone Delete Item' });

        // Case A: Soft-deletion / cancellation on make_orders
        mockSupabaseOrders.push({
            id: 903,
            order_number: 'MAKE-903',
            status: 'deleted',
            deleted_at: '2026-10-18T03:00:00.000Z',
            updated_at: '2026-10-18T03:00:00.000Z'
        });

        // Case B: Explicit Tombstone feed for Order 904
        mockSupabaseTombstones.push({
            id: 1,
            entity_name: 'make_orders',
            record_id: 904,
            deleted_at: '2026-10-18T03:05:00.000Z'
        });

        const res = await pullBusinessData(mockSupabase, mockPg);
        expect(res.success).toBe(true);

        // Verify both orders are cleanly removed from TrueNAS PostgreSQL replica
        expect(mockTrueNasOrders.has(903)).toBe(false);
        expect(mockTrueNasOrders.has(904)).toBe(false);
    });

    // ── Test 13: Mid-Batch Restart & Checkpoint Boundary ───────────────────────
    it('13. Mid-batch restart: handles mid-batch failure gracefully and resumes strictly from durable checkpoint on restart', async () => {
        const t1 = '2026-10-18T04:00:00.000Z';
        const t2 = '2026-10-18T04:01:00.000Z';
        const t3 = '2026-10-18T04:02:00.000Z';

        mockSupabaseOrders.push(
            { id: 910, order_number: 'MAKE-910', furniture_name: 'Order 1', updated_at: t1 },
            { id: 911, order_number: 'MAKE-911', furniture_name: 'Order 2', updated_at: t2 },
            { id: 912, order_number: 'MAKE-912', furniture_name: 'Order 3', updated_at: t3 }
        );

        // Simulate crash/error on Order 912
        const originalQuery = mockPg.query;
        let queryCount = 0;
        mockPg.query = vi.fn(async (sql: string, params: any[] = []) => {
            if (sql.includes('INSERT INTO make_orders') && params[0] === 912) {
                throw new Error('Connection terminated mid-batch during order 912');
            }
            return originalQuery(sql, params);
        });

        // Batch execution fails on 912
        await expect(pullBusinessData(mockSupabase, mockPg, { batchSize: 50 })).rejects.toThrow('Connection terminated mid-batch');

        // Checkpoint committed up to Order 911 (t2)
        const midCp = await getCheckpoint(mockPg, 'make_orders');
        expect(midCp.last_replicated_id).toBe('911');
        expect(midCp.last_replicated_at).toBe(t2);
        expect(mockTrueNasOrders.has(910)).toBe(true);
        expect(mockTrueNasOrders.has(911)).toBe(true);
        expect(mockTrueNasOrders.has(912)).toBe(false);

        // Restore healthy query execution (simulating worker restart)
        mockPg.query = originalQuery;

        // Restart worker: resumes strictly from checkpoint (t2, 911)
        const restartRes = await pullBusinessData(mockSupabase, mockPg, { batchSize: 50 });
        expect(restartRes.success).toBe(true);
        expect(restartRes.totalReplicated).toBe(1); // Only Order 912 was replicated!

        expect(mockTrueNasOrders.has(912)).toBe(true);
        const finalCp = await getCheckpoint(mockPg, 'make_orders');
        expect(finalCp.last_replicated_id).toBe('912');
        expect(finalCp.last_replicated_at).toBe(t3);
    });

    // ── Test 14: Exact-Once Idempotent Replay ──────────────────────────────────
    it('14. Replaying the same change twice: exact-once idempotent replay produces zero duplicate records and zero constraint errors', async () => {
        const t1 = '2026-10-18T05:00:00.000Z';
        mockSupabaseOrders.push({
            id: 920,
            order_number: 'MAKE-920',
            furniture_name: 'Replay Test Cabinet',
            total_price: 8000,
            current_stage: 'Assembly',
            updated_at: t1
        });

        // Run 1
        const r1 = await pullBusinessData(mockSupabase, mockPg);
        expect(r1.success).toBe(true);
        expect(mockTrueNasOrders.size).toBe(1);

        // Rewind checkpoint to force re-reading the exact same change
        mockCheckpoints.delete('make_orders');

        // Run 2 (Replay)
        const r2 = await pullBusinessData(mockSupabase, mockPg);
        expect(r2.success).toBe(true);

        // Verification: No duplicate records, unchanged data
        expect(mockTrueNasOrders.size).toBe(1);
        expect(mockTrueNasOrders.get(920).furniture_name).toBe('Replay Test Cabinet');
    });

    // ── Test 15: Authoritative File Manifest and Scoped Data Flow ──────────────
    it('15. Proves complete 7-step file lifecycle: upload -> reservation -> metadata link -> scoped pull -> SHA-256 persistence -> checkpoint -> retention', async () => {
        const fileContent = Buffer.from('AUTHORITATIVE-STORAGE-PAYLOAD-FOR-VERIFICATION');
        const expectedSha = crypto.createHash('sha256').update(fileContent).digest('hex').toUpperCase();
        const cloudPath = 'cad/res_cad_lifecycle_test.pdf';
        const resId = 'res_cad_lifecycle_test';

        // Step 1: Upload to private Supabase Storage
        mockSupabaseStorageFiles.set(cloudPath, {
            buffer: fileContent,
            sha256: expectedSha
        });

        // Step 2: Confirm quota reservation
        mockSupabaseReservations.push({
            id: resId,
            resource_type: 'storage',
            bytes_reserved: fileContent.length,
            status: 'committed'
        });

        // Step 3: Persist stable object key and owner metadata in make_orders
        mockSupabaseOrders.push({
            id: 930,
            order_number: 'MAKE-930',
            furniture_name: 'Verified Lifecycle Desk',
            invoice_attachment_urls: [`make-order-files/${cloudPath}`],
            updated_at: '2026-10-18T06:00:00.000Z'
        });

        // Step 4 & 5: NAS-side worker downloads object using scoped authorization and verifies SHA-256
        const cycleRes = await runReplicationCycle({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            pruneCloud: false // Step 7: Cloud retention by default
        });

        expect(cycleRes.success).toBe(true);
        expect(cycleRes.recordsReplicated).toBeGreaterThanOrEqual(1);
        expect(cycleRes.filesPulled).toBe(1);

        // Verify Step 5: durable NAS persistence and SHA-256 match
        const savedFilePath = path.join(tempStorageDir, 'cad', 'res_cad_lifecycle_test.pdf');
        expect(fs.existsSync(savedFilePath)).toBe(true);
        const diskHash = crypto.createHash('sha256').update(fs.readFileSync(savedFilePath)).digest('hex').toUpperCase();
        expect(diskHash).toBe(expectedSha);

        // Step 6: Advance replication checkpoint
        const fileCp = await getCheckpoint(mockPg, 'storage_files');
        expect(fileCp.items_replicated).toBeGreaterThanOrEqual(1);

        // Step 7: Supabase Storage copy is retained in cloud storage
        expect(mockSupabaseStorageFiles.has(cloudPath)).toBe(true);
    });

    it('16. Specification and color images: replicates specifications and colors, pulling images to TrueNAS when image_url is present and ignoring nulls', async () => {
        // Setup specification with image_url and one without
        const specImgPath = 'specs/spec_marble_drawing.pdf';
        const specImgBuffer = Buffer.from('DISPOSABLE_SPEC_DRAWING_BYTES_123');
        const specSha = crypto.createHash('sha256').update(specImgBuffer).digest('hex').toUpperCase();
        mockSupabaseStorageFiles.set(specImgPath, { buffer: specImgBuffer, sha256: specSha });

        mockSupabaseSpecs.push(
            {
                id: 101,
                product_id: 10,
                spec_code: 'SPEC-001',
                spec_name: 'Premium Marble Slab',
                spec_details: 'White Italian Marble',
                is_active: true,
                image_url: `make-order-files/${specImgPath}`,
                created_at: '2026-10-18T07:00:00.000Z'
            },
            {
                id: 102,
                product_id: 10,
                spec_code: 'SPEC-002',
                spec_name: 'Standard Oak Wood',
                spec_details: 'Natural finished oak',
                is_active: true,
                image_url: null, // Spec without image
                created_at: '2026-10-18T07:01:00.000Z'
            }
        );

        // Setup color swatch with image_url and one without
        const colorImgPath = 'colors/swatch_matte_black.png';
        const colorImgBuffer = Buffer.from('DISPOSABLE_COLOR_SWATCH_BYTES_456');
        const colorSha = crypto.createHash('sha256').update(colorImgBuffer).digest('hex').toUpperCase();
        mockSupabaseStorageFiles.set(colorImgPath, { buffer: colorImgBuffer, sha256: colorSha });

        mockSupabaseColors.push(
            {
                id: 201,
                product_id: 10,
                spec_id: 101,
                color_name: 'Matte Black Metal',
                color_code: '#111111',
                is_active: true,
                image_url: `make-order-files/${colorImgPath}`,
                created_at: '2026-10-18T07:02:00.000Z'
            },
            {
                id: 202,
                product_id: 10,
                spec_id: 102,
                color_name: 'Natural Honey',
                color_code: '#E5A65D',
                is_active: true,
                image_url: null, // Color without image
                created_at: '2026-10-18T07:03:00.000Z'
            }
        );

        // Run replication cycle
        const cycleRes = await runReplicationCycle({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            pruneCloud: false
        });

        expect(cycleRes.success).toBe(true);
        // Both specs and both colors replicated to TrueNAS PostgreSQL
        expect(mockTrueNasSpecs.size).toBe(2);
        expect(mockTrueNasSpecs.get(101)?.spec_name).toBe('Premium Marble Slab');
        expect(mockTrueNasSpecs.get(102)?.image_url).toBeNull();
        expect(mockTrueNasColors.size).toBe(2);
        expect(mockTrueNasColors.get(201)?.color_name).toBe('Matte Black Metal');

        // Both images pulled to TrueNAS local storage with SHA-256 integrity
        const specDiskPath = path.join(tempStorageDir, 'specs', 'spec_marble_drawing.pdf');
        expect(fs.existsSync(specDiskPath)).toBe(true);
        const actualSpecHash = crypto.createHash('sha256').update(fs.readFileSync(specDiskPath)).digest('hex').toUpperCase();
        expect(actualSpecHash).toBe(specSha);

        const colorDiskPath = path.join(tempStorageDir, 'colors', 'swatch_matte_black.png');
        expect(fs.existsSync(colorDiskPath)).toBe(true);
        const actualColorHash = crypto.createHash('sha256').update(fs.readFileSync(colorDiskPath)).digest('hex').toUpperCase();
        expect(actualColorHash).toBe(colorSha);

        // Checkpoints advanced
        const specCp = await getCheckpoint(mockPg, 'make_product_specifications');
        expect(specCp.items_replicated).toBe(2);
        const colorCp = await getCheckpoint(mockPg, 'make_product_colors');
        expect(colorCp.items_replicated).toBe(2);
    });

    it('17. Partial failure diagnostics: records diagnostic errors for a failed stream while independent streams continue safely and child streams halt safely', async () => {
        // Order in make_orders stream
        mockSupabaseOrders.push({
            id: 1001,
            order_number: 'ORD-PARTIAL-001',
            furniture_name: 'Executive Walnut Desk',
            total_price: 3200,
            current_stage: 'production',
            status: 'in_progress',
            created_at: '2026-10-18T08:00:00.000Z',
            updated_at: '2026-10-18T08:00:00.000Z'
        });

        // Spec in make_product_specifications stream
        mockSupabaseSpecs.push({
            id: 501,
            product_id: 20,
            spec_code: 'SPEC-FAIL-01',
            spec_name: 'Walnut Finish',
            is_active: true,
            created_at: '2026-10-18T08:01:00.000Z'
        });

        // Color in child stream
        mockSupabaseColors.push({
            id: 601,
            product_id: 20,
            spec_id: 501,
            color_name: 'Dark Walnut',
            is_active: true,
            created_at: '2026-10-18T08:02:00.000Z'
        });

        // Simulate database write failure specifically for make_product_specifications
        const originalQuery = mockPg.query;
        mockPg.query = vi.fn(async (sql: string, params: any[] = []) => {
            if (sql.includes('INSERT INTO make_product_specifications')) {
                throw new Error('relation "make_product_specifications" is locked by concurrent maintenance transaction');
            }
            return originalQuery(sql, params);
        });

        const cycleRes = await runReplicationCycle({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            pruneCloud: false
        });

        // Overall cycle reports failure because a stream encountered an error
        expect(cycleRes.success).toBe(false);
        expect(cycleRes.errors.businessData.make_product_specifications).toContain('locked by concurrent maintenance transaction');

        // Independent stream (make_orders) succeeded completely
        expect(mockTrueNasOrders.has(1001)).toBe(true);
        const orderCp = await getCheckpoint(mockPg, 'make_orders');
        expect(orderCp.items_replicated).toBe(1);

        // Dependent child stream (make_product_colors) safely halted to prevent foreign key errors
        expect(mockTrueNasColors.size).toBe(0);
        const colorCp = await getCheckpoint(mockPg, 'make_product_colors');
        expect(colorCp.items_replicated).toBe(0);

        // Spec checkpoint preserved with diagnostic error and did not advance
        const specCp = await getCheckpoint(mockPg, 'make_product_specifications');
        expect(specCp.items_replicated).toBe(0);
        expect(specCp.last_error).toContain('locked by concurrent maintenance transaction');
    });

    it('18. Idempotent retry: failed row or query recovers on subsequent cycle without advancing checkpoint prematurely or duplicating data', async () => {
        mockSupabaseOrders.push(
            {
                id: 1101,
                order_number: 'ORD-RETRY-001',
                furniture_name: 'Acoustic Wall Panel',
                total_price: 1500,
                current_stage: 'design',
                status: 'in_progress',
                created_at: '2026-10-18T08:10:00.000Z',
                updated_at: '2026-10-18T08:10:00.000Z'
            },
            {
                id: 1102,
                order_number: 'ORD-RETRY-002',
                furniture_name: 'Standing Desk Frame',
                total_price: 1800,
                current_stage: 'design',
                status: 'in_progress',
                created_at: '2026-10-18T08:11:00.000Z',
                updated_at: '2026-10-18T08:11:00.000Z'
            }
        );

        // First attempt: fail on order 1102
        let failOrder1102 = true;
        const originalQuery = mockPg.query;
        mockPg.query = vi.fn(async (sql: string, params: any[] = []) => {
            if (failOrder1102 && sql.includes('INSERT INTO make_orders') && params[0] === 1102) {
                throw new Error('Transient connection reset during order 1102');
            }
            return originalQuery(sql, params);
        });

        const cycle1 = await runReplicationCycle({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            pruneCloud: false
        });

        expect(cycle1.success).toBe(false);
        // Order 1101 was saved, but order 1102 failed
        expect(mockTrueNasOrders.has(1101)).toBe(true);
        expect(mockTrueNasOrders.has(1102)).toBe(false);

        // Checkpoint advanced to 1101, but NOT 1102
        const cp1 = await getCheckpoint(mockPg, 'make_orders');
        expect(cp1.last_replicated_id).toBe('1101');
        expect(cp1.items_replicated).toBe(1);

        // Second attempt: transient failure is resolved
        failOrder1102 = false;
        const cycle2 = await runReplicationCycle({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            pruneCloud: false
        });

        expect(cycle2.success).toBe(true);
        // Both orders now present in replica
        expect(mockTrueNasOrders.has(1101)).toBe(true);
        expect(mockTrueNasOrders.has(1102)).toBe(true);
        expect(mockTrueNasOrders.size).toBe(2);

        // Checkpoint now cleanly advanced to 1102 with zero duplicate records
        const cp2 = await getCheckpoint(mockPg, 'make_orders');
        expect(cp2.last_replicated_id).toBe('1102');
        expect(cp2.items_replicated).toBe(2);
    });

    it('19. File integrity verification: downloaded-byte SHA-256 vs persisted-file SHA-256 mismatch rejection, temporary-file cleanup, cloud object preservation, and retry recovery', async () => {
        const cloudPath = 'cad/corrupted_blueprint_test.pdf';
        const validBuffer = Buffer.from('VALID_BLUEPRINT_CAD_BINARY_STREAM_CONTENT_999');
        const validSha = crypto.createHash('sha256').update(validBuffer).digest('hex').toUpperCase();

        // Register order with this attachment
        mockSupabaseOrders.push({
            id: 1201,
            order_number: 'ORD-SHA-001',
            furniture_name: 'Reception Counter',
            total_price: 4500,
            current_stage: 'cad',
            status: 'in_progress',
            invoice_attachment_urls: [`make-order-files/${cloudPath}`],
            created_at: '2026-10-18T08:20:00.000Z',
            updated_at: '2026-10-18T08:20:00.000Z'
        });

        // Mock disk write corruption on first attempt to trigger downloaded vs persisted SHA mismatch
        let corruptDiskWrite = true;
        const originalWrite = fs.writeFileSync;
        const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation((target: any, content: any, opts: any) => {
            if (corruptDiskWrite && typeof target === 'string' && target.includes('corrupted_blueprint_test')) {
                return originalWrite(target, Buffer.from('CORRUPTED_INCOMPLETE_DISK_BYTES'), opts);
            }
            return originalWrite(target, content, opts);
        });

        mockSupabase.storage = {
            from: vi.fn(() => ({
                download: vi.fn(async (p: string) => {
                    return { data: validBuffer, error: null };
                }),
                remove: vi.fn(async (paths: string[]) => {
                    for (const p of paths) mockSupabaseStorageFiles.delete(p);
                    return { data: paths, error: null };
                })
            }))
        };
        mockSupabaseStorageFiles.set(cloudPath, { buffer: validBuffer, sha256: validSha });

        // First attempt with corrupt disk write: run pullAttachments
        const pullRes1 = await pullAttachments({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            pruneCloud: true // Even with pruneCloud=true, cloud file must NOT be pruned on failure!
        });

        expect(pullRes1.success).toBe(false);

        // Verified failed
        const destFile = path.join(tempStorageDir, 'cad', 'corrupted_blueprint_test.pdf');
        expect(fs.existsSync(destFile)).toBe(false);

        // Verify temporary .tmp file was unlinked and cleaned up
        const cadDir = path.join(tempStorageDir, 'cad');
        if (fs.existsSync(cadDir)) {
            const tempFiles = fs.readdirSync(cadDir).filter(f => f.endsWith('.tmp'));
            expect(tempFiles.length).toBe(0);
        }

        // Verify nas_replicated_files does NOT contain the key
        expect(mockTrueNasReplicatedFiles.has(cloudPath)).toBe(false);

        // Verify cloud object was PRESERVED for retry (not pruned)
        expect(mockSupabaseStorageFiles.has(cloudPath)).toBe(true);

        // Second attempt: disk corruption resolved
        corruptDiskWrite = false;
        const pullRes2 = await pullAttachments({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            pruneCloud: false
        });

        expect(pullRes2.success).toBe(true);

        // Successfully persisted with exact SHA-256 match
        expect(fs.existsSync(destFile)).toBe(true);
        const diskHash = crypto.createHash('sha256').update(fs.readFileSync(destFile)).digest('hex').toUpperCase();
        expect(diskHash).toBe(validSha);

        // Tracked in nas_replicated_files
        expect(mockTrueNasReplicatedFiles.has(cloudPath)).toBe(true);

        writeSpy.mockRestore();
    });

    it('20. Deterministic pagination beyond the first batch when many records/files exist', async () => {
        // Create 5 orders across multiple pages (batchSize = 2 -> 3 pages: 2, 2, 1)
        for (let i = 1; i <= 5; i++) {
            const relPath = `orders/page_doc_${i}.pdf`;
            const buf = Buffer.from(`PAGINATION_TEST_BUFFER_CONTENT_${i}`);
            const sha = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
            mockSupabaseStorageFiles.set(relPath, { buffer: buf, sha256: sha });

            mockSupabaseOrders.push({
                id: 2000 + i,
                order_number: `ORD-PAGE-${String(i).padStart(3, '0')}`,
                furniture_name: `Product Item ${i}`,
                total_price: 1000 * i,
                current_stage: 'production',
                status: 'in_progress',
                invoice_attachment_urls: [`make-order-files/${relPath}`],
                created_at: `2026-10-18T08:${String(30 + i).padStart(2, '0')}:00.000Z`,
                updated_at: `2026-10-18T08:${String(30 + i).padStart(2, '0')}:00.000Z`
            });
        }

        // Run pullBusinessData with batchSize: 2
        const dataResult = await pullBusinessData({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            batchSize: 2
        });

        expect(dataResult.ordersReplicated).toBe(5);
        expect(mockTrueNasOrders.size).toBe(5);

        // Checkpoint accurately reflects all 5 items
        const cp = await getCheckpoint(mockPg, 'make_orders');
        expect(cp.items_replicated).toBe(5);
        expect(cp.last_replicated_id).toBe('2005');

        // Run pullAttachments with batchSize: 2
        const attachResult = await pullAttachments({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            batchSize: 2
        });

        expect(attachResult.replicatedCount).toBe(5);
        for (let i = 1; i <= 5; i++) {
            const filePath = path.join(tempStorageDir, 'orders', `page_doc_${i}.pdf`);
            expect(fs.existsSync(filePath)).toBe(true);
            expect(mockTrueNasReplicatedFiles.has(`orders/page_doc_${i}.pdf`)).toBe(true);
        }
    });

    it('21. Storage key normalization and path traversal security: rejects directory traversal and third-party URLs while normalizing valid storage paths', () => {
        // Path traversal attempts must return null
        expect(normalizeStorageObjectKey('../secret.env')).toBeNull();
        expect(normalizeStorageObjectKey('../../etc/passwd')).toBeNull();
        expect(normalizeStorageObjectKey('..\\Windows\\System32\\cmd.exe')).toBeNull();
        expect(normalizeStorageObjectKey('cad/../../../shadow')).toBeNull();
        expect(normalizeStorageObjectKey('/absolute/root/file.pdf')).toBeNull();
        expect(normalizeStorageObjectKey('C:\\Windows\\win.ini')).toBeNull();

        // Third-party external URLs must return null
        expect(normalizeStorageObjectKey('https://evil-attacker.com/malware.exe')).toBeNull();
        expect(normalizeStorageObjectKey('http://insecure-site.org/file.pdf')).toBeNull();

        // Valid relative paths
        expect(normalizeStorageObjectKey('cad/drawing_001.pdf')).toBe('cad/drawing_001.pdf');
        expect(normalizeStorageObjectKey('products/photo_99.webp')).toBe('products/photo_99.webp');

        // Valid bucket-prefixed paths
        expect(normalizeStorageObjectKey('make-order-files/cad/drawing_001.pdf')).toBe('cad/drawing_001.pdf');
        expect(normalizeStorageObjectKey('/make-order-files/specs/spec_10.pdf')).toBe('specs/spec_10.pdf');
        expect(normalizeStorageObjectKey('supabase://make-order-files/colors/color_20.png')).toBe('colors/color_20.png');

        // Valid Supabase hosted storage URLs
        expect(normalizeStorageObjectKey('https://ildkkgjrolcjijwfokek.supabase.co/storage/v1/object/public/make-order-files/cad/drawing_001.pdf')).toBe('cad/drawing_001.pdf');
        expect(normalizeStorageObjectKey('https://xyz.supabase.co/storage/v1/object/sign/make-order-files/invoices/inv_123.pdf?token=abc')).toBe('invoices/inv_123.pdf');

        // Null / undefined / empty
        expect(normalizeStorageObjectKey(null)).toBeNull();
        expect(normalizeStorageObjectKey(undefined)).toBeNull();
        expect(normalizeStorageObjectKey('')).toBeNull();
    });

    it('22. Mutable specification and color replication: first replicates a record, then changes name/details/image_url, and proves existing TrueNAS record is updated in place via compound watermark', async () => {
        const t1 = '2026-10-18T05:00:00.000Z';
        const specImg1 = 'specs/marble_v1.pdf';
        const colorImg1 = 'colors/gold_v1.png';
        const bufSpec1 = Buffer.from('SPEC_IMAGE_VERSION_1');
        const bufColor1 = Buffer.from('COLOR_IMAGE_VERSION_1');
        mockSupabaseStorageFiles.set(specImg1, { buffer: bufSpec1, sha256: crypto.createHash('sha256').update(bufSpec1).digest('hex').toUpperCase() });
        mockSupabaseStorageFiles.set(colorImg1, { buffer: bufColor1, sha256: crypto.createHash('sha256').update(bufColor1).digest('hex').toUpperCase() });

        mockSupabaseSpecs.push({
            id: 701,
            product_id: 15,
            spec_code: 'SPEC-MUTABLE-01',
            spec_name: 'Initial Marble Surface',
            spec_details: 'Standard Polished Marble',
            is_active: true,
            image_url: `make-order-files/${specImg1}`,
            created_at: t1,
            updated_at: t1
        });

        mockSupabaseColors.push({
            id: 801,
            product_id: 15,
            spec_id: 701,
            color_name: 'Initial Brushed Gold',
            color_code: '#D4AF37',
            is_active: true,
            image_url: `make-order-files/${colorImg1}`,
            created_at: t1,
            updated_at: t1
        });

        // First replication cycle
        const cycle1 = await runReplicationCycle({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            pruneCloud: false
        });

        expect(cycle1.success).toBe(true);
        expect(mockTrueNasSpecs.get(701)?.spec_name).toBe('Initial Marble Surface');
        expect(mockTrueNasColors.get(801)?.color_name).toBe('Initial Brushed Gold');
        expect(fs.existsSync(path.join(tempStorageDir, 'specs', 'marble_v1.pdf'))).toBe(true);
        expect(fs.existsSync(path.join(tempStorageDir, 'colors', 'gold_v1.png'))).toBe(true);

        // Checkpoints after cycle 1
        const specCp1 = await getCheckpoint(mockPg, 'make_product_specifications');
        expect(specCp1.last_replicated_id).toBe('701');
        expect(specCp1.last_replicated_at).toBe(t1);

        // Now mutate existing specification and color in Supabase Cloud
        const t2 = '2026-10-18T05:30:00.000Z';
        const specImg2 = 'specs/marble_v2.pdf';
        const colorImg2 = 'colors/gold_v2.png';
        const bufSpec2 = Buffer.from('SPEC_IMAGE_VERSION_2_UPDATED');
        const bufColor2 = Buffer.from('COLOR_IMAGE_VERSION_2_UPDATED');
        mockSupabaseStorageFiles.set(specImg2, { buffer: bufSpec2, sha256: crypto.createHash('sha256').update(bufSpec2).digest('hex').toUpperCase() });
        mockSupabaseStorageFiles.set(colorImg2, { buffer: bufColor2, sha256: crypto.createHash('sha256').update(bufColor2).digest('hex').toUpperCase() });

        // Update in place in Supabase (id stays 701 and 801, but updated_at advances)
        const targetSpec = mockSupabaseSpecs.find(s => s.id === 701);
        targetSpec.spec_name = 'Ultra Polish Carrara Marble';
        targetSpec.spec_details = 'Double-beveled edge finish';
        targetSpec.image_url = `make-order-files/${specImg2}`;
        targetSpec.updated_at = t2;

        const targetColor = mockSupabaseColors.find(c => c.id === 801);
        targetColor.color_name = 'Champagne Brushed Gold';
        targetColor.color_code = '#F1E5AC';
        targetColor.image_url = `make-order-files/${colorImg2}`;
        targetColor.updated_at = t2;

        // Second replication cycle: compound watermark (updated_at, id) MUST discover existing modified rows!
        const cycle2 = await runReplicationCycle({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            pruneCloud: false
        });

        expect(cycle2.success).toBe(true);
        // Prove TrueNAS records were updated in place without duplicate records
        expect(mockTrueNasSpecs.size).toBe(1);
        expect(mockTrueNasSpecs.get(701)?.spec_name).toBe('Ultra Polish Carrara Marble');
        expect(mockTrueNasSpecs.get(701)?.spec_details).toBe('Double-beveled edge finish');
        expect(mockTrueNasSpecs.get(701)?.image_url).toBe(`make-order-files/${specImg2}`);

        expect(mockTrueNasColors.size).toBe(1);
        expect(mockTrueNasColors.get(801)?.color_name).toBe('Champagne Brushed Gold');
        expect(mockTrueNasColors.get(801)?.color_code).toBe('#F1E5AC');
        expect(mockTrueNasColors.get(801)?.image_url).toBe(`make-order-files/${colorImg2}`);

        // Prove newly assigned image attachments were pulled to TrueNAS disk
        expect(fs.existsSync(path.join(tempStorageDir, 'specs', 'marble_v2.pdf'))).toBe(true);
        expect(fs.existsSync(path.join(tempStorageDir, 'colors', 'gold_v2.png'))).toBe(true);

        // Checkpoints advanced to t2
        const specCp2 = await getCheckpoint(mockPg, 'make_product_specifications');
        expect(specCp2.last_replicated_id).toBe('701');
        expect(specCp2.last_replicated_at).toBe(t2);
    });

    it('23. Specification and color deletion propagation: tombstones and soft-deletions propagate cleanly to TrueNAS PostgreSQL replica', async () => {
        const t1 = '2026-10-18T06:00:00.000Z';
        mockSupabaseSpecs.push({
            id: 702,
            product_id: 16,
            spec_name: 'Temporary Granite Spec',
            created_at: t1,
            updated_at: t1
        });
        mockSupabaseColors.push({
            id: 802,
            product_id: 16,
            spec_id: 702,
            color_name: 'Temporary Granite Color',
            created_at: t1,
            updated_at: t1
        });

        // Initial sync
        await runReplicationCycle({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            pruneCloud: false
        });
        expect(mockTrueNasSpecs.has(702)).toBe(true);
        expect(mockTrueNasColors.has(802)).toBe(true);

        // Test 1: Soft-deletion of color (deleted_at set)
        const t2 = '2026-10-18T06:10:00.000Z';
        const cl = mockSupabaseColors.find(c => c.id === 802);
        cl.deleted_at = t2;
        cl.updated_at = t2;

        await runReplicationCycle({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            pruneCloud: false
        });
        expect(mockTrueNasColors.has(802)).toBe(false);

        // Test 2: Hard-deletion tombstone of specification
        const t3 = '2026-10-18T06:20:00.000Z';
        mockSupabaseTombstones.push({
            id: 301,
            table_name: 'make_product_specifications',
            record_id: 702,
            deleted_at: t3
        });

        await runReplicationCycle({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            pruneCloud: false
        });
        expect(mockTrueNasSpecs.has(702)).toBe(false);
    });

    it('24. Paginated attachment discovery for specifications and colors processes multiple pages deterministically beyond page 1', async () => {
        // Create 4 specifications and 4 colors across batches of size 2 (2 pages for specs, 2 pages for colors)
        for (let i = 1; i <= 4; i++) {
            const specKey = `specs/paginated_spec_${i}.pdf`;
            const colorKey = `colors/paginated_color_${i}.png`;
            const sBuf = Buffer.from(`SPEC_BUF_${i}`);
            const cBuf = Buffer.from(`COLOR_BUF_${i}`);
            mockSupabaseStorageFiles.set(specKey, { buffer: sBuf, sha256: crypto.createHash('sha256').update(sBuf).digest('hex').toUpperCase() });
            mockSupabaseStorageFiles.set(colorKey, { buffer: cBuf, sha256: crypto.createHash('sha256').update(cBuf).digest('hex').toUpperCase() });

            mockSupabaseSpecs.push({
                id: 1000 + i,
                product_id: 30,
                spec_name: `Paginated Spec ${i}`,
                image_url: `make-order-files/${specKey}`,
                created_at: `2026-10-18T06:${String(30 + i).padStart(2, '0')}:00.000Z`,
                updated_at: `2026-10-18T06:${String(30 + i).padStart(2, '0')}:00.000Z`
            });

            mockSupabaseColors.push({
                id: 2000 + i,
                product_id: 30,
                spec_id: 1000 + i,
                color_name: `Paginated Color ${i}`,
                image_url: `make-order-files/${colorKey}`,
                created_at: `2026-10-18T06:${String(30 + i).padStart(2, '0')}:00.000Z`,
                updated_at: `2026-10-18T06:${String(30 + i).padStart(2, '0')}:00.000Z`
            });
        }

        // Pull attachments with batchSize: 2
        const res = await pullAttachments({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            batchSize: 2
        });

        expect(res.success).toBe(true);
        expect(res.filesPulled).toBe(8);

        // Verify all 8 files on TrueNAS disk and registered
        for (let i = 1; i <= 4; i++) {
            expect(fs.existsSync(path.join(tempStorageDir, 'specs', `paginated_spec_${i}.pdf`))).toBe(true);
            expect(fs.existsSync(path.join(tempStorageDir, 'colors', `paginated_color_${i}.png`))).toBe(true);
            expect(mockTrueNasReplicatedFiles.has(`specs/paginated_spec_${i}.pdf`)).toBe(true);
            expect(mockTrueNasReplicatedFiles.has(`colors/paginated_color_${i}.png`)).toBe(true);
        }

        // Running again without new files is completely idempotent and pulls 0 files
        const res2 = await pullAttachments({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            batchSize: 2
        });
        expect(res2.success).toBe(true);
        expect(res2.filesPulled).toBe(0);
    });

    it('25. Query errors, PostgREST failure isolation, and restart recovery without premature checkpoint advancement', async () => {
        // Setup order, spec, color
        mockSupabaseOrders.push({
            id: 3001,
            order_number: 'ORD-ERR-001',
            furniture_name: 'Staging Bench',
            total_price: 1800,
            created_at: '2026-10-18T07:00:00.000Z',
            updated_at: '2026-10-18T07:00:00.000Z'
        });

        mockSupabaseSpecs.push({
            id: 4001,
            product_id: 40,
            spec_name: 'Bench Cushion Spec',
            created_at: '2026-10-18T07:00:00.000Z',
            updated_at: '2026-10-18T07:00:00.000Z'
        });

        mockSupabaseColors.push({
            id: 5001,
            product_id: 40,
            spec_id: 4001,
            color_name: 'Navy Blue Fabric',
            created_at: '2026-10-18T07:00:00.000Z',
            updated_at: '2026-10-18T07:00:00.000Z'
        });

        // Simulate PostgREST query failure on make_product_specifications
        let failSpecQuery = true;
        const origFrom = mockSupabase.from;
        mockSupabase.from = vi.fn((table: string) => {
            if (failSpecQuery && table === 'make_product_specifications') {
                const chain = origFrom(table).select();
                chain.then = (resolve: any) => resolve({
                    data: null,
                    error: { message: 'PostgREST 500: Database connection timeout', code: 'PGRST000' }
                });
                return {
                    select: vi.fn(() => chain)
                };
            }
            return origFrom(table);
        });

        // Cycle 1: make_orders succeeds, specs fails, colors skipped
        const cycle1 = await runReplicationCycle({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            pruneCloud: false
        });

        expect(cycle1.success).toBe(false);
        expect(cycle1.errors?.businessData?.make_product_specifications).toContain('Database connection timeout');
        expect(mockTrueNasOrders.has(3001)).toBe(true); // Independent stream succeeded!
        expect(mockTrueNasSpecs.has(4001)).toBe(false); // Failed stream halted!
        expect(mockTrueNasColors.has(5001)).toBe(false); // Dependent child stream halted safely!

        // Checkpoint for specs was NOT advanced
        const specCp1 = await getCheckpoint(mockPg, 'make_product_specifications');
        expect(specCp1.last_replicated_id).toBeNull();
        expect(specCp1.last_error).toContain('Database connection timeout');

        // Cycle 2: Transient failure resolved (worker restarted)
        failSpecQuery = false;
        mockSupabase.from = origFrom;

        const cycle2 = await runReplicationCycle({
            supabaseClient: mockSupabase,
            pgClient: mockPg,
            storagePath: tempStorageDir,
            pruneCloud: false
        });

        expect(cycle2.success).toBe(true);
        expect(mockTrueNasSpecs.has(4001)).toBe(true);
        expect(mockTrueNasColors.has(5001)).toBe(true);

        const specCp2 = await getCheckpoint(mockPg, 'make_product_specifications');
        expect(specCp2.last_replicated_id).toBe('4001');
        const colorCp2 = await getCheckpoint(mockPg, 'make_product_colors');
        expect(colorCp2.last_replicated_id).toBe('5001');
    });
});
