/**
 * placeOrderDraft.ts — Client-side draft buffer for MAKE Place Order.
 *
 * Preserves user-entered order details across page navigation:
 *  - Customer info, phone, address, remarks
 *  - Selected products, cart items, specs, sizes, colors
 *  - Delivery dates, priority, invoice attachments
 * Scoped safely per user so one user's draft never appears for another user.
 * Automatically cleared only after successful order submission or explicit user action.
 */

export interface CartItemDraft {
  _id: string;
  product_id?: number;
  product_code: string;
  product_name: string;
  spec_id?: number;
  spec_name?: string;
  spec_details?: string;
  size_id?: number;
  dimensions_text: string;
  is_customized?: boolean;
  custom_dimensions?: string;
  color_id?: number;
  color_name?: string;
  color_code?: string;
  quantity: number;
  item_cost_price?: number | string;
  item_sale_price?: number | string | null;
  max_discount_type?: 'percent' | 'amount' | null;
  max_discount_value?: number | null;
  discount_type?: 'percent' | 'amount' | null;
  discount_value?: number | string | null;
  discount_amount?: number | null;
  final_item_price?: number | null;
  notes?: string;
  attachedFile?: {
    name: string;
    url?: string;
    uploadId?: string;
    type: string;
    previewUrl?: string;
  } | null;
}

export interface PlaceOrderDraftData {
  priority?: string;
  targetDeliveryDate?: string;
  requestedDeliveryDate?: string;
  targetDeliveryDays?: number | string | null;
  requestedDeliveryDays?: number | string | null;
  orderPlacementDate?: string | null;
  selectedSalesmanId?: string;
  
  // Customer & Delivery info
  selectedCustomerId?: number | null;
  selectedCustomerInfo?: {
    id: number;
    name: string;
    phone?: string | null;
    email?: string | null;
    company?: string | null;
    address?: string | null;
  } | null;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  shippingAddress?: string;
  locationLandmark?: string;
  receiverName?: string;
  receiverPhone?: string;
  specialInstructions?: string;

  // Selected item form state (in progress before adding to cart)
  selectedProductId?: number | null;
  selectedProduct?: any | null;
  selectedSpecId?: number | null;
  selectedSizeId?: number | null;
  selectedColorId?: number | null;
  itemQuantity?: number;
  itemCostPrice?: number | string;
  itemSalePrice?: number | string;
  itemRemarks?: string;
  selectedItemAttachedFile?: { name: string; url?: string; uploadId?: string; type: string } | null;

  // Custom size/spec/color toggles
  isCustomSize?: boolean;
  customShape?: 'rect' | 'round';
  customLength?: string;
  customWidth?: string;
  customHeight?: string;
  customDiameter?: string;
  customUnit?: string;

  isCustomSpec?: boolean;
  customSpecName?: string;

  isCustomColor?: boolean;
  customColorName?: string;

  isCustomItemMode?: boolean;
  customItemName?: string;
  customItemSize?: string;
  customItemSpec?: string;

  // Cart & Attachments
  cartItems?: CartItemDraft[];
  invoiceAttachments?: { name: string; url: string; isPending?: boolean }[];

  // Order Discount
  discountType?: 'percent' | 'amount';
  discountValue?: number | string;
  moneyReceived?: number | string;

  updatedAt?: number;
}


export interface SavedPlaceOrderDraft {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  data: PlaceOrderDraftData;
}

function getSavedPlaceOrderDraftsStorageKey(): string {
  return getPlaceOrderDraftStorageKey().replace(
    /^make_place_order_draft_/,
    'make_place_order_saved_drafts_'
  );
}

export function getPersistentAttachmentReference(url?: string | null): string | undefined {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value || /^(data:|blob:)/i.test(value)) return undefined;

  // Supabase storage URLs (signed or public) for make-order-files -> extract durable key
  const sbMatch = value.match(/(?:supabase\.co|\/storage\/v1)\/object\/(?:sign|public)\/make-order-files\/([^?#]+)/i);
  if (sbMatch) {
    const rawKey = decodeURIComponent(sbMatch[1]).replace(/^\/+/, '');
    return `make-order-files/${rawKey}`;
  }

  // Supabase URI scheme
  if (/^supabase:\/\/make-order-files\//i.test(value)) {
    const rawKey = value.replace(/^supabase:\/\/make-order-files\//i, '').split('?')[0].replace(/^\/+/, '');
    return `make-order-files/${rawKey}`;
  }

  // Durable key
  if (/^make-order-files\//i.test(value)) {
    return value.split('?')[0];
  }

  // Confirmed TrueNAS URLs
  if (/^https?:\/\/(storage\.lenas\.me|100\.88\.85\.6|192\.168\.1\.14)/i.test(value)) {
    return value;
  }

  // If another HTTP URL with token= parameter is detected, strip query params to prevent persisting ephemeral tokens
  if (/^https?:\/\//i.test(value)) {
    if (value.includes('token=')) {
      return value.split('?')[0];
    }
    return value;
  }

  if (/^(app-media:\/\/|file:\/\/)/i.test(value)) return value;
  if (/^[a-z]:[\\/]/i.test(value) || /^\/(?!\/)/.test(value)) return value;
  if (/^upl_[0-9]+_[0-9a-f]+/i.test(value)) return value;

  return undefined;
}

/** Load all user-scoped, explicitly saved order drafts (newest first). */
export function loadSavedPlaceOrderDrafts(): SavedPlaceOrderDraft[] {
  try {
    const raw = localStorage.getItem(getSavedPlaceOrderDraftsStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item: any) => item && typeof item.id === 'string' && item.data && typeof item.data === 'object')
      .sort((a: SavedPlaceOrderDraft, b: SavedPlaceOrderDraft) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.warn('[PlaceOrderDraft] Failed to load saved drafts:', err);
    return [];
  }
}

/**
 * Save or update one named draft. Ephemeral blob/data URLs and raw file bytes
 * are deliberately excluded so a draft cannot exhaust localStorage or retain
 * an attachment that will not survive an app restart.
 */
export function saveNamedPlaceOrderDraft(
  data: PlaceOrderDraftData,
  title: string,
  draftId?: string
): { draft: SavedPlaceOrderDraft; omittedAttachmentCount: number } {
  const existing = loadSavedPlaceOrderDrafts();
  const current = draftId ? existing.find(item => item.id === draftId) : undefined;
  const now = Date.now();
  let omittedAttachmentCount = 0;

  const cartItems = Array.isArray(data.cartItems)
    ? data.cartItems.map((item: any) => {
        if (!item?.attachedFile) return item;
        const url = getPersistentAttachmentReference(item.attachedFile.url);
        if (!url) {
          omittedAttachmentCount += 1;
          return { ...item, attachedFile: null };
        }
        return {
          ...item,
          attachedFile: {
            name: item.attachedFile.name,
            type: item.attachedFile.type,
            url,
            uploadId: item.attachedFile.uploadId
          }
        };
      })
    : data.cartItems;

  const invoiceAttachments = Array.isArray(data.invoiceAttachments)
    ? data.invoiceAttachments.flatMap((attachment: any) => {
        const url = getPersistentAttachmentReference(attachment?.url);
        if (!url) {
          omittedAttachmentCount += 1;
          return [];
        }
        return [{ name: attachment.name || 'Attachment', url }];
      })
    : data.invoiceAttachments;

  let selectedItemAttachedFile = data.selectedItemAttachedFile;
  if (selectedItemAttachedFile) {
    const url = getPersistentAttachmentReference(selectedItemAttachedFile.url);
    if (!url) {
      omittedAttachmentCount += 1;
      selectedItemAttachedFile = null;
    } else {
      selectedItemAttachedFile = {
        name: selectedItemAttachedFile.name,
        type: selectedItemAttachedFile.type,
        url,
        uploadId: selectedItemAttachedFile.uploadId
      };
    }
  }

  const cleanedData: PlaceOrderDraftData = {
    ...data,
    cartItems,
    invoiceAttachments,
    selectedItemAttachedFile
  };

  const saved: SavedPlaceOrderDraft = {
    id: current?.id || ('draft_' + now + '_' + Math.random().toString(36).slice(2, 8)),
    title: (title || '').trim() || 'Untitled order',
    createdAt: current?.createdAt || now,
    updatedAt: now,
    data: cleanedData
  };

  const next = current
    ? existing.map(item => item.id === current.id ? saved : item)
    : [saved, ...existing];

  try {
    localStorage.setItem(getSavedPlaceOrderDraftsStorageKey(), JSON.stringify(next));
  } catch (err) {
    console.warn('[PlaceOrderDraft] Failed to save named draft:', err);
    throw err;
  }

  return { draft: saved, omittedAttachmentCount };
}

/** Remove one explicitly saved draft without touching the current form autosave. */
export function deleteSavedPlaceOrderDraft(draftId: string): void {
  try {
    const next = loadSavedPlaceOrderDrafts().filter(item => item.id !== draftId);
    localStorage.setItem(getSavedPlaceOrderDraftsStorageKey(), JSON.stringify(next));
  } catch (err) {
    console.warn('[PlaceOrderDraft] Failed to delete saved draft:', err);
  }
}


/**
 * Derives a storage key safely scoped to the currently authenticated user.
 */
export function getPlaceOrderDraftStorageKey(): string {
  try {
    const rawUser = localStorage.getItem('user');
    let userId = '';
    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser);
        userId = parsed.id || parsed.username || '';
      } catch {}
    }
    if (!userId) {
      userId = localStorage.getItem('user_id') || localStorage.getItem('user_name') || 'default_user';
    }
    return `make_place_order_draft_${userId}`;
  } catch {
    return 'make_place_order_draft_default_user';
  }
}

/**
 * Loads the current user's Place Order draft from storage.
 */
export function loadPlaceOrderDraft(): PlaceOrderDraftData {
  try {
    const key = getPlaceOrderDraftStorageKey();
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as PlaceOrderDraftData;
  } catch (err) {
    console.warn('[PlaceOrderDraft] Failed to load draft:', err);
    return {};
  }
}

/**
 * Saves or merges changes into the current user's Place Order draft.
 * CRITICAL ARCHITECTURAL SAFETY:
 * Strips large binary data (base64) and ephemeral blob URLs from attachments before
 * writing to localStorage to prevent localStorage quota exhaustion (5MB browser limit).
 * Only safe metadata references (file name, type, uploaded remote URL) are persisted.
 */
export function savePlaceOrderDraft(partial: Partial<PlaceOrderDraftData>): void {
  try {
    const key = getPlaceOrderDraftStorageKey();
    const existing = loadPlaceOrderDraft();

    // Sanitize cart items attachments to prevent storing raw binary base64
    let sanitizedCartItems = partial.cartItems !== undefined ? partial.cartItems : existing.cartItems;
    if (Array.isArray(sanitizedCartItems)) {
      sanitizedCartItems = sanitizedCartItems.map(item => {
        if (!item.attachedFile) return item;
        const { base64, previewUrl, ...safeFile } = item.attachedFile as any;
        return {
          ...item,
          attachedFile: safeFile
        };
      });
    }

    const merged: PlaceOrderDraftData = {
      ...existing,
      ...partial,
      cartItems: sanitizedCartItems,
      updatedAt: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(merged));
  } catch (err) {
    console.warn('[PlaceOrderDraft] Failed to save draft:', err);
  }
}

/**
 * Permanently removes the current user's Place Order draft.
 */
export function clearPlaceOrderDraft(): void {
  try {
    const key = getPlaceOrderDraftStorageKey();
    localStorage.removeItem(key);
  } catch (err) {
    console.warn('[PlaceOrderDraft] Failed to clear draft:', err);
  }
}

/**
 * Evaluates whether there is meaningful user-entered content in the draft.
 */
export function hasMeaningfulPlaceOrderDraft(draft?: PlaceOrderDraftData): boolean {
  const d = draft !== undefined ? draft : loadPlaceOrderDraft();
  if (d.customerName && d.customerName.trim().length > 0) return true;
  if (d.customerPhone && d.customerPhone.trim().length > 0) return true;
  if (d.customerEmail && d.customerEmail.trim().length > 0) return true;
  if (d.shippingAddress && d.shippingAddress.trim().length > 0) return true;
  if (d.specialInstructions && d.specialInstructions.trim().length > 0) return true;
  if (Array.isArray(d.cartItems) && d.cartItems.length > 0) return true;
  if (Array.isArray(d.invoiceAttachments) && d.invoiceAttachments.length > 0) return true;
  if (d.selectedProduct || d.customItemName) return true;
  if (d.targetDeliveryDate && d.targetDeliveryDate.trim().length > 0) return true;
  if (d.discountValue !== undefined && d.discountValue !== null && String(d.discountValue).trim().length > 0) return true;
  return false;
}
