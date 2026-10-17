/**
 * tests/integration/durable-upload-real-sqlite.integration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Real Native SQLite Integration Test for DurableUploadService Association Recovery.
 *
 * Verifies real SQLite durability under Electron's Node runtime (ABI 143):
 *  1. Uses an isolated, disposable temporary application-data directory.
 *  2. Stages a real upload without owner metadata.
 *  3. Persists a pending association in the real native SQLite pending_associations table.
 *  4. Shuts down and recreates the DurableUploadService against the same SQLite file.
 *  5. Proves pending-association record survives reopening on real disk and links the upload.
 *  6. Asserts database owner-reference update must succeed before cloud deletion and quota release.
 *  7. Confirms failure retains cloud copy and quota accounting for retry.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import { DurableUploadService } from '../../electron/services/media/DurableUploadService';
import { SupabaseQuotaManager } from '../../electron/services/quota/SupabaseQuotaManager';

const isRealSqlite = process.env.TEST_REAL_SQLITE === 'true';

describe.runIf(isRealSqlite)('DurableUploadService Real SQLite Association Recovery Integration Tests', () => {
    let tempDir: string;
    let originalAppData: string | undefined;

    beforeEach(() => {
        // 1. Isolated, disposable temporary directory
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesoft-durable-upload-real-sqlite-'));
        originalAppData = process.env.APPDATA;
        process.env.APPDATA = tempDir;

        if (app?.getPath) {
            vi.spyOn(app, 'getPath').mockReturnValue(tempDir);
        }

        DurableUploadService.resetInstanceForTesting();
    });

    afterEach(() => {
        try {
            // Close active SQLite handle before directory cleanup
            const activeInstance = DurableUploadService.getInstance();
            (activeInstance as any).db?.close();
            DurableUploadService.resetInstanceForTesting();
        } catch {}

        process.env.APPDATA = originalAppData;

        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        } catch {}

        vi.restoreAllMocks();
    });

    it('recovers persisted pending associations across service recreation on real native SQLite', async () => {
        const uploadService = DurableUploadService.getInstance();
        const db = (uploadService as any).db;
        expect(db).toBeDefined();

        // Verify the database file is physically created in the isolated temporary directory
        const dbFile = path.join(tempDir, 'lesoft_durable_uploads.db');
        expect(fs.existsSync(dbFile)).toBe(true);

        // 1. Stage a real upload with NO owner metadata (unassociated)
        const sampleBuffer = Buffer.from('%PDF-1.7 real native SQLite pending association recovery test payload');
        const staged = await uploadService.stageFile(
            sampleBuffer,
            'unassociated_real_sqlite.pdf',
            'application/pdf',
            'make-order-files/777',
            undefined, // NO owner metadata!
            { autoDispatch: false }
        );

        expect(staged.id).toBeDefined();
        expect(staged.sha256).toBeDefined();

        // Verify SQLite table durable_uploads contains this unassociated row
        const rowBefore = db.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(staged.id);
        expect(rowBefore).toBeDefined();
        expect(rowBefore.entity_type).toBeNull();
        expect(rowBefore.entity_id).toBeNull();
        expect(rowBefore.field_name).toBeNull();

        // 2. Persist a pending association in real SQLite pending_associations table
        const now = Date.now();
        db.prepare(`
            INSERT INTO pending_associations (identifier, entity_type, entity_id, field_name, retry_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, ?, ?)
        `).run(staged.id, 'make_orders', '777', 'invoice_attachment_urls', now, now);

        // Simulate cloud buffer established
        const cloudUrl = `make-order-files/777/${staged.id}_unassociated_real_sqlite.pdf`;
        db.prepare(`
            UPDATE durable_uploads
            SET status = 'buffered_supabase', remote_url_supabase = ?
            WHERE id = ?
        `).run(cloudUrl, staged.id);

        // Confirm pending_associations row exists in SQLite before restart
        const pendingBefore = db.prepare('SELECT * FROM pending_associations WHERE identifier = ?').get(staged.id);
        expect(pendingBefore).toBeDefined();
        expect(pendingBefore.entity_id).toBe('777');

        // Confirm real upload is still unassociated in durable_uploads before restart
        const unassocRow = db.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(staged.id);
        expect(unassocRow.entity_type).toBeNull();
        expect(unassocRow.entity_id).toBeNull();

        // 3. Close and recreate the service against the same SQLite database file
        DurableUploadService.resetInstanceForTesting();
        const reopenedService = DurableUploadService.getInstance();
        const reopenedDb = (reopenedService as any).db;
        expect(reopenedDb).toBeDefined();

        // 4. Verify startup reconciliation linked the unassociated upload to the intended owner
        const linkedRow = reopenedDb.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(staged.id);
        expect(linkedRow.entity_type).toBe('make_orders');
        expect(linkedRow.entity_id).toBe('777');
        expect(linkedRow.field_name).toBe('invoice_attachment_urls');

        // Verify the pending_associations row was consumed and removed
        const pendingAfter = reopenedDb.prepare('SELECT * FROM pending_associations WHERE identifier = ?').get(staged.id);
        expect(pendingAfter).toBeUndefined();

        // 5. Test failure retains cloud copy and quota accounting for retry
        const nasConfirmedUrl = `https://storage.lenas.me/files/make-order-files/777/${staged.id}_unassociated_real_sqlite.pdf`;
        vi.spyOn(reopenedService as any, 'uploadToNasStorage').mockResolvedValue({
            success: true,
            url: nasConfirmedUrl,
            sha256: staged.sha256
        });

        let cloudRemoved = false;
        let quotaPruned = false;

        const quotaMgr = SupabaseQuotaManager.getInstance();
        vi.spyOn(quotaMgr, 'pruneConfirmedStorage').mockImplementation(async () => {
            quotaPruned = true;
            return true;
        });

        // Mock Supabase client where remote order record does not exist (update fails)
        const mockSupabaseFailing: any = {
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
                    }))
                })),
                update: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        select: vi.fn().mockResolvedValue({ data: [], error: null })
                    }))
                }))
            })),
            storage: {
                from: vi.fn(() => ({
                    remove: vi.fn(async (paths: string[]) => {
                        cloudRemoved = true;
                        return { data: paths, error: null };
                    })
                }))
            }
        };

        (reopenedService as any).supabaseClient = mockSupabaseFailing;
        (reopenedService as any).nasClient = mockSupabaseFailing;

        const failedDispatch = await reopenedService.dispatchUpload(staged.id);
        expect(failedDispatch.success).toBe(false);

        // Cloud removal and quota release MUST NOT occur on entity update failure
        expect(cloudRemoved).toBe(false);
        expect(quotaPruned).toBe(false);

        // Real SQLite row retains buffered_supabase and remote_url_supabase for retry
        const rowAfterFail = reopenedDb.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(staged.id);
        expect(rowAfterFail.status).toBe('buffered_supabase');
        expect(rowAfterFail.remote_url_supabase).toBe(cloudUrl);

        // 6. Test success: database owner update succeeds BEFORE cloud removal and quota release
        const executionSequence: string[] = [];
        const mockOrder = { id: 777, invoice_attachment_urls: [cloudUrl] };

        const mockSupabaseSuccess: any = {
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({ data: mockOrder, error: null })
                    }))
                })),
                update: vi.fn((body: any) => ({
                    eq: vi.fn(() => ({
                        select: vi.fn().mockImplementation(() => {
                            executionSequence.push('db_update_order_reference');
                            Object.assign(mockOrder, body);
                            return Promise.resolve({ data: [mockOrder], error: null });
                        })
                    }))
                }))
            })),
            storage: {
                from: vi.fn(() => ({
                    remove: vi.fn(async (paths: string[]) => {
                        executionSequence.push('cloud_storage_remove');
                        return { data: paths, error: null };
                    })
                }))
            }
        };

        (reopenedService as any).supabaseClient = mockSupabaseSuccess;
        (reopenedService as any).nasClient = mockSupabaseSuccess;

        vi.spyOn(quotaMgr, 'pruneConfirmedStorage').mockImplementation(async () => {
            executionSequence.push('quota_prune_release');
            return true;
        });

        const successfulDispatch = await reopenedService.dispatchUpload(staged.id);
        expect(successfulDispatch.success).toBe(true);
        expect(successfulDispatch.status).toBe('synced_nas');

        // Strictly verify execution sequence:
        // (a) db_update_order_reference precedes cloud_storage_remove
        // (b) cloud_storage_remove precedes quota_prune_release
        expect(executionSequence).toEqual([
            'db_update_order_reference',
            'cloud_storage_remove',
            'quota_prune_release'
        ]);

        // Owning order was updated with NAS URL and removed temporary cloud URL
        expect(mockOrder.invoice_attachment_urls).toContain(nasConfirmedUrl);
        expect(mockOrder.invoice_attachment_urls).not.toContain(cloudUrl);

        // Real SQLite record confirms full synchronization and cleanup of cloud copy
        const finalRow = reopenedDb.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(staged.id);
        expect(finalRow.status).toBe('synced_nas');
        expect(finalRow.remote_url_supabase).toBeNull();
        expect(finalRow.remote_url_nas).toBe(nasConfirmedUrl);
    });
});
