import { describe, it, expect, beforeEach } from 'vitest';
import {
  savePlaceOrderDraft,
  loadPlaceOrderDraft,
  clearPlaceOrderDraft,
  hasMeaningfulPlaceOrderDraft,
  getPlaceOrderDraftStorageKey
} from '../../src/utils/placeOrderDraft';

// Provide in-memory localStorage mock for node test runner
const storageMap: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => (key in storageMap ? storageMap[key] : null),
  setItem: (key: string, val: string) => { storageMap[key] = String(val); },
  removeItem: (key: string) => { delete storageMap[key]; },
  clear: () => { Object.keys(storageMap).forEach(k => delete storageMap[k]); }
};
(global as any).localStorage = localStorageMock;

describe('Place Order Draft Persistence — Issue 3 Fixes', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('1. User/Session Isolation', () => {
    it('scopes draft key per authenticated user', () => {
      localStorage.setItem('user', JSON.stringify({ id: 'user-designer-01', username: 'john' }));
      expect(getPlaceOrderDraftStorageKey()).toBe('make_place_order_draft_user-designer-01');

      localStorage.setItem('user', JSON.stringify({ id: 'user-sales-02', username: 'jane' }));
      expect(getPlaceOrderDraftStorageKey()).toBe('make_place_order_draft_user-sales-02');
    });

    it('falls back to default_user key when user is not present', () => {
      expect(getPlaceOrderDraftStorageKey()).toBe('make_place_order_draft_default_user');
    });

    it('keeps drafts isolated between two different users', () => {
      // User 1 logs in and saves a draft
      localStorage.setItem('user', JSON.stringify({ id: 'user-1' }));
      savePlaceOrderDraft({
        customerName: 'Customer One',
        priority: 'Urgent'
      });

      // User 2 logs in
      localStorage.setItem('user', JSON.stringify({ id: 'user-2' }));
      expect(loadPlaceOrderDraft()).toEqual({});

      savePlaceOrderDraft({
        customerName: 'Customer Two',
        priority: 'Low'
      });

      // User 1 returns
      localStorage.setItem('user', JSON.stringify({ id: 'user-1' }));
      const user1Draft = loadPlaceOrderDraft();
      expect(user1Draft.customerName).toBe('Customer One');
      expect(user1Draft.priority).toBe('Urgent');

      // User 2 returns
      localStorage.setItem('user', JSON.stringify({ id: 'user-2' }));
      const user2Draft = loadPlaceOrderDraft();
      expect(user2Draft.customerName).toBe('Customer Two');
      expect(user2Draft.priority).toBe('Low');
    });
  });

  describe('2. Comprehensive Draft Field Persistence', () => {
    it('persists customer details, dates, items, and attachments across navigation', () => {
      localStorage.setItem('user', JSON.stringify({ id: 'designer-42' }));

      savePlaceOrderDraft({
        customerName: 'Acme Corporation',
        customerPhone: '+8801700000000',
        customerEmail: 'orders@acme.corp',
        shippingAddress: 'Gulshan 2, Dhaka',
        locationLandmark: 'Near Westin Hotel',
        receiverName: 'Mr. Rahman',
        receiverPhone: '+8801800000000',
        priority: 'High',
        targetDeliveryDate: '2026-10-15',
        requestedDeliveryDate: '2026-10-20',
        specialInstructions: 'Handle with extreme care, fragile polish.',
        cartItems: [
          {
            _id: 'cart-1',
            product_id: 101,
            product_code: 'CHR-EXEC-01',
            product_name: 'Executive Ergonomic Chair',
            spec_id: 5,
            spec_name: 'Italian Leather Finish',
            dimensions_text: 'W: 600mm x D: 650mm x H: 1100mm',
            color_id: 8,
            color_name: 'Midnight Black',
            quantity: 4,
            item_cost_price: 15000,
            item_sale_price: 22000
          }
        ],
        invoiceAttachments: [
          { name: 'PO-9988.pdf', url: 'https://storage.lenas.me/invoices/PO-9988.pdf' }
        ]
      });

      // Reload draft (simulating page navigation or app reload)
      const loaded = loadPlaceOrderDraft();
      expect(loaded.customerName).toBe('Acme Corporation');
      expect(loaded.customerPhone).toBe('+8801700000000');
      expect(loaded.shippingAddress).toBe('Gulshan 2, Dhaka');
      expect(loaded.priority).toBe('High');
      expect(loaded.targetDeliveryDate).toBe('2026-10-15');
      expect(loaded.specialInstructions).toBe('Handle with extreme care, fragile polish.');
      expect(loaded.cartItems).toHaveLength(1);
      expect(loaded.cartItems?.[0].product_code).toBe('CHR-EXEC-01');
      expect(loaded.cartItems?.[0].quantity).toBe(4);
      expect(loaded.invoiceAttachments).toHaveLength(1);
      expect(loaded.invoiceAttachments?.[0].name).toBe('PO-9988.pdf');
    });

    it('accurately identifies meaningful drafts with hasMeaningfulPlaceOrderDraft', () => {
      expect(hasMeaningfulPlaceOrderDraft({})).toBe(false);
      expect(hasMeaningfulPlaceOrderDraft({ priority: 'Normal' })).toBe(false);

      expect(hasMeaningfulPlaceOrderDraft({ customerName: 'Alice' })).toBe(true);
      expect(hasMeaningfulPlaceOrderDraft({ customerPhone: '123' })).toBe(true);
      expect(hasMeaningfulPlaceOrderDraft({ shippingAddress: 'House 4' })).toBe(true);
      expect(hasMeaningfulPlaceOrderDraft({ cartItems: [{ _id: '1', product_code: 'P1', product_name: 'P1', dimensions_text: '', quantity: 1 }] })).toBe(true);
      expect(hasMeaningfulPlaceOrderDraft({ invoiceAttachments: [{ name: 'file.pdf', url: 'url' }] })).toBe(true);
    });

    it('clears draft completely upon order creation or user reset', () => {
      localStorage.setItem('user', JSON.stringify({ id: 'user-test' }));
      savePlaceOrderDraft({
        customerName: 'Order to be cleared',
        priority: 'Urgent'
      });

      expect(loadPlaceOrderDraft().customerName).toBe('Order to be cleared');

      // Clear draft
      clearPlaceOrderDraft();

      expect(loadPlaceOrderDraft()).toEqual({});
      expect(hasMeaningfulPlaceOrderDraft()).toBe(false);
    });

    it('works completely offline without requiring network or database connection', () => {
      // Simulate zero network connection
      savePlaceOrderDraft({
        customerName: 'Offline Customer',
        specialInstructions: 'Created while TrueNAS was disconnected'
      });

      const loaded = loadPlaceOrderDraft();
      expect(loaded.customerName).toBe('Offline Customer');
      expect(loaded.specialInstructions).toBe('Created while TrueNAS was disconnected');
    });

    it('J. Place Order draft with attachments strips large binary base64 and ephemeral blob URLs to protect localStorage quota', () => {
      localStorage.setItem('user', JSON.stringify({ id: 'cad-designer' }));

      // Large 2MB mock base64 binary CAD payload
      const hugeBase64Payload = 'A'.repeat(2 * 1024 * 1024);

      savePlaceOrderDraft({
        customerName: 'Mega Projects Ltd',
        cartItems: [
          {
            _id: 'cart-cad-1',
            product_code: 'WS-EXEC-01',
            product_name: 'Custom Executive Workstation',
            dimensions_text: '2400x1200x750mm',
            quantity: 2,
            attachedFile: {
              name: 'huge_cad_drawing.dwg',
              base64: hugeBase64Payload,
              type: 'cad',
              previewUrl: 'blob:http://localhost:5173/mock-blob-uuid-12345'
            } as any
          }
        ],
        invoiceAttachments: [
          { name: 'purchase_order_reference.pdf', url: 'https://storage.lenas.me/invoices/po-123.pdf' }
        ]
      });

      // Retrieve persisted draft
      const loaded = loadPlaceOrderDraft();
      expect(loaded.customerName).toBe('Mega Projects Ltd');
      expect(loaded.cartItems).toHaveLength(1);

      const savedAttachment = loaded.cartItems?.[0].attachedFile;
      expect(savedAttachment).toBeDefined();
      expect(savedAttachment?.name).toBe('huge_cad_drawing.dwg');
      expect(savedAttachment?.type).toBe('cad');

      // CRITICAL CHECK: base64 payload and blob previewUrl are stripped to prevent localStorage 5MB quota exhaustion
      expect((savedAttachment as any)?.base64).toBeUndefined();
      expect((savedAttachment as any)?.previewUrl).toBeUndefined();

      // Clear draft removes all draft keys while preserving database integrity
      clearPlaceOrderDraft();
      expect(loadPlaceOrderDraft()).toEqual({});
    });
  });
});
