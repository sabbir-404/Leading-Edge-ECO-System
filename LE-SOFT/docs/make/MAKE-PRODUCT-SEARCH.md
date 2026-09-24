# MAKE Product Search Architecture & Specification (V1.2)

## 1. Overview
The intelligent whole-catalog product search engine enables salespersons, designers, and administrators to locate relevant furniture products in the MAKE order flow by typing natural queries. Rather than searching solely across product names or raw codes, the engine performs multi-token matching, relevance scoring, and attribute graph expansion across categories, dimensions, colors, materials, and specifications.

---

## 2. Searchable Entities & Database Fields

The search service inspects both direct attributes on `make_products` and normalized junction relationships:

### Product Header (`make_products`) & Category (`make_product_categories`)
* `product_name` (e.g., "Executive Workstation Table", "Solid Teak Dining Table")
* `product_code` / Model Number (e.g., "M-1025", "WS-204", "DT-01")
* `description` (e.g., "teakwood office desk with cable grommet")
* `category_id` linked to `make_product_categories(name)` (e.g., "Executive Desks", "Conference Tables", "Ergonomic Chairs")
* Fallback `category` text column for backward compatibility

### Product Sizes & Dimensions (`make_product_sizes` via `make_product_size_links`)
* `size_label` (e.g., "Standard", "King Bed Dimensions", "Round 800")
* `length`, `width`, `height`, `diameter`, `unit`
* Formatted dimension strings: e.g., "1200 x 600", "1500 x 750 x 750 mm", "Ø 800 x 450 mm"
* Number tokens extracted directly from search query (e.g., user enters "1200" or "750")

### Product Colors & Finishes (`make_product_colors` via `make_product_color_links`)
* `color_name` (e.g., "Walnut Dark", "Black Matte", "Natural Oak")
* `color_code` (e.g., "#3E2723", "#000000")

### Product Specifications & Materials (`make_product_specifications` via `make_product_specification_links`)
* `spec_name` (e.g., "Premium Brass Inlay", "Executive Wire Grommet", "Natural Finish")
* `spec_code` (e.g., "BR-01", "WG-02")
* `spec_details` (e.g., "Brushed gold metal finish", "Heavy duty gas lift")
* Material keywords: wood, metal, polish, lacquer, brass, teak, oak

---

## 3. Query Normalization & Typo/Punctuation Tolerance

Before executing score algorithms, queries undergo multi-stage normalization:
1. **Case-Insensitive Lowercasing**: All strings transformed to lowercase.
2. **Whitespace Normalization**: Multiple spaces collapsed to single whitespace.
3. **Punctuation Stripping**: Characters such as `-`, `_`, `.`, `/`, `(`, `)` are stripped to generate clean alphanumeric representations (e.g., `M-1025`, `m1025`, and `M 1025` match identically).
4. **Dimension Extraction**: Regex `/\b\d+(\.\d+)?\b/g` extracts numeric components to compare with dimensional attributes.

---

## 4. Relevance Scoring & Ranking Strategy

Each product starts with `score = 0`. Points are accumulated based on match specificity:

| Match Category | Score Weight | Badged Highlight Reason |
| :--- | :---: | :--- |
| **Exact Product Code / Model** | +1200 | `Exact Code Match: {code}` |
| **Product Code Prefix Match** | +600 | `Code Prefix: {code}` |
| **Product Code Partial Match** | +350 | `Code Match: {code}` |
| **Exact Product Name Match** | +1000 | `Exact Name Match: {name}` |
| **Product Name Prefix Match** | +500 | `Name Starts With: {token}` |
| **Product Name Substring Match** | +300 | `Name Contains: {token}` |
| **Exact Category Match** | +500 | `Matched Category: {category}` |
| **Category Substring / Token Match** | +250 | `Matched Category: {category}` |
| **Color Match (Direct or Linked)** | +300 | `Matched Color: {color_name}` |
| **Specification / Material Match** | +250 | `Matched Spec: {spec_name}` |
| **Dimension Match ("1200 x 600")** | +400 | `Matched Dimensions: {dims}` |
| **Individual Number Dimension Match** | +150 | `Matched Size: {size_label}` |
| **Description Match** | +100 | `Description Match` |
| **All-Tokens Matched Bonus** | +350 | Awarded when all query tokens match |

Results are sorted descending by `score`, with tie-breaking alphabetically by `product_name`.

---

## 5. Result Contract & UI Rendering

The search engine outputs structured `SearchProductResult` objects rather than raw database rows:

```typescript
interface SearchProductResult {
    id: number;
    product_code: string;
    product_name: string;
    description?: string;
    category?: string;
    category_id?: number | null;
    main_image?: string;
    is_active: boolean;
    score: number;
    matchedReasons: string[];
    specifications: any[];
    sizes: any[];
    colors: any[];
    images: any[];
}
```

The Place Order UI displays matching badges (`.make-search-badge`) indicating why the product matched (e.g., `Matched Category: Executive Desks`, `Matched Color: Walnut Dark`, `Matched Size: 1800 x 900 mm`), along with available catalog dimensions, colors, and specifications.

---

## 6. IPC Contract

* **IPC Channel**: `make-search-products`
* **Handler**: `MakeSearchService.searchProducts(parsed)`
* **Preload Wrapper**: `window.electron.makeSearchProducts({ query, category, activeOnly })`
* **Debounce**: 250ms debounced execution in React frontends.
