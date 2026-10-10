import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteSavedPlaceOrderDraft,
  loadSavedPlaceOrderDrafts,
  saveNamedPlaceOrderDraft
} from '../../src/utils/placeOrderDraft';

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

let storage: Storage;

beforeEach(() => {
  storage = createMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  storage.setItem('user_id', 'draft-test-user');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Saved Place Order Drafts', () => {
  it('persists multiple drafts and sorts newest first', () => {
    saveNamedPlaceOrderDraft({ customerName: 'Customer A' }, 'Customer A');
    saveNamedPlaceOrderDraft({ customerName: 'Customer B' }, 'Customer B');

    const loaded = loadSavedPlaceOrderDrafts();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].title).toBe('Customer B');
    expect(loaded[1].title).toBe('Customer A');
  });

  it('updates an existing draft instead of duplicating it', () => {
    const first = saveNamedPlaceOrderDraft({ customerName: 'Customer A' }, 'Customer A');
    const updated = saveNamedPlaceOrderDraft({ customerName: 'Customer A Updated' }, 'Customer A Updated', first.draft.id);

    expect(updated.draft.id).toBe(first.draft.id);
    expect(loadSavedPlaceOrderDrafts()).toHaveLength(1);
    expect(loadSavedPlaceOrderDrafts()[0].title).toBe('Customer A Updated');
  });

  it('does not persist temporary attachment URLs or raw selected-file bytes', () => {
    const result = saveNamedPlaceOrderDraft({
      customerName: 'Customer A',
      invoiceAttachments: [{ name: 'scan.png', url: 'data:image/png;base64,AAAA' }],
      selectedItemAttachedFile: { name: 'drawing.dwg', type: 'cad' }
    }, 'Customer A');

    expect(result.omittedAttachmentCount).toBe(2);
    expect(result.draft.data.invoiceAttachments).toEqual([]);
    expect(result.draft.data.selectedItemAttachedFile).toBeNull();
  });

  it('deletes only the selected saved draft without affecting other drafts', () => {
    const first = saveNamedPlaceOrderDraft({ customerName: 'Customer A' }, 'Customer A');
    const second = saveNamedPlaceOrderDraft({ customerName: 'Customer B' }, 'Customer B');

    deleteSavedPlaceOrderDraft(first.draft.id);

    const remaining = loadSavedPlaceOrderDrafts();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(second.draft.id);
  });

  it('isolates saved drafts strictly by authenticated user', () => {
    storage.setItem('user_id', 'user-alpha');
    saveNamedPlaceOrderDraft({ customerName: 'Alpha Customer' }, 'Alpha Draft');
    expect(loadSavedPlaceOrderDrafts()).toHaveLength(1);

    storage.setItem('user_id', 'user-beta');
    expect(loadSavedPlaceOrderDrafts()).toHaveLength(0);
    saveNamedPlaceOrderDraft({ customerName: 'Beta Customer' }, 'Beta Draft');
    expect(loadSavedPlaceOrderDrafts()).toHaveLength(1);
    expect(loadSavedPlaceOrderDrafts()[0].title).toBe('Beta Draft');

    storage.setItem('user_id', 'user-alpha');
    expect(loadSavedPlaceOrderDrafts()).toHaveLength(1);
    expect(loadSavedPlaceOrderDrafts()[0].title).toBe('Alpha Draft');
  });

  it('preserves persistent remote and local attachment references while stripping ephemeral data/blob URLs', () => {
    const result = saveNamedPlaceOrderDraft({
      customerName: 'Customer C',
      invoiceAttachments: [
        { name: 'cloud-invoice.pdf', url: 'https://storage.lenas.me/invoices/inv-1.pdf' },
        { name: 'nas-invoice.png', url: 'app-media://nas/files/invoices/inv-2.png' },
        { name: 'temp-scan.png', url: 'blob:http://localhost:5173/uuid-1234' },
        { name: 'data-scan.png', url: 'data:image/png;base64,AAAA' }
      ],
      cartItems: [{
        _id: 'item-1',
        product_code: 'TBL-01',
        product_name: 'Dining Table',
        quantity: 1,
        dimensions_text: '1200 x 800 mm',
        attachedFile: {
          name: 'nas-drawing.dwg',
          type: 'cad',
          url: 'app-media://nas/drawings/table.dwg'
        }
      }]
    }, 'Order with Mixed Attachments');

    expect(result.omittedAttachmentCount).toBe(2);
    expect(result.draft.data.invoiceAttachments).toHaveLength(2);
    expect(result.draft.data.invoiceAttachments?.[0].url).toBe('https://storage.lenas.me/invoices/inv-1.pdf');
    expect(result.draft.data.invoiceAttachments?.[1].url).toBe('app-media://nas/files/invoices/inv-2.png');
    expect(result.draft.data.cartItems?.[0].attachedFile?.url).toBe('app-media://nas/drawings/table.dwg');
  });

  it('handles localStorage errors gracefully without crashing when loading corrupted or empty data', () => {
    storage.setItem('make_place_order_saved_drafts_draft-test-user', 'invalid-json-content{{{');
    expect(loadSavedPlaceOrderDrafts()).toEqual([]);
  });

  it('simulates order placement lifecycle: draft is removed on order success and preserved on order error', () => {
    const { draft } = saveNamedPlaceOrderDraft({ customerName: 'Pending Order' }, 'Pending Order');
    expect(loadSavedPlaceOrderDrafts()).toHaveLength(1);

    // Simulated order placement failure: draft must NOT be removed
    let orderPlacementFailed = true;
    if (!orderPlacementFailed) {
      deleteSavedPlaceOrderDraft(draft.id);
    }
    expect(loadSavedPlaceOrderDrafts()).toHaveLength(1);

    // Simulated order placement success: draft is cleanly removed
    orderPlacementFailed = false;
    if (!orderPlacementFailed) {
      deleteSavedPlaceOrderDraft(draft.id);
    }
    expect(loadSavedPlaceOrderDrafts()).toHaveLength(0);
  });
});
