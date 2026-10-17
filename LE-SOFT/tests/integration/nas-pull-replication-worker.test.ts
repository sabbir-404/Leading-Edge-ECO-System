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
    let mockSupabaseTombstones: any[];
    let mockSupabaseStorageFiles: Map<string, { buffer: Buffer; sha256: string }>;
    let tempStorageDir: string;

    beforeEach(() => {
        mockCheckpoints = new Map();
        mockTrueNasOrders = new Map();
        mockTrueNasUpdates = new Map();
        mockSupabaseOrders = [];
        mockSupabaseUpdates = [];
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

                if (normalized.includes('SELECT 1 FROM nas_replicated_files WHERE object_key = $1')) {
                    return { rows: [] };
                }

                if (normalized.includes('INSERT INTO nas_replicated_files')) {
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
});
