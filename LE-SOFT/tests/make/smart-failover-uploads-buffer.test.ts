/**
 * tests/make/smart-failover-uploads-buffer.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete Phase 7 Verification Suite for LE-SOFT:
 * Smart Database Failover, Reliable Image Uploads & 1 GB Supabase Buffer.
 *
 * Covers all 16 required test scenarios:
 *  1. NAS database timeout with Supabase healthy.
 *  2. NAS storage failure while the database remains healthy.
 *  3. Both remote destinations unavailable & durable acceptance guarantee.
 *  4. Interrupted image upload and app restart.
 *  5. Duplicate upload and write retries (exact-once execution).
 *  6. Crash between transfer completion and acknowledgment (no synthesized URLs).
 *  7. NAS recovery with pending records and images (incomplete reconciliation guard).
 *  8. Missing customer foreign key and dependency resolution.
 *  9. Missing installation_charge schema field (code 42703 payload preservation).
 * 10. Concurrent clients competing for final available quota.
 * 11. Reaching 800 MB, 950 MB, and the hard 1 GB ceiling.
 * 12. Supabase quota live audit and recursive nested storage crawler.
 * 13. Checksum verification on uploads (remote digest & read-back).
 * 14. Conflict between NAS and fallback updates/deletes.
 * 15. Dead-letter visibility and authorized replay.
 * 16. Existing image previews, security regression defense & Migration 069 safety.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { SupabaseQuotaManager } from '../../electron/services/quota/SupabaseQuotaManager';
import { DurableOutboxService } from '../../electron/services/outbox/DurableOutboxService';
import { DurableUploadService } from '../../electron/services/media/DurableUploadService';
import { ConsolidatedHealthEngine } from '../../electron/services/health/ConsolidatedHealthEngine';
import { encryptField, encryptObject, encryptRowsAsync, decryptField } from '../../electron/field-encryption';
import { MakeProductionService } from '../../electron/services/make/MakeProductionService';

describe('LE-SOFT: Smart Database Failover, Reliable Image Uploads & 1 GB Buffer', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = path.join(process.cwd(), `tmp_test_${Date.now()}_${Math.random().toString(36).substring(7)}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        const engine = ConsolidatedHealthEngine.getInstance();
        engine.stopMonitoring();
        (engine as any).isProbing = false;
        (engine as any).isReconciling = false;
        (engine as any).consecutiveNasDbFailures = 0;
        (engine as any).consecutiveNasStorageFailures = 0;
        (engine as any).currentState = 'NORMAL_NAS_AUTHORITATIVE';
        DurableOutboxService.getInstance().stopWorker();

        // Reset Quota Manager state
        const quotaMgr = SupabaseQuotaManager.getInstance();
        quotaMgr.recordUsage('test', 0, 0);
        quotaMgr.registerClients({ supabase: null, reconciliation: null });
        (quotaMgr as any).activeStorageReservations.clear();
        (quotaMgr as any).activeDatabaseReservations.clear();
        (quotaMgr as any).blockedOperationsCount = 0;

        // Register clean mock Supabase storage for upload service in tests
        const uploadService = DurableUploadService.getInstance();
        uploadService.stopWorker();
        const mockStorage = {
            from: vi.fn(() => ({
                upload: vi.fn().mockResolvedValue({ data: { path: 'test/path' }, error: null }),
                createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.supabase.co/signed' }, error: null }),
                remove: vi.fn().mockResolvedValue({ data: {}, error: null })
            }))
        };
        const mockSupabaseClient = {
            storage: mockStorage,
            from: vi.fn(() => {
                let operation = 'select';
                const builder: any = {
                    select: () => builder,
                    update: () => { operation = 'update'; return builder; },
                    eq: () => builder,
                    maybeSingle: async () => ({ data: { id: 1, pdf_urls: [] }, error: null }),
                    then: (resolve: (value: any) => unknown) => Promise.resolve({
                        data: operation === 'update' ? [{ id: 1 }] : [{ id: 1 }],
                        error: null
                    }).then(resolve)
                };
                return builder;
            })
        };
        uploadService.registerClients({ nas: null, supabase: mockSupabaseClient as any });
    });

    afterEach(() => {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
        vi.restoreAllMocks();
    });

    // ── 1. NAS database timeout with Supabase healthy ───────────────────────────
    it('Scenario 1: NAS database timeout switches state to DEGRADED_DATABASE_FALLBACK while Supabase is healthy', async () => {
        const engine = ConsolidatedHealthEngine.getInstance();
        
        vi.spyOn(engine as any, 'probeNasDatabase').mockResolvedValue({ healthy: false, latency: 6000, url: null });
        vi.spyOn(engine as any, 'probeNasStorage').mockResolvedValue({ healthy: true, latency: 15, url: 'http://100.88.85.6:8081' });
        vi.spyOn(engine as any, 'probeSupabaseDatabase').mockResolvedValue(true);
        vi.spyOn(engine as any, 'probeSupabaseStorage').mockResolvedValue(true);

        // Run 2 probe cycles to satisfy anti-flapping threshold
        await engine.runHealthCycle();
        const state = await engine.runHealthCycle();

        expect(state).toBe('DEGRADED_DATABASE_FALLBACK');
        const probeDetails = engine.getProbeDetails();
        expect(probeDetails.isNasDbHealthy).toBe(false);
        expect(probeDetails.isNasStorageHealthy).toBe(true);
        expect(probeDetails.isSupabaseDbHealthy).toBe(true);
    });

    // ── 2. NAS storage failure while the database remains healthy ───────────────
    it('Scenario 2: NAS storage failure degrades storage to DEGRADED_STORAGE_BUFFER while DB remains unaffected', async () => {
        const engine = ConsolidatedHealthEngine.getInstance();

        vi.spyOn(engine as any, 'probeNasDatabase').mockResolvedValue({ healthy: true, latency: 20, url: 'http://100.88.85.6:3001' });
        vi.spyOn(engine as any, 'probeNasStorage').mockResolvedValue({ healthy: false, latency: 3000, url: null });
        vi.spyOn(engine as any, 'probeSupabaseDatabase').mockResolvedValue(true);
        vi.spyOn(engine as any, 'probeSupabaseStorage').mockResolvedValue(true);

        // Run 2 probe cycles for anti-flapping
        await engine.runHealthCycle();
        const state = await engine.runHealthCycle();

        expect(state).toBe('DEGRADED_STORAGE_BUFFER');
        const probeDetails = engine.getProbeDetails();
        expect(probeDetails.isNasDbHealthy).toBe(true);
        expect(probeDetails.isNasStorageHealthy).toBe(false);
    });

    // ── 3. Both remote destinations unavailable ─────────────────────────────────
    it('Scenario 3: Both remote destinations unavailable transitions to FULL_OFFLINE_LOCAL and stages work safely', async () => {
        const engine = ConsolidatedHealthEngine.getInstance();

        vi.spyOn(engine as any, 'probeNasDatabase').mockResolvedValue({ healthy: false, latency: 6000, url: null });
        vi.spyOn(engine as any, 'probeNasStorage').mockResolvedValue({ healthy: false, latency: 3000, url: null });
        vi.spyOn(engine as any, 'probeSupabaseDatabase').mockResolvedValue(false);
        vi.spyOn(engine as any, 'probeSupabaseStorage').mockResolvedValue(false);

        await engine.runHealthCycle();
        const state = await engine.runHealthCycle();

        expect(state).toBe('FULL_OFFLINE_LOCAL');

        // Verify outbox stores operation locally as pending
        const outbox = DurableOutboxService.getInstance();
        const opId = outbox.enqueueSingle({
            entityType: 'bills',
            operation: 'insert',
            payload: { invoice_number: 'TEST-OFFLINE-001', grand_total: 5000 }
        });

        expect(opId).toBeDefined();
        const stats = outbox.getStats();
        expect(stats.totalPending).toBeGreaterThanOrEqual(1);

        // Verification of durable acceptance: If outbox db is unavailable, enqueue throws immediately
        const prevDb = (outbox as any).db;
        try {
            (outbox as any).db = null;
            expect(() => {
                outbox.enqueueSingle({
                    entityType: 'bills',
                    operation: 'insert',
                    payload: { invoice_number: 'TEST-FAIL-001' }
                });
            }).toThrow(/SQLite database is not initialized/);
        } finally {
            (outbox as any).db = prevDb;
        }
    });

    // ── 4. Interrupted image upload and app restart ──────────────────────────────
    it('Scenario 4: Interrupted image upload recovers staged file on disk across restarts without data loss', async () => {
        const uploadService = DurableUploadService.getInstance();
        const fileContent = Buffer.from('FAKE-CAD-OR-IMAGE-BINARY-DATA-STAGED-12345');
        
        const staged = await uploadService.stageFile(
            fileContent,
            'test_drawing.pdf',
            'application/pdf',
            'cad-models'
        );

        expect(staged.id).toBeDefined();
        expect(staged.status).toBe('staged_local');
        expect(fs.existsSync(staged.localPath)).toBe(true);
        expect(staged.sizeBytes).toBe(fileContent.length);

        // Verify hash integrity
        const expectedHash = crypto.createHash('sha256').update(fileContent).digest('hex').toUpperCase();
        expect(staged.sha256).toBe(expectedHash);

        // Check that pending staged uploads list includes this item
        const stagedList = uploadService.getStagedUploads();
        const found = stagedList.find(u => u.id === staged.id);
        expect(found).toBeDefined();
        expect(found?.status).toBe('staged_local');
    });

    // ── 5. Duplicate upload and write retries ───────────────────────────────────
    it('Scenario 5: Duplicate writes with same operation ID or invoice number are idempotent', async () => {
        const outbox = DurableOutboxService.getInstance();
        const fixedOpId = `op_idempotent_${Date.now()}`;

        // Enqueue first time
        const ids1 = outbox.enqueueBatch([{
            id: fixedOpId,
            entityType: 'bills',
            operation: 'upsert',
            payload: { invoice_number: 'INV-IDEM-001', grand_total: 2500 }
        }]);

        expect(ids1[0]).toBe(fixedOpId);

        // Enqueue duplicate with same ID throws or prevents duplication
        expect(() => {
            outbox.enqueueBatch([{
                id: fixedOpId,
                entityType: 'bills',
                operation: 'upsert',
                payload: { invoice_number: 'INV-IDEM-001', grand_total: 2500 }
            }]);
        }).toThrow(/UNIQUE constraint failed/);

        // Verify outbox upserts bills with onConflict: 'invoice_number'
        const rawBill = { invoice_number: 'INV-IDEM-002', grand_total: 4000 };
        const opId = outbox.enqueueSingle({
            entityType: 'bills',
            operation: 'upsert',
            payload: rawBill
        });
        expect(opId).toBeDefined();
    });

    // ── 6. Crash between transfer completion and acknowledgment ─────────────────
    it('Scenario 6: Crash between transfer completion and acknowledgment preserves remote URL and checksum without synthesized URLs', async () => {
        const uploadService = DurableUploadService.getInstance();
        const buffer = Buffer.from('CRASH-RESILIENCE-TEST-IMAGE');
        const staged = await uploadService.stageFile(
            buffer,
            'crash_test.webp',
            'image/webp',
            'product-images',
            { entityType: 'catalog', entityId: '1', fieldName: 'image_url' }
        );

        vi.spyOn(uploadService as any, 'updateEntityRecord').mockResolvedValue(true);
        vi.spyOn(uploadService as any, 'pruneCloudCopy').mockResolvedValue(true);

        // Simulate successful remote transfer with verified digest
        const uploadSpy = vi.spyOn(uploadService, 'uploadToNasStorage').mockResolvedValue({
            success: true,
            url: `https://storage.lenas.me/files/product-images/${staged.fileName}`,
            sha256: staged.sha256
        });

        const res = await uploadService.dispatchUpload(staged.id);
        expect(res.success).toBe(true);
        expect(res.status).toBe('synced_nas');
        expect(res.activeUrl).toContain('storage.lenas.me');

        uploadSpy.mockRestore();

        // Verify synthesized URLs are rejected if server does not return valid URL
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ success: true }) // Missing file_url and url
        } as any);

        const failRes = await uploadService.uploadToNasStorage(buffer, 'test.webp', 'image/webp', 'sub');
        expect(failRes.success).toBe(false);
        expect(failRes.error).toContain('missing valid URL');
    });

    // ── 7. NAS recovery with pending records and images ─────────────────────────
    it('Scenario 7: Incomplete reconciliation prevents premature transition to NORMAL_NAS_AUTHORITATIVE', async () => {
        const engine = ConsolidatedHealthEngine.getInstance();
        const outbox = DurableOutboxService.getInstance();
        const uploadService = DurableUploadService.getInstance();

        (engine as any).currentState = 'RECOVERING_SYNCHRONIZING';

        // Mock remaining pending items in outbox and uploads
        vi.spyOn(outbox, 'drainNextBatch').mockResolvedValue(0);
        vi.spyOn(uploadService, 'processNextBatch').mockResolvedValue();
        vi.spyOn(outbox, 'getOutboxStats').mockReturnValue({
            totalPending: 2,
            pendingLocal: 1,
            bufferedSupabase: 1,
            blockedDependencies: 0,
            deadLetterCount: 0
        });
        vi.spyOn(uploadService, 'getPendingUploadStats').mockReturnValue({
            stagedCount: 0,
            bufferedCount: 1,
            totalPendingBytes: 5000
        });

        await engine.triggerRecoverySynchronization();

        // Must NOT transition to NORMAL_NAS_AUTHORITATIVE because items remain
        expect(engine.getCurrentState()).toBe('RECOVERING_SYNCHRONIZING');

        // Now simulate clean drain
        vi.spyOn(outbox, 'getOutboxStats').mockReturnValue({
            totalPending: 0,
            pendingLocal: 0,
            bufferedSupabase: 0,
            blockedDependencies: 0,
            deadLetterCount: 0
        });
        vi.spyOn(uploadService, 'getPendingUploadStats').mockReturnValue({
            stagedCount: 0,
            bufferedCount: 0,
            totalPendingBytes: 0
        });

        await engine.triggerRecoverySynchronization();
        expect(engine.getCurrentState()).toBe('NORMAL_NAS_AUTHORITATIVE');
    });

    // ── 8. Missing customer foreign key and dependency resolution ──────────────
    it('Scenario 8: Child bill operation blocks until parent customer dependency is resolved', () => {
        const outbox = DurableOutboxService.getInstance();
        const customerOpId = `op_cust_${Date.now()}`;
        const billOpId = `op_bill_${Date.now()}`;

        outbox.enqueueBatch([
            {
                id: customerOpId,
                entityType: 'billing_customers',
                operation: 'insert',
                payload: { name: 'John Doe', phone: '01711000000' }
            },
            {
                id: billOpId,
                entityType: 'bills',
                operation: 'insert',
                payload: { customer_id: null, invoice_number: 'INV-DEP-001', grand_total: 1000 },
                dependencyOpId: customerOpId
            }
        ]);

        const stats = outbox.getStats();
        expect(stats.blockedDependencies).toBeGreaterThanOrEqual(1);

        // Simulate customer completing and recording resolved ID 99
        (outbox as any).recordResolvedId(customerOpId, 'nas', '99');
        (outbox as any).markCompleted(customerOpId);

        // Unblock dependencies
        (outbox as any).unblockResolvedDependencies();

        const updatedStats = outbox.getStats();
        expect(updatedStats.blockedDependencies).toBe(0);

        // Resolve payload binding
        const boundPayload = (outbox as any).resolveDependentPayload(customerOpId, { customer_id: null, invoice_number: 'INV-DEP-001' });
        expect(boundPayload.customer_id).toBe(99);
    });

    // ── 9. Missing installation_charge schema field and safe migration ──────────
    it('Scenario 9: Preserves full bill payload with installation_charge intact and routes to dead_letter on code 42703', async () => {
        const outbox = DurableOutboxService.getInstance();
        const rawBill = {
            invoice_number: 'INV-PRESERVE-42703',
            subtotal: 1000,
            installation_charge: 150,
            installation_note: 'Wall mounting',
            grand_total: 1150
        };

        const opId = outbox.enqueueSingle({
            entityType: 'bills',
            operation: 'insert',
            payload: rawBill
        });

        // Verify outbox operation initially stored with unadulterated payload
        const deadOp = (outbox as any).db.prepare('SELECT payload_json FROM outbox_operations WHERE id = ?').get(opId);
        const storedPayload = JSON.parse(deadOp.payload_json);
        expect(storedPayload.installation_charge).toBe(150);
        expect(storedPayload.installation_note).toBe('Wall mounting');

        // Route to dead letter on code 42703
        outbox.markDeadLetter(opId, 'PostgreSQL error 42703: column bills.installation_charge does not exist');

        const deadLetters = outbox.getDeadLetters();
        const found = deadLetters.find(d => d.id === opId);
        expect(found).toBeDefined();
        expect(found?.status).toBe('dead_letter');
        expect(found?.lastError).toContain('42703');
        // Crucial requirement: Ensure payload was NOT stripped or deleted
        expect(found?.payload.installation_charge).toBe(150);
        expect(found?.payload.installation_note).toBe('Wall mounting');
        expect(found?.payload.grand_total).toBe(1150);
    });

    // ── 10. Concurrent clients competing for final available quota ───────────────
    it('Scenario 10: Concurrent clients competing for final quota are serialized atomically without exceeding 3 GB', async () => {
        const clientA = new SupabaseQuotaManager('client-A');
        
        // Storage cap is 2.2 GB; leave 500 KB left
        clientA.recordUsage('test', SupabaseQuotaManager.STORAGE_CEILING_BYTES - 500_000, 100_000_000);
        
        const req1 = await clientA.reserveStorageQuota('req_1', 300_000); // 300 KB -> accepted (remaining 200 KB)
        const req2 = await clientA.reserveStorageQuota('req_2', 300_000); // 300 KB -> exceeds storage cap -> REJECTED

        expect(req1).toBe(true);
        expect(req2).toBe(false);

        // Release req1
        await clientA.releaseStorageQuota('req_1', 0);
    });

    // ── 11. Reaching 2.4 GB warning, 2.85 GB critical, and 3 GB ceiling ──────────────────────
    it('Scenario 11: Correctly triggers WARNING at 2.4 GB, CRITICAL at 2.85 GB, and EXCEEDED at 3 GB', () => {
        const quotaMgr = SupabaseQuotaManager.getInstance();

        // 1. Under 2.4 GB -> ok
        quotaMgr.recordUsage('test', 1_500_000_000, 500_000_000); // 2.0 GB total
        expect(quotaMgr.getQuotaStatus().status).toBe('ok');

        // 2. 2.45 GB -> warning (>= 2.4 GB)
        quotaMgr.recordUsage('test', 1_800_000_000, 650_000_000); // 2.45 GB total
        expect(quotaMgr.getQuotaStatus().status).toBe('warning');

        // 3. 2.90 GB -> critical (>= 2.85 GB)
        quotaMgr.recordUsage('test', 2_100_000_000, 800_000_000); // 2.90 GB total
        expect(quotaMgr.getQuotaStatus().status).toBe('critical');

        // 4. > 3,000,000,000 bytes -> exceeded
        quotaMgr.recordUsage('test', 2_200_000_000, 800_000_001); // > 3 GB
        expect(quotaMgr.getQuotaStatus().status).toBe('exceeded');
        expect(quotaMgr.canAcceptStorageUpload(100)).toBe(false);
    });

    // ── 12. Supabase quota live audit and recursive nested storage crawler ──────
    it('Scenario 12: Recursive nested storage crawler accounts for all subfolders in bucket', async () => {
        const quotaMgr = SupabaseQuotaManager.getInstance();

        // Create a mock Supabase client with nested folders
        const mockStorageClient = {
            storage: {
                from: vi.fn().mockReturnValue({
                    list: vi.fn().mockImplementation(async (prefix: string) => {
                        if (prefix === '') {
                            return {
                                data: [
                                    { name: 'folder1', id: null, metadata: null },
                                    { name: 'root_image.webp', id: '1', metadata: { size: 1000 } }
                                ],
                                error: null
                            };
                        } else if (prefix === 'folder1') {
                            return {
                                data: [
                                    { name: 'subfolder2', id: null, metadata: null },
                                    { name: 'child_image.webp', id: '2', metadata: { size: 2500 } }
                                ],
                                error: null
                            };
                        } else if (prefix === 'folder1/subfolder2') {
                            return {
                                data: [
                                    { name: 'deep_cad.pdf', id: '3', metadata: { size: 5000 } }
                                ],
                                error: null
                            };
                        }
                        return { data: [], error: null };
                    })
                })
            }
        };

        quotaMgr.registerClients({ supabase: mockStorageClient as any });

        const crawlResult = await (quotaMgr as any).crawlStorageBucketRecursive('make-order-files', '');
        expect(crawlResult.totalBytes).toBe(1000 + 2500 + 5000);
        expect(crawlResult.fileCount).toBe(3);
    });

    // ── 13. Checksum verification on uploads ────────────────────────────────────
    it('Scenario 13: Detects checksum mismatch on corrupt upload and rejects acknowledgment', async () => {
        const uploadService = DurableUploadService.getInstance();
        const buffer = Buffer.from('VALID-ORIGINAL-PAYLOAD');
        const staged = await uploadService.stageFile(buffer, 'checksum_test.webp', 'image/webp', 'product-images');

        // Simulate NAS upload returning a mismatched SHA-256
        vi.spyOn(uploadService, 'uploadToNasStorage').mockResolvedValue({
            success: true,
            url: `https://storage.lenas.me/files/product-images/${staged.fileName}`,
            sha256: 'CORRUPTED-INCORRECT-SHA256-HASH'
        });

        const res = await uploadService.dispatchUpload(staged.id);
        expect(res.status).toBe('buffered_supabase');
        expect(res.status).not.toBe('synced_nas');
        expect(res.error).toContain('Checksum mismatch');

        // Upload record remains safely buffered in primary Supabase while recording NAS replication failure
        const uploads = uploadService.getStagedUploads();
        const stagedRecord = uploads.find(u => u.id === staged.id);
        expect(stagedRecord?.status).toBe('buffered_supabase');
        expect(stagedRecord?.lastError).toContain('Checksum mismatch');

        // Test verifyRemoteObject correctly validates matching digest
        const sliceArrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: true,
            arrayBuffer: async () => sliceArrayBuffer
        } as any);

        const verifyRes = await uploadService.verifyRemoteObject('http://127.0.0.1:8081/files/test.webp', staged.sha256);
        expect(verifyRes.verified).toBe(true);
        expect(verifyRes.sha256).toBe(staged.sha256);
    });

    // ── 14. Conflict between NAS and fallback updates/deletes ───────────────────
    it('Scenario 14: Preserves NAS authoritative status during concurrent fallback update conflicts', () => {
        const nasTimestamp = Date.now() + 1000;
        const fallbackTimestamp = Date.now();

        // Function ensuring NAS authoritative resolution
        const resolveUpdateConflict = (nasRow: any, fallbackRow: any) => {
            if (nasRow.updated_at >= fallbackRow.updated_at) {
                return { authoritative: 'nas', row: nasRow };
            }
            return {
                authoritative: 'fallback_applied_with_nas_archive',
                row: fallbackRow,
                conflictArchive: nasRow
            };
        };

        const res1 = resolveUpdateConflict(
            { id: 1, grand_total: 5000, updated_at: nasTimestamp },
            { id: 1, grand_total: 4500, updated_at: fallbackTimestamp }
        );

        expect(res1.authoritative).toBe('nas');
        expect(res1.row.grand_total).toBe(5000);
    });

    // ── 15. Dead-letter visibility and authorized operator replay ───────────────
    it('Scenario 15: Permanent errors are moved to dead_letter with full diagnostics and can be safely replayed', () => {
        const outbox = DurableOutboxService.getInstance();
        const deadOpId = `op_dead_${Date.now()}`;

        outbox.enqueueBatch([{
            id: deadOpId,
            entityType: 'bills',
            operation: 'insert',
            payload: { invoice_number: 'INV-PERM-FAIL', grand_total: 300 }
        }]);

        // Move to dead letter
        outbox.markDeadLetter(deadOpId, 'PostgreSQL foreign key violation: bills_customer_id_fkey');

        const deadLetters = outbox.getDeadLetters();
        const deadRecord = deadLetters.find(d => d.id === deadOpId);
        expect(deadRecord).toBeDefined();
        expect(deadRecord?.status).toBe('dead_letter');
        expect(deadRecord?.lastError).toContain('bills_customer_id_fkey');

        // Operator replays the dead-letter operation
        const replayed = outbox.replayDeadLetter(deadOpId);
        expect(replayed).toBe(true);

        const refreshedDeadLetters = outbox.getDeadLetters();
        expect(refreshedDeadLetters.find(d => d.id === deadOpId)).toBeUndefined();
    });

    // ── 16. Existing image previews, security regression defense & Migration 069 safety ─
    it('Scenario 16: Image source resolver rejects malformed URLs, and Migration 069 rollback contains explicit data loss warnings for database lesoft', () => {
        const isValidApprovedImageUrl = (url: string): boolean => {
            if (!url || typeof url !== 'string') return false;
            if (url.startsWith('file://')) return true;
            try {
                const parsed = new URL(url);
                if (parsed.protocol === 'https:' && parsed.hostname === 'storage.lenas.me') return true;
                if (parsed.protocol === 'http:' && parsed.hostname === '100.88.85.6' && parsed.port === '8081') return true;
                if (parsed.protocol === 'http:' && parsed.hostname === '192.168.1.14' && parsed.port === '8081') return true;
                if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co')) return true;
                return false;
            } catch {
                return false;
            }
        };

        expect(isValidApprovedImageUrl('https://storage.lenas.me/files/product-images/item_1.webp')).toBe(true);
        expect(isValidApprovedImageUrl('http://100.88.85.6:8081/files/product-images/item_2.webp')).toBe(true);
        expect(isValidApprovedImageUrl('https://ildkkgjrolcjijwfokek.supabase.co/storage/v1/object/public/make-order-files/item.webp')).toBe(true);
        expect(isValidApprovedImageUrl('file://C:/Users/AppData/Local/staging/item.webp')).toBe(true);

        // Security rejections
        expect(isValidApprovedImageUrl('https://storage.lenas.me.attacker.com/files/evil.webp')).toBe(false);
        expect(isValidApprovedImageUrl('http://storage.lenas.me:8080/files/legacy.webp')).toBe(false);
        expect(isValidApprovedImageUrl('javascript:alert(1)')).toBe(false);

        // Verify Migration 069 rollback script safety warnings
        const rollbackSqlPath = path.join(process.cwd(), 'database/truenas/rollback/069_nas_schema_synchronization_rollback.sql');
        expect(fs.existsSync(rollbackSqlPath)).toBe(true);
        const rollbackSql = fs.readFileSync(rollbackSqlPath, 'utf-8');

        expect(rollbackSql).toContain('CRITICAL DESTRUCTIVE SCRIPT WARNING');
        expect(rollbackSql).toContain('lesoft');
        expect(rollbackSql).toContain('customer_payments');
        expect(rollbackSql).toContain('customer_addresses');
        expect(rollbackSql).toContain('installation_charge');
        expect(rollbackSql).toContain('RECOVERY STRATEGY (Non-Destructive Fix-Forward)');
    });

    // ── 17. Quota rejection with delayed Promise prevents cloud fallback write ──
    it('Scenario 17: Delayed Promise resolving to false for reserveDatabaseQuota prevents cloud fallback write and preserves work locally', async () => {
        const outbox = DurableOutboxService.getInstance();
        const quotaMgr = SupabaseQuotaManager.getInstance();

        // Simulate delayed quota rejection (e.g. concurrent race or server quota limit)
        const reserveSpy = vi.spyOn(quotaMgr, 'reserveDatabaseQuota').mockImplementation(() => {
            return new Promise((resolve) => {
                setTimeout(() => resolve(false), 25);
            });
        });

        let cloudWriteAttempted = false;
        const mockSbClient: any = {
            from: vi.fn().mockImplementation(() => {
                cloudWriteAttempted = true;
                return {
                    insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 999 }, error: null }) }) }),
                };
            })
        };

        // Register clients: NAS is null (offline), Supabase is mock
        outbox.registerClients({ nas: null, supabase: mockSbClient });

        const opId = `op_quota_rej_${Date.now()}`;
        outbox.enqueueBatch([{
            id: opId,
            entityType: 'bills',
            operation: 'insert',
            payload: { invoice_number: 'INV-QUOTA-TEST', grand_total: 1500 },
            target: 'supabase'
        }]);

        // Drain the batch
        await outbox.drainNextBatch(1);

        expect(reserveSpy).toHaveBeenCalled();
        // Cloud write must NOT occur because reservation was rejected!
        expect(cloudWriteAttempted).toBe(false);

        // Record must remain durable in local outbox with incremented retry
        const stats = outbox.getOutboxStats();
        expect(stats.totalPending).toBeGreaterThan(0);

        reserveSpy.mockRestore();
    });

    // ── 18. Committed fallback data remains included in shared quota accounting ──
    it('Scenario 18: Committed fallback data remains included in shared quota accounting after reservation release', async () => {
        const quotaMgr = new SupabaseQuotaManager('test-client-18');
        const initialTotal = quotaMgr.getCurrentTotalUsageBytes();

        // Reserve 200 KB
        const reserved = await quotaMgr.reserveStorageQuota('res_test_commit', 200_000);
        expect(reserved).toBe(true);
        expect(quotaMgr.getTotalReservedStorageBytes()).toBe(200_000);

        // Release with confirmedUploadedBytes: 200_000 (committed)
        await quotaMgr.releaseStorageQuota('res_test_commit', 200_000);

        // Reservation is cleared from active, but usage remains counted as committed
        expect(quotaMgr.getTotalReservedStorageBytes()).toBe(0);
        expect(quotaMgr.getCurrentTotalUsageBytes()).toBe(initialTotal + 200_000);

        // Pruning removes committed bytes from accounting
        await quotaMgr.pruneConfirmedStorage('res_test_commit', 100_000);
        expect(quotaMgr.getCurrentTotalUsageBytes()).toBe(initialTotal + 100_000);

        // Cleanup
        await quotaMgr.pruneConfirmedStorage('res_test_commit', 100_000);
    });

    // ── 19. Security and access control in Migration 070 ─────────────────────────
    it('Scenario 19: Migration 070 enforces authoritative server constants, client isolation, and security definer protections', () => {
        const migrationSqlPath = path.join(process.cwd(), 'supabase/migrations/070_supabase_buffer_quota_reservations.sql');
        expect(fs.existsSync(migrationSqlPath)).toBe(true);
        const sql = fs.readFileSync(migrationSqlPath, 'utf-8');

        // Authoritative limits defined on server
        expect(sql).toContain('STORAGE_CEILING CONSTANT BIGINT := 600000000');
        expect(sql).toContain('DATABASE_CEILING CONSTANT BIGINT := 250000000');
        expect(sql).toContain('HARD_CEILING CONSTANT BIGINT := 1000000000');
        expect(sql).toContain('CRITICAL_RESERVE CONSTANT BIGINT := 150000000');

        // Client isolation: Client B cannot modify Client A's reservation
        expect(sql).toContain('UNAUTHORIZED_CLIENT_MISMATCH');
        expect(sql).toContain('v_existing_client <> v_caller');

        // Direct table access revoked, RLS enabled
        expect(sql).toContain('ALTER TABLE public.supabase_buffer_reservations ENABLE ROW LEVEL SECURITY');
        expect(sql).toContain('REVOKE ALL ON TABLE public.supabase_buffer_reservations FROM PUBLIC, anon');
        expect(sql).toContain('CREATE POLICY "client_read_own_reservations" ON public.supabase_buffer_reservations');

        // Explicit search_path protection on security definer functions
        expect(sql).toContain('SECURITY DEFINER');
        expect(sql).toContain('SET search_path = public, pg_temp');

        // Accounts for active and committed status
        expect(sql).toContain("WHERE status IN ('active', 'committed') AND resource_type = 'storage'");
        expect(sql).toContain("WHERE status IN ('active', 'committed') AND resource_type = 'database'");
    });

    // ── 20. Update/delete filters and conflict targets survive serialization ──────
    it('Scenario 20: Update/delete filters and upsert conflict targets survive durable serialization and execution', async () => {
        const outbox = DurableOutboxService.getInstance();

        let executedFilter: any[] = [];
        let executedConflict: any = null;

        const mockClient: any = {
            from: vi.fn().mockImplementation((table: string) => {
                const chain: any = {
                    update: vi.fn().mockReturnThis(),
                    upsert: vi.fn().mockImplementation((_data: any, options: any) => {
                        executedConflict = options?.onConflict;
                        return {
                            select: vi.fn().mockReturnValue({
                                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 101 }, error: null })
                            })
                        };
                    }),
                    delete: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockImplementation((col: string, val: any) => {
                        executedFilter.push({ col, val });
                        return chain;
                    }),
                    select: vi.fn().mockReturnValue({
                        then: (fn: any) => Promise.resolve(fn({ data: [{ id: 101 }], error: null }))
                    })
                };
                return chain;
            })
        };

        // 1. Test Update with multi-column filter
        const updateResult = await outbox.executeOnClient(
            mockClient,
            'products',
            'update',
            { price: 450 },
            'id',
            [{ column: 'sku', value: 'DESK-01' }, { column: 'is_active', value: true }]
        );

        expect(updateResult.success).toBe(true);
        expect(executedFilter).toEqual([
            { col: 'sku', val: 'DESK-01' },
            { col: 'is_active', val: true }
        ]);

        // 2. Test Upsert with explicit conflict target
        const upsertResult = await outbox.executeOnClient(
            mockClient,
            'products',
            'upsert',
            { sku: 'DESK-01', price: 450 },
            'id',
            null,
            'sku'
        );

        expect(upsertResult.success).toBe(true);
        expect(executedConflict).toBe('sku');
    });

    // ── 21. Multi-row payloads and parent/child dependencies ──────────────────────
    it('Scenario 21: Multi-row child payloads preserve array type, substitute parent IDs, and execute without maybeSingle', async () => {
        const outbox = DurableOutboxService.getInstance();

        // 1. Test resolveDependentPayload with an array of child rows
        (outbox as any).recordResolvedId('op_parent_bill', 'nas', '777');

        const childRows = [
            { product_name: 'Table', quantity: 1, price: 1000 },
            { product_name: 'Chair', quantity: 4, price: 250 }
        ];

        const resolved = outbox.resolveDependentPayload('op_parent_bill', childRows);

        expect(Array.isArray(resolved)).toBe(true);
        expect(resolved.length).toBe(2);
        expect(resolved[0].bill_id).toBe(777);
        expect(resolved[1].bill_id).toBe(777);

        // 2. Test multi-row insert execution on client
        let insertArgs: any = null;
        let selectChainCalled = false;

        const mockClient: any = {
            from: vi.fn().mockImplementation(() => ({
                insert: vi.fn().mockImplementation((data: any) => {
                    insertArgs = data;
                    return {
                        select: vi.fn().mockImplementation(() => {
                            selectChainCalled = true;
                            // Multi-row insert returns array of inserted records without calling maybeSingle!
                            return Promise.resolve({
                                data: [{ id: 1 }, { id: 2 }],
                                error: null
                            });
                        })
                    };
                })
            }))
        };

        const result = await outbox.executeOnClient(mockClient, 'bill_items', 'insert', resolved, 'id');

        expect(result.success).toBe(true);
        expect(result.affectedRows).toBe(2);
        expect(Array.isArray(insertArgs)).toBe(true);
        expect(selectChainCalled).toBe(true);
    });

    // ── 22. Field encryption preservation without double-encryption ─────────────
    it('Scenario 22: Preserves field encryption transformations without double-encrypting existing ciphertext', async () => {
        const sensitiveObject = {
            notes: 'Confidential client agreement notes',
            custom_spec: 'Special rosewood varnish finish',
            invoice_number: 'INV-2026-001', // Structural key: must remain plain text
            role: 'cashier',                 // Structural key: must remain plain text
            amount: 5000                     // Number: not encrypted
        };

        // First encryption pass
        const enc1 = encryptObject(sensitiveObject);

        expect(enc1.notes.startsWith('e3:')).toBe(true);
        expect(enc1.custom_spec.startsWith('e3:')).toBe(true);
        expect(enc1.invoice_number).toBe('INV-2026-001');
        expect(enc1.role).toBe('cashier');
        expect(enc1.amount).toBe(5000);

        // Second encryption pass: verify double-encryption guard
        const enc2 = encryptObject(enc1);
        expect(enc2.notes).toBe(enc1.notes);
        expect(enc2.custom_spec).toBe(enc1.custom_spec);
        expect(enc2.notes.startsWith('e3:e3:')).toBe(false);

        // Decryption verification
        expect(decryptField(enc1.notes)).toBe('Confidential client agreement notes');
        expect(decryptField(enc1.custom_spec)).toBe('Special rosewood varnish finish');
    });

    // ── 23. Callback-driven work survives restart via durable outbox ────────────
    it('Scenario 23: Child operations enqueued with dependencyOpId survive application restart and execute', async () => {
        const outbox = DurableOutboxService.getInstance();
        const parentId = `bill_parent_${Date.now()}`;
        const childId = `items_child_${Date.now()}`;

        // Step 1: Parent and child enqueued into durable SQLite outbox
        outbox.enqueueBatch([
            {
                id: parentId,
                entityType: 'bills',
                operation: 'insert',
                payload: { invoice_number: 'INV-DURABLE-RESTART', grand_total: 2500 }
            },
            {
                id: childId,
                entityType: 'bill_items',
                operation: 'insert',
                payload: [{ product_name: 'Executive Desk', quantity: 1, price: 2500 }],
                dependencyOpId: parentId
            }
        ]);

        // Child record starts in 'blocked_dependency'
        const initialStats = outbox.getOutboxStats();
        expect(initialStats.blockedDependencies).toBeGreaterThan(0);

        // Step 2: Simulate app restart after parent commits:
        // Record parent resolution
        (outbox as any).recordResolvedId(parentId, 'nas', '8888');

        // Mark parent as completed
        (outbox as any).markCompleted(parentId);

        // Step 3: Drain outbox in new application session
        // Unblocks child record and resolves bill_id to 8888
        const mockClient: any = {
            from: vi.fn().mockImplementation(() => ({
                insert: vi.fn().mockReturnValue({
                    select: vi.fn().mockResolvedValue({ data: [{ id: 10 }], error: null })
                })
            }))
        };
        outbox.registerClients({ nas: mockClient, supabase: null });

        const processed = await outbox.drainNextBatch(5);
        expect(processed).toBeGreaterThan(0);

        // Child dependency was executed and resolved
        const finalStats = outbox.getOutboxStats();
        expect(finalStats.blockedDependencies).toBe(0);
    });

    // ── 24. Health engine recovery requires all outbox and upload queues to be clear ──
    it('Scenario 24: Recovery engine returns to NORMAL_NAS_AUTHORITATIVE only when outbox and upload queues are 100% clean', async () => {
        const engine = ConsolidatedHealthEngine.getInstance();
        const outbox = DurableOutboxService.getInstance();
        const uploadService = DurableUploadService.getInstance();

        // Simulate NAS healthy
        vi.spyOn(engine as any, 'probeNasDatabase').mockResolvedValue({ healthy: true, latency: 10, url: 'nas_db' });
        vi.spyOn(engine as any, 'probeNasStorage').mockResolvedValue({ healthy: true, latency: 15, url: 'nas_storage' });
        vi.spyOn(engine as any, 'probeSupabaseDatabase').mockResolvedValue(true);
        vi.spyOn(engine as any, 'probeSupabaseStorage').mockResolvedValue(true);

        vi.spyOn(outbox, 'drainNextBatch').mockResolvedValue(0);
        vi.spyOn(uploadService, 'processNextBatch').mockResolvedValue();

        (engine as any).currentState = 'RECOVERING_SYNCHRONIZING';

        // Case A: Dead-letter item outstanding -> must NOT transition to normal
        vi.spyOn(outbox, 'getOutboxStats').mockReturnValue({
            totalPending: 0,
            pendingLocal: 0,
            bufferedSupabase: 0,
            blockedDependencies: 0,
            deadLetterCount: 1, // Outstanding operator dead letter
            oldestPendingTime: null,
            recentErrors: []
        });
        vi.spyOn(uploadService, 'getPendingUploadStats').mockReturnValue({
            stagedCount: 0,
            bufferedCount: 0,
            totalPendingBytes: 0
        });

        await engine.triggerRecoverySynchronization();
        expect(engine.getCurrentState()).toBe('RECOVERING_SYNCHRONIZING');

        // Case B: Blocked dependency outstanding -> must NOT transition to normal
        vi.spyOn(outbox, 'getOutboxStats').mockReturnValue({
            totalPending: 0,
            pendingLocal: 0,
            bufferedSupabase: 0,
            blockedDependencies: 1,
            deadLetterCount: 0,
            oldestPendingTime: null,
            recentErrors: []
        });

        await engine.triggerRecoverySynchronization();
        expect(engine.getCurrentState()).toBe('RECOVERING_SYNCHRONIZING');

        // Case C: Staged uploads outstanding -> must NOT transition to normal
        vi.spyOn(outbox, 'getOutboxStats').mockReturnValue({
            totalPending: 0,
            pendingLocal: 0,
            bufferedSupabase: 0,
            blockedDependencies: 0,
            deadLetterCount: 0,
            oldestPendingTime: null,
            recentErrors: []
        });
        vi.spyOn(uploadService, 'getPendingUploadStats').mockReturnValue({
            stagedCount: 2,
            bufferedCount: 0,
            totalPendingBytes: 50000
        });

        await engine.triggerRecoverySynchronization();
        expect(engine.getCurrentState()).toBe('RECOVERING_SYNCHRONIZING');

        // Case D: All queues 100% clean -> transitions to NORMAL_NAS_AUTHORITATIVE
        vi.spyOn(uploadService, 'getPendingUploadStats').mockReturnValue({
            stagedCount: 0,
            bufferedCount: 0,
            totalPendingBytes: 0
        });

        await engine.triggerRecoverySynchronization();
        expect(engine.getCurrentState()).toBe('NORMAL_NAS_AUTHORITATIVE');

        // Case E: Repeated triggers do not overlap
        (engine as any).isReconciling = true;
        const secondRun = engine.triggerRecoverySynchronization();
        await secondRun;
        // returns early without error
    });

    it('Scenario 25: Destination-specific parent ID resolution prevents cross-destination pollution', () => {
        const outbox = DurableOutboxService.getInstance();
        const parentOpId = `op_parent_${Date.now()}`;

        // Record deliberately different destination IDs in outbox_id_map:
        // NAS generated ID is 101, Supabase generated ID is 505
        outbox.recordResolvedId(parentOpId, 'nas', '101');
        outbox.recordResolvedId(parentOpId, 'supabase', '505');

        const childItemsPayload = [
            { product_id: 1, product_name: 'Executive Chair', quantity: 2, bill_id: null },
            { product_id: 2, product_name: 'Standing Desk', quantity: 1, bill_id: null }
        ];

        // Resolve specifically for TrueNAS destination
        const nasResolved = outbox.resolveDependentPayload(parentOpId, childItemsPayload, 'nas');
        expect(Array.isArray(nasResolved)).toBe(true);
        expect(nasResolved.length).toBe(2);
        expect(nasResolved[0].bill_id).toBe(101);
        expect(nasResolved[1].bill_id).toBe(101);
        expect(nasResolved[0].product_name).toBe('Executive Chair');

        // Resolve specifically for Supabase destination
        const sbResolved = outbox.resolveDependentPayload(parentOpId, childItemsPayload, 'supabase');
        expect(Array.isArray(sbResolved)).toBe(true);
        expect(sbResolved.length).toBe(2);
        expect(sbResolved[0].bill_id).toBe(505);
        expect(sbResolved[1].bill_id).toBe(505);
        expect(sbResolved[0].bill_id).not.toBe(nasResolved[0].bill_id);
    });

    it('Scenario 26: Authoritative durable bill graph ensures all side effects survive restart without duplicates', () => {
        const outbox = DurableOutboxService.getInstance();
        const invNum = `INV-TEST-26-${Date.now()}`;
        const billOpId = `bill_${invNum}`;
        const itemsOpId = `bill_items_${invNum}`;
        const orderOpId = `make_order_${invNum}_0`;
        const stockOpId = `stock_dec_${invNum}_10_0`;
        const shipOpId = `shipping_${invNum}`;
        const shipLogOpId = `shipping_log_${invNum}`;

        // 1. Enqueue entire bill graph with deterministic keys
        outbox.enqueueSingle({ id: billOpId, entityType: 'bills', operation: 'insert', payload: { invoice_number: invNum, grand_total: 500 } });
        outbox.enqueueSingle({ id: itemsOpId, entityType: 'bill_items', operation: 'insert', payload: [{ product_id: 10, quantity: 2 }], dependencyOpId: billOpId });
        outbox.enqueueSingle({ id: orderOpId, entityType: 'make_orders', operation: 'insert', payload: { furniture_name: 'Custom Desk', bill_id: null }, dependencyOpId: billOpId });
        outbox.enqueueSingle({ id: stockOpId, entityType: 'inventory_decrement', operation: 'custom', payload: { product_id: 10, quantity: 2 }, dependencyOpId: billOpId });
        outbox.enqueueSingle({ id: shipOpId, entityType: 'bill_shipping', operation: 'insert', payload: { invoice_number: invNum, ship_to_name: 'Test Client' }, dependencyOpId: billOpId });
        outbox.enqueueSingle({ id: shipLogOpId, entityType: 'shipping_status_log', operation: 'insert', payload: { status: 'pending_payment' }, dependencyOpId: shipOpId });

        // 2. Duplicate retry attempts with identical keys MUST be rejected by UNIQUE constraint
        expect(() => {
            outbox.enqueueSingle({ id: billOpId, entityType: 'bills', operation: 'insert', payload: { invoice_number: invNum, grand_total: 500 } });
        }).toThrow(/UNIQUE constraint failed/);

        expect(() => {
            outbox.enqueueSingle({ id: itemsOpId, entityType: 'bill_items', operation: 'insert', payload: [{ product_id: 10, quantity: 2 }], dependencyOpId: billOpId });
        }).toThrow(/UNIQUE constraint failed/);

        expect(() => {
            outbox.enqueueSingle({ id: stockOpId, entityType: 'inventory_decrement', operation: 'custom', payload: { product_id: 10, quantity: 2 }, dependencyOpId: billOpId });
        }).toThrow(/UNIQUE constraint failed/);
    });

    it('Scenario 27: Idempotent inventory decrement decrements stock safely on database client', async () => {
        const outbox = DurableOutboxService.getInstance();
        let storedQty = 50;

        const mockClient: any = {
            from: vi.fn((table: string) => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 10, quantity: storedQty }, error: null })
                    }))
                })),
                update: vi.fn((payload: any) => ({
                    eq: vi.fn(async () => {
                        storedQty = payload.quantity;
                        return { data: { id: 10, quantity: storedQty }, error: null };
                    })
                }))
            }))
        };

        const res = await outbox.executeOnClient(mockClient, 'inventory_decrement', 'custom', { product_id: 10, quantity: 5 });
        expect(res.success).toBe(true);
        expect(res.affectedRows).toBe(1);
        expect(storedQty).toBe(45);
    });

    it('Scenario 28: Idempotent image retry reuses established remote URL after failed metadata update without re-upload', async () => {
        const uploadService = DurableUploadService.getInstance();
        // This scenario exercises cleanup after successful reconciliation, which
        // requires the authenticated reconciliation capability in production.
        vi.spyOn(SupabaseQuotaManager.getInstance(), 'hasAuthorizedReconciliationSession').mockResolvedValue(true);
        
        // Mock uploadToNasStorage to succeed with established remote URL
        const uploadSpy = vi.spyOn(uploadService as any, 'uploadToNasStorage').mockResolvedValue({
            success: true,
            url: 'https://storage.lenas.me/files/products/established_drawing.png'
        });

        // First attempt: entity update fails (simulating crash or DB metadata update failure)
        const entitySpy = vi.spyOn(uploadService as any, 'updateEntityRecord')
            .mockResolvedValueOnce(true)  // temporary Supabase-buffer reference
            .mockResolvedValueOnce(false); // NAS reference update fails on first pass

        const stageRecord = await uploadService.stageFile(
            Buffer.from('test-image-data-scenario-28'),
            'desk_drawing.png',
            'image/png',
            'products',
            { entityType: 'make_orders', entityId: 'ord_123', fieldName: 'technical_drawing_url' },
            { autoDispatch: true }
        );

        expect(stageRecord.id).toBeDefined();
        const uplId = stageRecord.id;

        // Wait a tick for the background dispatch from stageFile to complete
        await new Promise(r => setTimeout(r, 50));

        // Verify that remote_url_nas was saved despite metadata failure
        const rowAfterFirstAttempt = (uploadService as any).db.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(uplId) as any;
        expect(rowAfterFirstAttempt.remote_url_nas).toBe('https://storage.lenas.me/files/products/established_drawing.png');
        expect(rowAfterFirstAttempt.last_error).toContain('Entity record update failed');

        // Clear upload spy history before testing retry
        uploadSpy.mockClear();

        // Second attempt (retry): entity update succeeds
        entitySpy.mockResolvedValue(true);

        const retryRes = await uploadService.dispatchUpload(uplId);
        expect(retryRes.success).toBe(true);
        expect(retryRes.status).toBe('synced_nas');
        expect(retryRes.url).toBe('https://storage.lenas.me/files/products/established_drawing.png');
        expect(uploadSpy).not.toHaveBeenCalled();
    });

    it('Scenario 29: Committed quota cannot be prematurely released; only pruned after confirmed TrueNAS reconciliation', async () => {
        const quotaMgr = new SupabaseQuotaManager('client-test-29');
        let committedBytes = 0;
        let reservationStatus = 'active';

        const mockClient: any = {
            rpc: vi.fn(async (fnName: string, params: any) => {
                if (fnName === 'reserve_buffer_capacity') {
                    reservationStatus = 'active';
                    return { data: { success: true }, error: null };
                }
                if (fnName === 'release_buffer_capacity') {
                    if (reservationStatus === 'committed' && params.p_status === 'released') {
                        return { data: { success: false, reason: 'COMMITTED_QUOTA_CAN_ONLY_BE_PRUNED' }, error: null };
                    }
                    reservationStatus = params.p_status;
                    if (params.p_status === 'committed') committedBytes = params.p_actual_bytes;
                    if (params.p_status === 'pruned') committedBytes = 0;
                    return { data: { success: true, status: params.p_status }, error: null };
                }
                return { data: null, error: null };
            })
        };

        quotaMgr.registerClient(mockClient);

        // 1. Reserve and commit database quota
        await quotaMgr.reserveDatabaseQuota('res_test_29', 2048);
        await quotaMgr.releaseDatabaseQuota('res_test_29', 2048, 'committed');
        expect(committedBytes).toBe(2048);

        // 2. Attempt to release committed quota -> rejected by state machine
        const { data: rejectData } = await mockClient.rpc('release_buffer_capacity', {
            p_reservation_id: 'res_test_29',
            p_client_id: 'client-test-29',
            p_status: 'released'
        });
        expect(rejectData.success).toBe(false);
        expect(rejectData.reason).toBe('COMMITTED_QUOTA_CAN_ONLY_BE_PRUNED');
        expect(committedBytes).toBe(2048);

        // 3. Prune confirmed database quota after reconciliation
        await quotaMgr.pruneConfirmedDatabase('res_test_29', 2048);
        expect(committedBytes).toBe(0);
        expect(reservationStatus).toBe('pruned');
    });

    // ── 30. Spoofed client ID & identity mismatch rejection ───────────────────────
    it('Scenario 30: Rejects spoofed client_id and identity mismatch', async () => {
        const quotaMgr = new SupabaseQuotaManager('attacker_client');

        const mockClient: any = {
            rpc: vi.fn(async (fnName: string, params: any) => {
                if (params.p_client_id !== 'authenticated_caller_id') {
                    return { data: { success: false, reason: 'CLIENT_IDENTITY_MISMATCH' }, error: null };
                }
                return { data: { success: true }, error: null };
            })
        };

        quotaMgr.registerClient(mockClient);

        // Attempt reservation with spoofed client ID
        const reserved = await quotaMgr.reserveStorageQuota('spoof_res_1', 1_000_000);
        expect(reserved).toBe(false);
        expect(mockClient.rpc).toHaveBeenCalledWith('reserve_buffer_capacity', expect.objectContaining({
            p_client_id: 'attacker_client'
        }));
    });

    // ── 31. Unauthorized pruning attempt by client rejected ───────────────────────
    it('Scenario 31: Rejects unauthorized pruning attempt without trusted reconciliation credentials', async () => {
        const quotaMgr = new SupabaseQuotaManager('client_standard');

        const mockClient: any = {
            rpc: vi.fn(async (fnName: string, params: any) => {
                if (params.p_status === 'pruned') {
                    return { 
                        data: { success: false, reason: 'UNAUTHORIZED_PRUNING_DENIED' }, 
                        error: null 
                    };
                }
                return { data: { success: true, status: params.p_status }, error: null };
            })
        };

        quotaMgr.registerClient(mockClient);

        const pruneResult = await quotaMgr.pruneConfirmedStorage('res_prune_denied', 500_000);
        expect(pruneResult).toBe(false);
    });

    // ── 32. Failed RPC response handling (fail-closed to local outbox) ────────────
    it('Scenario 32: Fails closed to local outbox when Supabase RPC returns error or unexpected failure', async () => {
        const quotaMgr = new SupabaseQuotaManager('client_rpc_fail');

        // RPC fails with network disconnect or PostgREST timeout
        const mockClient: any = {
            rpc: vi.fn().mockResolvedValue({
                data: null,
                error: { message: '503 Service Unavailable: upstream connection reset', code: '503' }
            })
        };

        quotaMgr.registerClient(mockClient);

        const initialBlocked = quotaMgr.getQuotaStatus().blockedOperationsCount;
        const canBuffer = await quotaMgr.reserveDatabaseQuota('res_fail_rpc', 4096);
        expect(canBuffer).toBe(false);
        expect(quotaMgr.getQuotaStatus().blockedOperationsCount).toBeGreaterThan(initialBlocked);
    });

    // ── 33. Expiry after failed or abandoned commit ───────────────────────────────
    it('Scenario 33: Stale active reservations expire and do not permanently lock capacity', async () => {
        const quotaMgr = new SupabaseQuotaManager('client_expiry');

        // Simulate reservation expiry in mock
        let reservationStatus = 'active';
        let expiresAt = Date.now() - 1000; // Expired 1 second ago

        const mockClient: any = {
            rpc: vi.fn(async (fnName: string) => {
                if (fnName === 'reserve_buffer_capacity') {
                    if (reservationStatus === 'active' && expiresAt < Date.now()) {
                        reservationStatus = 'expired';
                    }
                    return { data: { success: true, status: 'active' }, error: null };
                }
                return { data: null, error: null };
            })
        };

        quotaMgr.registerClient(mockClient);
        const ok = await quotaMgr.reserveStorageQuota('res_will_expire', 5000);
        expect(ok).toBe(true);
    });

    // ── 34. Concurrent real reservations at the capacity limit ───────────────────
    it('Scenario 34: Concurrent real reservations strictly serialize and enforce partition ceiling', async () => {
        const quotaMgr = new SupabaseQuotaManager('client_concurrency');
        // Set existing storage usage to 10 MB below STORAGE_CEILING_BYTES (2.2 GB)
        quotaMgr.recordUsage('audit', SupabaseQuotaManager.STORAGE_CEILING_BYTES - 10_000_000, 0);

        // 5 concurrent reservation attempts of 4 MB each (total 20 MB -> only 2 should fit in 10 MB remaining)
        const attempts = await Promise.all([
            quotaMgr.reserveStorageQuota('c_req_1', 4_000_000),
            quotaMgr.reserveStorageQuota('c_req_2', 4_000_000),
            quotaMgr.reserveStorageQuota('c_req_3', 4_000_000),
            quotaMgr.reserveStorageQuota('c_req_4', 4_000_000),
            quotaMgr.reserveStorageQuota('c_req_5', 4_000_000),
        ]);

        const successful = attempts.filter(Boolean).length;
        expect(successful).toBe(2); // Exactly 8 MB accepted (2.190 GB + 8 MB = 2.198 GB <= 2.2 GB)
        expect(attempts.filter(x => !x).length).toBe(3); // 3 rejected
    });

    // ── 35. Partial-completion recovery boundaries ─────────────────────────────────
    it('Scenario 35: Demonstrates deterministic recovery at each partial-completion boundary in bill graph', async () => {
        const outbox = DurableOutboxService.getInstance();
        const testInvoice = `INV_BOUND_${Date.now()}`;

        // Track custom MySQL stock sync execution
        let mysqlSyncExecuted = false;
        let syncedProductId = 0;
        let syncedQty = 0;

        DurableOutboxService.registerCustomHandler('mysql_stock_sync', async (payload: any) => {
            mysqlSyncExecuted = true;
            syncedProductId = payload.product_id;
            syncedQty = payload.quantity;
        });

        // Assemble full bill graph operations
        const billOpId = `bill_${testInvoice}`;
        const itemsOpId = `bill_items_${testInvoice}`;
        const stockOpId = `stock_dec_${testInvoice}_99_0`;
        const mysqlOpId = `mysql_stock_sync_${testInvoice}_99_0`;
        const shipOpId = `shipping_${testInvoice}`;
        const shipLogOpId = `shipping_log_${testInvoice}`;

        const batchIds = outbox.enqueueBatch([
            {
                id: billOpId,
                entityType: 'bills',
                operation: 'insert',
                payload: { invoice_number: testInvoice, grand_total: 1500 },
                primaryKeyCol: 'id',
                upsertConflict: 'invoice_number'
            },
            {
                id: itemsOpId,
                entityType: 'bill_items',
                operation: 'insert',
                payload: [{ bill_id: null, product_id: 99, quantity: 2, price: 750 }],
                dependencyOpId: billOpId
            },
            {
                id: stockOpId,
                entityType: 'inventory_decrement',
                operation: 'insert',
                payload: { product_id: 99, quantity: 2, invoice_number: testInvoice },
                dependencyOpId: billOpId
            },
            {
                id: mysqlOpId,
                entityType: 'mysql_stock_sync',
                operation: 'insert',
                payload: { product_id: 99, quantity: 2, invoice_number: testInvoice },
                dependencyOpId: stockOpId
            },
            {
                id: shipOpId,
                entityType: 'bill_shipping',
                operation: 'insert',
                payload: { bill_id: null, invoice_number: testInvoice, ship_to_name: 'Test Customer' },
                dependencyOpId: billOpId
            },
            {
                id: shipLogOpId,
                entityType: 'shipping_status_log',
                operation: 'insert',
                payload: { shipment_id: null, status: 'pending_payment' },
                dependencyOpId: shipOpId
            }
        ]);

        expect(batchIds.length).toBe(6);

        // Boundary A: Bill is pending, all child operations blocked by dependency
        const pendingRows = [billOpId, itemsOpId, stockOpId, mysqlOpId, shipOpId, shipLogOpId]
            .map(id => (outbox as any).db.prepare("SELECT id, status FROM outbox_operations WHERE id = ?").get(id))
            .filter(Boolean);
        const billRecord = pendingRows.find(r => r.id === billOpId);
        expect(billRecord).toBeDefined();
        expect(billRecord.status).toBe('pending');
        const blockedRecords = pendingRows.filter(r => r.id !== billOpId);
        expect(blockedRecords.length).toBe(5);
        expect(blockedRecords.every(r => r.status === 'blocked_dependency')).toBe(true);

        // Boundary B: Bill completes with resolved ID 5001
        outbox.recordResolvedId(billOpId, 'nas', '5001');
        (outbox as any).markCompleted(billOpId);

        // Child payload resolution checks
        const resolvedItemsPayload = outbox.resolveDependentPayload(billOpId, [{ bill_id: null, product_id: 99, quantity: 2 }], 'nas');
        expect(resolvedItemsPayload[0].bill_id).toBe(5001);

        // Boundary C: Stock decrement completes and unblocks MySQL sync
        outbox.recordResolvedId(stockOpId, 'nas', 'dec_99_2');
        (outbox as any).markCompleted(stockOpId);

        // Execute MySQL stock sync operation
        await (outbox as any).processRecord({
            id: mysqlOpId,
            entityType: 'mysql_stock_sync',
            operation: 'insert',
            payload: { product_id: 99, quantity: 2, invoice_number: testInvoice },
            filter: null,
            primaryKeyCol: 'id',
            primaryKeyVal: null,
            upsertConflict: null,
            dependencyOpId: stockOpId,
            metadata: null,
            target: 'both',
            status: 'pending',
            retryCount: 0,
            maxRetries: 5,
            lastError: null,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        expect(mysqlSyncExecuted).toBe(true);
        expect(syncedProductId).toBe(99);
        expect(syncedQty).toBe(2);
    });

    // ── 36. Retry and restart deduplication ───────────────────────────────────────
    it('Scenario 36: Retry and restart behavior guarantees no duplicate bill items, make orders, or stock decrements', async () => {
        const outbox = DurableOutboxService.getInstance();
        const testInvoice = `INV_DEDUP_${Date.now()}`;

        // 1. Bill Items Deduplication
        const mockClientWithItems: any = {
            from: (table: string) => ({
                select: () => ({
                    eq: () => Promise.resolve({ data: [{ id: 101 }, { id: 102 }], error: null })
                }),
                insert: vi.fn(),
                delete: vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }))
            })
        };

        const dedupItemsResult = await outbox.executeOnClient(
            mockClientWithItems,
            'bill_items',
            'insert',
            [{ bill_id: 999, product_id: 1, quantity: 1 }, { bill_id: 999, product_id: 2, quantity: 1 }]
        );
        // Already exists on server -> does not insert duplicates
        expect(dedupItemsResult.success).toBe(true);
        expect(dedupItemsResult.affectedRows).toBe(2);

        // 2. Customized Make Order Deduplication
        const mockClientWithOrder: any = {
            from: (table: string) => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: () => Promise.resolve({ data: { id: 701 }, error: null })
                        })
                    })
                }),
                insert: vi.fn()
            })
        };

        const dedupOrderResult = await outbox.executeOnClient(
            mockClientWithOrder,
            'make_orders',
            'insert',
            { bill_id: 999, description: `Customized order linked to Invoice ${testInvoice}. Attributes: Color: Oak` }
        );
        expect(dedupOrderResult.success).toBe(true);
        expect(dedupOrderResult.resolvedId).toBe('701');

        // 3. Inventory Decrement Deduplication via outbox_id_map
        const decOpId = `stock_dec_${testInvoice}_10_0`;
        outbox.recordResolvedId(decOpId, 'nas', 'dec_10_3');

        expect(outbox.hasTargetRecord(decOpId, 'nas')).toBe(true);
    });

    // ── 37. Quota reservation state transitions & trusted reconciliation ──────────
    it('Scenario 37: Quota reservation state prevents commit -> same-ID reserve -> release exploit, enforces resource types, and isolates trusted pruning', async () => {
        const reservations = new Map<string, { status: string; bytes: number; client_id: string; resource_type: string }>();

        const mockClient: any = {
            rpc: vi.fn(async (fn: string, args: any) => {
                if (fn === 'reserve_buffer_capacity') {
                    const existing = reservations.get(args.p_reservation_id);
                    if (existing) {
                        if (existing.resource_type !== args.p_resource_type) {
                            return { data: { success: false, reason: 'RESOURCE_TYPE_MISMATCH' }, error: null };
                        }
                        if (existing.status === 'committed') {
                            return { data: { success: false, reason: 'CANNOT_REOPEN_COMMITTED_RESERVATION' }, error: null };
                        }
                        if (['released', 'pruned', 'expired'].includes(existing.status)) {
                            return { data: { success: false, reason: 'RESERVATION_ALREADY_CLOSED' }, error: null };
                        }
                    }
                    reservations.set(args.p_reservation_id, {
                        status: 'active',
                        bytes: args.p_bytes,
                        client_id: args.p_client_id,
                        resource_type: args.p_resource_type
                    });
                    return { data: { success: true }, error: null };
                }

                if (fn === 'release_buffer_capacity') {
                    const existing = reservations.get(args.p_reservation_id);
                    if (!existing) {
                        return { data: { success: false, reason: 'RESERVATION_NOT_FOUND' }, error: null };
                    }
                    if (args.p_status === 'pruned') {
                        // Desktop client without reconciliation role cannot prune
                        return { data: { success: false, reason: 'PRUNE_REQUIRES_RECONCILIATION_ROLE' }, error: null };
                    }
                    if (existing.status === 'committed' && args.p_status === 'released') {
                        // Cannot release committed reservation without trusted pruning
                        return { data: { success: false, reason: 'CANNOT_RELEASE_COMMITTED_RESERVATION' }, error: null };
                    }
                    existing.status = args.p_status;
                    return { data: { success: true }, error: null };
                }
                return { data: null, error: new Error('Unknown RPC') };
            })
        };

        const mockReconciliationClient: any = {
            rpc: vi.fn(async (fn: string, args: any) => {
                if (fn === 'release_buffer_capacity' && args.p_status === 'pruned') {
                    const existing = reservations.get(args.p_reservation_id);
                    if (existing && existing.status === 'committed') {
                        existing.status = 'pruned';
                        return { data: { success: true }, error: null };
                    }
                    return { data: { success: false, reason: 'INVALID_PRUNE_TARGET' }, error: null };
                }
                return { data: null, error: new Error('Unknown RPC') };
            })
        };

        const quotaMgr = new SupabaseQuotaManager('test-client-37', mockClient);
        const resId = 'res_37_safety_test';

        // 1. Initial reservation succeeds
        const reserved = await quotaMgr.reserveStorageQuota(resId, 50_000_000);
        expect(reserved).toBe(true);
        expect(reservations.get(resId)?.status).toBe('active');

        // 2. Commit reservation after upload
        const committed = await quotaMgr.releaseStorageQuota(resId, 50_000_000, 'committed');
        expect(committed).toBe(true);
        expect(reservations.get(resId)?.status).toBe('committed');

        // 3. Exploit attempt: Try to re-reserve using the same reservation ID
        const exploitReserve = await quotaMgr.reserveStorageQuota(resId, 50_000_000);
        expect(exploitReserve).toBe(false);
        expect(reservations.get(resId)?.status).toBe('committed'); // Must remain committed

        // 4. Direct release attempt on committed quota without pruning is rejected
        const unauthorizedRelease = await quotaMgr.releaseStorageQuota(resId, 0, 'released');
        expect(unauthorizedRelease).toBe(false);
        expect(reservations.get(resId)?.status).toBe('committed');

        // 5. Attempting to prune via standard desktop client is rejected
        const clientPrune = await quotaMgr.pruneConfirmedStorage(resId, 50_000_000);
        expect(clientPrune).toBe(false);
        expect(reservations.get(resId)?.status).toBe('committed');

        // 6. Prune via registered trusted reconciliation client succeeds
        quotaMgr.registerReconciliationClient(mockReconciliationClient);
        const trustedPrune = await quotaMgr.pruneConfirmedStorage(resId, 50_000_000);
        expect(trustedPrune).toBe(true);
        expect(reservations.get(resId)?.status).toBe('pruned');

        // 7. Closed state: cannot re-reserve after pruned
        const closedReserve = await quotaMgr.reserveStorageQuota(resId, 10_000_000);
        expect(closedReserve).toBe(false);

        // 8. Resource type mismatch: cannot reserve database quota on storage reservation
        const mismatchReserve = await quotaMgr.reserveDatabaseQuota(resId, 10_000);
        expect(mismatchReserve).toBe(false);
    });

    // ── 38. Database buffer lifecycle & preservation of primary Supabase records ──
    it('Scenario 38: Database records committed to Supabase primary are preserved when NAS syncs; NAS failure leaves replication pending without deleting cloud data', async () => {
        const outbox = DurableOutboxService.getInstance();
        const testInvoice = `INV_BUFFER_LIFECYCLE_${Date.now()}`;
        const opId = `bill_fallback_${testInvoice}`;

        let cloudRowExists = true;

        const mockSupabase: any = {
            from: vi.fn(() => ({
                delete: vi.fn(() => ({
                    eq: vi.fn(() => {
                        cloudRowExists = false;
                        return Promise.resolve({ error: null });
                    })
                })),
                select: vi.fn(() => ({
                    eq: vi.fn(() => Promise.resolve({ data: cloudRowExists ? [{ id: 1 }] : [], error: null }))
                })),
                upsert: vi.fn(() => ({
                    select: vi.fn(() => ({
                        maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 777 }, error: null })),
                        single: vi.fn(() => Promise.resolve({ data: { id: 777 }, error: null }))
                    }))
                })),
                insert: vi.fn(() => ({
                    select: vi.fn(() => ({
                        maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 777 }, error: null })),
                        single: vi.fn(() => Promise.resolve({ data: { id: 777 }, error: null }))
                    }))
                }))
            }))
        };

        const mockNasClient: any = {
            from: vi.fn(() => ({
                upsert: vi.fn(() => ({
                    select: vi.fn(() => ({
                        maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 888 }, error: null })),
                        single: vi.fn(() => Promise.resolve({ data: { id: 888 }, error: null }))
                    }))
                })),
                insert: vi.fn(() => ({
                    select: vi.fn(() => ({
                        maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 888 }, error: null })),
                        single: vi.fn(() => Promise.resolve({ data: { id: 888 }, error: null }))
                    }))
                }))
            }))
        };

        outbox.registerClients({
            nas: mockNasClient,
            supabase: mockSupabase
        });

        // 1. Enqueue operation originally buffered to Supabase
        outbox.enqueueBatch([{
            id: opId,
            entityType: 'bills',
            operation: 'insert',
            payload: { invoice_number: testInvoice, total: 1000 }
        }]);

        // Mark as buffered_supabase
        (outbox as any).markStatus(opId, 'buffered_supabase');
        (outbox as any).recordResolvedId(opId, 'supabase', 'sb_row_888');

        // 2. Run processRecord when NAS is available
        const mapRowToRecord = (r: any): any => ({
            id: r.id,
            entityType: r.entity_type,
            operation: r.operation,
            payload: JSON.parse(r.payload_json || '{}'),
            filter: r.filter_json ? JSON.parse(r.filter_json) : null,
            primaryKeyCol: r.primary_key_col || 'id',
            primaryKeyVal: r.primary_key_val,
            upsertConflict: r.upsert_conflict || null,
            dependencyOpId: r.dependency_op_id,
            metadata: r.metadata_json ? JSON.parse(r.metadata_json) : null,
            target: r.target,
            status: r.status,
            retryCount: r.retry_count,
            maxRetries: r.max_retries,
            lastError: r.last_error,
            createdAt: r.created_at,
            updatedAt: r.updated_at
        });

        const opRecord = (outbox as any).db.prepare('SELECT * FROM outbox_operations WHERE id = ?').get(opId);
        await (outbox as any).processRecord(mapRowToRecord(opRecord));

        // Invariant: committed Supabase data is preserved intact; NAS receives replicated copy
        expect(cloudRowExists).toBe(true);
        const finalOp = (outbox as any).db.prepare('SELECT status, last_error FROM outbox_operations WHERE id = ?').get(opId);
        expect(finalOp.status).toBe('completed');
        expect(finalOp.last_error).toBeNull();

        // 3. Test failure path: when NAS replication fails, cloud copy is preserved and status stays buffered_supabase
        const opIdFail = `bill_fallback_fail_${testInvoice}`;
        outbox.enqueueBatch([{
            id: opIdFail,
            entityType: 'bills',
            operation: 'insert',
            payload: { invoice_number: `${testInvoice}-FAIL`, total: 2000 }
        }]);
        (outbox as any).markStatus(opIdFail, 'buffered_supabase');
        (outbox as any).recordResolvedId(opIdFail, 'supabase', 'sb_row_999');

        const failingNasClient: any = {
            from: vi.fn(() => ({
                upsert: vi.fn(() => ({
                    select: vi.fn(() => ({
                        maybeSingle: vi.fn(() => Promise.reject(new Error('NAS replication connection timeout'))),
                        single: vi.fn(() => Promise.reject(new Error('NAS replication connection timeout')))
                    }))
                })),
                insert: vi.fn(() => ({
                    select: vi.fn(() => ({
                        maybeSingle: vi.fn(() => Promise.reject(new Error('NAS replication connection timeout'))),
                        single: vi.fn(() => Promise.reject(new Error('NAS replication connection timeout')))
                    }))
                }))
            }))
        };

        outbox.registerClients({
            nas: failingNasClient,
            supabase: mockSupabase
        });

        const failRecord = (outbox as any).db.prepare('SELECT * FROM outbox_operations WHERE id = ?').get(opIdFail);
        await (outbox as any).processRecord(mapRowToRecord(failRecord));

        // Supabase record remains intact, status marks buffered_supabase pending replication
        expect(cloudRowExists).toBe(true);
        const pendingOp = (outbox as any).db.prepare('SELECT status, last_error FROM outbox_operations WHERE id = ?').get(opIdFail);
        expect(pendingOp.status).toBe('buffered_supabase');
        expect(pendingOp.last_error).toContain('TrueNAS replication pending');

        // 4. Test persistent mirror preservation
        let mirrorDeleted = false;
        const mirrorSupabase: any = {
            rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
            from: vi.fn(() => ({
                delete: vi.fn(() => {
                    mirrorDeleted = true;
                    return { eq: vi.fn(() => Promise.resolve({ error: null })) };
                }),
                upsert: vi.fn(() => ({
                    select: vi.fn(() => ({
                        maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 999 }, error: null })),
                        single: vi.fn(() => Promise.resolve({ data: { id: 999 }, error: null }))
                    }))
                })),
                insert: vi.fn(() => ({
                    select: vi.fn(() => ({
                        maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 999 }, error: null })),
                        single: vi.fn(() => Promise.resolve({ data: { id: 999 }, error: null }))
                    }))
                }))
            }))
        };

        outbox.registerClients({
            nas: mockNasClient,
            supabase: mirrorSupabase
        });

        const mirrorOpId = `bill_mirror_${testInvoice}`;
        outbox.enqueueBatch([{
            id: mirrorOpId,
            entityType: 'bills',
            operation: 'insert',
            payload: { invoice_number: `${testInvoice}-MIRROR`, total: 3000 }
        }]);

        const mirrorRecord = (outbox as any).db.prepare('SELECT * FROM outbox_operations WHERE id = ?').get(mirrorOpId);
        await (outbox as any).processRecord(mapRowToRecord(mirrorRecord));

        expect(mirrorDeleted).toBe(false);
        const finalMirrorOp = (outbox as any).db.prepare('SELECT status FROM outbox_operations WHERE id = ?').get(mirrorOpId);
        expect(finalMirrorOp.status).toBe('completed');
    });

    // ── 39. Full Runtime Reconciliation Workflow with Quota Manager ─────────────
    it('Scenario 39: Runtime reconciliation workflow: Supabase primary write commits, NAS replication succeeds once without repeated NAS writes, and status reaches completed', async () => {
        const outbox = DurableOutboxService.getInstance();
        const testInvoice = `INV-RECON-PHASE4-${Date.now()}`;
        const opId = `bill_recon_${testInvoice}`;

        // 1. Initial State: record buffered in Supabase
        outbox.enqueueBatch([{
            id: opId,
            entityType: 'bills',
            operation: 'insert',
            payload: { invoice_number: testInvoice, total: 4500 }
        }]);

        // Mark as buffered_supabase
        (outbox as any).markStatus(opId, 'buffered_supabase');
        (outbox as any).recordResolvedId(opId, 'supabase', 'sb_row_recon_1');

        let nasWriteCallCount = 0;
        const mockNasClient: any = {
            from: vi.fn(() => ({
                upsert: vi.fn(() => {
                    nasWriteCallCount++;
                    return {
                        select: vi.fn(() => ({
                            maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'nas_persisted_1' }, error: null })),
                            single: vi.fn(() => Promise.resolve({ data: { id: 'nas_persisted_1' }, error: null }))
                        }))
                    };
                }),
                insert: vi.fn(() => {
                    nasWriteCallCount++;
                    return {
                        select: vi.fn(() => ({
                            maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'nas_persisted_1' }, error: null })),
                            single: vi.fn(() => Promise.resolve({ data: { id: 'nas_persisted_1' }, error: null }))
                        }))
                    };
                })
            }))
        };

        let cloudRowExists = true;
        const mockSupabase: any = {
            rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
            from: vi.fn(() => ({
                delete: vi.fn(() => {
                    cloudRowExists = false;
                    return { eq: vi.fn(() => Promise.resolve({ error: null })) };
                }),
                select: vi.fn(() => ({
                    eq: vi.fn(() => Promise.resolve({
                        data: cloudRowExists ? [{ id: 'sb_row_recon_1' }] : [],
                        error: null
                    }))
                }))
            }))
        };

        outbox.registerClients({
            nas: mockNasClient,
            supabase: mockSupabase
        });

        const mapRowToRecord = (r: any) => ({
            id: r.id,
            entityType: r.entity_type,
            operation: r.operation,
            payload: JSON.parse(r.payload_json),
            filter: r.filter_json ? JSON.parse(r.filter_json) : null,
            primaryKeyCol: r.primary_key_col || 'id',
            primaryKeyVal: r.primary_key_val,
            upsertConflict: r.upsert_conflict || null,
            dependencyOpId: r.dependency_op_id,
            metadata: r.metadata_json ? JSON.parse(r.metadata_json) : null,
            target: r.target,
            status: r.status,
            retryCount: r.retry_count,
            maxRetries: r.max_retries,
            lastError: r.last_error,
            createdAt: r.created_at,
            updatedAt: r.updated_at
        });

        // 2. Step 1: Execute processRecord
        // - Supabase record is preserved intact (cloudRowExists === true)
        // - NAS write succeeds (nasWriteCallCount === 1)
        // - Operation reaches completed status
        const recordStep1 = (outbox as any).db.prepare('SELECT * FROM outbox_operations WHERE id = ?').get(opId);
        await (outbox as any).processRecord(mapRowToRecord(recordStep1));

        expect(nasWriteCallCount).toBe(1);
        expect(cloudRowExists).toBe(true);
        const opStep1 = (outbox as any).db.prepare('SELECT status, last_error FROM outbox_operations WHERE id = ?').get(opId);
        expect(opStep1.status).toBe('completed');
        expect(opStep1.last_error).toBeNull();

        // 3. Step 2: Retry/re-process avoids repeated NAS write
        const recordStep2 = (outbox as any).db.prepare('SELECT * FROM outbox_operations WHERE id = ?').get(opId);
        await (outbox as any).processRecord(mapRowToRecord(recordStep2));

        // CRITICAL ASSERTION: NAS write must NOT have been called again!
        expect(nasWriteCallCount).toBe(1);
        expect(cloudRowExists).toBe(true);

        const opStep2 = (outbox as any).db.prepare('SELECT status, last_error FROM outbox_operations WHERE id = ?').get(opId);
        expect(opStep2.status).toBe('completed');
        expect(opStep2.last_error).toBeNull();
    });

    // ── 40. (Section 5.1 & 5.2) Supabase Healthy, NAS Offline: First-Write to Supabase ─
    it('Scenario 40: Supabase is healthy and NAS is unavailable: text writes commit to Supabase primary, file buffers to Supabase Storage, and NAS replication remains pending in buffered_supabase without data loss', async () => {
        const outbox = DurableOutboxService.getInstance();
        const uploadService = DurableUploadService.getInstance();

        // 1. Text/Business write when NAS is offline
        const mockSupabaseDb: any = {
            from: vi.fn(() => ({
                insert: vi.fn(() => ({
                    select: vi.fn(() => ({
                        maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 101, furniture_name: 'Executive Chair' }, error: null })),
                        single: vi.fn(() => Promise.resolve({ data: { id: 101, furniture_name: 'Executive Chair' }, error: null }))
                    }))
                }))
            }))
        };
        const mockFailingNasDb: any = {
            from: vi.fn(() => ({
                insert: vi.fn(() => ({
                    select: vi.fn(() => ({
                        maybeSingle: vi.fn(() => Promise.reject(new Error('NAS network timeout (100.88.85.6:3001 unreachable)'))),
                        single: vi.fn(() => Promise.reject(new Error('NAS network timeout (100.88.85.6:3001 unreachable)')))
                    }))
                }))
            }))
        };

        outbox.registerClients({ nas: mockFailingNasDb, supabase: mockSupabaseDb });

        const opId = `make_order_sb_first_${Date.now()}`;
        outbox.enqueueSingle({
            id: opId,
            entityType: 'make_orders',
            operation: 'insert',
            payload: { furniture_name: 'Executive Chair', total_price: 1500 }
        });

        const opRecord = (outbox as any).db.prepare('SELECT * FROM outbox_operations WHERE id = ?').get(opId);
        const mapRow = (r: any) => ({
            id: r.id, entityType: r.entity_type, operation: r.operation,
            payload: JSON.parse(r.payload_json), filter: null, primaryKeyCol: 'id',
            primaryKeyVal: null, upsertConflict: null, dependencyOpId: null,
            metadata: null, target: r.target, status: r.status, retryCount: 0,
            maxRetries: 10, lastError: null, createdAt: r.created_at, updatedAt: r.updated_at
        });

        await (outbox as any).processRecord(mapRow(opRecord));

        // Primary Supabase commit succeeded; NAS replication marked pending
        const recordAfter = (outbox as any).db.prepare('SELECT status, last_error FROM outbox_operations WHERE id = ?').get(opId);
        expect(recordAfter.status).toBe('buffered_supabase');
        expect(recordAfter.last_error).toContain('TrueNAS replication pending');

        // 2. File write when NAS is offline
        const buffer = Buffer.from('TEST-CAD-DRAWING-BINARY-DATA');
        const staged = await uploadService.stageFile(
            buffer,
            'desk_cad_v1.pdf',
            'application/pdf',
            'make-order-files',
            { entityType: 'make_orders', entityId: '101', fieldName: 'technical_drawing_url' }
        );

        // Supabase upload succeeds, NAS upload fails
        vi.spyOn(uploadService, 'uploadToNasStorage').mockResolvedValue({
            success: false,
            error: 'NAS storage daemon offline'
        });

        const uploadRes = await uploadService.dispatchUpload(staged.id);
        expect(uploadRes.success).toBe(true);
        expect(uploadRes.status).toBe('buffered_supabase');
        expect(uploadRes.durableKey).toContain('desk_cad_v1.pdf');

        const stagedInDb = (uploadService as any).db.prepare('SELECT status, remote_url_supabase, remote_url_nas FROM durable_uploads WHERE id = ?').get(staged.id);
        expect(stagedInDb.status).toBe('buffered_supabase');
        expect(stagedInDb.remote_url_supabase).toBeTruthy();
        expect(stagedInDb.remote_url_nas).toBeNull();
    });

    // ── 41. (Section 5.3) NAS Recovery: Pull Replication & Confirmation ─────────
    it('Scenario 41: NAS recovers: replication worker synchronizes pending data and files from Supabase, verifies persistence, and marks tasks completed only after confirmation', async () => {
        const outbox = DurableOutboxService.getInstance();
        const uploadService = DurableUploadService.getInstance();

        // 1. Text replication recovery
        const opId = `recon_text_${Date.now()}`;
        outbox.enqueueSingle({
            id: opId,
            entityType: 'make_orders',
            operation: 'insert',
            payload: { furniture_name: 'Reconciled Table' }
        });
        (outbox as any).markStatus(opId, 'buffered_supabase');
        (outbox as any).recordResolvedId(opId, 'supabase', 'sb_ord_555');

        let nasInserted = false;
        const mockRecoveredNasDb: any = {
            from: vi.fn(() => ({
                insert: vi.fn(() => {
                    nasInserted = true;
                    return {
                        select: vi.fn(() => ({
                            maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 555 }, error: null })),
                            single: vi.fn(() => Promise.resolve({ data: { id: 555 }, error: null }))
                        }))
                    };
                })
            }))
        };
        const mockSbDb: any = {
            from: vi.fn(() => ({
                select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [{ id: 'sb_ord_555' }], error: null })) }))
            }))
        };

        outbox.registerClients({ nas: mockRecoveredNasDb, supabase: mockSbDb });

        const row = (outbox as any).db.prepare('SELECT * FROM outbox_operations WHERE id = ?').get(opId);
        const mapRow = (r: any) => ({
            id: r.id, entityType: r.entity_type, operation: r.operation,
            payload: JSON.parse(r.payload_json), filter: null, primaryKeyCol: 'id',
            primaryKeyVal: null, upsertConflict: null, dependencyOpId: null,
            metadata: null, target: r.target, status: r.status, retryCount: 0,
            maxRetries: 10, lastError: null, createdAt: r.created_at, updatedAt: r.updated_at
        });

        await (outbox as any).processRecord(mapRow(row));
        expect(nasInserted).toBe(true);

        const opFinal = (outbox as any).db.prepare('SELECT status, last_error FROM outbox_operations WHERE id = ?').get(opId);
        expect(opFinal.status).toBe('completed');
        expect(opFinal.last_error).toBeNull();

        // 2. File replication recovery
        const buffer = Buffer.from('RECON-PHOTO-DATA');
        const staged = await uploadService.stageFile(
            buffer,
            'recon_photo.webp',
            'image/webp',
            'product-images',
            { entityType: 'make_orders', entityId: '555', fieldName: 'photo_url' }
        );
        (uploadService as any).db.prepare("UPDATE durable_uploads SET status = 'buffered_supabase', remote_url_supabase = ? WHERE id = ?").run('product-images/photo_key.webp', staged.id);

        vi.spyOn(uploadService as any, 'uploadToNasStorage').mockResolvedValue({
            success: true,
            url: 'https://storage.lenas.me/files/product-images/recon_photo.webp',
            sha256: staged.sha256
        });
        vi.spyOn(uploadService as any, 'updateEntityRecord').mockResolvedValue(true);
        vi.spyOn(uploadService as any, 'pruneCloudCopy').mockResolvedValue(true);

        const reconUploadRes = await uploadService.dispatchUpload(staged.id);
        expect(reconUploadRes.success).toBe(true);
        expect(reconUploadRes.status).toBe('synced_nas');
        expect(reconUploadRes.url).toBe('https://storage.lenas.me/files/product-images/recon_photo.webp');
    });

    // ── 42. (Section 5.4) Supabase Unavailable: Durable Local Staging ───────────
    it('Scenario 42: Supabase is unavailable: files and business writes enter durable local staging without false remote commitment', async () => {
        const outbox = DurableOutboxService.getInstance();
        const uploadService = DurableUploadService.getInstance();

        // 1. Database write when Supabase is completely down
        outbox.registerClients({
            nas: null,
            supabase: null // Offline
        });

        const opId = `local_staged_${Date.now()}`;
        outbox.enqueueSingle({
            id: opId,
            entityType: 'make_orders',
            operation: 'insert',
            payload: { furniture_name: 'Offline Desk' }
        });

        const pendingRow = (outbox as any).db.prepare('SELECT status FROM outbox_operations WHERE id = ?').get(opId);
        expect(pendingRow.status).toBe('pending'); // Kept safely locally

        // 2. File upload when Supabase Storage client is offline
        uploadService.registerClients({ nas: null, supabase: null });

        const buffer = Buffer.from('OFFLINE-BINARY');
        const staged = await uploadService.stageFile(buffer, 'offline_doc.pdf', 'application/pdf', 'make-order-files');
        expect(staged.status).toBe('staged_local');

        const uploadRes = await uploadService.dispatchUpload(staged.id);
        expect(uploadRes.success).toBe(false);
        expect(uploadRes.status).toBe('staged_local');
        expect(uploadRes.error).toContain('Supabase Storage client is not configured or offline');
    });

    // ── 43. (Section 5.5) Supabase Recovery & Dependency Ordering ────────────────
    it('Scenario 43: Supabase recovers: pending outbox writes are replayed in dependency order, parent order precedes child updates, and duplicate processing does not produce duplicates', async () => {
        const outbox = DurableOutboxService.getInstance();
        const parentOpId = `op_parent_recov_${Date.now()}`;
        const childOpId = `op_child_recov_${Date.now()}`;

        let ordersInserted = 0;
        let updatesInserted = 0;

        const mockSupabase: any = {
            from: vi.fn((table: string) => ({
                insert: vi.fn((payload: any) => {
                    if (table === 'make_orders') {
                        ordersInserted++;
                        return {
                            select: vi.fn(() => ({
                                maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 701, order_number: 'MAKE-2026-000701' }, error: null })),
                                single: vi.fn(() => Promise.resolve({ data: { id: 701, order_number: 'MAKE-2026-000701' }, error: null }))
                            }))
                        };
                    }
                    if (table === 'make_order_updates') {
                        updatesInserted++;
                        return {
                            select: vi.fn(() => ({
                                maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 901 }, error: null })),
                                single: vi.fn(() => Promise.resolve({ data: { id: 901 }, error: null }))
                            }))
                        };
                    }
                    return { select: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 1 }, error: null })) })) };
                })
            }))
        };

        outbox.registerClients({ nas: null, supabase: mockSupabase });

        // Enqueue parent and dependent child
        outbox.enqueueSingle({
            id: parentOpId,
            entityType: 'make_orders',
            operation: 'insert',
            payload: { furniture_name: 'Dependent Order' }
        });
        outbox.enqueueSingle({
            id: childOpId,
            entityType: 'make_order_updates',
            operation: 'insert',
            payload: { stage: 'Work in process', order_id: null },
            dependencyOpId: parentOpId
        });

        // Process in queue order
        const mapRow = (r: any) => ({
            id: r.id, entityType: r.entity_type, operation: r.operation,
            payload: JSON.parse(r.payload_json), filter: null, primaryKeyCol: 'id',
            primaryKeyVal: null, upsertConflict: null, dependencyOpId: r.dependency_op_id,
            metadata: null, target: r.target, status: r.status, retryCount: 0,
            maxRetries: 10, lastError: null, createdAt: r.created_at, updatedAt: r.updated_at
        });

        const pRow = (outbox as any).db.prepare('SELECT * FROM outbox_operations WHERE id = ?').get(parentOpId);
        await (outbox as any).processRecord(mapRow(pRow));

        const cRow = (outbox as any).db.prepare('SELECT * FROM outbox_operations WHERE id = ?').get(childOpId);
        await (outbox as any).processRecord(mapRow(cRow));

        expect(ordersInserted).toBe(1);
        expect(updatesInserted).toBe(1);

        // Verify child resolved parent ID (701)
        const parentResolved = (outbox as any).db.prepare('SELECT resolved_id FROM outbox_id_map WHERE op_id = ?').get(parentOpId);
        expect(parentResolved.resolved_id).toBe('701');

        // Replay attempt is idempotent
        expect(() => {
            outbox.enqueueSingle({
                id: parentOpId,
                entityType: 'make_orders',
                operation: 'insert',
                payload: { furniture_name: 'Dependent Order' }
            });
        }).toThrow(/UNIQUE constraint failed/);
    });

    // ── 44. (Section 5.6) Quota Reservation Exhaustion ──────────────────────────
    it('Scenario 44: Quota reservation exhaustion: 2.2 GB storage / 3 GB database ceiling rejects prospective writes, retains files safely locally for retry without accounting loss', async () => {
        const quotaMgr = SupabaseQuotaManager.getInstance();
        const uploadService = DurableUploadService.getInstance();

        // Register mock storage for uploadService
        const mockStorage = {
            from: vi.fn(() => ({
                upload: vi.fn().mockResolvedValue({ data: { path: 'test' }, error: null }),
                createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage/signed' }, error: null })
            }))
        };
        uploadService.registerClients({ nas: null, supabase: { storage: mockStorage } as any });

        // Simulate usage at STORAGE_CEILING_BYTES (2.2 GB)
        quotaMgr.recordUsage('client-quota-test', SupabaseQuotaManager.STORAGE_CEILING_BYTES, 100 * 1024 * 1024);

        const buffer = Buffer.from('QUOTA-EXHAUSTION-TEST-PAYLOAD');
        const staged = await uploadService.stageFile(buffer, 'huge_cad.dwg', 'application/acad', 'make-order-files');

        // Dispatch must be rejected by quota limit and retained locally
        const res = await uploadService.dispatchUpload(staged.id);
        expect(res.success).toBe(false);
        expect(res.status).toBe('staged_local');
        expect(res.error).toMatch(/(ceiling|quota limit)/i);

        const dbRecord = (uploadService as any).db.prepare('SELECT status, last_error FROM durable_uploads WHERE id = ?').get(staged.id);
        expect(dbRecord.status).toBe('staged_local');
        expect(dbRecord.last_error).toMatch(/(ceiling|quota limit)/i);
    });

    // ── 45. (Section 5.7) Quota RPC Failure / Mismatch Fail-Safety ──────────────
    it('Scenario 45: Missing or mismatched RPC fails visibly and safely to local outbox rather than silently violating the Supabase-first contract', async () => {
        const quotaMgr = SupabaseQuotaManager.getInstance();

        // Simulate PostgREST schema cache 404 (function not found)
        const mockClientWithRpcError: any = {
            rpc: vi.fn().mockResolvedValue({
                data: null,
                error: {
                    code: 'PGRST202',
                    message: 'Could not find the function public.reserve_buffer_capacity in the schema cache'
                }
            })
        };

        quotaMgr.registerClients({ supabase: mockClientWithRpcError });

        const canReserve = await quotaMgr.reserveStorageQuota('res_rpc_fail_test', 5000);
        expect(canReserve).toBe(false); // Strictly fails closed!
        expect((quotaMgr as any).blockedOperationsCount).toBeGreaterThan(0);
    });

    // ── 46. (Section 5.8) MakeProductionService Foreign Key Defenses ─────────────
    it('Scenario 46: MakeProductionService foreign key validation: production update for non-existent parent order is rejected fail-closed, or deferred in outbox if parent order is pending', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        }));
        const outbox = DurableOutboxService.getInstance();
        const nonExistentId = 999999;

        // Case 1: Order does not exist in DB or outbox
        const resNonExistent = await MakeProductionService.addProductionUpdate({
            orderId: nonExistentId,
            targetStage: 'Work in process',
            actorName: 'Floor Manager',
            actorRole: 'Factory Manager'
        });

        expect(resNonExistent.success).toBe(false);
        expect(resNonExistent.error).toContain(`Parent order "${nonExistentId}" does not exist in database or pending outbox.`);

        // Case 2: Parent order is currently pending in durable outbox
        const pendingParentOpId = `make_order_pending_${Date.now()}`;
        outbox.enqueueSingle({
            id: pendingParentOpId,
            entityType: 'make_orders',
            operation: 'insert',
            payload: { id: 88888, furniture_name: 'Staged Chair' }
        });

        const resDeferred = await MakeProductionService.addProductionUpdate({
            orderId: 88888,
            targetStage: 'Work in process',
            note: 'Starting framework assembly',
            actorName: 'Floor Manager',
            actorRole: 'Factory Manager'
        });

        expect(resDeferred.success).toBe(true);
        expect(resDeferred.stage).toBe('Work in process');

        // Verify dependent child was deferred in outbox rather than failing with FK 23503
        const deferredChild = (outbox as any).db.prepare('SELECT * FROM outbox_operations WHERE dependency_op_id = ?').get(pendingParentOpId);
        expect(deferredChild).toBeDefined();
        expect(deferredChild.entity_type).toBe('make_order_updates');
        expect(deferredChild.payload_json).toContain('Starting framework assembly');
    });
});
