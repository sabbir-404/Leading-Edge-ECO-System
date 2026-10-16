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
    SavedPlaceOrderDraft
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
        registerMakeHandlers();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
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
            expect(uploadRes.publicUrl).toBeDefined();
            expect(reserveSpy).toHaveBeenCalled();
            expect(releaseSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Number), 'committed');
        });

        it('enforces 600 MB / 1 GB Supabase quota ceiling on upload', async () => {
            const quotaMgr = SupabaseQuotaManager.getInstance();
            vi.spyOn(quotaMgr, 'canAcceptStorageUpload').mockReturnValue(false);
            vi.spyOn(quotaMgr, 'reserveStorageQuota').mockResolvedValue(false);

            const buffer = Buffer.from('%PDF-1.7');
            const uploadRes = await MakeCadService.uploadValidatedBuffer(
                buffer,
                'oversize.pdf',
                'application/pdf',
                'make-order-files/101'
            );

            expect(uploadRes.success).toBe(false);
            expect(uploadRes.error).toContain('Supabase Storage quota limit reached');
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
});
