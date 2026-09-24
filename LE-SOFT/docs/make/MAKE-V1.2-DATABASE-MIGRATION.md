# MAKE V1.2 Database Migration Guide (Migration 062)

**Migration File:** `supabase/migrations/062_make_product_categories.sql`  
**Target Database:** Production Supabase Cloud (`ildkkgjrolcjijwfokek.supabase.co`)  
**Execution Mode:** **MANUAL EXECUTION ONLY (Supabase SQL Editor)**  
**Current Execution Status:** **PENDING MANUAL EXECUTION**

---

## 1. Summary of Changes

Migration 062 transitions the MAKE module's category architecture from a flat text field to a **normalized, relational entity** with strict referential integrity:

```text
make_product_categories.id (SERIAL PRIMARY KEY)
             ▲
             │ FOREIGN KEY (category_id) REFERENCES make_product_categories(id) ON DELETE RESTRICT
make_products.category_id (INTEGER) [Authoritative relationship]
             │
             ▼ Automatic sync trigger
make_products.category (VARCHAR 100) [Preserved compatibility text]
```

---

## 2. DDL & Schema Objects Created

### A. Tables Created
- **`make_product_categories`**:
  - `id SERIAL PRIMARY KEY`: Unique integer identifier.
  - `name VARCHAR(100) NOT NULL UNIQUE`: Canonical category title.
  - `code VARCHAR(50)`: Short code / prefix.
  - `description TEXT`: Extended category details.
  - `is_active BOOLEAN DEFAULT true`: Active status flag.
  - `created_at TIMESTAMPTZ DEFAULT NOW()`: Audit timestamp.

### B. Columns Added
- **`make_products.category`** (`VARCHAR(100)`): Ensured present if not already added.
- **`make_products.category_id`** (`INTEGER`): Foreign key referencing `make_product_categories(id)`.

### C. Foreign Key & Integrity Constraints
- **Constraint**: `FOREIGN KEY (category_id) REFERENCES make_product_categories(id) ON DELETE RESTRICT`.
- **Behavior**: If an administrative user or automated query attempts to delete a category that is still referenced by any active product, PostgreSQL rejects the deletion with an immediate foreign key constraint error. Products can never be accidentally orphaned or cascade-deleted.

### D. Indexes Created
- `CREATE INDEX IF NOT EXISTS idx_make_products_category_id ON make_products(category_id);`
- `CREATE INDEX IF NOT EXISTS idx_make_products_category ON make_products(category);`
- Implicit unique B-tree index on `make_product_categories(name)`.

### E. Database Triggers Created
1. **`trg_sync_make_product_category` (BEFORE INSERT OR UPDATE OF category_id ON make_products)**:
   Whenever `category_id` is set on a product, the trigger automatically queries `make_product_categories.name` and sets `NEW.category`. Guarantees that legacy systems reading `category` always see the correct string.
2. **`trg_sync_make_product_category_rename` (AFTER UPDATE OF name ON make_product_categories)**:
   Whenever an administrator renames a global category in `make_product_categories`, this trigger automatically cascades the new name to all existing products where `category_id = NEW.id`.

### F. Row Level Security (RLS) & Grants
- RLS enabled on `make_product_categories`.
- `SELECT` (Read) granted to `anon`, `authenticated`, and `service_role`. Normal catalog browsing, product creation dropdowns, and search can freely read category lists.
- Direct `INSERT`, `UPDATE`, `DELETE` (Write) via direct PostgREST calls is **exclusively restricted to `service_role`**.
- Direct mutation attempts by `anon` or any `authenticated` client (even if carrying admin/superadmin claims) are denied at the database RLS layer. All category management must flow through the trusted MAKE IPC layer (`canManageCatalog(session)` in the Electron Main process SessionManager).

---

## 3. Backfill Logic & Transformation Matrix

The migration executes a non-destructive, deterministic two-step backfill:

### Step 1: Distinct Category Seed
```sql
INSERT INTO make_product_categories (name)
SELECT DISTINCT TRIM(category)
FROM make_products
WHERE category IS NOT NULL AND TRIM(category) <> ''
ON CONFLICT (name) DO NOTHING;
```
- Filters out `NULL`, empty, and whitespace-only strings.
- Strips leading and trailing whitespace.
- Idempotent `ON CONFLICT (name) DO NOTHING` prevents duplicate insertion errors.

### Step 2: Authoritative Product Linking
```sql
UPDATE make_products p
SET category_id = c.id
FROM make_product_categories c
WHERE p.category_id IS NULL
  AND p.category IS NOT NULL
  AND TRIM(p.category) = c.name;
```
- Matches existing products to their new global category record.
- Sets `category_id` authoritatively.
- Only touches products where `category_id IS NULL`, ensuring it is safe to rerun multiple times.

### Example Transformation Data:

| Existing `make_products.category` | Created `make_product_categories` Entry | Resulting `category_id` | Resulting `category` (Text) |
| :--- | :--- | :--- | :--- |
| `"Executive Desks"` | ID `1`, Name `"Executive Desks"` | `1` | `"Executive Desks"` |
| `"  Workstations  "` | ID `2`, Name `"Workstations"` (trimmed) | `2` | `"Workstations"` |
| `"Conference Tables"` | ID `3`, Name `"Conference Tables"` | `3` | `"Conference Tables"` |
| `NULL` | *(No category created)* | `NULL` | `NULL` |
| `""` (Empty string) | *(No category created)* | `NULL` | `""` |

---

## 4. Pre-Migration Safety & Backup Requirements

Before executing Migration 062:
1. **Database Snapshot**: Create an automated or manual backup snapshot in the Supabase Dashboard:
   - Navigate to **Project Settings** -> **Backups** -> **Take Backup Now**.
2. **Read-Only Inspection**: Run the verification queries in Section 6 to record the baseline row counts.
3. **Low-Traffic Window**: Execute during low operational hours to prevent locks during the schema update.

---

## 5. Execution Instructions (Step-by-Step)

1. Open the browser and log in to the Supabase Cloud Console:
   `https://supabase.com/dashboard/project/ildkkgjrolcjijwfokek`
2. In the left navigation menu, click **SQL Editor**.
3. Click **New Query**.
4. Copy the entire contents of:
   `supabase/migrations/062_make_product_categories.sql`
5. Paste into the SQL Editor.
6. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`).
7. Confirm the result output shows: `Success. No rows returned` (or row counts for the backfill statements).

---

## 6. Post-Migration Verification SQL Queries

Run the following queries in the Supabase SQL Editor to verify complete success:

### Query 1: Verify Table and Column Existence
```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('make_product_categories', 'make_products')
  AND column_name IN ('category', 'category_id', 'name', 'code', 'is_active')
ORDER BY table_name, column_name;
```
*Expected: `make_product_categories` has `id, name, code, description, is_active, created_at`. `make_products` has `category` and `category_id`.*

### Query 2: Verify Seeded Categories
```sql
SELECT id, name, is_active, created_at
FROM make_product_categories
ORDER BY id;
```
*Expected: Distinct category names populated from existing product records.*

### Query 3: Verify Product Category Backfill Status
```sql
SELECT 
    COUNT(*) AS total_products,
    COUNT(category) AS products_with_category_text,
    COUNT(category_id) AS products_with_category_id,
    COUNT(*) FILTER (WHERE category IS NOT NULL AND category_id IS NULL) AS unlinked_products
FROM make_products;
```
*Expected: `unlinked_products` must be `0`.*

### Query 4: Verify Referential Integrity Constraint
```sql
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'make_products' 
  AND kcu.column_name = 'category_id';
```
*Expected: Foreign key exists with `delete_rule = 'RESTRICT'`.*

### Query 5: Verify RLS Policies
```sql
SELECT policyname, cmd, roles, qual, with_check 
FROM pg_policies 
WHERE tablename = 'make_product_categories';
```
*Expected: Exactly two active policies:*
*1. `Allow read access to make_product_categories` (`FOR SELECT USING (true)` for all roles).*
*2. `Allow service_role write access to make_product_categories` (`FOR ALL TO service_role USING (true) WITH CHECK (true)`).*
*No direct mutation policies for `authenticated` or `anon`.*

### Query 6: Verify PostgREST Reload
```sql
NOTIFY pgrst, 'reload schema';
```
*Expected: PostgREST reloads its schema cache immediately.*

---

## 7. Rollback & Recovery Considerations

If any unexpected issue arises during or after migration:

### Non-Destructive Rollback SQL
```sql
-- Disable triggers
DROP TRIGGER IF EXISTS trg_sync_make_product_category ON make_products;
DROP TRIGGER IF EXISTS trg_sync_make_product_category_rename ON make_product_categories;
DROP FUNCTION IF EXISTS fn_sync_make_product_category();
DROP FUNCTION IF EXISTS fn_sync_make_product_category_rename();

-- Drop foreign key constraint without deleting make_products data
ALTER TABLE make_products DROP CONSTRAINT IF EXISTS make_products_category_id_fkey;

-- Drop category_id column (product text in make_products.category remains 100% intact)
ALTER TABLE make_products DROP COLUMN IF EXISTS category_id;

-- Drop table
DROP TABLE IF EXISTS make_product_categories CASCADE;

-- Reload schema
NOTIFY pgrst, 'reload schema';
```

> **Safety Notice:**  
> Dropping `category_id` leaves `make_products.category` intact. Existing product names, prices, specifications, orders, and legacy category text are **never destroyed**.
