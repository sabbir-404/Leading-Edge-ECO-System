# MAKE Product Attributes & Normalized Architecture (V1.2)

## 1. Overview
MAKE V1.2 elevates **Category** to a first-class global Product Attribute alongside Sizes, Colors, and Specifications. Attributes can be created globally, shared across multiple products, and associated through dedicated database relationships and junction tables.

---

## 2. Canonical Database Schema (Migrations 061 & 062)

### 2.1 Global Attribute Tables
1. **`make_product_categories`** (Migration 062):
   * `id`: SERIAL PRIMARY KEY
   * `name`: VARCHAR(255) NOT NULL UNIQUE
   * `code`: VARCHAR(50)
   * `description`: TEXT
   * `is_active`: BOOLEAN DEFAULT true
   * `created_at`: TIMESTAMPTZ DEFAULT NOW()
   * `updated_at`: TIMESTAMPTZ DEFAULT NOW()

2. **`make_product_specifications`** (Migration 061):
   * `id`: SERIAL PRIMARY KEY
   * `spec_name`: VARCHAR(255) NOT NULL
   * `spec_code`: VARCHAR(50)
   * `spec_details`: TEXT
   * `is_active`: BOOLEAN DEFAULT true

3. **`make_product_sizes`** (Migration 061):
   * `id`: SERIAL PRIMARY KEY
   * `size_label`: VARCHAR(100) NOT NULL
   * `length`, `width`, `height`, `diameter`: NUMERIC
   * `unit`: VARCHAR(20) DEFAULT 'mm'
   * `is_active`: BOOLEAN DEFAULT true

4. **`make_product_colors`** (Migration 061):
   * `id`: SERIAL PRIMARY KEY
   * `color_name`: VARCHAR(100) NOT NULL
   * `color_code`: VARCHAR(50) (e.g., `#3E2723`)
   * `is_active`: BOOLEAN DEFAULT true

---

## 3. Single Source of Truth & Backward Compatibility Architecture

### 3.1 Authoritative Foreign Key (`category_id`)
```text
make_product_categories
        ↑
        │ REFERENCES make_product_categories(id) ON DELETE SET NULL
make_products.category_id  <-- AUTHORITATIVE RELATIONSHIP
```

* `category_id` is the single authoritative product-to-category relationship.
* Frontend product editing strictly updates `category_id`. Separate editing of text `category` is eliminated.

### 3.2 Compatibility Sync Mechanism
For legacy integrations (WordPress portal, existing views):
* The text column `make_products.category` is maintained automatically via PostgreSQL triggers (`trg_sync_make_product_category` and `trg_sync_make_product_category_rename`) and synchronized in `make-save-catalog-product` IPC handler.
* Renaming a category in `make_product_categories` automatically cascades and updates all referencing products' `category` text column so no products are left pointing to stale text.

---

## 4. Protected Category Deletion Contract

To prevent accidental data corruption or orphan product records:
1. Deletion requests go through `make-delete-category` (Preload: `window.electron.makeDeleteCategory({ id })`).
2. The handler checks `make_products` for active references by `category_id` (or matching category name).
3. If active products exist, the deletion is rejected with a structured error:
   ```json
   {
     "success": false,
     "error": "Cannot delete category \"Executive Desks\". It is currently used by 2 product(s): Executive Workstation Table, Solid Teak Table."
   }
   ```
4. Only when 0 products reference the category is the record safely deleted.

---

## 5. Inline Attribute Creation & Auto-Selection Contract

When a user creates a new Category, Size, Color, or Specification directly from the Product Creation/Edit modal:
1. `makeSaveGlobalAttribute` creates the entity and returns:
   ```json
   {
     "success": true,
     "attribute": {
       "id": 14,
       "name": "Executive Desks",
       "code": "EXEC-DSK"
     }
   }
   ```
2. The UI extracts the new attribute ID:
   ```typescript
   const newId = created?.attribute?.id ?? created?.id;
   ```
3. For Categories, `formData.category_id` is automatically set to `newId` (auto-selected in the dropdown).
4. For multi-select attributes (Sizes, Colors, Specs), the new ID is automatically appended to the selected ID array.
5. The attribute is saved globally and immediately available for all future products.
