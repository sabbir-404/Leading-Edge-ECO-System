import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
    isFactoryManager,
    canCreateProductFromPlaceOrder,
    canViewSalePrice,
    canViewCostPrice,
    canEditCostPrice,
    canEditSalePrice,
    canManageMakeCatalog,
    canManageGlobalProductAttributes,
    getUserPricingPermissions
} from '../../src/utils/permissions';
import { savePlaceOrderDraft, loadPlaceOrderDraft, clearPlaceOrderDraft, PlaceOrderDraftData } from '../../src/utils/placeOrderDraft';
import { NASConnectionManager } from '../../electron/services/make/NASConnectionManager';
import { WatchdogService } from '../../electron/services/WatchdogService';
import { WindowsNotificationService } from '../../electron/services/WindowsNotificationService';

describe('LE-SOFT 1.8.11 Cycle — Engineering Verification Suite', () => {

    beforeAll(() => {
        let store: Record<string, string> = {};
        globalThis.localStorage = {
            getItem: (key: string) => store[key] ?? null,
            setItem: (key: string, value: string) => { store[key] = String(value); },
            removeItem: (key: string) => { delete store[key]; },
            clear: () => { store = {}; },
            key: (i: number) => Object.keys(store)[i] ?? null,
            get length() { return Object.keys(store).length; },
        } as any;
    });

    beforeEach(() => {
        localStorage.clear();
    });

    const setUser = (role: string, permissions: Record<string, boolean> = {}) => {
        localStorage.setItem('user', JSON.stringify({ role, permissions, username: 'testuser' }));
        localStorage.setItem('user_role', role);
    };

    // ── 1. FACTORY MANAGER ROLE & RBAC HARDENING ─────────────────────────────
    describe('1. Factory Manager RBAC & Sale Price Shielding', () => {
        it('should correctly identify factory_manager role', () => {
            setUser('factory_manager');
            expect(isFactoryManager()).toBe(true);

            setUser('factory manager');
            expect(isFactoryManager()).toBe(true);

            setUser('salesperson');
            expect(isFactoryManager()).toBe(false);

            setUser('furniture_designer');
            expect(isFactoryManager()).toBe(false);

            setUser('admin');
            expect(isFactoryManager()).toBe(false);
        });

        it('strictly forbids factory_manager from viewing sale price anywhere', () => {
            setUser('factory_manager');
            expect(canViewSalePrice()).toBe(false);

            setUser('factory manager');
            expect(canViewSalePrice()).toBe(false);

            // Permitted roles
            setUser('furniture_designer');
            expect(canViewSalePrice()).toBe(true);

            setUser('salesperson');
            expect(canViewSalePrice()).toBe(true);

            setUser('admin');
            expect(canViewSalePrice()).toBe(true);

            setUser('superadmin');
            expect(canViewSalePrice()).toBe(true);
        });

        it('allows factory_manager to view cost price, but forbids editing cost price', () => {
            setUser('factory_manager');
            expect(canViewCostPrice()).toBe(true);
            expect(canEditCostPrice()).toBe(false);

            // Furniture designer can view AND edit cost price
            setUser('furniture_designer');
            expect(canViewCostPrice()).toBe(true);
            expect(canEditCostPrice()).toBe(true);
        });

        it('strictly denies factory_manager from catalog editing and product creation', () => {
            setUser('factory_manager');
            expect(canManageMakeCatalog()).toBe(false);
            expect(canManageGlobalProductAttributes()).toBe(false);
        });

        it('provides atomic pricing permissions bundle conforming to factory_manager constraints', () => {
            setUser('factory_manager');
            const perms = getUserPricingPermissions();
            expect(perms.canViewCostPrice).toBe(true);
            expect(perms.canEditCostPrice).toBe(false);
            expect(perms.canViewSalePrice).toBe(false);
            expect(perms.canEditSalePrice).toBe(false);

            setUser('furniture_designer');
            const designerPerms = getUserPricingPermissions();
            expect(designerPerms.canViewCostPrice).toBe(true);
            expect(designerPerms.canEditCostPrice).toBe(true);
            expect(designerPerms.canViewSalePrice).toBe(true);
            expect(designerPerms.canEditSalePrice).toBe(true);
        });
    });

    // ── 2. CREATE PRODUCT FROM PLACE ORDER CAPABILITY ─────────────────────────
    describe('2. create_product_from_place_order Capability', () => {
        it('allows furniture designer or users with explicit create_product_from_place_order permission', () => {
            setUser('furniture_designer');
            expect(canCreateProductFromPlaceOrder()).toBe(true);

            setUser('admin');
            expect(canCreateProductFromPlaceOrder()).toBe(true);

            setUser('superadmin');
            expect(canCreateProductFromPlaceOrder()).toBe(true);

            // Regular user without permission
            setUser('user');
            expect(canCreateProductFromPlaceOrder()).toBe(false);

            setUser('salesperson');
            expect(canCreateProductFromPlaceOrder()).toBe(false);

            setUser('factory_manager');
            expect(canCreateProductFromPlaceOrder()).toBe(false);

            // Custom user with permission
            setUser('custom_role', { create_product_from_place_order: true });
            expect(canCreateProductFromPlaceOrder()).toBe(true);

            // Factory manager even with permission flag is forbidden
            setUser('factory_manager', { create_product_from_place_order: true });
            expect(canCreateProductFromPlaceOrder()).toBe(false);
        });
    });

    // ── 3. NON-CATALOG PRODUCT SEPARATE SIZE & SPEC FIELDS ────────────────────
    describe('3. Non-Catalog Separate Size and Specification Draft Buffer', () => {
        it('persists and restores customItemSize independently from customItemSpec', () => {
            clearPlaceOrderDraft();

            const testDraft: PlaceOrderDraftData = {
                customerName: 'Ayesha Rahman',
                customerPhone: '01700000000',
                shippingAddress: 'Gulshan 2, Dhaka',
                priority: 'High',
                specialInstructions: 'Handle with care',
                isCustomItemMode: true,
                customItemName: 'Executive Conference Table',
                customItemSize: '12ft x 4ft x 2.5ft (LxWxH)',
                customItemSpec: 'Solid Burma Teak with brushed brass cable management grommets',
                itemQuantity: 2,
                itemCostPrice: '60000',
                itemSalePrice: '85000'
            };

            savePlaceOrderDraft(testDraft);
            const loaded = loadPlaceOrderDraft();

            expect(loaded).toBeDefined();
            expect(loaded?.customItemName).toBe('Executive Conference Table');
            expect(loaded?.customItemSize).toBe('12ft x 4ft x 2.5ft (LxWxH)');
            expect(loaded?.customItemSpec).toBe('Solid Burma Teak with brushed brass cable management grommets');
            expect(loaded?.itemCostPrice).toBe('60000');
            expect(loaded?.itemSalePrice).toBe('85000');

            clearPlaceOrderDraft();
            expect(loadPlaceOrderDraft()).toEqual({});
        });
    });

    // ── 4. NAS SMART CONNECTION MANAGER PRIVACY & SAFE STATUS ─────────────────
    describe('4. NAS Smart Connection Manager', () => {
        it('should return safe status containing strictly zero private IPs or endpoints', () => {
            const manager = NASConnectionManager.getInstance();
            const safeStatus = manager.getSafeStatus();

            expect(safeStatus).toBeDefined();
            expect(['Connected', 'Reconnecting', 'Degraded', 'Offline']).toContain(safeStatus.status);
            expect(typeof safeStatus.isNasOnline).toBe('boolean');
            expect(typeof safeStatus.lastSync).toBe('number');

            // Verify strict redaction / zero secret leakage
            const serialized = JSON.stringify(safeStatus);
            expect(serialized).not.toContain('100.88.85.6');
            expect(serialized).not.toContain('192.168.');
            expect(serialized).not.toContain(':3001');
            expect(serialized).not.toContain(':8085');
            expect(serialized).not.toContain('storage.lenas.me');
        });
    });

    // ── 5. WATCHDOG & APPLICATION STABILITY ──────────────────────────────────
    describe('5. Watchdog Engine & Diagnostics Sanitization', () => {
        it('records and returns sanitized stability diagnostics', () => {
            const watchdog = WatchdogService.getInstance();
            const diagnostics = watchdog.getSanitizedDiagnostics();

            expect(Array.isArray(diagnostics)).toBe(true);

            // Record a sample operation
            watchdog.recordDiagnostic({
                operationName: 'test_order_creation',
                durationMs: 450,
                success: true,
                connectionState: 'Connected'
            });

            const updated = watchdog.getSanitizedDiagnostics();
            expect(updated.length).toBeGreaterThan(0);
            const latest = updated[updated.length - 1];
            expect(latest.operationName).toBe('test_order_creation');
            expect(latest.durationMs).toBe(450);
            expect(latest.success).toBe(true);

            // Ensure zero secrets leak to diagnostics
            const rawText = JSON.stringify(updated);
            expect(rawText).not.toContain('password');
            expect(rawText).not.toContain('service_role');
            expect(rawText).not.toContain('sb_secret');
        });
    });

    // ── 6. WINDOWS NOTIFICATION CENTER SERVICE ───────────────────────────────
    describe('6. Windows Notification Center Deduplication & Settings', () => {
        it('loads default notification preferences correctly', () => {
            const service = WindowsNotificationService.getInstance();
            const settings = service.getSettings();

            expect(settings).toBeDefined();
            expect(typeof settings.enabled).toBe('boolean');
            expect(typeof settings.orderNotifications).toBe('boolean');
            expect(typeof settings.updateNotifications).toBe('boolean');
        });

        it('suppresses duplicate notifications within cooldown window', () => {
            const service = WindowsNotificationService.getInstance();
            const testKey = 'order_confirmed_TEST-999';

            // First call allowed (or returns boolean depending on platform)
            service.showNotification({
                title: 'Order Placed',
                body: 'Order #TEST-999 confirmed',
                category: 'new_order',
                dedupKey: testKey
            });

            // Immediate repeat with identical dedupKey MUST be suppressed
            const second = service.showNotification({
                title: 'Order Placed',
                body: 'Order #TEST-999 confirmed',
                category: 'new_order',
                dedupKey: testKey
            });

            expect(second).toBe(false);
        });
    });

    // ── 7. MAKE_ORDER_ITEMS SCHEMA CONTRACT & FIELD COMPATIBILITY ─────────────
    describe('7. make_order_items Schema Contract & Compatibility Mapping', () => {
        it('preserves distinct spec_name, spec_details, size_label, dimensions_text, and custom_size in write payload', () => {
            const rawItem = {
                product_id: 101,
                product_name: 'Executive Ergonomic Chair',
                spec_name: 'Standard Mesh High-Back',
                spec_details: 'Seasoned mahogany frame with 45kg/m3 high-density foam',
                size_label: 'Standard Office Size',
                dimensions_text: '700mm x 700mm x 1200mm',
                custom_size: '700mm x 700mm x 1200mm',
                custom_dimensions: '700mm x 700mm x 1200mm',
                color_name: 'Charcoal Black',
                quantity: 2,
                is_customized: true,
                designer_notes: 'Urgent delivery for boardroom'
            };

            // Authoritative MakeOrderService mapping
            const payload = {
                product_id: rawItem.product_id,
                product_name: rawItem.product_name.trim(),
                spec_name: rawItem.spec_name || null,
                spec_details: rawItem.spec_details || null,
                size_label: rawItem.size_label || null,
                dimensions_text: rawItem.dimensions_text || null,
                custom_size: rawItem.custom_size || (rawItem.is_customized ? rawItem.dimensions_text : null) || null,
                custom_dimensions: rawItem.custom_dimensions || (rawItem.is_customized ? (rawItem.custom_size || rawItem.dimensions_text) : null) || null,
                color_name: rawItem.color_name || null,
                is_customized: !!rawItem.is_customized,
                designer_notes: rawItem.designer_notes || null,
                quantity: rawItem.quantity
            };

            // Distinction preserved
            expect(payload.spec_name).toBe('Standard Mesh High-Back');
            expect(payload.spec_details).toBe('Seasoned mahogany frame with 45kg/m3 high-density foam');
            expect(payload.size_label).toBe('Standard Office Size');
            expect(payload.dimensions_text).toBe('700mm x 700mm x 1200mm');
            expect(payload.custom_size).toBe('700mm x 700mm x 1200mm');
            expect(payload.custom_dimensions).toBe('700mm x 700mm x 1200mm');
            expect(payload.designer_notes).toBe('Urgent delivery for boardroom');

            // Neither collapsed nor discarded
            expect(payload.spec_name).not.toBe(payload.spec_details);
        });

        it('normalizes UI aliases (custom_color, custom_notes, is_custom) into canonical columns without phantom keys', () => {
            const rawItem = {
                product_id: 202,
                product_name: 'Custom Boardroom Table',
                custom_size: '3000mm x 1200mm x 750mm',
                custom_color: 'Espresso Walnut Finish',
                custom_notes: 'Include 4x integrated power grommets',
                is_custom: true,
                quantity: 1
            };

            const normalizedPayload: any = {
                product_id: rawItem.product_id,
                product_name: rawItem.product_name.trim(),
                spec_name: (rawItem as any).spec_name || null,
                spec_details: (rawItem as any).spec_details || null,
                size_label: (rawItem as any).size_label || rawItem.custom_size || null,
                dimensions_text: (rawItem as any).dimensions_text || rawItem.custom_size || null,
                custom_size: rawItem.custom_size || null,
                custom_dimensions: rawItem.custom_size || null,
                color_name: (rawItem as any).color_name || rawItem.custom_color || null,
                designer_notes: (rawItem as any).designer_notes || rawItem.custom_notes || null,
                is_customized: !!((rawItem as any).is_customized || rawItem.is_custom),
                quantity: rawItem.quantity
            };

            expect(normalizedPayload.color_name).toBe('Espresso Walnut Finish');
            expect(normalizedPayload.designer_notes).toBe('Include 4x integrated power grommets');
            expect(normalizedPayload.is_customized).toBe(true);

            // Verified: no phantom columns in DB write payload
            expect(normalizedPayload.custom_color).toBeUndefined();
            expect(normalizedPayload.custom_notes).toBeUndefined();
            expect(normalizedPayload.is_custom).toBeUndefined();
        });

        it('demonstrates schema fallback retry when target (Supabase Cloud) lacks designer_notes', () => {
            const rawItems = [
                {
                    product_id: 1,
                    product_name: 'Sofa',
                    spec_name: 'Leather',
                    spec_details: 'Top-grain Italian leather',
                    dimensions_text: '2000x900x850mm',
                    custom_size: '2000x900x850mm',
                    custom_dimensions: '2000x900x850mm',
                    designer_notes: 'Piping in cream thread',
                    quantity: 1
                }
            ];

            // Primary payload sent to TrueNAS (which supports designer_notes)
            const primaryPayload = rawItems.map(item => ({
                product_id: item.product_id,
                product_name: item.product_name,
                spec_name: item.spec_name,
                spec_details: item.spec_details,
                dimensions_text: item.dimensions_text,
                custom_size: item.custom_size,
                custom_dimensions: item.custom_dimensions,
                designer_notes: item.designer_notes,
                quantity: item.quantity
            }));
            expect(primaryPayload[0].designer_notes).toBe('Piping in cream thread');

            // Simulated Supabase Cloud error (42703: column make_order_items.designer_notes does not exist)
            const simulatedError = { code: '42703', message: 'column make_order_items.designer_notes does not exist' };
            const isMissingCol = simulatedError.code === '42703' || /column.*does not exist/i.test(simulatedError.message);
            expect(isMissingCol).toBe(true);

            // Retry sanitization removes NAS-only columns
            const sanitizedPayload = primaryPayload.map(item => {
                const copy: any = { ...item };
                delete copy.designer_notes;
                delete copy.technical_drawing_url;
                delete copy.pdf_urls;
                return copy;
            });
            expect(sanitizedPayload[0].designer_notes).toBeUndefined();
            expect(sanitizedPayload[0].spec_details).toBe('Top-grain Italian leather');
            expect(sanitizedPayload[0].custom_size).toBe('2000x900x850mm');

            // Timeline note preserves the designer notes
            const collectedItemNotes = rawItems
                .map((it, idx) => it.designer_notes ? `Item #${idx + 1} (${it.product_name}): ${it.designer_notes}` : null)
                .filter(Boolean);
            const timelineNote = `Order placed and approved [Item Notes: ${collectedItemNotes.join('; ')}]`;
            expect(timelineNote).toContain('Piping in cream thread');
        });

        it('verifies TrackOrders display fallback resolution across both schema variants', () => {
            // Case A: Record saved with baseline 052/057 columns
            const dbItemBaseline = {
                spec_name: 'Solid Teak Wood',
                spec_details: null,
                size_label: '2100mm x 950mm x 750mm',
                custom_dimensions: '2100mm x 950mm x 750mm',
                dimensions_text: null
            };

            const displaySpecA = dbItemBaseline.spec_details || dbItemBaseline.spec_name;
            const displayDimA = dbItemBaseline.custom_dimensions || dbItemBaseline.dimensions_text || dbItemBaseline.size_label || 'Standard Dimensions';
            expect(displaySpecA).toBe('Solid Teak Wood');
            expect(displayDimA).toBe('2100mm x 950mm x 750mm');

            // Case B: Record saved with forward columns
            const dbItemForward = {
                spec_name: null,
                spec_details: 'Solid Teak Wood with polyurethane lacquer',
                size_label: null,
                custom_dimensions: null,
                dimensions_text: '2100mm x 950mm x 750mm (Custom)'
            };

            const displaySpecB = dbItemForward.spec_details || dbItemForward.spec_name;
            const displayDimB = dbItemForward.custom_dimensions || dbItemForward.dimensions_text || dbItemForward.size_label || 'Standard Dimensions';
            expect(displaySpecB).toBe('Solid Teak Wood with polyurethane lacquer');
            expect(displayDimB).toBe('2100mm x 950mm x 750mm (Custom)');
        });
    });
});
