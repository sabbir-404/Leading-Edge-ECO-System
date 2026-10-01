/**
 * productCatalogDraft.ts — Client-side draft buffer for MAKE Product Catalog.
 *
 * Preserves user-entered form, search, and filter inputs across page navigation.
 * Scoped safely per user so one user's draft cannot appear as another user's draft.
 * Does NOT automatically write to the database.
 */

export interface ProductFormDraft {
  product_code?: string;
  product_name?: string;
  description?: string;
  category_id?: number | null;
  category?: string | null;
  selectedCategoryIds?: (number | string)[];
  main_image?: string;
  is_active?: boolean;
  selectedSpecIds?: (number | string)[];
  selectedSizeIds?: (number | string)[];
  selectedColorIds?: (number | string)[];
  isOpen?: boolean;
  inlineNewAttrType?: 'category' | 'spec' | 'size' | 'color' | null;
  inlineAttrName?: string;
  inlineAttrExtra?: string;
}

export interface ProductCatalogDraftData {
  search?: string;
  historySearch?: string;
  catalogMainView?: 'products' | 'attributes';
  attrTab?: 'categories' | 'sizes' | 'colors' | 'specs';
  activeTab?: 'all' | 'specs' | 'sizes' | 'colors' | 'history';
  productForm?: ProductFormDraft;
  updatedAt?: number;
}

/**
 * Derives a storage key safely scoped to the currently authenticated user.
 */
export function getProductCatalogDraftStorageKey(): string {
  try {
    const rawUser = localStorage.getItem('user');
    let userId = '';
    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser);
        userId = parsed.id || parsed.username || '';
      } catch {
        // ignore JSON parse error
      }
    }
    if (!userId) {
      userId = localStorage.getItem('user_id') || localStorage.getItem('user_name') || 'default_user';
    }
    return `make_product_catalog_draft_${userId}`;
  } catch {
    return 'make_product_catalog_draft_default_user';
  }
}

/**
 * Loads the current user's draft from storage.
 */
export function loadProductCatalogDraft(): ProductCatalogDraftData {
  try {
    const key = getProductCatalogDraftStorageKey();
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as ProductCatalogDraftData;
  } catch (err) {
    console.warn('[ProductCatalogDraft] Failed to load draft:', err);
    return {};
  }
}

/**
 * Merges partial draft updates into the current user's draft.
 */
export function saveProductCatalogDraft(partial: Partial<ProductCatalogDraftData>): void {
  try {
    const key = getProductCatalogDraftStorageKey();
    const existing = loadProductCatalogDraft();
    const merged: ProductCatalogDraftData = {
      ...existing,
      ...partial,
      updatedAt: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(merged));
  } catch (err) {
    console.warn('[ProductCatalogDraft] Failed to save draft:', err);
  }
}

/**
 * Clears the product form draft specifically (e.g. after successful product creation/save).
 */
export function clearProductFormDraft(): void {
  try {
    const key = getProductCatalogDraftStorageKey();
    const existing = loadProductCatalogDraft();
    delete existing.productForm;
    existing.updatedAt = Date.now();
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (err) {
    console.warn('[ProductCatalogDraft] Failed to clear product form draft:', err);
  }
}

/**
 * Deliberately clears the entire product catalog draft for the current user.
 */
export function clearProductCatalogDraft(): void {
  try {
    const key = getProductCatalogDraftStorageKey();
    localStorage.removeItem(key);
  } catch (err) {
    console.warn('[ProductCatalogDraft] Failed to clear draft:', err);
  }
}

/**
 * Evaluates whether there is meaningful unsaved content in the draft.
 * Used to decide whether to confirm before clearing.
 */
export function hasMeaningfulDraftContent(draft?: ProductCatalogDraftData): boolean {
  const d = draft !== undefined ? draft : loadProductCatalogDraft();
  if (d.search && d.search.trim().length > 0) return true;
  if (d.historySearch && d.historySearch.trim().length > 0) return true;

  const pf = d.productForm;
  if (pf) {
    if (pf.product_code && pf.product_code.trim().length > 0) return true;
    if (pf.product_name && pf.product_name.trim().length > 0) return true;
    if (pf.description && pf.description.trim().length > 0) return true;
    if (pf.main_image && pf.main_image.trim().length > 0) return true;
    if (pf.category_id || (pf.category && pf.category.trim().length > 0)) return true;
    if (Array.isArray(pf.selectedCategoryIds) && pf.selectedCategoryIds.length > 0) return true;
    if (Array.isArray(pf.selectedSpecIds) && pf.selectedSpecIds.length > 0) return true;
    if (Array.isArray(pf.selectedSizeIds) && pf.selectedSizeIds.length > 0) return true;
    if (Array.isArray(pf.selectedColorIds) && pf.selectedColorIds.length > 0) return true;
    if (pf.inlineAttrName && pf.inlineAttrName.trim().length > 0) return true;
  }

  return false;
}
