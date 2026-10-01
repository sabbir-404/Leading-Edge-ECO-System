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
  notes?: string;
  attachedFile?: {
    name: string;
    url?: string;
    type: string;
    previewUrl?: string;
  } | null;
}

export interface PlaceOrderDraftData {
  priority?: string;
  targetDeliveryDate?: string;
  requestedDeliveryDate?: string;
  selectedSalesmanId?: string;
  
  // Customer & Delivery info
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
  customItemSpec?: string;

  // Cart & Attachments
  cartItems?: CartItemDraft[];
  invoiceAttachments?: { name: string; url: string }[];

  updatedAt?: number;
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
  return false;
}
