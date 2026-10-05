import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getProductCatalogDraftStorageKey,
  loadProductCatalogDraft,
  saveProductCatalogDraft,
  clearProductCatalogDraft,
  clearProductFormDraft,
  hasMeaningfulDraftContent,
  ProductCatalogDraftData
} from '../../src/utils/productCatalogDraft';
import {
  canManageGlobalProductAttributes,
  canManageMakeCatalog,
  isSuperadmin,
  isAdmin
} from '../../src/utils/permissions';
import { SessionManager, UserSession } from '../../electron/session-manager';
import { ipcMain } from 'electron';
import { registerMakeHandlers } from '../../electron/ipc/handlers/make';
import { supabase } from '../../electron/supabase';

// Mock electron ipcMain and BrowserWindow
const mockIpcHandlers: Record<string, Function> = {};
vi.mock('electron', () => {
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: Function) => {
        mockIpcHandlers[channel] = handler;
      }),
      on: vi.fn(),
      removeHandler: vi.fn()
    },
    BrowserWindow: {
      getFocusedWindow: vi.fn(() => null)
    }
  };
});

// Mock Supabase
vi.mock('../../electron/supabase', () => {
  const dummyChain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnValue({ catch: vi.fn() }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: { id: 999, name: 'Mock Cat' }, error: null })
  };
  return {
    supabase: {
      from: vi.fn(() => dummyChain)
    },
    supabaseAdmin: {
      from: vi.fn(() => dummyChain)
    }
  };
});

describe('MAKE Feature Set — Product Catalog & Place Order Enhancements', () => {
  // Mock localStorage
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString();
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      }
    });

    vi.stubGlobal('window', {
      confirm: vi.fn(() => true),
      electron: {}
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // FEATURE 1: Create New Product directly from Place Order
  // ══════════════════════════════════════════════════════════════════════════════
  describe('FEATURE 1: Create New Product directly from Place Order', () => {
    it('designer with write_make_catalog permission is allowed to manage/create products', () => {
      localStorage.setItem('user', JSON.stringify({
        id: 42,
        username: 'designer_user',
        role: 'furniture_designer',
        permissions: { write_make_catalog: true }
      }));

      expect(canManageMakeCatalog()).toBe(true);
    });

    it('unauthorized user without catalog write permission cannot create products in UI', () => {
      localStorage.setItem('user', JSON.stringify({
        id: 99,
        username: 'salesperson_user',
        role: 'salesperson',
        permissions: { read_make: true }
      }));

      expect(canManageMakeCatalog()).toBe(false);
    });

    it('simulates Place Order receiving new product, refreshing catalog, and immediately selecting it', () => {
      const existingCatalog = [
        { id: 1, product_name: 'Existing Table', product_code: 'TAB-001' }
      ];

      const newProduct = {
        id: 2,
        product_name: 'Custom Executive Desk',
        product_code: 'DSK-999',
        category_id: 5,
        category: 'Desks',
        specifications: [{ id: 10, spec_name: 'Brass Handles' }],
        sizes: [{ id: 20, size_label: '200x100 cm' }],
        colors: [{ id: 30, color_name: 'Walnut' }]
      };

      // Simulated Place Order state handler
      let selectedProductId: number | null = null;
      let selectedProductObj: any = null;
      let catalog = [...existingCatalog];

      const handleProductCreated = (created: any) => {
        catalog = [created, ...catalog];
        const resolved = catalog.find(p => p.id === created.id) || created;
        selectedProductId = resolved.id;
        selectedProductObj = resolved;
      };

      handleProductCreated(newProduct);

      expect(catalog.length).toBe(2);
      expect(selectedProductId).toBe(2);
      expect(selectedProductObj.product_name).toBe('Custom Executive Desk');
      expect(selectedProductObj.specifications).toHaveLength(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // FEATURE 2: Preserve Product Catalog input as a draft/buffer while navigating
  // ══════════════════════════════════════════════════════════════════════════════
  describe('FEATURE 2: Preserve Product Catalog draft across navigation', () => {
    it('scopes draft buffer strictly per user ID', () => {
      localStorage.setItem('user', JSON.stringify({ id: 101, username: 'alice' }));
      expect(getProductCatalogDraftStorageKey()).toBe('make_product_catalog_draft_101');

      localStorage.setItem('user', JSON.stringify({ id: 202, username: 'bob' }));
      expect(getProductCatalogDraftStorageKey()).toBe('make_product_catalog_draft_202');
    });

    it('saves and restores search text, view tabs, and product form fields', () => {
      localStorage.setItem('user', JSON.stringify({ id: 101, username: 'alice' }));

      saveProductCatalogDraft({
        search: 'Executive Desk',
        historySearch: 'Invoice-402',
        catalogMainView: 'products',
        activeTab: 'specs',
        productForm: {
          product_name: 'Presidential Desk',
          product_code: 'DSK-PRES',
          description: 'High end mahogany wood finish with leather top',
          selectedSpecIds: [1, 3],
          selectedSizeIds: [10],
          selectedColorIds: [25],
          isOpen: true
        }
      });

      // Emulate page unmount / navigation and re-mount
      const restored = loadProductCatalogDraft();
      expect(restored.search).toBe('Executive Desk');
      expect(restored.historySearch).toBe('Invoice-402');
      expect(restored.catalogMainView).toBe('products');
      expect(restored.activeTab).toBe('specs');
      expect(restored.productForm?.product_name).toBe('Presidential Desk');
      expect(restored.productForm?.product_code).toBe('DSK-PRES');
      expect(restored.productForm?.selectedSpecIds).toEqual([1, 3]);
      expect(restored.productForm?.selectedColorIds).toEqual([25]);
    });

    it('does not leak draft data from Alice to Bob', () => {
      // Alice creates a draft
      localStorage.setItem('user', JSON.stringify({ id: 101, username: 'alice' }));
      saveProductCatalogDraft({
        search: 'Alice Confidential Table',
        productForm: { product_name: 'Alice Secret' }
      });

      // Bob logs in
      localStorage.setItem('user', JSON.stringify({ id: 202, username: 'bob' }));
      const bobDraft = loadProductCatalogDraft();
      expect(bobDraft.search).toBeUndefined();
      expect(bobDraft.productForm).toBeUndefined();
    });

    it('identifies meaningful draft content correctly', () => {
      expect(hasMeaningfulDraftContent({})).toBe(false);
      expect(hasMeaningfulDraftContent({ search: '   ' })).toBe(false);
      expect(hasMeaningfulDraftContent({ search: 'Office Chair' })).toBe(true);
      expect(hasMeaningfulDraftContent({ productForm: { product_name: 'Chair' } })).toBe(true);
      expect(hasMeaningfulDraftContent({ productForm: { selectedSpecIds: [1] } })).toBe(true);
    });

    it('clears product form draft specifically after successful save while keeping search', () => {
      localStorage.setItem('user', JSON.stringify({ id: 101, username: 'alice' }));
      saveProductCatalogDraft({
        search: 'Active Filter',
        productForm: { product_name: 'Completed Product', product_code: 'CP-1' }
      });

      clearProductFormDraft();
      const updated = loadProductCatalogDraft();
      expect(updated.productForm).toBeUndefined();
      expect(updated.search).toBe('Active Filter');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // FEATURE 3: Clear button
  // ══════════════════════════════════════════════════════════════════════════════
  describe('FEATURE 3: Clear Draft functionality', () => {
    it('completely removes draft data from storage on clearProductCatalogDraft', () => {
      localStorage.setItem('user', JSON.stringify({ id: 101, username: 'alice' }));
      saveProductCatalogDraft({
        search: 'Query to clear',
        productForm: { product_name: 'Draft to discard' }
      });

      expect(hasMeaningfulDraftContent()).toBe(true);
      clearProductCatalogDraft();

      const cleared = loadProductCatalogDraft();
      expect(cleared).toEqual({});
      expect(hasMeaningfulDraftContent()).toBe(false);
    });

    it('navigating away and back after clear does not restore the cleared draft', () => {
      localStorage.setItem('user', JSON.stringify({ id: 101, username: 'alice' }));
      saveProductCatalogDraft({ search: 'Temporary Query' });
      clearProductCatalogDraft();

      // Simulate re-entering the page
      const freshMountDraft = loadProductCatalogDraft();
      expect(freshMountDraft.search).toBeUndefined();
      expect(freshMountDraft.productForm).toBeUndefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // FEATURE 4: Furniture Designer permission for Global Product Attributes
  // ══════════════════════════════════════════════════════════════════════════════
  describe('FEATURE 4: Granular manage_global_product_attributes permission', () => {
    it('admin and superadmin always have permission without explicit toggle', () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, role: 'superadmin' }));
      expect(canManageGlobalProductAttributes()).toBe(true);

      localStorage.setItem('user', JSON.stringify({ id: 2, role: 'admin' }));
      expect(canManageGlobalProductAttributes()).toBe(true);
    });

    it('furniture designer with manage_global_product_attributes has access', () => {
      localStorage.setItem('user', JSON.stringify({
        id: 10,
        role: 'furniture_designer',
        permissions: { manage_global_product_attributes: true }
      }));
      expect(canManageGlobalProductAttributes()).toBe(true);
    });

    it('furniture designer WITHOUT manage_global_product_attributes is denied', () => {
      localStorage.setItem('user', JSON.stringify({
        id: 11,
        role: 'furniture_designer',
        permissions: {
          write_make_catalog: true,
          read_make: true
        }
      }));
      // Note: write_make_catalog does NOT grant global attribute management!
      expect(canManageGlobalProductAttributes()).toBe(false);
    });

    it('other roles (salesperson, viewer) are denied by default', () => {
      localStorage.setItem('user', JSON.stringify({
        id: 20,
        role: 'salesperson',
        permissions: { read_make: true }
      }));
      expect(canManageGlobalProductAttributes()).toBe(false);
    });

    it('enforces manage_global_product_attributes in Main Process IPC handlers', async () => {
      registerMakeHandlers();

      // 1. Session with Furniture Designer lacking manage_global_product_attributes
      const unauthorizedSession: UserSession = {
        userId: 99,
        username: 'designer_no_perm',
        role: 'furniture_designer',
        fullName: 'Designer Bob',
        permissions: { write_make_catalog: true },
        authExpiresAt: Date.now() + 3600000
      };

      vi.spyOn(SessionManager, 'getSession').mockReturnValue(unauthorizedSession);

      const saveGlobalAttrHandler = mockIpcHandlers['make-save-global-attribute'];
      expect(saveGlobalAttrHandler).toBeDefined();

      const resultUnauthorized = await saveGlobalAttrHandler({}, {
        type: 'category',
        name: 'Forbidden Category'
      });

      expect(resultUnauthorized.success).toBe(false);
      expect(resultUnauthorized.error).toContain('manage_global_product_attributes');

      // Category deletion also denied
      const deleteCatHandler = mockIpcHandlers['make-delete-category'];
      const delUnauthorized = await deleteCatHandler({}, 5);
      expect(delUnauthorized.success).toBe(false);
      expect(delUnauthorized.error).toContain('manage_global_product_attributes');

      // 2. Session with Furniture Designer WITH manage_global_product_attributes
      const authorizedSession: UserSession = {
        userId: 100,
        username: 'designer_with_perm',
        role: 'furniture_designer',
        fullName: 'Designer Alice',
        permissions: {
          write_make_catalog: true,
          manage_global_product_attributes: true
        },
        authExpiresAt: Date.now() + 3600000
      };

      vi.spyOn(SessionManager, 'getSession').mockReturnValue(authorizedSession);

      const resultAuthorized = await saveGlobalAttrHandler({}, {
        type: 'category',
        name: 'Allowed Global Category'
      });

      expect(resultAuthorized.success).toBe(true);
      expect(resultAuthorized.attribute).toBeDefined();
    });

    it('main process rejects unauthorized users attempting to modify global specs/sizes/colors', async () => {
      registerMakeHandlers();

      const unauthorizedSession: UserSession = {
        userId: 99,
        username: 'designer_no_perm',
        role: 'furniture_designer',
        fullName: 'Designer Bob',
        permissions: { write_make_catalog: true },
        authExpiresAt: Date.now() + 3600000
      };

      vi.spyOn(SessionManager, 'getSession').mockReturnValue(unauthorizedSession);

      // make-save-spec for global spec (product_id: null)
      const saveSpecHandler = mockIpcHandlers['make-save-spec'];
      await expect(saveSpecHandler({}, {
        product_id: null,
        spec_name: 'Global Brass Inlay'
      })).rejects.toThrow('manage_global_product_attributes');

      // make-save-size for global size (product_id: null)
      const saveSizeHandler = mockIpcHandlers['make-save-size'];
      await expect(saveSizeHandler({}, {
        product_id: null,
        size_label: 'Global King Size'
      })).rejects.toThrow('manage_global_product_attributes');

      // make-save-color for global color (product_id: null)
      const saveColorHandler = mockIpcHandlers['make-save-color'];
      await expect(saveColorHandler({}, {
        product_id: null,
        color_name: 'Global Walnut Color'
      })).rejects.toThrow('manage_global_product_attributes');
    });

    // ══════════════════════════════════════════════════════════════════════════════
    // REGRESSION SUITE: Global Attribute size_label handling for Furniture Designer
    // ══════════════════════════════════════════════════════════════════════════════
    describe('Global Attribute Creation & size_label Regression Tests (Yousuf / Furniture Designer)', () => {
      beforeEach(() => {
        registerMakeHandlers();
      });

      const designerSession: UserSession = {
        userId: 101,
        username: 'yousuf',
        role: 'furniture_designer',
        fullName: 'Yousuf',
        permissions: {
          write_make_catalog: true,
          manage_global_product_attributes: true
        },
        authExpiresAt: Date.now() + 3600000
      };

      it('A. Furniture Designer creates a normal Global Attribute with no size_label (or null) -> succeeds and writes SQL NULL', async () => {
        vi.spyOn(SessionManager, 'getSession').mockReturnValue(designerSession);
        const saveGlobalAttrHandler = mockIpcHandlers['make-save-global-attribute'];

        // Simulate renderer sending payload where size_label was null or omitted, with dimensions provided
        const payloadWithNull = {
          type: 'size',
          size_label: null,
          length: 1800,
          width: 900,
          height: 750,
          unit: 'mm',
          is_active: true
        };

        const res = await saveGlobalAttrHandler({}, payloadWithNull);
        expect(res.success).toBe(true);
        expect(res.error).toBeUndefined();

        // Verify DB payload written: size_label must be strictly primitive null (never "null" string)
        const chain = (supabase.from as any)('make_product_sizes');
        const lastInsert = chain.insert.mock.calls[chain.insert.mock.calls.length - 1][0];
        expect(lastInsert.size_label).toBeNull();
        expect(lastInsert.size_label).not.toBe('null');
        expect(lastInsert.size_label).not.toBe('undefined');
        expect(lastInsert.length).toBe(1800);
        expect(lastInsert.width).toBe(900);
        expect(lastInsert.height).toBe(750);

        // Also test with completely omitted size_label
        const payloadOmitted = {
          type: 'size',
          length: 2000,
          width: 1000,
          height: 750,
          unit: 'mm',
          is_active: true
        };
        const res2 = await saveGlobalAttrHandler({}, payloadOmitted);
        expect(res2.success).toBe(true);

        const lastInsert2 = chain.insert.mock.calls[chain.insert.mock.calls.length - 1][0];
        expect(lastInsert2.size_label).toBeNull();
        expect(lastInsert2.size_label).not.toBe('null');
      });

      it('B. Furniture Designer creates a Global Attribute with a valid size_label -> succeeds', async () => {
        vi.spyOn(SessionManager, 'getSession').mockReturnValue(designerSession);
        const saveGlobalAttrHandler = mockIpcHandlers['make-save-global-attribute'];

        const payload = {
          type: 'size',
          size_label: 'Standard King Bed',
          length: 2000,
          width: 1800,
          height: 1100,
          unit: 'mm',
          is_active: true
        };

        const res = await saveGlobalAttrHandler({}, payload);
        expect(res.success).toBe(true);
        expect(res.attribute).toBeDefined();
      });

      it('C. Invalid non-string size_label is rejected cleanly with validation error', async () => {
        vi.spyOn(SessionManager, 'getSession').mockReturnValue(designerSession);
        const saveGlobalAttrHandler = mockIpcHandlers['make-save-global-attribute'];

        // Number size_label
        const resNum = await saveGlobalAttrHandler({}, {
          type: 'size',
          size_label: 12345,
          length: 2000,
          width: 1800
        });
        expect(resNum.success).toBe(false);
        expect(resNum.error).toContain('expected string');

        // Object size_label
        const resObj = await saveGlobalAttrHandler({}, {
          type: 'size',
          size_label: { label: 'invalid' },
          length: 2000
        });
        expect(resObj.success).toBe(false);
        expect(resObj.error).toContain('expected string');
      });

      it('D. Unauthorized roles remain strictly blocked from saving global attributes', async () => {
        const saveGlobalAttrHandler = mockIpcHandlers['make-save-global-attribute'];

        // 1. Salesperson role
        vi.spyOn(SessionManager, 'getSession').mockReturnValue({
          userId: 200,
          username: 'sales_user',
          role: 'salesperson',
          fullName: 'Sales Person',
          permissions: { read_make: true },
          authExpiresAt: Date.now() + 3600000
        });
        const resSales = await saveGlobalAttrHandler({}, {
          type: 'size',
          size_label: 'Hacked Size',
          length: 1000
        });
        expect(resSales.success).toBe(false);
        expect(resSales.error).toContain('manage_global_product_attributes');

        // 2. Designer WITHOUT manage_global_product_attributes permission
        vi.spyOn(SessionManager, 'getSession').mockReturnValue({
          userId: 201,
          username: 'designer_restricted',
          role: 'furniture_designer',
          fullName: 'Restricted Designer',
          permissions: { write_make_catalog: true },
          authExpiresAt: Date.now() + 3600000
        });
        const resDesignerRestricted = await saveGlobalAttrHandler({}, {
          type: 'size',
          length: 1200
        });
        expect(resDesignerRestricted.success).toBe(false);
        expect(resDesignerRestricted.error).toContain('manage_global_product_attributes');
      });

      it('E. Editing an existing Global Attribute does not regress', async () => {
        vi.spyOn(SessionManager, 'getSession').mockReturnValue(designerSession);
        const saveGlobalAttrHandler = mockIpcHandlers['make-save-global-attribute'];

        // Edit size (with id: 50)
        const updateSizePayload = {
          type: 'size',
          id: 50,
          size_label: 'Updated Executive Desk',
          length: 2200,
          width: 1100,
          height: 750,
          unit: 'mm',
          is_active: true
        };
        const resSize = await saveGlobalAttrHandler({}, updateSizePayload);
        expect(resSize.success).toBe(true);

        // Edit category (with id: 10)
        const updateCatPayload = {
          type: 'category',
          id: 10,
          name: 'Updated Category Name',
          code: 'CAT-UPD'
        };
        const resCat = await saveGlobalAttrHandler({}, updateCatPayload);
        expect(resCat.success).toBe(true);

        // Edit spec (with id: 25)
        const updateSpecPayload = {
          type: 'spec',
          id: 25,
          spec_name: 'Updated Specification'
        };
        const resSpec = await saveGlobalAttrHandler({}, updateSpecPayload);
        expect(resSpec.success).toBe(true);

        // Edit color (with id: 35)
        const updateColorPayload = {
          type: 'color',
          id: 35,
          color_name: 'Updated Color'
        };
        const resColor = await saveGlobalAttrHandler({}, updateColorPayload);
        expect(resColor.success).toBe(true);
      });
    });
  });
});
