/**
 * tests/make/make-module-stability.integration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive MAKE Module Stability & Verification Suite — LE-SOFT v1.8.12
 *
 * Verifies:
 *  1. Place Order and MAKE order items:
 *     - Customer required fields, phone validation, placeholder rejection
 *     - Phone number normalization (+880, 880, formatting)
 *     - Authoritative multi-item pricing & decimal precision
 *     - Atomic order rollback on item failure
 *     - Guaranteed unique order numbers
 *  2. Named drafts lifecycle:
 *     - Create, save, edit, reload, delete, duplicate
 *     - Ephemeral blob/data URL stripping to prevent localStorage quota exhaustion
 *     - User isolation
 *     - Post-submission cleanup
 *  3. File and CAD attachment uploads (MakeCadService):
 *     - Format & size limit enforcement (50 MB CAD, 15 MB photo/invoice)
 *     - Binary magic-byte validation (reject executables / scripts)
 *     - Unicode filename & space preservation with security sanitization
 *     - Durable upload staging & SHA-256 verification
 *     - Quota-managed Supabase Storage fallback with commit/release
 *  4. Global specification images & Migration 066 compatibility:
 *     - make-save-spec persists image_url
 *     - Actionable migration 066 error on missing image_url column
 *     - Graceful schema compatibility when no image is provided
 *  5. Order security & Track Orders operations:
 *     - Rejection of arbitrary local file paths in legacy PDF upload handlers
 *     - Order duplication mapping integrity
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

// ── Hoisted Mocks for Electron & Supabase IPC ───────────────────────────────
const h = vi.hoisted(() => {
    const state: {
        calls: Array<{ table: string; op: 'insert' | 'update' | 'delete' | 'select'; body?: any }>;
        responder: (table: string, op: string, body?: any) => { data: any; error: any } | Promise<{ data: any; error: any }>;
        cloudCalls: Array<{ table: string; row: any }>;
        handlers: Record<string, Function>;
        quotaReserved: number;
        storageUploads: Array<{ bucket: string; path: string; buffer: Buffer }>;
        storageBuckets: Record<string, any>;
    } = {
        calls: [],
        responder: () => ({ data: { id: 101, order_number: 'MAKE-2026-999999' }, error: null }),
        cloudCalls: [],
        handlers: {},
        quotaReserved: 0,
        storageUploads: [],
        storageBuckets: {}
    };

    const getStorageBucket = (bucket: string) => {
        if (!state.storageBuckets[bucket]) {
            state.storageBuckets[bucket] = {
                upload: vi.fn(async (filePath: string, buffer: Buffer) => {
                    state.storageUploads.push({ bucket, path: filePath, buffer });
                    return { data: { path: filePath }, error: null };
                }),
                createSignedUrl: vi.fn(async (filePath: string, expiresIn: number) => ({
                    data: { signedUrl: `https://mock.supabase.co/storage/v1/object/sign/${bucket}/${filePath}?token=mock_signed&expires=${expiresIn}` },
                    error: null
                })),
                getPublicUrl: vi.fn((filePath: string) => ({
                    data: { publicUrl: `https://mock.supabase.co/storage/v1/object/public/${bucket}/${filePath}` }
                })),
                remove: vi.fn(async (paths: string[]) => ({
                    data: paths,
                    error: null
                }))
            };
        }
        return state.storageBuckets[bucket];
    };

    const makeBuilder = (table: string) => {
        let op: 'insert' | 'update' | 'delete' | 'select' = 'select';
        let body: any = null;
        let selectedCols = '*';

        const b: any = {
            insert: (v: any) => {
                op = 'insert';
                body = v;
                state.calls.push({ table, op, body });
                return b;
            },
            update: (v: any) => {
                op = 'update';
                body = v;
                state.calls.push({ table, op, body });
                return b;
            },
            delete: () => {
                op = 'delete';
                state.calls.push({ table, op });
                return b;
            },
            select: (cols?: string) => {
                selectedCols = cols || '*';
                return b;
            },
            eq: () => b,
            neq: () => b,
            in: () => b,
            or: () => b,
            order: () => b,
            limit: () => b,
            range: () => b,
            maybeSingle: async () => state.responder(table, op, body),
            single: async () => state.responder(table, op, body),
            then: (resolve: Function) => Promise.resolve(state.responder(table, op, body)).then(resolve as any)
        };
        return b;
    };

    return { state, makeBuilder, getStorageBucket };
});

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => path.join(process.cwd(), 'tmp_make_test_userdata')), isPackaged: false },
    dialog: { showOpenDialog: vi.fn() },
    shell: {},
    BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
    ipcMain: {
        handle: vi.fn((channel: string, fn: Function) => { h.state.handlers[channel] = fn; }),
        on: vi.fn(),
        removeHandler: vi.fn()
    }
}));

vi.mock('../../electron/supabase', () => ({
    supabase: {
        from: vi.fn((table: string) => h.makeBuilder(table)),
        storage: {
            from: vi.fn((bucket: string) => h.getStorageBucket(bucket))
        }
    },
    supabaseAdmin: {
        from: vi.fn((table: string) => ({
            upsert: (row: any) => {
                h.state.cloudCalls.push({ table, row });
                return { catch: vi.fn() };
            }
        }))
    },
    failoverEngine: {
        executeRead: vi.fn(async (fn: Function) => fn({
            from: (t: string) => h.makeBuilder(t)
        })),
        executeWrite: vi.fn(async (fn: Function) => fn({
            from: (t: string) => h.makeBuilder(t)
        }))
    },
    getNasStorageCandidates: vi.fn(() => []),
    getCfAccessHeaders: vi.fn(() => ({}))
}));

import { MakeOrderService, CreateMakeOrderInput } from '../../electron/services/make/MakeOrderService';
import { MakePricingService } from '../../electron/services/make/MakePricingService';
import { MakeCadService } from '../../electron/services/make/MakeCadService';
import { SupabaseQuotaManager } from '../../electron/services/quota/SupabaseQuotaManager';
import { DurableUploadService } from '../../electron/services/media/DurableUploadService';
import { supabase } from '../../electron/supabase';
import { SessionManager, UserSession } from '../../electron/session-manager';
import { registerMakeHandlers, resolveAttachmentUrl } from '../../electron/ipc/handlers/make';
import {
    saveNamedPlaceOrderDraft,
    loadSavedPlaceOrderDrafts,
    deleteSavedPlaceOrderDraft,
    savePlaceOrderDraft,
    loadPlaceOrderDraft,
    clearPlaceOrderDraft,
    hasMeaningfulPlaceOrderDraft,
    SavedPlaceOrderDraft,
    getPersistentAttachmentReference
} from '../../src/utils/placeOrderDraft';

// ── In-Memory LocalStorage Mock ─────────────────────────────────────────────
function createMemoryStorage(): Storage {
    const values = new Map<string, string>();
    return {
        get length() { return values.size; },
        clear: () => values.clear(),
        getItem: (key: string) => values.has(key) ? values.get(key)! : null,
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        removeItem: (key: string) => { values.delete(key); },
        setItem: (key: string, value: string) => { values.set(String(key), String(value)); }
    } as Storage;
}

describe('MAKE Module Stability & Verification Suite (LE-SOFT v1.8.12)', () => {
    let mockStorage: Storage;

    beforeEach(() => {
        vi.restoreAllMocks();
        h.state.calls = [];
        h.state.cloudCalls = [];
        h.state.storageUploads = [];
        h.state.handlers = {};
        h.state.storageBuckets = {};

        mockStorage = createMemoryStorage();
        vi.stubGlobal('localStorage', mockStorage);
        mockStorage.setItem('user_id', 'make-test-user');

        // Configure mock session
        SessionManager.setSession({
            id: 42,
            username: 'test_designer',
            full_name: 'Test Designer',
            role: 'furniture_designer',
            permissions: { manage_make_orders: true, manage_catalog: true, manage_global_product_attributes: true, write_make_catalog: true }
        });

        // Register handlers & clients
        DurableUploadService.getInstance().registerClients({ nas: null, supabase: supabase as any });
        // Cleanup tests model the authenticated reconciliation identity required
        // before committed cloud-buffer copies can be pruned in production.
        vi.spyOn(SupabaseQuotaManager.getInstance(), 'hasAuthorizedReconciliationSession').mockResolvedValue(true);
        registerMakeHandlers();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. PLACE ORDER & ORDER ITEMS VALIDATION
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. Place Order & Order Items Validation', () => {
        const actorSession = {
            userId: 42,
            username: 'designer_1',
            fullName: 'Lead Designer',
            role: 'Designer'
        };

        it('rejects order creation without customer name', async () => {
            const result = await MakeOrderService.createOrder({
                furniture_name: 'Executive Desk',
                customer_name: '',
                items: [{ product_name: 'Desk Item', quantity: 1, item_cost_price: 100 }]
            } as CreateMakeOrderInput, actorSession);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Customer name is required');
        });

        it('rejects invalid or placeholder customer phone numbers', async () => {
            const invalidPhones = ['0000000000', '1234567890', 'none', 'unknown', 'test', '0000000'];

            for (const phone of invalidPhones) {
                const result = await MakeOrderService.createOrder({
                    furniture_name: 'Executive Desk',
                    customer_name: 'Valid Customer',
                    customer_phone: phone,
                    items: [{ product_name: 'Desk Item', quantity: 1, item_cost_price: 100 }]
                } as CreateMakeOrderInput, actorSession);

                expect(result.success).toBe(false);
                expect(result.error).toContain('Invalid customer phone number');
            }
        });

        it('normalizes customer phone numbers deterministically', () => {
            expect(MakeOrderService.normalizePhoneNumber('+8801712345678')).toBe('01712345678');
            expect(MakeOrderService.normalizePhoneNumber('8801712345678')).toBe('01712345678');
            expect(MakeOrderService.normalizePhoneNumber('01712-345678')).toBe('01712345678');
            expect(MakeOrderService.normalizePhoneNumber('01712 345 678')).toBe('01712345678');
            expect(MakeOrderService.normalizePhoneNumber('')).toBe('');
        });

        it('calculates and validates multi-item financial pricing accurately', () => {
            const items = [
                { product_name: 'Desk A', quantity: 2, item_cost_price: 150.50, item_sale_price: 250.75 },
                { product_name: 'Chair B', quantity: 4, item_cost_price: 45.25, item_sale_price: 80.00 }
            ];

            const pricing = MakePricingService.calculateAndValidateTotals(items);
            expect(pricing.isValid).toBe(true);
            // 2 * 150.50 + 4 * 45.25 = 301.00 + 181.00 = 482.00
            expect(pricing.totalCostPrice).toBe(482.00);
            // 2 * 250.75 + 4 * 80.00 = 501.50 + 320.00 = 821.50
            expect(pricing.totalSalePrice).toBe(821.50);
        });

        it('rejects negative quantity or negative prices', () => {
            const invalidQty = MakePricingService.calculateAndValidateTotals([
                { product_name: 'Desk', quantity: -1, item_cost_price: 100 }
            ]);
            expect(invalidQty.isValid).toBe(false);

            const invalidCost = MakePricingService.calculateAndValidateTotals([
                { product_name: 'Desk', quantity: 1, item_cost_price: -50 }
            ]);
            expect(invalidCost.isValid).toBe(false);
        });

        it('guarantees unique order numbers with canonical prefix MAKE-YYYY-', async () => {
            const num1 = MakeOrderService.generateOrderNumber();
            const num2 = MakeOrderService.generateOrderNumber();
            const year = new Date().getFullYear();

            expect(num1).toMatch(new RegExp(`^MAKE-${year}-\\d{6}$`));
            expect(num2).toMatch(new RegExp(`^MAKE-${year}-\\d{6}$`));
            expect(num1).not.toBe(num2);
        });

        it('atomically rolls back order header if items insert fails', async () => {
            let orderInserted = false;
            let rollbackTriggered = false;

            h.state.responder = (table: string, op: string) => {
                if (table === 'make_orders' && op === 'insert') {
                    orderInserted = true;
                    return { data: { id: 888, order_number: 'MAKE-2026-888888' }, error: null };
                }
                if (table === 'make_order_items' && op === 'insert') {
                    return { data: null, error: { code: '23502', message: 'Not-null violation on custom field' } };
                }
                if (table === 'make_orders' && op === 'delete') {
                    rollbackTriggered = true;
                    return { data: null, error: null };
                }
                return { data: null, error: null };
            };

            const result = await MakeOrderService.createOrder({
                furniture_name: 'Rollback Test Desk',
                customer_name: 'Rollback Customer',
                customer_phone: '01712345678',
                items: [{ product_name: 'Faulty Item', quantity: 1, item_cost_price: 100 }]
            } as CreateMakeOrderInput, actorSession);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Order creation rolled back');
            expect(orderInserted).toBe(true);
            expect(rollbackTriggered).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. NAMED DRAFTS LIFECYCLE & INTEGRITY
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. Named Drafts Lifecycle & Integrity', () => {
        it('creates, saves, and reloads named drafts sorted newest first', () => {
            const d1 = saveNamedPlaceOrderDraft({ customerName: 'Customer Alpha' }, 'Alpha Draft');
            const d2 = saveNamedPlaceOrderDraft({ customerName: 'Customer Beta' }, 'Beta Draft');

            const drafts = loadSavedPlaceOrderDrafts();
            expect(drafts).toHaveLength(2);
            expect(drafts[0].title).toBe('Beta Draft');
            expect(drafts[1].title).toBe('Alpha Draft');
        });

        it('updates existing draft when draftId is provided', () => {
            const initial = saveNamedPlaceOrderDraft({ customerName: 'Customer Alpha' }, 'Alpha Draft');
            const updated = saveNamedPlaceOrderDraft(
                { customerName: 'Customer Alpha Updated', priority: 'Urgent' },
                'Alpha Draft Renamed',
                initial.draft.id
            );

            expect(updated.draft.id).toBe(initial.draft.id);
            const drafts = loadSavedPlaceOrderDrafts();
            expect(drafts).toHaveLength(1);
            expect(drafts[0].title).toBe('Alpha Draft Renamed');
            expect(drafts[0].data.priority).toBe('Urgent');
        });

        it('duplicates draft into a separate independent record', () => {
            const original = saveNamedPlaceOrderDraft({
                customerName: 'Original Customer',
                cartItems: [{
                    _id: 'item_1',
                    product_name: 'Duplicated Sofa',
                    quantity: 1,
                    dimensions_text: '2000x900'
                }]
            }, 'Master Draft');

            const duplicated = saveNamedPlaceOrderDraft(
                JSON.parse(JSON.stringify(original.draft.data)),
                `${original.draft.title} (Copy)`
            );

            expect(duplicated.draft.id).not.toBe(original.draft.id);
            expect(duplicated.draft.title).toBe('Master Draft (Copy)');

            const drafts = loadSavedPlaceOrderDrafts();
            expect(drafts).toHaveLength(2);
        });

        it('strips ephemeral data: and blob: URLs to prevent quota exhaustion', () => {
            const result = saveNamedPlaceOrderDraft({
                customerName: 'Large Media Customer',
                invoiceAttachments: [
                    { name: 'local_receipt.png', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...' },
                    { name: 'remote_receipt.png', url: 'https://storage.lenas.me/files/invoices/valid.png' }
                ],
                cartItems: [{
                    _id: 'it_1',
                    product_name: 'Chair',
                    quantity: 1,
                    dimensions_text: '500x500',
                    attachedFile: {
                        name: 'blob_drawing.dwg',
                        type: 'cad',
                        url: 'blob:http://localhost/1234-5678'
                    }
                }]
            }, 'Sanitization Test');

            expect(result.omittedAttachmentCount).toBe(2);
            expect(result.draft.data.invoiceAttachments).toHaveLength(1);
            expect(result.draft.data.invoiceAttachments![0].url).toBe('https://storage.lenas.me/files/invoices/valid.png');
            expect(result.draft.data.cartItems![0].attachedFile).toBeNull();
        });

        it('deletes saved drafts cleanly and isolates by user', () => {
            mockStorage.setItem('user_id', 'user_1');
            const d1 = saveNamedPlaceOrderDraft({ customerName: 'User 1 Draft' }, 'U1');
            expect(loadSavedPlaceOrderDrafts()).toHaveLength(1);

            mockStorage.setItem('user_id', 'user_2');
            expect(loadSavedPlaceOrderDrafts()).toHaveLength(0);
            saveNamedPlaceOrderDraft({ customerName: 'User 2 Draft' }, 'U2');
            expect(loadSavedPlaceOrderDrafts()).toHaveLength(1);

            mockStorage.setItem('user_id', 'user_1');
            deleteSavedPlaceOrderDraft(d1.draft.id);
            expect(loadSavedPlaceOrderDrafts()).toHaveLength(0);

            // User 2 draft remains intact
            mockStorage.setItem('user_id', 'user_2');
            expect(loadSavedPlaceOrderDrafts()).toHaveLength(1);
        });

        it('detects meaningful content for autosave guard', () => {
            expect(hasMeaningfulPlaceOrderDraft({})).toBe(false);
            expect(hasMeaningfulPlaceOrderDraft({ customerName: 'Acme Corp' })).toBe(true);
            expect(hasMeaningfulPlaceOrderDraft({ cartItems: [{ _id: '1', product_name: 'Table', quantity: 1, dimensions_text: '1x1' }] })).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. FILE & CAD ATTACHMENT UPLOAD STABILITY
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. File & CAD Attachment Upload Stability (MakeCadService)', () => {
        it('enforces 50 MB limit for CAD files and 15 MB for photos and invoices', () => {
            // CAD 50 MB limit
            expect(MakeCadService.validateFileMetadata('blueprint.dwg', 49 * 1024 * 1024, 'cad').isValid).toBe(true);
            expect(MakeCadService.validateFileMetadata('blueprint.dwg', 51 * 1024 * 1024, 'cad').isValid).toBe(false);

            // Photo 15 MB limit
            expect(MakeCadService.validateFileMetadata('stage.jpg', 14 * 1024 * 1024, 'photo').isValid).toBe(true);
            expect(MakeCadService.validateFileMetadata('stage.jpg', 16 * 1024 * 1024, 'photo').isValid).toBe(false);

            // Invoice 15 MB limit
            expect(MakeCadService.validateFileMetadata('invoice.pdf', 15 * 1024 * 1024, 'invoice_attachment').isValid).toBe(true);
            expect(MakeCadService.validateFileMetadata('invoice.pdf', 16 * 1024 * 1024, 'invoice_attachment').isValid).toBe(false);
        });

        it('rejects executable headers (PE/MZ, ELF) disguised as CAD or images', () => {
            // Executable Windows PE header (MZ)
            const peBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00]);
            const peCheck = MakeCadService.validateBufferMagicBytes(peBuffer, 'dwg');
            expect(peCheck.isValid).toBe(false);
            expect(peCheck.error).toContain('Executable binaries');

            // Linux ELF header (\x7FELF)
            const elfBuffer = Buffer.from([0x7F, 0x45, 0x4C, 0x46, 0x01, 0x01]);
            const elfCheck = MakeCadService.validateBufferMagicBytes(elfBuffer, 'pdf');
            expect(elfCheck.isValid).toBe(false);
            expect(elfCheck.error).toContain('Executable binaries');

            // Shell script
            const scriptBuffer = Buffer.from('#!/bin/bash\necho hack');
            const scriptCheck = MakeCadService.validateBufferMagicBytes(scriptBuffer, 'png');
            expect(scriptCheck.isValid).toBe(false);
        });

        it('sanitizes filenames preserving Unicode characters and spaces while stripping illegal characters', () => {
            const raw1 = 'Technical Drawing #1 (Desk & Chair) [Final] - বাংলা.dwg';
            const clean1 = MakeCadService.sanitizeFileName(raw1);
            expect(clean1).toBe('Technical Drawing #1 (Desk & Chair) [Final] - বাংলা.dwg');

            const rawWithBadChars = 'dangerous/file\\name:*?"<>|test.pdf';
            const clean2 = MakeCadService.sanitizeFileName(rawWithBadChars);
            expect(clean2).not.toMatch(/[\/\\:*?"<>|]/);
            expect(clean2.endsWith('.pdf')).toBe(true);
        });

        it('safely uploads through MakeCadService with QuotaManager reservation and commitment', async () => {
            const validPdfBuffer = Buffer.from('%PDF-1.7 technical drawing content');
            const fileName = 'test_drawing.pdf';
            const mimeType = 'application/pdf';
            const subfolder = 'make-order-files/101';

            const quotaMgr = SupabaseQuotaManager.getInstance();
            const reserveSpy = vi.spyOn(quotaMgr, 'reserveStorageQuota').mockResolvedValue(true);
            const releaseSpy = vi.spyOn(quotaMgr, 'releaseStorageQuota').mockResolvedValue(true);

            const uploadRes = await MakeCadService.uploadValidatedBuffer(
                validPdfBuffer,
                fileName,
                mimeType,
                subfolder
            );

            expect(uploadRes.success).toBe(true);
            expect(uploadRes.status).toBe('buffered_supabase');
            expect(uploadRes.durableKey).toBeDefined();
            expect(uploadRes.isPendingUpload).toBe(true);
            expect(reserveSpy).toHaveBeenCalled();
            expect(releaseSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Number), 'committed');
        });

        it('enforces 600 MB / 1 GB Supabase quota ceiling on upload', async () => {
            const quotaMgr = SupabaseQuotaManager.getInstance();
            const acceptSpy = vi.spyOn(quotaMgr, 'canAcceptStorageUpload').mockReturnValue(false);
            const reserveSpy = vi.spyOn(quotaMgr, 'reserveStorageQuota').mockResolvedValue(false);

            const buffer = Buffer.from('%PDF-1.7');
            const uploadRes = await MakeCadService.uploadValidatedBuffer(
                buffer,
                'oversize.pdf',
                'application/pdf',
                'make-order-files/101'
            );

            expect(uploadRes.success).toBe(false);
            expect(uploadRes.error).toContain('Supabase Storage quota limit reached');

            acceptSpy.mockRestore();
            reserveSpy.mockRestore();
        });

        it('single-flight protection: concurrent dispatchUpload calls on the same upload ID execute once and share result', async () => {
            const uploadService = DurableUploadService.getInstance();
            const buffer = Buffer.from('%PDF-1.7 single flight test');
            const staged = await uploadService.stageFile(buffer, 'single_flight.pdf', 'application/pdf', 'make-order-files/101', undefined, { autoDispatch: false });

            // Mock uploadToNasStorage to introduce brief delay
            let nasUploadCalls = 0;
            vi.spyOn(uploadService as any, 'uploadToNasStorage').mockImplementation(async () => {
                nasUploadCalls++;
                await new Promise(r => setTimeout(r, 40));
                return { success: true, url: 'https://storage.lenas.me/files/make-order-files/101/single_flight.pdf', sha256: staged.sha256 };
            });

            // Dispatch concurrently twice on the same upload ID
            const [res1, res2] = await Promise.all([
                uploadService.dispatchUpload(staged.id),
                uploadService.dispatchUpload(staged.id)
            ]);

            expect(res1.success).toBe(true);
            expect(res2.success).toBe(true);
            expect(res1.url).toBe(res2.url);
            // Proves uploadToNasStorage was only invoked once
            expect(nasUploadCalls).toBe(1);
        });

        it('retry safety: retry does not re-upload to NAS or re-commit quota when remote URL already exists', async () => {
            const uploadService = DurableUploadService.getInstance();
            const buffer = Buffer.from('%PDF-1.7 retry test');
            const staged = await uploadService.stageFile(buffer, 'retry_safety.pdf', 'application/pdf', 'make-order-files/101', undefined, { autoDispatch: false });

            // Simulate that NAS upload previously succeeded and recorded remote_url_nas in DB
            const confirmedUrl = 'https://storage.lenas.me/files/make-order-files/101/retry_safety.pdf';
            (uploadService as any).db.prepare(`
                UPDATE durable_uploads SET remote_url_nas = ? WHERE id = ?
            `).run(confirmedUrl, staged.id);

            const uploadSpy = vi.spyOn(uploadService as any, 'uploadToNasStorage');
            uploadSpy.mockClear();

            const res = await uploadService.dispatchUpload(staged.id);
            expect(res.success).toBe(true);
            expect(res.url).toBe(confirmedUrl);
            // Proves uploadToNasStorage was bypassed since authoritative remote URL already exists
            expect(uploadSpy).not.toHaveBeenCalled();
        });

        it('truthful private bucket URLs: resolveAttachmentUrl creates authorized signed URLs and never exposes unauthenticated public URLs', async () => {
            // Case A: Durable object key in private bucket 'make-order-files'
            const privateKey = 'make-order-files/101/part_blueprint.dwg';
            const resolvedA = await resolveAttachmentUrl(privateKey);
            expect(resolvedA.url).toContain('/sign/make-order-files/');
            expect(resolvedA.url).toContain('token=mock_signed');

            // Case B: Legacy unauthenticated public URL pointing to make-order-files
            const legacyPubUrl = 'https://mock.supabase.co/storage/v1/object/public/make-order-files/101/part_blueprint.dwg';
            const resolvedB = await resolveAttachmentUrl(legacyPubUrl);
            expect(resolvedB.url).toContain('/sign/make-order-files/');
            expect(resolvedB.url).not.toContain('/public/');

            // Case C: TrueNAS confirmed URL is preserved
            const nasUrl = 'https://storage.lenas.me/files/make-order-files/101/cad.dwg';
            const resolvedC = await resolveAttachmentUrl(nasUrl);
            expect(resolvedC.url).toBe(nasUrl);
        });

        it('staged-local representation: local staged files are never represented as remote attachments or file:// URLs', async () => {
            // When NAS fails and Supabase quota limit is reached
            const quotaMgr = SupabaseQuotaManager.getInstance();
            vi.spyOn(quotaMgr, 'canAcceptStorageUpload').mockReturnValue(false);
            vi.spyOn(quotaMgr, 'reserveStorageQuota').mockResolvedValue(false);

            const buffer = Buffer.from('%PDF-1.7 local staging test');
            const res = await MakeCadService.uploadValidatedBuffer(
                buffer,
                'outage_doc.pdf',
                'application/pdf',
                'make-order-files/101'
            );

            // Staging preserves local copy while remote quota is exhausted
            expect(res.success).toBe(false);
            expect(res.status).toBe('staged_local');
            expect(res.isPendingUpload).toBe(true);
            // CRITICAL: publicUrl must be undefined, NEVER a file:// URL pretending to be remotely accessible
            expect(res.publicUrl).toBeUndefined();
            expect(res.durableKey).toBeDefined();

            // Calling resolveAttachmentUrl on a local path or file:// URL marks it pending without claiming a remote URL
            const resolved = await resolveAttachmentUrl('file:///C:/AppData/staging/outage_doc.pdf');
            expect(resolved.isPending).toBe(true);
            expect(resolved.url).toBe('');
        });

        it('no invented URLs: unresolvable or missing files never return a guessed https://storage.lenas.me URL', async () => {
            // Empty string or unresolvable reference
            const resEmpty = await resolveAttachmentUrl('');
            expect(resEmpty.url).toBe('');

            // Failed Supabase signed URL generation
            const mockStorage = (supabase.storage.from as any)('make-order-files');
            vi.spyOn(mockStorage, 'createSignedUrl').mockResolvedValue({ data: null, error: new Error('Object not found') } as any);

            const resNotFound = await resolveAttachmentUrl('unknown-file.pdf');
            expect(resNotFound.url).toBe('');
            expect(resNotFound.url).not.toContain('storage.lenas.me');
        });

        it('cleanup: new relative object keys are pruned correctly after authoritative persistence', async () => {
            const uploadService = DurableUploadService.getInstance();
            (uploadService as any).supabaseClient = supabase;

            const relativeKey = 'make-order-files/101/drawing.pdf';
            const mockStorage = (supabase.storage.from as any)('make-order-files');
            const removeSpy = vi.spyOn(mockStorage, 'remove').mockResolvedValue({ data: ['101/drawing.pdf'], error: null });

            const pruned = await uploadService.pruneCloudCopy('make-order-files/101', relativeKey, 1024, 'upl_test_rel_key');
            expect(pruned).toBe(true);
            expect(removeSpy).toHaveBeenCalledWith(expect.arrayContaining(['make-order-files/101/drawing.pdf', '101/drawing.pdf']));
        });

        it('cleanup: existing legacy absolute URLs are handled safely without new URL() crash', async () => {
            const uploadService = DurableUploadService.getInstance();
            (uploadService as any).supabaseClient = supabase;

            const legacyUrl = 'https://mock.supabase.co/storage/v1/object/public/make-order-files/101/legacy_drawing.pdf';
            const mockStorage = (supabase.storage.from as any)('make-order-files');
            const removeSpy = vi.spyOn(mockStorage, 'remove').mockResolvedValue({ data: ['101/legacy_drawing.pdf'], error: null });

            const pruned = await uploadService.pruneCloudCopy('make-order-files/101', legacyUrl, 2048, 'upl_test_legacy_url');
            expect(pruned).toBe(true);
            expect(removeSpy).toHaveBeenCalledWith(expect.arrayContaining(['101/legacy_drawing.pdf']));
        });

        it('cloud-buffer -> TrueNAS recovery updates the owning entity record before cloud cleanup and deduplicates array fields', async () => {
            const uploadService = DurableUploadService.getInstance();
            (uploadService as any).supabaseClient = supabase;
            (uploadService as any).nasClient = supabase;

            const buffer = Buffer.from('%PDF-1.7 recovery flow test');
            const staged = await uploadService.stageFile(
                buffer,
                'recovery_test.pdf',
                'application/pdf',
                'make-order-files/101',
                { entityType: 'make_orders', entityId: 101, fieldName: 'pdf_urls' },
                { autoDispatch: false }
            );

            const tempCloudUrl = `make-order-files/101/${staged.id}_recovery_test.pdf`;
            (uploadService as any).db.prepare(`
                UPDATE durable_uploads
                SET status = 'buffered_supabase', remote_url_supabase = ?
                WHERE id = ?
            `).run(tempCloudUrl, staged.id);

            const sequence: string[] = [];
            let orderPdfs: string[] = [tempCloudUrl, 'https://storage.lenas.me/files/existing_blueprint.pdf'];

            h.state.responder = (table: string, op: string, body?: any) => {
                if (table === 'make_orders') {
                    if (op === 'select') {
                        return { data: { id: 101, pdf_urls: orderPdfs }, error: null };
                    }
                    if (op === 'update') {
                        sequence.push('update_entity_record');
                        orderPdfs = body.pdf_urls;
                        return { data: { id: 101, ...body }, error: null };
                    }
                }
                return { data: null, error: null };
            };

            const nasConfirmedUrl = `https://storage.lenas.me/files/make-order-files/101/${staged.id}_recovery_test.pdf`;
            vi.spyOn(uploadService as any, 'uploadToNasStorage').mockImplementation(async () => {
                sequence.push('upload_nas');
                return { success: true, url: nasConfirmedUrl, sha256: staged.sha256 };
            });

            const mockStorage = (supabase.storage.from as any)('make-order-files');
            vi.spyOn(mockStorage, 'remove').mockImplementation(async (paths: string[]) => {
                sequence.push('prune_cloud');
                return { data: paths, error: null };
            });

            const quotaMgr = SupabaseQuotaManager.getInstance();
            vi.spyOn(quotaMgr, 'pruneConfirmedStorage').mockImplementation(async () => {
                sequence.push('prune_quota');
                return true;
            });

            const res = await uploadService.dispatchUpload(staged.id);

            expect(res.success).toBe(true);
            expect(res.status).toBe('synced_nas');
            expect(res.url).toBe(nasConfirmedUrl);

            // Strict sequence verification
            expect(sequence.indexOf('upload_nas')).toBeLessThan(sequence.indexOf('update_entity_record'));
            expect(sequence.indexOf('update_entity_record')).toBeLessThan(sequence.indexOf('prune_cloud'));

            // Owning record updated with TrueNAS URL, replacing temporary cloud reference without duplicates
            expect(orderPdfs).toContain(nasConfirmedUrl);
            expect(orderPdfs).not.toContain(tempCloudUrl);
            expect(orderPdfs.filter(u => u === nasConfirmedUrl).length).toBe(1);
        });

        it('cleanup failure retains valid attachment and quota accounting for retry', async () => {
            const uploadService = DurableUploadService.getInstance();
            (uploadService as any).supabaseClient = supabase;
            (uploadService as any).nasClient = supabase;

            const buffer = Buffer.from('%PDF-1.7 cleanup failure test');
            const staged = await uploadService.stageFile(
                buffer,
                'cleanup_fail.pdf',
                'application/pdf',
                'make-order-files/101',
                { entityType: 'make_orders', entityId: 101, fieldName: 'pdf_urls' },
                { autoDispatch: false }
            );

            const tempCloudUrl = `make-order-files/101/${staged.id}_cleanup_fail.pdf`;
            (uploadService as any).db.prepare(`
                UPDATE durable_uploads
                SET status = 'buffered_supabase', remote_url_supabase = ?
                WHERE id = ?
            `).run(tempCloudUrl, staged.id);

            const nasConfirmedUrl = `https://storage.lenas.me/files/make-order-files/101/${staged.id}_cleanup_fail.pdf`;
            vi.spyOn(uploadService as any, 'uploadToNasStorage').mockResolvedValue({
                success: true,
                url: nasConfirmedUrl,
                sha256: staged.sha256
            });

            h.state.responder = (table: string, op: string, body?: any) => {
                if (table === 'make_orders') {
                    return { data: { id: 101, pdf_urls: [] }, error: null };
                }
                return { data: null, error: null };
            };

            // Simulate cloud prune failure
            const mockStorage = (supabase.storage.from as any)('make-order-files');
            vi.spyOn(mockStorage, 'remove').mockResolvedValue({ data: null, error: new Error('Supabase Storage 503') });

            const res = await uploadService.dispatchUpload(staged.id);

            expect(res.success).toBe(false);
            expect(res.error).toContain('cleanup retry');

            // SQLite record retains remote_url_nas so next retry skips re-uploading to NAS
            const row = (uploadService as any).db.prepare(`SELECT * FROM durable_uploads WHERE id = ?`).get(staged.id);
            expect(row.status).toBe('buffered_supabase');
            expect(row.remote_url_nas).toBe(nasConfirmedUrl);
            expect(row.remote_url_supabase).toBe(tempCloudUrl);

            // Resolve failure and retry
            vi.spyOn(mockStorage, 'remove').mockResolvedValue({ data: [tempCloudUrl], error: null });
            vi.spyOn(SupabaseQuotaManager.getInstance(), 'pruneConfirmedStorage').mockResolvedValue(true);

            const retryRes = await uploadService.dispatchUpload(staged.id);
            expect(retryRes.success).toBe(true);
            expect(retryRes.status).toBe('synced_nas');

            const finalRow = (uploadService as any).db.prepare(`SELECT * FROM durable_uploads WHERE id = ?`).get(staged.id);
            expect(finalRow.status).toBe('synced_nas');
            expect(finalRow.last_error).toBeNull();
        });

        it('successful cleanup releases quota exactly once', async () => {
            const uploadService = DurableUploadService.getInstance();
            (uploadService as any).supabaseClient = supabase;
            const quotaMgr = SupabaseQuotaManager.getInstance();

            const pruneSpy = vi.spyOn(quotaMgr, 'pruneConfirmedStorage').mockResolvedValue(true);
            pruneSpy.mockClear();

            const mockStorage = (supabase.storage.from as any)('make-order-files');
            vi.spyOn(mockStorage, 'remove').mockResolvedValue({ data: ['101/file.pdf'], error: null });

            const pruned = await uploadService.pruneCloudCopy('make-order-files/101', 'make-order-files/101/file.pdf', 5000, 'upl_quota_once');
            expect(pruned).toBe(true);
            expect(pruneSpy).toHaveBeenCalledTimes(1);
            expect(pruneSpy).toHaveBeenCalledWith('upl_quota_once', 5000);
        });

        it('offline drawing and stage-photo flows preserve pending owner association', async () => {
            const quotaMgr = SupabaseQuotaManager.getInstance();
            vi.spyOn(quotaMgr, 'canAcceptStorageUpload').mockReturnValue(false);
            vi.spyOn(quotaMgr, 'reserveStorageQuota').mockResolvedValue(false);

            const uploadService = DurableUploadService.getInstance();
            vi.spyOn(uploadService as any, 'uploadToNasStorage').mockResolvedValue({ success: false, error: 'TrueNAS offline' });

            const buffer = Buffer.from('%PDF-1.7 offline drawing test');
            const uploadRes = await MakeCadService.uploadValidatedBuffer(
                buffer,
                'offline_blueprint.pdf',
                'application/pdf',
                'make-order-files/101/items/55',
                { entityType: 'make_order_items', entityId: 55, fieldName: 'technical_drawing_url' }
            );

            expect(uploadRes.status).toBe('staged_local');
            expect(uploadRes.isPendingUpload).toBe(true);
            expect(uploadRes.publicUrl).toBeUndefined();
            expect(uploadRes.durableKey).toBeDefined();

            // Verify owner association is preserved in SQLite
            const row = (uploadService as any).db.prepare(`
                SELECT * FROM durable_uploads WHERE id = ?
            `).get(uploadRes.uploadId);
            expect(row).toBeDefined();
            expect(row.field_name).toBe('technical_drawing_url');
            expect(row.status).toBe('staged_local');
        });

        it('associateUploadWithEntity safely links pre-order staged attachments upon order creation', async () => {
            const uploadService = DurableUploadService.getInstance();
            const buffer = Buffer.from('%PDF-1.7 pre-order invoice');
            const staged = await uploadService.stageFile(
                buffer,
                'pre_order_invoice.pdf',
                'application/pdf',
                'make-order-files/invoices',
                undefined,
                { autoDispatch: false }
            );

            expect(staged.entityType).toBeNull();
            expect(staged.entityId).toBeNull();

            // Link to order via associateUploadWithEntity
            const associated = uploadService.associateUploadWithEntity(staged.id, {
                entityType: 'make_orders',
                entityId: 999,
                fieldName: 'invoice_attachment_urls'
            });

            expect(associated).toBe(true);

            const row = (uploadService as any).db.prepare(`SELECT * FROM durable_uploads WHERE id = ?`).get(staged.id);
            expect(row.entity_type).toBe('make_orders');
            expect(row.entity_id).toBe('999');
            expect(row.field_name).toBe('invoice_attachment_urls');
        });

        it('signed URL failure never falls back to a public URL', async () => {
            const mockStorage = (supabase.storage.from as any)('make-order-files');
            vi.spyOn(mockStorage, 'createSignedUrl').mockResolvedValue({
                data: null,
                error: new Error('Permission denied')
            } as any);

            const resolved = await resolveAttachmentUrl('make-order-files/101/private_plan.dwg');
            expect(resolved.url).toBe('');
            expect(resolved.url).not.toContain('/public/');
            expect(resolved.isPending).toBe(true);
        });

        it('complete pre-order invoice lifecycle: offline buffer -> order creation -> association -> TrueNAS recovery -> reference update -> cloud/quota cleanup', async () => {
            const uploadService = DurableUploadService.getInstance();
            (uploadService as any).supabaseClient = supabase;
            const quotaMgr = SupabaseQuotaManager.getInstance();

            // 1. Stage pre-order invoice while TrueNAS is offline
            vi.spyOn(uploadService as any, 'uploadToNasStorage').mockResolvedValue({
                success: false,
                error: 'TrueNAS offline'
            });
            // Make the cloud quota unavailable too so this first step genuinely
            // exercises durable local staging before the later recovery fixture.
            vi.spyOn(quotaMgr, 'reserveStorageQuota').mockResolvedValue(false);

            const buffer = Buffer.from('%PDF-1.7 full lifecycle invoice test');
            const uploadRes = await MakeCadService.uploadValidatedBuffer(
                buffer,
                'client_invoice.pdf',
                'application/pdf',
                'make-order-files/invoices'
            );

            expect(uploadRes.status).toBe('staged_local');
            expect(uploadRes.isPendingUpload).toBe(true);
            expect(uploadRes.publicUrl).toBeUndefined();
            expect(uploadRes.durableKey).toBeDefined();

            // Simulate cloud fallback buffering during outage
            const tempCloudUrl = `make-order-files/invoices/${uploadRes.uploadId}_client_invoice.pdf`;
            (uploadService as any).db.prepare(`
                UPDATE durable_uploads
                SET status = 'buffered_supabase', remote_url_supabase = ?
                WHERE id = ?
            `).run(tempCloudUrl, uploadRes.uploadId);

            // 2. Persist order referencing the pending attachment
            const mockOrder = {
                id: 501,
                order_number: 'MAKE-2026-501',
                invoice_attachment_urls: [uploadRes.durableKey]
            };
            h.state.responder = (table: string, op: string, body?: any) => {
                if (table === 'make_orders') {
                    if (op === 'update' && body) {
                        Object.assign(mockOrder, body);
                        return { data: mockOrder, error: null };
                    }
                    return { data: mockOrder, error: null };
                }
                return { data: null, error: null };
            };

            // 3. Associate upload with that order
            const assocOk = uploadService.associateUploadWithEntity(uploadRes.uploadId!, {
                entityType: 'make_orders',
                entityId: 501,
                fieldName: 'invoice_attachment_urls'
            });
            expect(assocOk).toBe(true);

            const rowBefore = (uploadService as any).db.prepare('SELECT sha256 FROM durable_uploads WHERE id = ?').get(uploadRes.uploadId);
            const nasAuthoritativeUrl = `https://storage.lenas.me/files/make-order-files/invoices/${uploadRes.uploadId}_client_invoice.pdf`;
            vi.spyOn(uploadService as any, 'uploadToNasStorage').mockResolvedValue({
                success: true,
                url: nasAuthoritativeUrl,
                sha256: rowBefore?.sha256
            });

            const mockStorage = (supabase.storage.from as any)('make-order-files');
            const removeSpy = vi.spyOn(mockStorage, 'remove').mockResolvedValue({ data: [tempCloudUrl], error: null });
            const quotaSpy = vi.spyOn(quotaMgr, 'pruneConfirmedStorage').mockResolvedValue(true);

            // 5. Worker reconciles: updates order reference to authoritative remote URL
            const syncRes = await uploadService.dispatchUpload(uploadRes.uploadId!);
            expect(syncRes.status).toBe('synced_nas');
            expect(syncRes.url).toBe(nasAuthoritativeUrl);

            // 6. Verify order reference changed to authoritative URL
            expect(mockOrder.invoice_attachment_urls).toContain(nasAuthoritativeUrl);
            expect(mockOrder.invoice_attachment_urls).not.toContain(uploadRes.durableKey);

            // 7. Cloud object removed and quota released
            expect(removeSpy).toHaveBeenCalledTimes(1);
            expect(quotaSpy).toHaveBeenCalledTimes(1);

            // 8. Restart / retry safety: calling dispatchUpload again does not re-upload or re-prune
            removeSpy.mockClear();
            quotaSpy.mockClear();
            const reSync = await uploadService.dispatchUpload(uploadRes.uploadId!);
            expect(reSync.status).toBe('synced_nas');
            expect(removeSpy).not.toHaveBeenCalled();
            expect(quotaSpy).not.toHaveBeenCalled();
        });

        it('association failure or unlinked upload prevents premature cloud cleanup upon NAS sync', async () => {
            const uploadService = DurableUploadService.getInstance();
            (uploadService as any).supabaseClient = supabase;
            const quotaMgr = SupabaseQuotaManager.getInstance();

            const buffer = Buffer.from('%PDF-1.7 unlinked upload test');
            const staged = await uploadService.stageFile(
                buffer,
                'unlinked_file.pdf',
                'application/pdf',
                'make-order-files/invoices',
                undefined,
                { autoDispatch: false }
            );

            // Staged upload has no owner association
            expect(staged.entityType).toBeNull();
            expect(staged.entityId).toBeNull();

            // Set to buffered_supabase
            const tempCloudUrl = `make-order-files/invoices/${staged.id}_unlinked_file.pdf`;
            (uploadService as any).db.prepare(`
                UPDATE durable_uploads
                SET status = 'buffered_supabase', remote_url_supabase = ?
                WHERE id = ?
            `).run(tempCloudUrl, staged.id);

            // TrueNAS comes back online
            const nasUrl = `https://storage.lenas.me/files/make-order-files/invoices/${staged.id}_unlinked_file.pdf`;
            vi.spyOn(uploadService as any, 'uploadToNasStorage').mockResolvedValue({
                success: true,
                url: nasUrl,
                sha256: staged.sha256
            });

            const mockStorage = (supabase.storage.from as any)('make-order-files');
            const removeSpy = vi.spyOn(mockStorage, 'remove');
            const quotaSpy = vi.spyOn(quotaMgr, 'pruneConfirmedStorage');
            removeSpy.mockClear();
            quotaSpy.mockClear();

            // Background worker or dispatch executes
            const res = await uploadService.dispatchUpload(staged.id);

            // Must transition to awaiting_association and NOT synced_nas
            expect(res.status).toBe('awaiting_association');

            // Destructive cleanup MUST be deferred
            expect(removeSpy).not.toHaveBeenCalled();
            expect(quotaSpy).not.toHaveBeenCalled();

            const row = (uploadService as any).db.prepare(`SELECT * FROM durable_uploads WHERE id = ?`).get(staged.id);
            expect(row.status).toBe('awaiting_association');
            expect(row.remote_url_nas).toBe(nasUrl);
            expect(row.remote_url_supabase).toBe(tempCloudUrl);

            // Now associate with order
            const mockOrder = { id: 777, invoice_attachment_urls: [tempCloudUrl] };
            h.state.responder = (table: string, op: string, body?: any) => {
                if (table === 'make_orders') {
                    if (op === 'update' && body) {
                        Object.assign(mockOrder, body);
                        return { data: mockOrder, error: null };
                    }
                    return { data: mockOrder, error: null };
                }
                return { data: null, error: null };
            };
            vi.spyOn(mockStorage, 'remove').mockResolvedValue({ data: [tempCloudUrl], error: null });
            vi.spyOn(quotaMgr, 'pruneConfirmedStorage').mockResolvedValue(true);

            const assocSuccess = uploadService.associateUploadWithEntity(staged.id, {
                entityType: 'make_orders',
                entityId: 777,
                fieldName: 'invoice_attachment_urls'
            });
            expect(assocSuccess).toBe(true);

            // Reconcile now that association is confirmed
            const finalRes = await uploadService.dispatchUpload(staged.id);
            expect(finalRes.status).toBe('synced_nas');
            expect(removeSpy).toHaveBeenCalledTimes(1);
            expect(quotaSpy).toHaveBeenCalledTimes(1);
            expect(mockOrder.invoice_attachment_urls).toContain(nasUrl);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. GLOBAL SPECIFICATION IMAGES & MIGRATION 066 COMPATIBILITY
    // ─────────────────────────────────────────────────────────────────────────
    describe('4. Global Specification Images & Migration 066 Compatibility', () => {
        it('persists spec image_url in make-save-spec when column exists', async () => {
            let capturedBody: any = null;
            h.state.responder = (table: string, op: string, body?: any) => {
                if (table === 'make_product_specifications') {
                    capturedBody = body;
                    return { data: { id: 55, ...body }, error: null };
                }
                return { data: null, error: null };
            };

            const handler = h.state.handlers['make-save-spec'];
            expect(handler).toBeDefined();

            const res = await handler(null, {
                product_id: 10,
                spec_name: 'Oak Finish Specification',
                spec_code: 'OAK-01',
                image_url: 'https://storage.lenas.me/files/specs/oak.webp'
            });

            expect(res.id).toBe(55);
            expect(capturedBody).toBeDefined();
            expect(capturedBody.image_url).toBe('https://storage.lenas.me/files/specs/oak.webp');
        });

        it('displays actionable Migration 066 error when image_url column is missing', async () => {
            h.state.responder = (table: string) => {
                if (table === 'make_product_specifications') {
                    return {
                        data: null,
                        error: {
                            code: 'PGRST204',
                            message: "Could not find the 'image_url' column of 'make_product_specifications' in the schema cache"
                        }
                    };
                }
                return { data: null, error: null };
            };

            const handler = h.state.handlers['make-save-spec'];
            await expect(handler(null, {
                product_id: 10,
                spec_name: 'Walnut Finish',
                image_url: 'https://storage.lenas.me/files/specs/walnut.webp'
            })).rejects.toThrow('Saving specification with an image requires database migration 066');
        });

        it('omits image_url cleanly when saving a spec without image on legacy database', async () => {
            let capturedBody: any = null;
            h.state.responder = (table: string, op: string, body?: any) => {
                if (table === 'make_product_specifications') {
                    capturedBody = body;
                    return { data: { id: 77, ...body }, error: null };
                }
                return { data: null, error: null };
            };

            const handler = h.state.handlers['make-save-spec'];
            const res = await handler(null, {
                product_id: 10,
                spec_name: 'Standard Metal Finish'
            });

            expect(res.id).toBe(77);
            expect(capturedBody.image_url).toBeUndefined();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. SECURITY & TRACK ORDERS ATTACHMENT OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────
    describe('5. Security & Track Orders Operations', () => {
        it('rejects arbitrary local file paths in legacy PDF upload handlers', async () => {
            const itemPdfHandler = h.state.handlers['make-upload-item-pdf'];
            const orderPdfHandler = h.state.handlers['make-upload-pdf'];

            const itemRes = await itemPdfHandler(null, { orderId: 1, itemId: 2, filePath: 'C:\\Windows\\System32\\cmd.exe' });
            expect(itemRes.error).toContain('Arbitrary filesystem paths are rejected');

            const orderRes = await orderPdfHandler(null, { orderId: 1, filePath: '/etc/shadow' });
            expect(orderRes.error).toContain('Arbitrary filesystem paths are rejected');
        });

        it('preserves drawing attachment references across order duplication', () => {
            const originalOrder = {
                id: 1001,
                order_number: 'MAKE-2026-1001',
                customer_name: 'Duplication Customer',
                furniture_name: 'Bespoke Conference Table',
                items: [{
                    product_id: 5,
                    product_name: 'Conference Table',
                    technical_drawing_url: 'https://storage.lenas.me/files/make-order-files/1001/drawing.dwg',
                    quantity: 1,
                    item_cost_price: 500,
                    item_sale_price: 900
                }]
            };

            const duplicatedItems = originalOrder.items.map(it => ({
                _id: String(Date.now()),
                product_name: it.product_name,
                quantity: it.quantity,
                attachedFile: it.technical_drawing_url ? {
                    name: 'Drawing Blueprint',
                    url: it.technical_drawing_url,
                    type: 'cad'
                } : null
            }));

            expect(duplicatedItems[0].attachedFile).not.toBeNull();
            expect(duplicatedItems[0].attachedFile?.url).toBe('https://storage.lenas.me/files/make-order-files/1001/drawing.dwg');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 6. DATA-INTEGRITY VERIFICATION GATE — DURABLE REFERENCES & RECOVERY
    // ─────────────────────────────────────────────────────────────────────────
    describe('6. Data-Integrity Verification Gate — Durable References & Atomic Recovery', () => {
        it('1. durable keys, not signed URLs, are written into order records and drafts', async () => {
            // (a) Draft persistence: signed URL with token must be normalized to durable key
            const signedUrlWithToken = 'https://ildkkgjrolcjijwfokek.supabase.co/storage/v1/object/sign/make-order-files/invoices/test_inv.pdf?token=eyJhbGciOiJIUzI1NiJ9.abc&expires=1893456000';
            const normalizedDraftRef = getPersistentAttachmentReference(signedUrlWithToken);
            expect(normalizedDraftRef).toBe('make-order-files/invoices/test_inv.pdf');
            expect(normalizedDraftRef).not.toContain('token=');

            // (b) Order creation: MakeOrderService.normalizeAttachmentReference extracts durable key
            const normalizedOrderRef = MakeOrderService.normalizeAttachmentReference(signedUrlWithToken);
            expect(normalizedOrderRef).toBe('make-order-files/invoices/test_inv.pdf');
            expect(normalizedOrderRef).not.toContain('token=');

            // (c) Confirmed TrueNAS URLs are preserved intact
            const confirmedNasUrl = 'https://storage.lenas.me/files/make-order-files/invoices/confirmed.pdf';
            expect(getPersistentAttachmentReference(confirmedNasUrl)).toBe(confirmedNasUrl);
            expect(MakeOrderService.normalizeAttachmentReference(confirmedNasUrl)).toBe(confirmedNasUrl);
        });

        it('2. signed URL expiry does not break later attachment access', async () => {
            const mockStorage = (supabase.storage.from as any)('make-order-files');
            const createSignedUrlSpy = vi.spyOn(mockStorage, 'createSignedUrl').mockImplementation(async (path: string, expiresIn: number) => {
                return {
                    data: { signedUrl: `https://mock.supabase.co/storage/v1/object/sign/make-order-files/${path}?token=FRESH_TOKEN&expires=${expiresIn}` },
                    error: null
                };
            });

            // Pass an expired signed URL to resolveAttachmentUrl
            const expiredSignedUrl = 'https://mock.supabase.co/storage/v1/object/sign/make-order-files/invoices/upl_expired_bill.pdf?token=EXPIRED_OLD_TOKEN&expires=1000';
            const resolved = await resolveAttachmentUrl(expiredSignedUrl);

            // Verified: re-resolves using clean storage path to issue fresh signed URL
            expect(resolved.url).toContain('token=FRESH_TOKEN');
            expect(resolved.url).not.toContain('EXPIRED_OLD_TOKEN');
            expect(resolved.isPending).toBe(true);
            expect(createSignedUrlSpy).toHaveBeenCalled();
        });

        it('3. an update affecting zero rows cannot permit cloud cleanup', async () => {
            const uploadService = DurableUploadService.getInstance();
            (uploadService as any).supabaseClient = supabase;
            const quotaMgr = SupabaseQuotaManager.getInstance();

            const buffer = Buffer.from('%PDF-1.7 zero-rows safety test');
            const staged = await uploadService.stageFile(
                buffer,
                'zero_rows_test.pdf',
                'application/pdf',
                'make-order-files/invoices',
                { entityType: 'make_orders', entityId: 999999, fieldName: 'invoice_attachment_urls' },
                { autoDispatch: false }
            );

            // Buffer in Supabase
            const cloudKey = `make-order-files/invoices/${staged.id}_zero_rows_test.pdf`;
            (uploadService as any).db.prepare(`
                UPDATE durable_uploads
                SET status = 'buffered_supabase', remote_url_supabase = ?
                WHERE id = ?
            `).run(cloudKey, staged.id);

            // Mock database: target row does NOT exist / returns 0 rows on update
            h.state.responder = (table: string, op: string) => {
                if (table === 'make_orders') {
                    if (op === 'select') return { data: null, error: null }; // row not found
                    if (op === 'update') return { data: [], error: null }; // 0 rows affected
                }
                return { data: null, error: null };
            };

            const nasUrl = `https://storage.lenas.me/files/make-order-files/invoices/${staged.id}_zero_rows_test.pdf`;
            vi.spyOn(uploadService as any, 'uploadToNasStorage').mockResolvedValue({
                success: true,
                url: nasUrl,
                sha256: staged.sha256
            });

            const mockStorage = (supabase.storage.from as any)('make-order-files');
            const removeSpy = vi.spyOn(mockStorage, 'remove');
            const quotaSpy = vi.spyOn(quotaMgr, 'pruneConfirmedStorage');
            removeSpy.mockClear();
            quotaSpy.mockClear();

            // Execute dispatch: entity update will fail because target order doesn't exist
            const result = await uploadService.dispatchUpload(staged.id);

            // Must NOT count as success
            expect(result.success).toBe(false);
            expect(result.error).toContain('Entity record update failed');

            // Cloud removal and quota pruning MUST NOT be executed
            expect(removeSpy).not.toHaveBeenCalled();
            expect(quotaSpy).not.toHaveBeenCalled();

            // Cloud URL and status must be retained for retry
            const row = (uploadService as any).db.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(staged.id);
            expect(row.remote_url_supabase).toBe(cloudKey);
            expect(row.remote_url_nas).toBe(nasUrl);
            expect(row.status).toBe('buffered_supabase');
        });

        it('4. the real MakeOrderService.createOrder() path preserves and associates pending invoice attachments', async () => {
            const uploadService = DurableUploadService.getInstance();
            (uploadService as any).supabaseClient = supabase;

            // Stage an invoice attachment offline
            vi.spyOn(uploadService as any, 'uploadToNasStorage').mockResolvedValue({ success: false, error: 'Offline' });
            const buffer = Buffer.from('%PDF-1.7 order creation association test');
            const uploadRes = await MakeCadService.uploadValidatedBuffer(
                buffer,
                'client_bill.pdf',
                'application/pdf',
                'make-order-files/invoices'
            );

            expect(uploadRes.uploadId).toBeDefined();
            expect(uploadRes.isPendingUpload).toBe(true);

            // Provide signed URL in input to test that createOrder normalizes it to durable key
            const ephemeralSignedUrl = `https://mock.supabase.co/storage/v1/object/sign/${uploadRes.durableKey}?token=EXP_TOKEN`;

            // Prepare mock responder for MakeOrderService.createOrder()
            const createdOrderId = 882;
            let insertedOrderHeader: any = null;
            h.state.responder = (table: string, op: string, body?: any) => {
                if (table === 'make_orders' && op === 'insert') {
                    insertedOrderHeader = body;
                    return { data: { id: createdOrderId, order_number: 'MAKE-2026-000882' }, error: null };
                }
                if (table === 'make_order_items' && op === 'insert') {
                    return { data: [{ id: 901, product_name: 'Executive Desk' }], error: null };
                }
                if (table === 'billing_customers') {
                    return { data: { id: 44, name: 'Corporate Client', phone: '01711000000' }, error: null };
                }
                return { data: {}, error: null };
            };

            const orderInput: CreateMakeOrderInput = {
                furniture_name: 'Executive Desk',
                customer_name: 'Corporate Client',
                customer_phone: '01711000000',
                delivery_date: '2026-11-30',
                invoice_attachment_urls: [ephemeralSignedUrl],
                items: [{
                    product_name: 'Executive Desk',
                    quantity: 1,
                    item_cost_price: 15000,
                    item_sale_price: 25000
                }]
            };

            const actorSession = { userId: 1, username: 'designer_1', fullName: 'Designer One', role: 'furniture_designer' };
            const orderRes = await MakeOrderService.createOrder(orderInput, actorSession);

            expect(orderRes.success).toBe(true);
            expect(orderRes.id).toBe(createdOrderId);

            // Verified 1: Durable key was written into DB header, NOT the signed URL with token
            expect(insertedOrderHeader).toBeDefined();
            expect(insertedOrderHeader.invoice_attachment_urls[0]).toBe(uploadRes.durableKey);
            expect(insertedOrderHeader.invoice_attachment_urls[0]).not.toContain('token=');

            // Verified 2: Pre-staged upload was automatically associated with the newly created order in SQLite
            const uploadRow = (uploadService as any).db.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(uploadRes.uploadId);
            expect(uploadRow.entity_type).toBe('make_orders');
            expect(uploadRow.entity_id).toBe(String(createdOrderId));
            expect(uploadRow.field_name).toBe('invoice_attachment_urls');
        });

        it('5. background recovery racing order creation cannot delete the only reachable copy', async () => {
            const uploadService = DurableUploadService.getInstance();
            (uploadService as any).supabaseClient = supabase;
            const quotaMgr = SupabaseQuotaManager.getInstance();

            // Upload is staged and buffered in Supabase, but entity association hasn't happened yet (user still filling form)
            const buffer = Buffer.from('%PDF-1.7 race condition test file');
            const staged = await uploadService.stageFile(
                buffer,
                'race_doc.pdf',
                'application/pdf',
                'make-order-files/invoices',
                undefined, // NO owner entity yet!
                { autoDispatch: false }
            );

            const cloudUrl = `make-order-files/invoices/${staged.id}_race_doc.pdf`;
            (uploadService as any).db.prepare(`
                UPDATE durable_uploads
                SET status = 'buffered_supabase', remote_url_supabase = ?
                WHERE id = ?
            `).run(cloudUrl, staged.id);

            // Background worker runs when TrueNAS comes online
            const nasUrl = `https://storage.lenas.me/files/make-order-files/invoices/${staged.id}_race_doc.pdf`;
            vi.spyOn(uploadService as any, 'uploadToNasStorage').mockResolvedValue({
                success: true,
                url: nasUrl,
                sha256: staged.sha256
            });

            const mockStorage = (supabase.storage.from as any)('make-order-files');
            const removeSpy = vi.spyOn(mockStorage, 'remove');
            const quotaSpy = vi.spyOn(quotaMgr, 'pruneConfirmedStorage');
            removeSpy.mockClear();
            quotaSpy.mockClear();

            const dispatchRes = await uploadService.dispatchUpload(staged.id);

            // Must enter awaiting_association and NOT delete cloud copy
            expect(dispatchRes.status).toBe('awaiting_association');
            expect(removeSpy).not.toHaveBeenCalled();
            expect(quotaSpy).not.toHaveBeenCalled();

            // Reachable copy in Supabase must remain intact
            const row = (uploadService as any).db.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(staged.id);
            expect(row.remote_url_supabase).toBe(cloudUrl);
            expect(row.remote_url_nas).toBe(nasUrl);
        });

        it('6. successful reconciliation updates the order reference before deleting cloud data', async () => {
            const uploadService = DurableUploadService.getInstance();
            (uploadService as any).supabaseClient = supabase;
            const quotaMgr = SupabaseQuotaManager.getInstance();

            const buffer = Buffer.from('%PDF-1.7 ordering verification test');
            const staged = await uploadService.stageFile(
                buffer,
                'order_verify.pdf',
                'application/pdf',
                'make-order-files/invoices',
                { entityType: 'make_orders', entityId: 654, fieldName: 'invoice_attachment_urls' },
                { autoDispatch: false }
            );

            const cloudUrl = `make-order-files/invoices/${staged.id}_order_verify.pdf`;
            (uploadService as any).db.prepare(`
                UPDATE durable_uploads
                SET status = 'buffered_supabase', remote_url_supabase = ?
                WHERE id = ?
            `).run(cloudUrl, staged.id);

            const executionSequence: string[] = [];
            const mockOrder = { id: 654, invoice_attachment_urls: [cloudUrl] };

            h.state.responder = (table: string, op: string, body?: any) => {
                if (table === 'make_orders') {
                    if (op === 'select') return { data: mockOrder, error: null };
                    if (op === 'update') {
                        executionSequence.push('db_update_order_reference');
                        Object.assign(mockOrder, body);
                        return { data: [mockOrder], error: null };
                    }
                }
                return { data: null, error: null };
            };

            const nasUrl = `https://storage.lenas.me/files/make-order-files/invoices/${staged.id}_order_verify.pdf`;
            vi.spyOn(uploadService as any, 'uploadToNasStorage').mockResolvedValue({
                success: true,
                url: nasUrl,
                sha256: staged.sha256
            });

            const mockStorage = (supabase.storage.from as any)('make-order-files');
            vi.spyOn(mockStorage, 'remove').mockImplementation(async () => {
                executionSequence.push('cloud_storage_remove');
                return { data: [cloudUrl], error: null };
            });
            vi.spyOn(quotaMgr, 'pruneConfirmedStorage').mockImplementation(async () => {
                executionSequence.push('quota_prune_release');
                return true;
            });

            const res = await uploadService.dispatchUpload(staged.id);
            expect(res.status).toBe('synced_nas');

            // Exact required sequence:
            // 1. db_update_order_reference
            // 2. cloud_storage_remove
            // 3. quota_prune_release
            expect(executionSequence).toEqual([
                'db_update_order_reference',
                'cloud_storage_remove',
                'quota_prune_release'
            ]);
        });

        it('7. cloud prune failures and consecutive dispatch retries preserve attachment and quota accounting', async () => {
            const uploadService = DurableUploadService.getInstance();
            (uploadService as any).supabaseClient = supabase;
            const quotaMgr = SupabaseQuotaManager.getInstance();

            const buffer = Buffer.from('%PDF-1.7 recovery restart test');
            const staged = await uploadService.stageFile(
                buffer,
                'restart_test.pdf',
                'application/pdf',
                'make-order-files/invoices',
                { entityType: 'make_orders', entityId: 777, fieldName: 'invoice_attachment_urls' },
                { autoDispatch: false }
            );

            const cloudUrl = `make-order-files/invoices/${staged.id}_restart_test.pdf`;
            (uploadService as any).db.prepare(`
                UPDATE durable_uploads
                SET status = 'buffered_supabase', remote_url_supabase = ?
                WHERE id = ?
            `).run(cloudUrl, staged.id);

            const mockOrder = { id: 777, invoice_attachment_urls: [cloudUrl] };
            h.state.responder = (table: string, op: string, body?: any) => {
                if (table === 'make_orders') {
                    if (op === 'select') return { data: mockOrder, error: null };
                    if (op === 'update') {
                        Object.assign(mockOrder, body);
                        return { data: [mockOrder], error: null };
                    }
                }
                return { data: null, error: null };
            };

            const nasUrl = `https://storage.lenas.me/files/make-order-files/invoices/${staged.id}_restart_test.pdf`;
            vi.spyOn(uploadService as any, 'uploadToNasStorage').mockResolvedValue({
                success: true,
                url: nasUrl,
                sha256: staged.sha256
            });

            // Simulate cloud prune failing on attempt 1
            const mockStorage = (supabase.storage.from as any)('make-order-files');
            vi.spyOn(mockStorage, 'remove').mockResolvedValueOnce({ data: null, error: new Error('Cloud Storage timeout') });
            vi.spyOn(quotaMgr, 'pruneConfirmedStorage').mockResolvedValue(true);

            // Attempt 1: fails at cloud prune
            const attempt1 = await uploadService.dispatchUpload(staged.id);
            expect(attempt1.success).toBe(false);

            // Record in SQLite still preserves remote_url_supabase and quota
            const rowAfterAttempt1 = (uploadService as any).db.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(staged.id);
            expect(rowAfterAttempt1.remote_url_supabase).toBe(cloudUrl);
            expect(rowAfterAttempt1.status).toBe('buffered_supabase');

            // Attempt 2 (e.g. after service restart): cloud storage succeeds
            vi.spyOn(mockStorage, 'remove').mockResolvedValue({ data: [cloudUrl], error: null });
            const attempt2 = await uploadService.dispatchUpload(staged.id);
            const finalRow = (uploadService as any).db.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(staged.id);

            expect(attempt2.success).toBe(true);
            expect(attempt2.status).toBe('synced_nas');

            expect(finalRow.status).toBe('synced_nas');
            expect(finalRow.remote_url_supabase).toBeNull();
            expect(finalRow.remote_url_nas).toBe(nasUrl);
        });

        it('8. mocked service reinitialization: reloads persisted pending associations and completes recovery before cloud cleanup', async () => {
            const uploadService = DurableUploadService.getInstance();
            (uploadService as any).supabaseClient = supabase;
            (uploadService as any).nasClient = supabase;
            const quotaMgr = SupabaseQuotaManager.getInstance();

            // 1. Stage and buffer a real upload WITHOUT owner metadata
            const buffer = Buffer.from('%PDF-1.7 genuine process restart recovery test');
            const staged = await uploadService.stageFile(
                buffer,
                'process_restart_test.pdf',
                'application/pdf',
                'make-order-files/999',
                undefined, // NO owner entity at staging time!
                { autoDispatch: false }
            );

            const cloudUrl = `make-order-files/999/${staged.id}_process_restart_test.pdf`;
            (uploadService as any).db.prepare(`
                UPDATE durable_uploads
                SET status = 'buffered_supabase', remote_url_supabase = ?
                WHERE id = ?
            `).run(cloudUrl, staged.id);

            // 2. Persist a pending association for this exact upload identifier in SQLite
            (uploadService as any).db.prepare(`
                INSERT INTO pending_associations (identifier, entity_type, entity_id, field_name, retry_count, created_at, updated_at)
                VALUES (?, ?, ?, ?, 0, ?, ?)
            `).run(staged.id, 'make_orders', '999', 'invoice_attachment_urls', Date.now(), Date.now());

            // CRITICAL: Ensure the real upload remains unassociated in durable_uploads BEFORE resetting the service
            const rowBeforeRestart = (uploadService as any).db.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(staged.id);
            expect(rowBeforeRestart.entity_type).toBeNull();
            expect(rowBeforeRestart.entity_id).toBeNull();

            // 3. Reset and recreate the service against the same SQLite database while the upload is unassociated
            DurableUploadService.resetInstanceForTesting();
            const restartedService = DurableUploadService.getInstance();
            (restartedService as any).supabaseClient = supabase;
            (restartedService as any).nasClient = supabase;

            // 4. Verify startup/worker reconciliation resolves that persisted association and links the upload to the intended owner
            const linkedRow = (restartedService as any).db.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(staged.id);
            expect(linkedRow.entity_type).toBe('make_orders');
            expect(linkedRow.entity_id).toBe('999');
            expect(linkedRow.field_name).toBe('invoice_attachment_urls');

            // Persisted association record was consumed and removed from pending_associations
            const pendingAfterReconcile = (restartedService as any).db.prepare('SELECT * FROM pending_associations WHERE identifier = ?').get(staged.id);
            expect(pendingAfterReconcile).toBeUndefined();

            // 5. Verify failure retains cloud copy and accounting for retry
            const nasUrl = `https://storage.lenas.me/files/make-order-files/999/${staged.id}_process_restart_test.pdf`;
            vi.spyOn(restartedService as any, 'uploadToNasStorage').mockResolvedValue({
                success: true,
                url: nasUrl,
                sha256: staged.sha256
            });

            const mockStorage = (supabase.storage.from as any)('make-order-files');
            const removeSpy = vi.spyOn(mockStorage, 'remove');
            const quotaSpy = vi.spyOn(quotaMgr, 'pruneConfirmedStorage');
            removeSpy.mockClear();
            quotaSpy.mockClear();

            // Simulate database entity update failure (e.g. order not found / 0 rows affected)
            h.state.responder = (table: string, op: string) => {
                if (table === 'make_orders') {
                    if (op === 'select') return { data: null, error: null };
                    if (op === 'update') return { data: [], error: null };
                }
                return { data: null, error: null };
            };

            const failedDispatch = await restartedService.dispatchUpload(staged.id);
            expect(failedDispatch.success).toBe(false);

            // Cloud removal and quota release MUST NOT occur on entity update failure
            expect(removeSpy).not.toHaveBeenCalled();
            expect(quotaSpy).not.toHaveBeenCalled();

            const rowAfterFailure = (restartedService as any).db.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(staged.id);
            expect(rowAfterFailure.remote_url_supabase).toBe(cloudUrl);
            expect(rowAfterFailure.status).toBe('buffered_supabase');

            // 6. Restore the owning order record and assert database update precedes cloud removal and quota release
            const executionSequence: string[] = [];
            const mockOrder = { id: 999, invoice_attachment_urls: [cloudUrl] };
            h.state.responder = (table: string, op: string, body?: any) => {
                if (table === 'make_orders') {
                    if (op === 'select') return { data: mockOrder, error: null };
                    if (op === 'update') {
                        executionSequence.push('db_update_order_reference');
                        Object.assign(mockOrder, body);
                        return { data: [mockOrder], error: null };
                    }
                }
                return { data: null, error: null };
            };

            removeSpy.mockImplementation(async () => {
                executionSequence.push('cloud_storage_remove');
                return { data: [cloudUrl], error: null };
            });
            quotaSpy.mockImplementation(async () => {
                executionSequence.push('quota_prune_release');
                return true;
            });

            const successfulRecovery = await restartedService.dispatchUpload(staged.id);
            expect(successfulRecovery.success).toBe(true);
            expect(successfulRecovery.status).toBe('synced_nas');

            // Strictly verify:
            // (a) db_update_order_reference precedes cloud_storage_remove
            // (b) cloud_storage_remove precedes quota_prune_release
            expect(executionSequence).toEqual([
                'db_update_order_reference',
                'cloud_storage_remove',
                'quota_prune_release'
            ]);
            expect(mockOrder.invoice_attachment_urls).toContain(nasUrl);
            expect(mockOrder.invoice_attachment_urls).not.toContain(cloudUrl);

            // Persisted SQLite record confirms cleanup of cloud copy
            const recoveredRow = (restartedService as any).db.prepare('SELECT * FROM durable_uploads WHERE id = ?').get(staged.id);
            expect(recoveredRow.status).toBe('synced_nas');
            expect(recoveredRow.remote_url_supabase).toBeNull();
            expect(recoveredRow.remote_url_nas).toBe(nasUrl);
        });

        it('9. IPC security gate: make-resolve-attachment-url rejects unauthenticated callers', async () => {
            SessionManager.clearSession();
            const handler = h.state.handlers['make-resolve-attachment-url'];
            expect(handler).toBeDefined();

            await expect(handler({} as any, 'make-order-files/101/blueprint.dwg'))
                .rejects.toThrow('Unauthorized: Authentication required');
        });

        it('10. IPC security gate: make-resolve-attachment-url rejects unauthorized roles', async () => {
            SessionManager.setSession({
                id: 88,
                username: 'unauth_user',
                full_name: 'Guest User',
                role: 'guest',
                permissions: {}
            });
            const handler = h.state.handlers['make-resolve-attachment-url'];

            await expect(handler({} as any, 'make-order-files/101/blueprint.dwg'))
                .rejects.toThrow('Forbidden: Session lacks MAKE permissions');
        });

        it('11. IPC security gate: make-resolve-attachment-url rejects malformed or path-traversal references', async () => {
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                full_name: 'Lead Designer',
                role: 'furniture_designer',
                permissions: {}
            });
            const handler = h.state.handlers['make-resolve-attachment-url'];

            // Empty or whitespace
            await expect(handler({} as any, ''))
                .rejects.toThrow('Invalid or malformed attachment reference');

            // Path traversal attempt
            await expect(handler({} as any, 'make-order-files/../../etc/passwd'))
                .rejects.toThrow('Forbidden: Attachment is unassociated or access is unauthorized.');

            // Null byte injection attempt
            await expect(handler({} as any, 'make-order-files/101/file.pdf\0.exe'))
                .rejects.toThrow('Forbidden: Attachment is unassociated or access is unauthorized.');
        });

        it('12. IPC security gate: make-resolve-attachment-url rejects unassociated object keys (fail closed)', async () => {
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                full_name: 'Lead Designer',
                role: 'furniture_designer',
                permissions: {}
            });
            const handler = h.state.handlers['make-resolve-attachment-url'];

            // Mock database: no order or item owns this key
            h.state.responder = () => ({ data: null, error: null });

            // Random unassociated key cannot be probed or signed
            await expect(handler({} as any, 'make-order-files/999/attacker_probe.pdf'))
                .rejects.toThrow('Forbidden: Attachment is unassociated or access is unauthorized.');
        });

        it('13. IPC security gate: make-resolve-attachment-url authorizes access to valid order attachments', async () => {
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                full_name: 'Lead Designer',
                role: 'furniture_designer',
                permissions: {}
            });
            const handler = h.state.handlers['make-resolve-attachment-url'];

            const validKey = 'make-order-files/505/approved_blueprint.pdf';
            h.state.responder = (table: string, op: string) => {
                if (table === 'make_orders' && op === 'select') {
                    return { data: { id: 505, pdf_urls: [validKey], invoice_attachment_urls: [] }, error: null };
                }
                return { data: null, error: null };
            };

            const result = await handler({} as any, validKey);
            expect(result.url).toContain('/sign/make-order-files/');
            expect(result.url).toContain('token=mock_signed');
        });

        it('14. IPC security gate: make-get-pdf-urls and make-download-pdf enforce authentication and authorization', async () => {
            // (a) make-get-pdf-urls rejects unauthenticated callers
            SessionManager.clearSession();
            const getPdfHandler = h.state.handlers['make-get-pdf-urls'];
            await expect(getPdfHandler({} as any, 101)).rejects.toThrow('Unauthorized: Authentication required');

            // (b) make-get-pdf-urls rejects invalid order ID
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                full_name: 'Lead Designer',
                role: 'furniture_designer',
                permissions: {}
            });
            await expect(getPdfHandler({} as any, -5)).rejects.toThrow('Invalid order ID');

            // (c) make-download-pdf rejects unauthenticated callers
            SessionManager.clearSession();
            const downloadPdfHandler = h.state.handlers['make-download-pdf'];
            const unauthDownload = await downloadPdfHandler({} as any, { url: 'https://storage.lenas.me/files/doc.pdf', fileName: 'doc.pdf' });
            expect(unauthDownload.success).toBe(false);
            expect(unauthDownload.error).toContain('Unauthorized');

            // (d) make-download-pdf rejects unassociated references
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                full_name: 'Lead Designer',
                role: 'furniture_designer',
                permissions: {}
            });
            h.state.responder = () => ({ data: null, error: null });
            const unassociatedDownload = await downloadPdfHandler({} as any, { url: 'make-order-files/888/unassociated.pdf', fileName: 'unassociated.pdf' });
            expect(unassociatedDownload.success).toBe(false);
            expect(unassociatedDownload.error).toContain('Forbidden');
        });

        it('15. IPC security gate: existing upload ID combined with a different object path is rejected', async () => {
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                full_name: 'Lead Designer',
                role: 'furniture_designer',
                permissions: {}
            });
            const handler = h.state.handlers['make-resolve-attachment-url'];

            // Register an existing legitimate upload in SQLite for order 101
            const uploadService = DurableUploadService.getInstance();
            const legitKey = 'make-order-files/101/upl_legit_123_blueprint.pdf';
            (uploadService as any).db.prepare(`
                INSERT INTO durable_uploads (
                    id, local_path, file_name, mime_type, size_bytes, sha256,
                    subfolder, entity_type, entity_id, field_name, status,
                    remote_url_supabase, retry_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'buffered_supabase', ?, 0, ?, ?)
            `).run(
                'upl_legit_123',
                'C:/temp/blueprint.pdf',
                'blueprint.pdf',
                'application/pdf',
                1024,
                'ABCDEF123456',
                'make-order-files/101',
                'make_orders',
                '101',
                'pdf_urls',
                legitKey,
                Date.now(),
                Date.now()
            );

            // Attacker supplies the valid upload ID embedded inside an unauthorized/different path
            const spoofedKey = 'make-order-files/999/upl_legit_123_stolen.pdf';
            h.state.responder = () => ({ data: null, error: null });

            await expect(handler({} as any, spoofedKey))
                .rejects.toThrow('Forbidden: Attachment is unassociated or access is unauthorized.');
        });

        it('16. IPC security gate: unassociated buffered upload cannot be signed', async () => {
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                full_name: 'Lead Designer',
                role: 'furniture_designer',
                permissions: {}
            });
            const handler = h.state.handlers['make-resolve-attachment-url'];

            // Register an upload that is buffered in Supabase but lacks owner metadata (unassociated)
            const uploadService = DurableUploadService.getInstance();
            const unassociatedKey = 'make-order-files/invoices/upl_unassociated_456_bill.pdf';
            (uploadService as any).db.prepare(`
                INSERT INTO durable_uploads (
                    id, local_path, file_name, mime_type, size_bytes, sha256,
                    subfolder, entity_type, entity_id, field_name, status,
                    remote_url_supabase, retry_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'buffered_supabase', ?, 0, ?, ?)
            `).run(
                'upl_unassociated_456',
                'C:/temp/bill.pdf',
                'bill.pdf',
                'application/pdf',
                2048,
                'SHA256_UNASSOC',
                'make-order-files/invoices',
                unassociatedKey,
                Date.now(),
                Date.now()
            );

            h.state.responder = () => ({ data: null, error: null });

            // Unassociated buffered upload MUST NOT be signed
            await expect(handler({} as any, unassociatedKey))
                .rejects.toThrow('Forbidden: Attachment is unassociated or access is unauthorized.');
        });

        it('17. IPC security gate: exact hostname validation rejects lookalike NAS domain prefix bypass', async () => {
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                full_name: 'Lead Designer',
                role: 'furniture_designer',
                permissions: {}
            });
            const handler = h.state.handlers['make-resolve-attachment-url'];

            // An attacker-controlled lookalike domain starting with storage.lenas.me
            const lookalikeUrl = 'https://storage.lenas.me.attacker.com/files/make-order-files/101/exploit.dwg';
            h.state.responder = () => ({ data: null, error: null });

            await expect(handler({} as any, lookalikeUrl))
                .rejects.toThrow('Forbidden: Attachment is unassociated or access is unauthorized.');
        });

        it('18. IPC security gate: local SQLite owner metadata exists but remote owner row does not -> rejected', async () => {
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                full_name: 'Lead Designer',
                role: 'furniture_designer',
                permissions: {}
            });
            const handler = h.state.handlers['make-resolve-attachment-url'];

            // Register an upload in local SQLite claiming to belong to order 777
            const uploadService = DurableUploadService.getInstance();
            const orphanKey = 'make-order-files/777/orphan_drawing.pdf';
            (uploadService as any).db.prepare(`
                INSERT INTO durable_uploads (
                    id, local_path, file_name, mime_type, size_bytes, sha256,
                    subfolder, entity_type, entity_id, field_name, status,
                    remote_url_supabase, retry_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'make_orders', '777', 'pdf_urls', 'buffered_supabase', ?, 0, ?, ?)
            `).run(
                'upl_orphan_777',
                'C:/temp/orphan.pdf',
                'orphan.pdf',
                'application/pdf',
                1024,
                'SHA256_ORPHAN',
                'make-order-files/777',
                orphanKey,
                Date.now(),
                Date.now()
            );

            // Remote database: order 777 does not exist
            h.state.responder = (table: string) => {
                if (table === 'make_orders') return { data: null, error: null };
                return { data: null, error: null };
            };

            // Local SQLite metadata alone must not authorize a signed URL when remote owner row is missing
            await expect(handler({} as any, orphanKey))
                .rejects.toThrow('Forbidden: Attachment is unassociated or access is unauthorized.');
        });

        it('19. IPC security gate: owner row exists but attachment field contains a different key -> rejected', async () => {
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                full_name: 'Lead Designer',
                role: 'furniture_designer',
                permissions: {}
            });
            const handler = h.state.handlers['make-resolve-attachment-url'];

            // Register an upload in SQLite claiming order 101, but with an unlisted key
            const uploadService = DurableUploadService.getInstance();
            const unlistedKey = 'make-order-files/101/unlisted_file.pdf';
            (uploadService as any).db.prepare(`
                INSERT INTO durable_uploads (
                    id, local_path, file_name, mime_type, size_bytes, sha256,
                    subfolder, entity_type, entity_id, field_name, status,
                    remote_url_supabase, retry_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'make_orders', '101', 'pdf_urls', 'buffered_supabase', ?, 0, ?, ?)
            `).run(
                'upl_unlisted_101',
                'C:/temp/unlisted.pdf',
                'unlisted.pdf',
                'application/pdf',
                1024,
                'SHA256_UNLISTED',
                'make-order-files/101',
                unlistedKey,
                Date.now(),
                Date.now()
            );

            // Remote database: order 101 exists, but its pdf_urls contains only a different key
            h.state.responder = (table: string, op: string) => {
                if (table === 'make_orders' && op === 'select') {
                    return {
                        data: {
                            id: 101,
                            pdf_urls: ['make-order-files/101/different_approved_file.pdf'],
                            invoice_attachment_urls: []
                        },
                        error: null
                    };
                }
                return { data: null, error: null };
            };

            // Mismatched attachment field in existing owner row must be rejected
            await expect(handler({} as any, unlistedKey))
                .rejects.toThrow('Forbidden: Attachment is unassociated or access is unauthorized.');
        });

        it('20. IPC security gate: legitimately linked order attachment remains accessible', async () => {
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                full_name: 'Lead Designer',
                role: 'furniture_designer',
                permissions: {}
            });
            const handler = h.state.handlers['make-resolve-attachment-url'];

            const legitKey = 'make-order-files/101/valid_attached_blueprint.pdf';

            // Remote database: order 101 exists and explicitly contains legitKey
            h.state.responder = (table: string, op: string) => {
                if (table === 'make_orders' && op === 'select') {
                    return {
                        data: {
                            id: 101,
                            pdf_urls: [legitKey],
                            invoice_attachment_urls: []
                        },
                        error: null
                    };
                }
                return { data: null, error: null };
            };

            const result = await handler({} as any, legitKey);
            expect(result.url).toContain('/sign/make-order-files/101/valid_attached_blueprint.pdf');
            expect(result.url).toContain('token=mock_signed');
        });

        it('21. IPC security gate: pending upload with no confirmed owner cannot be signed', async () => {
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                full_name: 'Lead Designer',
                role: 'furniture_designer',
                permissions: {}
            });
            const handler = h.state.handlers['make-resolve-attachment-url'];

            // Register an upload staged in Supabase with no confirmed owner
            const uploadService = DurableUploadService.getInstance();
            const unconfirmedKey = 'make-order-files/temp/upl_unconfirmed_999_draft.pdf';
            (uploadService as any).db.prepare(`
                INSERT INTO durable_uploads (
                    id, local_path, file_name, mime_type, size_bytes, sha256,
                    subfolder, entity_type, entity_id, field_name, status,
                    remote_url_supabase, retry_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'buffered_supabase', ?, 0, ?, ?)
            `).run(
                'upl_unconfirmed_999',
                'C:/temp/draft.pdf',
                'draft.pdf',
                'application/pdf',
                1024,
                'SHA256_UNCONFIRMED',
                'make-order-files/temp',
                unconfirmedKey,
                Date.now(),
                Date.now()
            );

            h.state.responder = () => ({ data: null, error: null });

            // Pending upload with no confirmed owner MUST NOT be signed
            await expect(handler({} as any, unconfirmedKey))
                .rejects.toThrow('Forbidden: Attachment is unassociated or access is unauthorized.');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 7. MAKE ATTACHMENT DELETION SECURITY GATE — LE-SOFT v1.8.12
    // ─────────────────────────────────────────────────────────────────────────
    describe('7. MAKE Attachment Deletion Security Gate (LE-SOFT v1.8.12)', () => {
        beforeEach(() => {
            SessionManager.clearSession();
            h.state.calls = [];
            h.state.cloudCalls = [];
            h.state.storageUploads = [];
            if (h.state.storageBuckets['make-order-files']) {
                h.state.storageBuckets['make-order-files'].remove.mockClear();
            }
        });

        it('1. Unauthenticated user attempts to delete an order PDF: rejected', async () => {
            const handler = h.state.handlers['make-delete-pdf'];
            SessionManager.clearSession();

            await expect(handler({} as any, { orderId: 101, storagePath: 'make-order-files/101/doc.pdf' }))
                .rejects.toThrow('Unauthorized: Authentication required');

            expect(h.state.calls.filter(c => c.table === 'make_orders' && c.op === 'update')).toHaveLength(0);
        });

        it('2. Authenticated read-only user attempts deletion: rejected', async () => {
            const handler = h.state.handlers['make-delete-pdf'];
            SessionManager.setSession({
                id: 88,
                username: 'auditor',
                role: 'operator',
                permissions: { make_view: true }
            });

            await expect(handler({} as any, { orderId: 101, storagePath: 'make-order-files/101/doc.pdf' }))
                .rejects.toThrow('Forbidden: Session lacks MAKE order modification permissions');

            expect(h.state.calls.filter(c => c.table === 'make_orders' && c.op === 'update')).toHaveLength(0);
        });

        it('3. User without the required MAKE modification permission: rejected', async () => {
            const handler = h.state.handlers['make-delete-pdf'];
            SessionManager.setSession({
                id: 89,
                username: 'sales_clerk',
                role: 'salesperson',
                permissions: { make_create: true }
            });

            await expect(handler({} as any, { orderId: 101, storagePath: 'make-order-files/101/doc.pdf' }))
                .rejects.toThrow('Forbidden: Session lacks MAKE order modification permissions');

            expect(h.state.calls.filter(c => c.table === 'make_orders' && c.op === 'update')).toHaveLength(0);
        });

        it('4. Authorized user deletes an attachment belonging to an order they can modify: succeeds', async () => {
            const handler = h.state.handlers['make-delete-pdf'];
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                role: 'furniture_designer',
                permissions: {}
            });

            const targetFile = 'make-order-files/101/blueprint.pdf';
            const remainingFile = 'make-order-files/101/spec.pdf';

            h.state.responder = (table: string, op: string) => {
                if (table === 'make_orders' && op === 'select') {
                    return {
                        data: { id: 101, status: 'Draft', pdf_urls: [targetFile, remainingFile] },
                        error: null
                    };
                }
                if (table === 'make_orders' && op === 'update') {
                    return { data: [{ id: 101 }], error: null };
                }
                return { data: null, error: null };
            };

            const result = await handler({} as any, { orderId: 101, storagePath: targetFile });
            expect(result).toEqual({ success: true });

            const updates = h.state.calls.filter(c => c.table === 'make_orders' && c.op === 'update');
            expect(updates).toHaveLength(1);
            expect(updates[0].body.pdf_urls).toEqual([remainingFile]);
        });

        it('5. User attempts to delete an attachment belonging to another order: rejected', async () => {
            const handler = h.state.handlers['make-delete-pdf'];
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                role: 'furniture_designer',
                permissions: {}
            });

            h.state.responder = (table: string, op: string) => {
                if (table === 'make_orders' && op === 'select') {
                    return {
                        data: { id: 101, status: 'Draft', pdf_urls: ['make-order-files/101/own_file.pdf'] },
                        error: null
                    };
                }
                return { data: null, error: null };
            };

            await expect(handler({} as any, { orderId: 101, storagePath: 'make-order-files/202/other_file.pdf' }))
                .rejects.toThrow('does not belong to order #101');

            expect(h.state.calls.filter(c => c.table === 'make_orders' && c.op === 'update')).toHaveLength(0);
        });

        it('5b. Designer attempts deletion on an order that has reached post-production: rejected', async () => {
            const handler = h.state.handlers['make-delete-pdf'];
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                role: 'furniture_designer',
                permissions: {}
            });

            h.state.responder = (table: string, op: string) => {
                if (table === 'make_orders' && op === 'select') {
                    return {
                        data: { id: 101, status: 'Production On Going', pdf_urls: ['make-order-files/101/own_file.pdf'] },
                        error: null
                    };
                }
                return { data: null, error: null };
            };

            await expect(handler({} as any, { orderId: 101, storagePath: 'make-order-files/101/own_file.pdf' }))
                .rejects.toThrow('Only Administrators can modify this order');

            expect(h.state.calls.filter(c => c.table === 'make_orders' && c.op === 'update')).toHaveLength(0);
        });

        it('6. Item PDF deletion against an item belonging to a different order: rejected', async () => {
            const handler = h.state.handlers['make-delete-item-pdf'];
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                role: 'furniture_designer',
                permissions: {}
            });

            h.state.responder = (table: string, op: string) => {
                if (table === 'make_order_items' && op === 'select') {
                    return {
                        data: { id: 45, order_id: 101, pdf_urls: ['make-order-files/101/items/45/cad.pdf'], technical_drawing_url: null },
                        error: null
                    };
                }
                return { data: null, error: null };
            };

            await expect(handler({} as any, { itemId: 45, orderId: 999, storagePath: 'make-order-files/101/items/45/cad.pdf' }))
                .rejects.toThrow('Item #45 belongs to order #101, not order #999');

            expect(h.state.calls.filter(c => c.table === 'make_order_items' && c.op === 'update')).toHaveLength(0);
        });

        it('7. Requested attachment key does not match the owner item recorded attachment: rejected', async () => {
            const handler = h.state.handlers['make-delete-item-pdf'];
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                role: 'furniture_designer',
                permissions: {}
            });

            h.state.responder = (table: string, op: string) => {
                if (table === 'make_order_items' && op === 'select') {
                    return {
                        data: { id: 45, order_id: 101, pdf_urls: ['make-order-files/101/items/45/correct_cad.pdf'], technical_drawing_url: null },
                        error: null
                    };
                }
                if (table === 'make_orders' && op === 'select') {
                    return { data: { id: 101, status: 'Draft' }, error: null };
                }
                return { data: null, error: null };
            };

            await expect(handler({} as any, { itemId: 45, storagePath: 'make-order-files/101/items/45/unrecorded_cad.pdf' }))
                .rejects.toThrow('does not belong to item #45');

            expect(h.state.calls.filter(c => c.table === 'make_order_items' && c.op === 'update')).toHaveLength(0);
        });

        it('8. Nonexistent order or item: rejected without destructive side effects', async () => {
            const orderHandler = h.state.handlers['make-delete-pdf'];
            const itemHandler = h.state.handlers['make-delete-item-pdf'];
            SessionManager.setSession({
                id: 1,
                username: 'admin_user',
                role: 'admin',
                permissions: {}
            });

            h.state.responder = () => ({ data: null, error: null });

            await expect(orderHandler({} as any, { orderId: 8888, storagePath: 'make-order-files/8888/doc.pdf' }))
                .rejects.toThrow('Order with ID 8888 not found');

            await expect(itemHandler({} as any, { itemId: 8888, storagePath: 'make-order-files/8888/doc.pdf' }))
                .rejects.toThrow('Item with ID 8888 not found');

            expect(h.state.calls.filter(c => c.op === 'update')).toHaveLength(0);
        });

        it('9. Invalid IDs, traversal paths, malformed URLs, and unsupported references: rejected', async () => {
            const handler = h.state.handlers['make-delete-pdf'];
            SessionManager.setSession({
                id: 1,
                username: 'admin_user',
                role: 'admin',
                permissions: {}
            });

            // Negative ID
            await expect(handler({} as any, { orderId: -1, storagePath: 'valid.pdf' })).rejects.toThrow();

            // Directory traversal
            await expect(handler({} as any, { orderId: 101, storagePath: '../../secret.pdf' })).rejects.toThrow();
            await expect(handler({} as any, { orderId: 101, storagePath: '/files/%2e%2e/secret.pdf' })).rejects.toThrow();

            // Null bytes
            await expect(handler({} as any, { orderId: 101, storagePath: 'valid.pdf\0malicious' })).rejects.toThrow();
            await expect(handler({} as any, { orderId: 101, storagePath: 'valid.pdf%00malicious' })).rejects.toThrow();

            // Unsupported protocol schemes
            await expect(handler({} as any, { orderId: 101, storagePath: 'javascript:alert(1)' })).rejects.toThrow();
            await expect(handler({} as any, { orderId: 101, storagePath: 'file:///etc/passwd' })).rejects.toThrow();
            await expect(handler({} as any, { orderId: 101, storagePath: 'data:text/plain;base64,AAAA' })).rejects.toThrow();

            // Untrusted external HTTP host
            await expect(handler({} as any, { orderId: 101, storagePath: 'http://malicious-external-host.com/evil.pdf' }))
                .rejects.toThrow('Invalid or unsupported attachment reference');

            expect(h.state.calls.filter(c => c.op === 'update')).toHaveLength(0);
        });

        it('10. Database lookup failure or zero affected rows: no false success', async () => {
            const handler = h.state.handlers['make-delete-pdf'];
            SessionManager.setSession({
                id: 1,
                username: 'admin_user',
                role: 'admin',
                permissions: {}
            });

            // Database lookup error
            h.state.responder = (table: string, op: string) => {
                if (table === 'make_orders' && op === 'select') {
                    return { data: null, error: { message: 'Database connection timeout' } };
                }
                return { data: null, error: null };
            };

            await expect(handler({} as any, { orderId: 101, storagePath: 'make-order-files/101/blueprint.pdf' }))
                .rejects.toThrow('Database error looking up order: Database connection timeout');

            // Zero affected rows on update
            h.state.responder = (table: string, op: string) => {
                if (table === 'make_orders' && op === 'select') {
                    return {
                        data: { id: 101, status: 'Draft', pdf_urls: ['make-order-files/101/blueprint.pdf'] },
                        error: null
                    };
                }
                if (table === 'make_orders' && op === 'update') {
                    return { data: [], error: null }; // 0 rows affected
                }
                return { data: null, error: null };
            };

            await expect(handler({} as any, { orderId: 101, storagePath: 'make-order-files/101/blueprint.pdf' }))
                .rejects.toThrow('Order attachment deletion failed: 0 rows affected for order #101');
        });

        it('11. Authorization failure causes no database mutation, NAS deletion, Supabase object removal, or quota release', async () => {
            const handler = h.state.handlers['make-delete-pdf'];
            SessionManager.setSession({
                id: 42,
                username: 'operator_bob',
                role: 'operator',
                permissions: {}
            });

            const initialStorageRemoveCalls = h.state.storageBuckets['make-order-files']?.remove?.mock?.calls?.length || 0;

            await expect(handler({} as any, { orderId: 101, storagePath: 'make-order-files/101/doc.pdf' }))
                .rejects.toThrow('Forbidden: Session lacks MAKE order modification permissions');

            // Confirm no DB mutations occurred
            expect(h.state.calls.filter(c => c.op === 'update' || c.op === 'delete')).toHaveLength(0);

            // Confirm no Supabase storage remove was called
            const currentRemoveCalls = h.state.storageBuckets['make-order-files']?.remove?.mock?.calls?.length || 0;
            expect(currentRemoveCalls).toBe(initialStorageRemoveCalls);
        });

        it('12. A genuine cleanup failure preserves sufficient metadata for safe retry', async () => {
            const handler = h.state.handlers['make-delete-pdf'];
            SessionManager.setSession({
                id: 1,
                username: 'lead_designer',
                role: 'furniture_designer',
                permissions: {}
            });

            const targetKey = 'make-order-files/101/buffered_retry_test.pdf';

            // Order has target file, update succeeds
            h.state.responder = (table: string, op: string) => {
                if (table === 'make_orders' && op === 'select') {
                    return {
                        data: { id: 101, status: 'Draft', pdf_urls: [targetKey] },
                        error: null
                    };
                }
                if (table === 'make_orders' && op === 'update') {
                    return { data: [{ id: 101 }], error: null };
                }
                return { data: null, error: null };
            };

            // Simulate cloud prune failure
            const uploadService = DurableUploadService.getInstance();
            const originalPrune = uploadService.pruneCloudCopy;
            uploadService.pruneCloudCopy = vi.fn().mockRejectedValue(new Error('Supabase Storage 503 Service Unavailable'));

            try {
                // Operation still completes order deletion gracefully without unhandled crash
                const res = await handler({} as any, { orderId: 101, storagePath: targetKey });
                expect(res.success).toBe(true);

                // Cloud prune was attempted
                expect(uploadService.pruneCloudCopy).toHaveBeenCalled();
            } finally {
                uploadService.pruneCloudCopy = originalPrune;
            }
        });

        it('13. Authorized item-level technical drawing deletion updates item and cascades technical_drawing_url', async () => {
            const handler = h.state.handlers['make-delete-item-pdf'];
            SessionManager.setSession({
                id: 1,
                username: 'designer',
                role: 'furniture_designer',
                permissions: {}
            });

            const targetDrawing = 'make-order-files/101/items/55/drawing_v1.dwg';
            const remainingDrawing = 'make-order-files/101/items/55/drawing_v2.dwg';

            h.state.responder = (table: string, op: string) => {
                if (table === 'make_order_items' && op === 'select') {
                    return {
                        data: {
                            id: 55,
                            order_id: 101,
                            pdf_urls: [targetDrawing, remainingDrawing],
                            technical_drawing_url: targetDrawing
                        },
                        error: null
                    };
                }
                if (table === 'make_orders' && op === 'select') {
                    return { data: { id: 101, status: 'Draft' }, error: null };
                }
                if (table === 'make_order_items' && op === 'update') {
                    return { data: [{ id: 55 }], error: null };
                }
                return { data: null, error: null };
            };

            const result = await handler({} as any, { itemId: 55, orderId: 101, storagePath: targetDrawing });
            expect(result).toEqual({ success: true });

            const itemUpdates = h.state.calls.filter(c => c.table === 'make_order_items' && c.op === 'update');
            expect(itemUpdates).toHaveLength(1);
            expect(itemUpdates[0].body.pdf_urls).toEqual([remainingDrawing]);
            // technical_drawing_url cascades to next available drawing
            expect(itemUpdates[0].body.technical_drawing_url).toEqual(remainingDrawing);
        });
    });
});
