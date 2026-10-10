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

  it('deletes only the selected saved draft', () => {
    const first = saveNamedPlaceOrderDraft({ customerName: 'Customer A' }, 'Customer A');
    const second = saveNamedPlaceOrderDraft({ customerName: 'Customer B' }, 'Customer B');

    deleteSavedPlaceOrderDraft(first.draft.id);

    const remaining = loadSavedPlaceOrderDrafts();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(second.draft.id);
  });
});
