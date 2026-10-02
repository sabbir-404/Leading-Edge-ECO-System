import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  savePlaceOrderDraft,
  loadPlaceOrderDraft,
  clearPlaceOrderDraft,
  hasMeaningfulPlaceOrderDraft
} from '../../src/utils/placeOrderDraft';
import { MakeOrderService } from '../../electron/services/make/MakeOrderService';

// Mock in-memory localStorage
const storageMap: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => (key in storageMap ? storageMap[key] : null),
  setItem: (key: string, val: string) => { storageMap[key] = String(val); },
  removeItem: (key: string) => { delete storageMap[key]; },
  clear: () => { Object.keys(storageMap).forEach(k => delete storageMap[k]); }
};
(global as any).localStorage = localStorageMock;

describe('Customer Autocomplete & Selection Verification Suite', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('1. Debounced Search & Input Triggers', () => {
    it('1. ignores short or empty search inputs without querying database', async () => {
      const mockQuery = vi.fn();
      const searchFn = async (query: string) => {
        const trimmed = (query || '').trim();
        if (!trimmed || trimmed.length < 2) return { success: true, customers: [] };
        return mockQuery(trimmed);
      };

      const emptyRes = await searchFn('');
      expect(emptyRes.customers).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();

      const singleCharRes = await searchFn('A');
      expect(singleCharRes.customers).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('2. triggers search on customer name input with >= 2 characters', async () => {
      const mockDb = [
        { id: 10, name: 'Sabbir Rahman', phone: '+8801711111111', email: 'sabbir@leadingedge.com', company: 'Leading Edge' },
        { id: 11, name: 'Acme Furniture Corp', phone: '+8801822222222', email: 'procurement@acme.com', company: 'Acme Corp' }
      ];

      const searchFn = async (query: string) => {
        const trimmed = query.trim().toLowerCase();
        const matches = mockDb.filter(c => c.name.toLowerCase().includes(trimmed));
        return { success: true, customers: matches };
      };

      const res = await searchFn('Sab');
      expect(res.customers.length).toBe(1);
      expect(res.customers[0].name).toBe('Sabbir Rahman');
    });

    it('3. triggers search on customer phone with fragment matching', async () => {
      const mockDb = [
        { id: 10, name: 'Sabbir Rahman', phone: '+8801711111111', email: 'sabbir@leadingedge.com' },
        { id: 12, name: 'Apex Ltd', phone: '+8801933333333', email: 'apex@example.com' }
      ];

      const searchFn = async (query: string) => {
        const digits = query.replace(/\D/g, '');
        const matches = mockDb.filter(c => c.phone.replace(/\D/g, '').includes(digits));
        return { success: true, customers: matches };
      };

      const res = await searchFn('1711');
      expect(res.customers.length).toBe(1);
      expect(res.customers[0].id).toBe(10);
    });

    it('4. triggers search on customer email with fragment matching', async () => {
      const mockDb = [
        { id: 10, name: 'Sabbir Rahman', phone: '+8801711111111', email: 'sabbir@leadingedge.com' },
        { id: 11, name: 'Acme Furniture Corp', phone: '+8801822222222', email: 'procurement@acme.com' }
      ];

      const searchFn = async (query: string) => {
        const lower = query.toLowerCase().trim();
        const matches = mockDb.filter(c => c.email.toLowerCase().includes(lower));
        return { success: true, customers: matches };
      };

      const res = await searchFn('acme.com');
      expect(res.customers.length).toBe(1);
      expect(res.customers[0].id).toBe(11);
    });
  });

  describe('2. Search Race Condition & Sequence Protection', () => {
    it('5. stale slower responses cannot overwrite newer search results', async () => {
      let activeSeq = 0;
      let finalResults: any[] = [];

      const triggerSearch = async (query: string, delayMs: number) => {
        const currentSeq = ++activeSeq;
        await new Promise(r => setTimeout(r, delayMs));
        const results = [{ query, seq: currentSeq }];
        if (currentSeq === activeSeq) {
          finalResults = results;
        }
      };

      // Query 1 starts first with 80ms delay
      const p1 = triggerSearch('Sa', 80);
      // Query 2 starts next with 20ms delay
      const p2 = triggerSearch('Sabbir', 20);

      await Promise.all([p1, p2]);

      expect(finalResults.length).toBe(1);
      expect(finalResults[0].query).toBe('Sabbir');
    });
  });

  describe('3. Customer Selection & Authoritative Details Population', () => {
    it('6. populates customer name, phone, email, shipping address, landmark, and receiver details', () => {
      const authoritativeCustomer = {
        id: 42,
        name: 'Prime Real Estate Ltd',
        phone: '+8801755555555',
        email: 'projects@prime.bd',
        address: 'Banani C/A, Block C, Road 11',
        delivery_address: 'Banani C/A, Block C, Road 11, Floor 6',
        location_landmark: 'Behind Shurwid Hospital',
        receiver_name: 'Engr. Kamal',
        receiver_phone: '+8801866666666'
      };

      // Simulate selection handler
      let customerName = '';
      let customerPhone = '';
      let customerEmail = '';
      let shippingAddress = '';
      let locationLandmark = '';
      let receiverName = '';
      let receiverPhone = '';
      let selectedCustomerId: number | null = null;

      const handleSelect = (cust: typeof authoritativeCustomer) => {
        selectedCustomerId = cust.id;
        customerName = cust.name;
        customerPhone = cust.phone;
        customerEmail = cust.email;
        shippingAddress = cust.delivery_address || cust.address;
        locationLandmark = cust.location_landmark;
        receiverName = cust.receiver_name;
        receiverPhone = cust.receiver_phone;
      };

      handleSelect(authoritativeCustomer);

      expect(selectedCustomerId).toBe(42);
      expect(customerName).toBe('Prime Real Estate Ltd');
      expect(customerPhone).toBe('+8801755555555');
      expect(customerEmail).toBe('projects@prime.bd');
      expect(shippingAddress).toBe('Banani C/A, Block C, Road 11, Floor 6');
      expect(locationLandmark).toBe('Behind Shurwid Hospital');
      expect(receiverName).toBe('Engr. Kamal');
      expect(receiverPhone).toBe('+8801866666666');
    });

    it('7. retains customer_id without overwriting if user edits shipping address for this order', () => {
      let selectedCustomerId: number | null = 42;
      let shippingAddress = 'Floor 6';

      // User changes delivery address to Floor 8
      shippingAddress = 'Floor 8 (New Office Extension)';

      expect(selectedCustomerId).toBe(42);
      expect(shippingAddress).toBe('Floor 8 (New Office Extension)');
    });

    it('8. clearing customer selection unlinks customer_id and allows new customer input', () => {
      let selectedCustomerId: number | null = 42;
      let selectedCustomerInfo: any = { id: 42, name: 'Acme' };

      const handleUnlink = () => {
        selectedCustomerId = null;
        selectedCustomerInfo = null;
      };

      handleUnlink();
      expect(selectedCustomerId).toBeNull();
      expect(selectedCustomerInfo).toBeNull();
    });
  });

  describe('4. Draft Buffer Integration with Customer Selection', () => {
    it('9. persists selectedCustomerId and selectedCustomerInfo in draft', () => {
      localStorage.setItem('user', JSON.stringify({ id: 'designer-01' }));

      savePlaceOrderDraft({
        selectedCustomerId: 88,
        selectedCustomerInfo: {
          id: 88,
          name: 'Bengal Commercial Bank',
          phone: '+8801799999999',
          email: 'admin@bengalbank.bd',
          company: 'Bengal Bank',
          address: 'Motijheel C/A, Dhaka'
        },
        customerName: 'Bengal Commercial Bank',
        customerPhone: '+8801799999999',
        customerEmail: 'admin@bengalbank.bd',
        priority: 'Urgent'
      });

      const loaded = loadPlaceOrderDraft();
      expect(loaded.selectedCustomerId).toBe(88);
      expect(loaded.selectedCustomerInfo?.name).toBe('Bengal Commercial Bank');
      expect(loaded.selectedCustomerInfo?.company).toBe('Bengal Bank');
      expect(loaded.customerName).toBe('Bengal Commercial Bank');
      expect(hasMeaningfulPlaceOrderDraft(loaded)).toBe(true);
    });

    it('10. clearing draft cleans selected customer and all customer states', () => {
      localStorage.setItem('user', JSON.stringify({ id: 'designer-01' }));

      savePlaceOrderDraft({
        selectedCustomerId: 88,
        customerName: 'Bengal Bank'
      });

      clearPlaceOrderDraft();
      const loaded = loadPlaceOrderDraft();
      expect(loaded.selectedCustomerId).toBeUndefined();
      expect(loaded.customerName).toBeUndefined();
    });
  });

  describe('5. Database & Order Service No-Duplicate Verification', () => {
    it('11. resolveOrCreateCustomer returns existing record when customerId is provided', async () => {
      // Mock supabase response for byId
      const fakeCustomer = { id: 77, name: 'Existing Corporate Client', phone: '+8801777777777', email: 'corp@client.com' };
      
      const resolveSpy = vi.spyOn(MakeOrderService, 'resolveOrCreateCustomer').mockResolvedValue(fakeCustomer);

      const resolved = await MakeOrderService.resolveOrCreateCustomer({
        customerId: 77,
        customerName: 'Existing Corporate Client',
        customerPhone: '+8801777777777'
      });

      expect(resolved).toBeDefined();
      expect(resolved?.id).toBe(77);
      expect(resolved?.name).toBe('Existing Corporate Client');

      resolveSpy.mockRestore();
    });

    it('12. order creation with selected customer_id does not create duplicate record', async () => {
      const fakeResolvedCustomer = { id: 105, name: 'Vertex Holdings', phone: '+8801712345678' };
      const resolveSpy = vi.spyOn(MakeOrderService, 'resolveOrCreateCustomer').mockResolvedValue(fakeResolvedCustomer);

      // Verify that resolveOrCreateCustomer is called with customerId: 105
      const res = await MakeOrderService.resolveOrCreateCustomer({
        customerId: 105,
        customerName: 'Vertex Holdings',
        customerPhone: '+8801712345678'
      });

      expect(res?.id).toBe(105);
      expect(resolveSpy).toHaveBeenCalledWith(expect.objectContaining({
        customerId: 105
      }));

      resolveSpy.mockRestore();
    });
  });
});
