import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('MAKE Half-Screen Responsive Layout & Input Robustness Audit', () => {
  const dashboardCssPath = path.resolve(__dirname, '../../src/pages/Dashboard/Dashboard.css');
  const catalogTsxPath = path.resolve(__dirname, '../../src/pages/Make/MakeProductCatalog.tsx');
  const placeOrderTsxPath = path.resolve(__dirname, '../../src/pages/Make/PlaceOrder.tsx');
  const trackOrdersTsxPath = path.resolve(__dirname, '../../src/pages/Make/TrackOrders.tsx');
  const alterOrderTsxPath = path.resolve(__dirname, '../../src/pages/Make/AlterOrder.tsx');
  const productCreateModalTsxPath = path.resolve(__dirname, '../../src/pages/Make/components/ProductCreateModal.tsx');
  const layoutTsxPath = path.resolve(__dirname, '../../src/components/DashboardLayout.tsx');

  const dashboardCss = fs.readFileSync(dashboardCssPath, 'utf8');
  const catalogTsx = fs.readFileSync(catalogTsxPath, 'utf8');
  const placeOrderTsx = fs.readFileSync(placeOrderTsxPath, 'utf8');
  const trackOrdersTsx = fs.readFileSync(trackOrdersTsxPath, 'utf8');
  const alterOrderTsx = fs.readFileSync(alterOrderTsxPath, 'utf8');
  const productCreateModalTsx = fs.readFileSync(productCreateModalTsxPath, 'utf8');
  const layoutTsx = fs.readFileSync(layoutTsxPath, 'utf8');

  describe('1. Top Bar & Window Drag Header Responsiveness (960px / 900px / 800px)', () => {
    it('constrains top-bar-left and page title to prevent pushing clock off-screen', () => {
      // Must have min-width: 0, overflow: hidden, and text truncation
      expect(dashboardCss).toContain('.top-bar-left');
      expect(dashboardCss).toContain('.page-title');
      expect(dashboardCss).toContain('text-overflow: ellipsis');
      expect(dashboardCss).toContain('white-space: nowrap');
    });

    it('compacts live clock padding at half-screen widths without overlapping window controls', () => {
      expect(dashboardCss).toContain('@media (max-width: 1024px)');
      expect(dashboardCss).toContain('@media (max-width: 900px)');
      // Top bar padding must scale down on smaller widths
      expect(dashboardCss).toMatch(/padding:\s*0\s+14[0-4]px/);
    });
  });

  describe('2. Product Catalog Half-Screen Grid Behavior', () => {
    it('uses minmax(0, 1fr) for product catalog detail panel to prevent horizontal overflow', () => {
      expect(dashboardCss).toContain('.make-catalog-grid');
      expect(dashboardCss).toContain('minmax(0, 1fr)');
      expect(catalogTsx).toContain('className="make-catalog-grid"');
      expect(catalogTsx).toContain('className="make-catalog-list-panel"');
      expect(catalogTsx).toContain('className="make-catalog-detail-panel"');
    });

    it('adapts product catalog grid columns at desktop breakpoints (1920px, 1100px, 860px)', () => {
      // At desktop: minmax(280px, 320px) minmax(0, 1fr)
      expect(dashboardCss).toMatch(/minmax\(280px,\s*320px\)\s+minmax\(0,\s*1fr\)/);
      // At medium desktop (<= 1100px): minmax(240px, 280px) minmax(0, 1fr)
      expect(dashboardCss).toMatch(/minmax\(240px,\s*280px\)\s+minmax\(0,\s*1fr\)/);
      // At narrow screen (<= 860px): stacks cleanly with minmax(0, 1fr)
      expect(dashboardCss).toMatch(/@media\s*\(max-width:\s*860px\)[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    });

    it('wraps product action buttons (Purchase History, Edit, Delete) to prevent detail card clipping', () => {
      expect(catalogTsx).toContain("flexWrap: 'wrap'");
      expect(catalogTsx).toContain("wordBreak: 'break-word'");
    });
  });

  describe('3. Input Hit-Area & Pointer Event Protection', () => {
    it('sets pointer-events: none on search SVG icons to prevent click interception', () => {
      // In MakeProductCatalog
      expect(catalogTsx).toMatch(/<Search[^>]*pointerEvents:\s*'none'/);
      // In PlaceOrder
      expect(placeOrderTsx).toMatch(/<Search[^>]*pointerEvents:\s*'none'/);
      // In TrackOrders
      expect(trackOrdersTsx).toMatch(/<Search[^>]*pointerEvents:\s*'none'/);
    });

    it('synchronously initializes PlaceOrder input states so keystrokes are never wiped on mount', () => {
      expect(placeOrderTsx).toContain('useState(() => initialDraft.customerName');
      expect(placeOrderTsx).toContain('useState(() => initialDraft.customerPhone');
      expect(placeOrderTsx).toContain('useState(() => initialDraft.customerEmail');
    });

    it('decouples draft saving from ProductCreateModal setState updater', () => {
      expect(productCreateModalTsx).toContain('const handleFieldChange = (field: string, value: any) => {');
      // Must not call notifyDraftUpdate inside setFormData reducer
      expect(productCreateModalTsx).not.toMatch(/setFormData\([^)]*notifyDraftUpdate/);
    });
  });

  describe('4. Place Order & Logistics Grid Responsiveness', () => {
    it('uses make-responsive-grid-2 and make-responsive-grid-4 for order logistics', () => {
      expect(placeOrderTsx).toContain('className="make-responsive-grid-2"');
      expect(placeOrderTsx).toContain('className="make-responsive-grid-4"');
    });

    it('ensures custom dimensions grid uses auto-fit repeat to prevent overflow', () => {
      expect(placeOrderTsx).toMatch(/gridTemplateColumns:\s*'repeat\(auto-fit,\s*minmax\(110px,\s*1fr\)\)'/);
    });

    it('uses responsive flex wrap for item quantity and remarks', () => {
      expect(placeOrderTsx).toMatch(/display:\s*'flex',\s*flexWrap:\s*'wrap',\s*gap:\s*'1rem',\s*alignItems:\s*'flex-end'/);
    });
  });

  describe('5. Modal Viewport Bounds & Scroll Rules', () => {
    it('ensures all MAKE modals have viewport-bounded max-width and max-height with vertical scroll', () => {
      expect(dashboardCss).toContain('.make-modal-container');
      expect(dashboardCss).toContain('max-width: min(680px, calc(100vw - 32px))');
      expect(dashboardCss).toContain('max-height: 90vh');
      expect(dashboardCss).toContain('overflow-y: auto');

      // ProductCreateModal
      expect(productCreateModalTsx).toContain("maxWidth: 'min(560px, calc(100vw - 32px))'");
      // AlterOrder
      expect(alterOrderTsx).toContain("maxWidth: 'min(560px, calc(100vw - 32px))'");
      // TrackOrders version diff modal
      expect(trackOrdersTsx).toContain("maxWidth: 'min(900px, calc(100vw - 32px))'");
    });
  });

  describe('6. Customer Autocomplete Dropdown Placement', () => {
    it('places customer autocomplete dropdown within viewport bounds with max-height and scrolling', () => {
      expect(dashboardCss).toContain('.make-customer-dropdown');
      expect(dashboardCss).toContain('max-height: 280px');
      expect(dashboardCss).toContain('overflow-y: auto');
      expect(dashboardCss).toContain('z-index: 1000');
    });
  });
});
