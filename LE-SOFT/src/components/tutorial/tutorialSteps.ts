/**
 * MAKE Tutorial Step Definitions
 *
 * Defines the canonical 8 steps across MAKE modules.
 * Each step specifies its target route and stable DOM selector
 * enabling the centralized controller to navigate automatically
 * and wait for DOM elements to render before positioning tooltips.
 */

export interface TutorialStep {
  id: string;
  stepNumber: number;
  route: string;
  target: string;
  title: string;
  badge: string;
  description: string;
  details: string;
  tips?: string;
}

export const MAKE_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'dashboard',
    stepNumber: 1,
    route: '/make/dashboard',
    target: '[data-tutorial="make-dashboard"]',
    title: 'MAKE Dashboard Overview',
    badge: 'Step 1 of 8',
    description: 'High-level executive overview of production metrics, order statuses, and recent manufacturing activity.',
    details: 'View active orders, orders awaiting pricing, in-progress factory units, ready-to-ship items, and completed deliveries at a glance.',
    tips: 'Use the Refresh button anytime to pull real-time factory data from the NAS database.'
  },
  {
    id: 'product-catalog',
    stepNumber: 2,
    route: '/make/products',
    target: '[data-tutorial="make-product-catalog"]',
    title: 'Product Catalog & Attributes',
    badge: 'Step 2 of 8',
    description: 'Manage products alongside first-class global Product Attributes: Categories, Sizes, Colors, and Specifications.',
    details: 'Categories act as authoritative product groupings. Create reusable categories, assign multiple dimensions or finishes, and benefit from protected deletion safeguards when categories are actively in use.',
    tips: 'You can create new categories inline while drafting a product, and they will auto-select immediately.'
  },
  {
    id: 'product-search',
    stepNumber: 3,
    route: '/make/place-order',
    target: '[data-tutorial="make-product-search"]',
    title: 'Intelligent Whole-Catalog Search',
    badge: 'Step 3 of 8',
    description: 'Quickly find any product by typing names, codes, dimensions, colors, specifications, materials, or categories.',
    details: 'The search engine computes multi-attribute relevance scores with visual badges showing exactly why a product matched (e.g. Matched Category, Matched Color, Matched Dimension).',
    tips: 'Try searching "Walnut 1800 Executive" to match color, dimensions, and specifications simultaneously.'
  },
  {
    id: 'place-order',
    stepNumber: 4,
    route: '/make/place-order',
    target: '[data-tutorial="make-place-order"]',
    title: 'Place Manufacturing Orders',
    badge: 'Step 4 of 8',
    description: 'Streamlined order placement with automatic MAKE-YYYY-XXXXXX order numbering and flexible customer inputs.',
    details: 'Customer Name is required, while Customer Phone is optional to accommodate corporate and repeat clients. Configure custom item specs or standard catalog items with line-item pricing.',
    tips: 'Delivery landmarks and secondary receiver contacts ensure error-free dispatch and installation.'
  },
  {
    id: 'invoice-attachments',
    stepNumber: 5,
    route: '/make/place-order',
    target: '[data-tutorial="make-invoice-attachments"]',
    title: 'Invoice Attachments & Documents',
    badge: 'Step 5 of 8',
    description: 'Attach official invoices, work orders, sketches, and specifications directly to orders before submission.',
    details: 'Upload desktop files, capture live invoice photos on mobile devices, or attach multi-page PDF documents. Files are stored on local NAS storage with verifiable audit trails.',
    tips: 'Attachments remain permanently associated with the order throughout all production stages.'
  },
  {
    id: 'track-orders',
    stepNumber: 6,
    route: '/make/track',
    target: '[data-tutorial="make-track-orders"]',
    title: 'Track Orders & Lifecycle Versioning',
    badge: 'Step 6 of 8',
    description: 'Real-time monitoring of all submitted orders with sequential version tracking (v1, v2, v3) and approval audits.',
    details: 'Filter orders by status, inspect item cost/sale prices, view technical CAD blueprints, and track salesperson approval workflows.',
    tips: 'Any designer pricing modification generates a new immutable version for salesperson review.'
  },
  {
    id: 'production-stages',
    stepNumber: 7,
    route: '/make/track',
    target: '[data-tutorial="make-production-stages"]',
    title: 'Canonical 8-Stage Production Flow',
    badge: 'Step 7 of 8',
    description: 'Strictly sequential factory progression enforced by database constraints and photo verification.',
    details: 'Stages follow: 1. Work in process → 2. Production On Going → 3. Primary QC → 4. Color Ongoing (oven) → 5. QC Final → 6. Packaging → 7. Ready to Ship → 8. Delivered. Stages cannot be skipped.',
    tips: 'Factory supervisors upload live photos at each stage to certify quality control before advancement.'
  },
  {
    id: 'customer-ledger',
    stepNumber: 8,
    route: '/crm/ledger',
    target: '[data-tutorial="make-customer-ledger"]',
    title: 'Customer Ledger Integration',
    badge: 'Step 8 of 8',
    description: 'Seamless financial integration connecting MAKE manufacturing orders with customer accounting ledgers.',
    details: 'Review complete customer payment histories, outstanding balances, invoices, and credit terms directly linked to order delivery settlements.',
    tips: 'Click on any customer to inspect line-by-line financial debit/credit statements.'
  }
];
