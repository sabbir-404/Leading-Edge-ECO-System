import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, Plus, Search, Edit2, Trash2, 
  Layers, Maximize2, Palette, CheckCircle, AlertCircle, RefreshCw, X, Upload, Image as ImageIcon,
  ShoppingCart, History as HistoryIcon, RotateCcw
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { canManageGlobalProductAttributes } from '../../utils/permissions';
import { 
  loadProductCatalogDraft, 
  saveProductCatalogDraft, 
  clearProductCatalogDraft, 
  clearProductFormDraft, 
  hasMeaningfulDraftContent 
} from '../../utils/productCatalogDraft';
import { ProductCreateModal } from './components/ProductCreateModal';

interface Size {
  id?: number;
  product_id?: number;
  spec_id?: number | null;
  size_label?: string;
  length?: string | number;
  width?: string | number;
  height?: string | number;
  diameter?: string | number;
  unit: string;
  is_active: boolean;
}

interface Color {
  id?: number;
  product_id?: number;
  spec_id?: number | null;
  color_name: string;
  color_code?: string;
  image_url?: string;
  is_active: boolean;
}

interface Spec {
  id?: number;
  product_id: number;
  spec_code?: string;
  spec_name: string;
  spec_details?: string;
  image_url?: string;
  is_active: boolean;
}

interface Product {
  id?: number;
  product_code: string;
  product_name: string;
  category_id?: number | null;
  category?: string | null;
  description?: string;
  main_image?: string;
  is_active: boolean;
  purchased_count?: number;
  specifications?: Spec[];
  sizes?: Size[];
  colors?: Color[];
}

interface OrderHistoryItem {
  id: number;
  order_id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  location_landmark: string;
  delivery_address: string;
  salesperson_name: string;
  designer_name: string;
  status: string;
  approval_status: string;
  created_at: string;
  delivery_date?: string;
  spec_name: string;
  size_label: string;
  color_name: string;
  quantity: number;
  item_cost_price: number;
  item_sale_price: number | null;
  total_sale_price: number | null;
  salesperson_note: string;
}

interface PurchaseHistoryData {
  productId: number;
  productName: string;
  productCode: string;
  totalQuantity: number;
  orderCount: number;
  totalRevenue: number;
  history: OrderHistoryItem[];
}

const MakeProductCatalog: React.FC = () => {
  const initialDraft = loadProductCatalogDraft();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialDraft.search || '');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Active section tab inside selected product view
  const [activeTab, setActiveTab] = useState<'all' | 'specs' | 'sizes' | 'colors' | 'history'>(initialDraft.activeTab || 'all');

  // Purchase History State
  const [historyData, setHistoryData] = useState<PurchaseHistoryData | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState(initialDraft.historySearch || '');

  // Top view toggle: products or global attributes
  const [catalogMainView, setCatalogMainView] = useState<'products' | 'attributes'>(initialDraft.catalogMainView || 'products');
  const [globalAttributes, setGlobalAttributes] = useState<{ categories: any[]; specs: any[]; sizes: any[]; colors: any[] }>({ categories: [], specs: [], sizes: [], colors: [] });
  const [attrTab, setAttrTab] = useState<'categories' | 'sizes' | 'colors' | 'specs'>(initialDraft.attrTab || 'categories');

  // Permissions
  const canManageGlobal = canManageGlobalProductAttributes();

  // Modals
  const [showProductModal, setShowProductModal] = useState(!!initialDraft.productForm?.isOpen);
  const [editingProduct, setEditingProduct] = useState<Partial<Product>>(
    initialDraft.productForm
      ? {
          is_active: initialDraft.productForm.is_active !== undefined ? initialDraft.productForm.is_active : true,
          product_code: initialDraft.productForm.product_code || '',
          product_name: initialDraft.productForm.product_name || '',
          description: initialDraft.productForm.description || '',
          category_id: initialDraft.productForm.category_id || null,
          category: initialDraft.productForm.category || null,
          main_image: initialDraft.productForm.main_image || '',
        }
      : { is_active: true }
  );

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>({ is_active: true });

  const [showSpecModal, setShowSpecModal] = useState(false);
  const [editingSpec, setEditingSpec] = useState<Partial<Spec>>({ is_active: true });

  const [showSizeModal, setShowSizeModal] = useState(false);
  const [editingSize, setEditingSize] = useState<Partial<Size>>({ unit: 'mm', is_active: true });

  const [showColorModal, setShowColorModal] = useState(false);
  const [editingColor, setEditingColor] = useState<Partial<Color>>({ is_active: true });

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const handlePickAndUploadImage = async (onSuccess: (url: string) => void) => {
    setUploadingImage(true);
    try {
      // @ts-ignore
      const url = await window.electron.pickImage();
      if (url) {
        onSuccess(url);
        setMsg({ type: 'success', text: 'Image successfully uploaded and stored on NAS!' });
        setTimeout(() => setMsg(null), 4000);
      }
    } catch (e: any) {
      console.error(e);
      setMsg({ type: 'error', text: 'Failed to upload image to NAS: ' + (e.message || String(e)) });
    } finally {
      setUploadingImage(false);
    }
  };

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      // @ts-ignore
      const data = await window.electron.makeGetCatalogProducts({ search });
      setProducts(data || []);
      if (selectedProduct) {
        const updated = (data || []).find((p: any) => p.id === selectedProduct.id);
        setSelectedProduct(updated || null);
      } else if (data && data.length > 0) {
        setSelectedProduct(data[0]);
      }
    } catch (e: any) {
      console.error(e);
      setMsg({ type: 'error', text: 'Failed to load product catalog' });
    } finally {
      setLoading(false);
    }
  };

  const fetchProductHistory = async (productId: number) => {
    setLoadingHistory(true);
    try {
      // @ts-ignore
      const res = await window.electron.makeGetProductPurchaseHistory(productId);
      setHistoryData(res || null);
    } catch (e: any) {
      console.error('[fetchProductHistory] Error:', e);
      setHistoryData(null);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchGlobalAttributes = async () => {
    try {
      if (window.electron?.makeGetGlobalAttributes) {
        const res = await window.electron.makeGetGlobalAttributes();
        if (res) {
          setGlobalAttributes({
            categories: Array.isArray(res.categories) ? res.categories : [],
            specs: Array.isArray(res.specs) ? res.specs : [],
            sizes: Array.isArray(res.sizes) ? res.sizes : [],
            colors: Array.isArray(res.colors) ? res.colors : [],
          });
        }
      }
    } catch (err) {
      console.error('Failed to load global attributes:', err);
    }
  };

  useEffect(() => {
    fetchCatalog();
    fetchGlobalAttributes();
  }, [search]);

  useEffect(() => {
    if (selectedProduct?.id) {
      fetchProductHistory(selectedProduct.id);
    } else {
      setHistoryData(null);
    }
  }, [selectedProduct?.id]);

  useEffect(() => {
    saveProductCatalogDraft({
      search,
      historySearch,
      catalogMainView,
      attrTab,
      activeTab,
    });
  }, [search, historySearch, catalogMainView, attrTab, activeTab]);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  };

  const handleOpenNewProduct = () => {
    const draft = loadProductCatalogDraft();
    if (draft.productForm) {
      setEditingProduct({
        is_active: draft.productForm.is_active !== undefined ? draft.productForm.is_active : true,
        product_code: draft.productForm.product_code || '',
        product_name: draft.productForm.product_name || '',
        description: draft.productForm.description || '',
        category_id: draft.productForm.category_id || null,
        category: draft.productForm.category || null,
        main_image: draft.productForm.main_image || '',
        specifications: (globalAttributes.specs || []).filter((s: any) => (draft.productForm?.selectedSpecIds || []).includes(s.id)),
        sizes: (globalAttributes.sizes || []).filter((s: any) => (draft.productForm?.selectedSizeIds || []).includes(s.id)),
        colors: (globalAttributes.colors || []).filter((c: any) => (draft.productForm?.selectedColorIds || []).includes(c.id)),
      });
    } else {
      setEditingProduct({ is_active: true, category_id: null, category: null });
    }
    setShowProductModal(true);
    saveProductCatalogDraft({
      productForm: {
        ...(draft.productForm || {}),
        isOpen: true
      }
    });
  };

  const handleOpenEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setShowProductModal(true);
  };

  const handleCloseProductModal = () => {
    setShowProductModal(false);
    if (!editingProduct?.id) {
      const currentDraft = loadProductCatalogDraft();
      if (currentDraft.productForm) {
        saveProductCatalogDraft({
          productForm: {
            ...currentDraft.productForm,
            isOpen: false
          }
        });
      }
    }
  };

  const handleProductSaved = async (saved: any) => {
    setShowProductModal(false);
    clearProductFormDraft();
    showFeedback('success', editingProduct?.id ? 'Product updated.' : 'Product created successfully.');
    if (saved) {
      setSelectedProduct(saved);
      setProducts(prev => {
        const idx = prev.findIndex(p => p.id === saved.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...saved };
          return updated;
        }
        return [saved, ...prev];
      });
    }
    // Refresh catalog and attributes in background without blocking modal close or UI responsiveness
    fetchCatalog().catch(() => {});
    fetchGlobalAttributes().catch(() => {});
  };

  const handleClearDraft = () => {
    const hasMeaningful = hasMeaningfulDraftContent();
    if (hasMeaningful) {
      if (!window.confirm('Clear all unsaved product catalog inputs, drafts, and search filters?')) {
        return;
      }
    }
    clearProductCatalogDraft();
    setSearch('');
    setHistorySearch('');
    setEditingProduct({ is_active: true });
    setShowProductModal(false);
    showFeedback('success', 'Draft cleared successfully.');
  };


  // Category Actions
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory.name?.trim()) {
      showFeedback('error', 'Category name is required.');
      return;
    }
    try {
      // @ts-ignore
      const res = await window.electron.makeSaveGlobalAttribute({
        type: 'category',
        id: editingCategory.id,
        name: editingCategory.name.trim(),
        code: editingCategory.code?.trim() || null,
        description: editingCategory.description?.trim() || null,
        is_active: editingCategory.is_active !== undefined ? editingCategory.is_active : true
      });
      if (res && res.error) {
        showFeedback('error', res.error);
        return;
      }
      const savedCat = res?.attribute;
      if (savedCat) {
        setGlobalAttributes(prev => {
          const exists = prev.categories.some(c => c.id === savedCat.id);
          const next = exists
            ? prev.categories.map(c => c.id === savedCat.id ? savedCat : c)
            : [...prev.categories, savedCat];
          return { ...prev, categories: next.sort((a, b) => a.name.localeCompare(b.name)) };
        });
      }
      setShowCategoryModal(false);
      showFeedback('success', editingCategory.id ? 'Category updated.' : 'Category created.');
      await fetchGlobalAttributes();
      if (catalogMainView === 'products') {
        await fetchCatalog();
      }
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to save category');
    }
  };

  const handleDeleteCategory = async (cat: any) => {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return;
    try {
      // @ts-ignore
      const res = await window.electron.makeDeleteCategory(cat.id);
      if (res && res.error) {
        showFeedback('error', res.error);
        alert(res.error);
      } else {
        setGlobalAttributes(prev => ({
          ...prev,
          categories: prev.categories.filter(c => c.id !== cat.id)
        }));
        showFeedback('success', `Category "${cat.name}" deleted.`);
        await fetchGlobalAttributes();
        if (catalogMainView === 'products') {
          await fetchCatalog();
        }
      }
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to delete category');
    }
  };


  const handleDeleteProduct = async (id: number) => {
    if (!window.confirm('Delete this product and all its specifications, sizes, and colors?')) return;
    try {
      // @ts-ignore
      await window.electron.makeDeleteCatalogProduct(id);
      showFeedback('success', 'Product deleted.');
      if (selectedProduct?.id === id) {
        setSelectedProduct(null);
      }
      fetchCatalog();
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  // Specification Actions
  const handleSaveSpec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSpec.spec_name?.trim()) {
      showFeedback('error', 'Specification name is required.');
      return;
    }
    try {
      if (selectedProduct?.id && catalogMainView === 'products') {
        // @ts-ignore
        await window.electron.makeSaveSpec({ ...editingSpec, product_id: selectedProduct.id });
        if (catalogMainView === 'products') fetchCatalog();
      } else {
        // @ts-ignore
        const res = await window.electron.makeSaveGlobalAttribute({
          type: 'spec',
          id: editingSpec.id,
          spec_name: editingSpec.spec_name.trim(),
          spec_code: editingSpec.spec_code?.trim() || null,
          spec_details: editingSpec.spec_details?.trim() || null,
          image_url: editingSpec.image_url || null,
          is_active: editingSpec.is_active !== undefined ? editingSpec.is_active : true
        });
        if (res && res.error) {
          showFeedback('error', res.error);
          return;
        }
        const savedSpec = res?.attribute;
        if (savedSpec) {
          setGlobalAttributes(prev => {
            const exists = prev.specs.some(s => s.id === savedSpec.id);
            const next = exists
              ? prev.specs.map(s => s.id === savedSpec.id ? savedSpec : s)
              : [...prev.specs, savedSpec];
            return { ...prev, specs: next.sort((a, b) => (a.spec_name || '').localeCompare(b.spec_name || '')) };
          });
        }
        await fetchGlobalAttributes();
      }
      setShowSpecModal(false);
      showFeedback('success', editingSpec.id ? 'Specification updated.' : 'Specification saved.');
      if (catalogMainView === 'products') fetchCatalog();
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to save specification');
    }
  };

  const handleDeleteSpec = async (id: number, name?: string) => {
    if (!window.confirm(`Delete specification ${name ? `"${name}"` : ''}?`)) return;
    try {
      // @ts-ignore
      const res = await window.electron.makeDeleteSpec(id);
      if (res && res.error) {
        showFeedback('error', res.error);
        return;
      }
      setGlobalAttributes(prev => ({
        ...prev,
        specs: prev.specs.filter(s => s.id !== id)
      }));
      showFeedback('success', 'Specification deleted.');
      if (catalogMainView === 'products') fetchCatalog();
      await fetchGlobalAttributes();
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to delete specification');
    }
  };

  // Size Actions
  const handleSaveSize = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedProduct?.id && catalogMainView === 'products') {
        // @ts-ignore
        await window.electron.makeSaveSize({ ...editingSize, product_id: selectedProduct.id });
        if (catalogMainView === 'products') fetchCatalog();
      } else {
        // @ts-ignore
        const res = await window.electron.makeSaveGlobalAttribute({
          type: 'size',
          id: editingSize.id,
          size_label: editingSize.size_label?.trim() || null,
          length: editingSize.length,
          width: editingSize.width,
          height: editingSize.height,
          diameter: editingSize.diameter,
          unit: editingSize.unit || 'mm',
          is_active: editingSize.is_active !== undefined ? editingSize.is_active : true
        });
        if (res && res.error) {
          showFeedback('error', res.error);
          return;
        }
        const savedSize = res?.attribute;
        if (savedSize) {
          setGlobalAttributes(prev => {
            const exists = prev.sizes.some(s => s.id === savedSize.id);
            const next = exists
              ? prev.sizes.map(s => s.id === savedSize.id ? savedSize : s)
              : [...prev.sizes, savedSize];
            return { ...prev, sizes: next };
          });
        }
        await fetchGlobalAttributes();
      }
      setShowSizeModal(false);
      showFeedback('success', editingSize.id ? 'Dimensions updated.' : 'Dimensions saved.');
      if (catalogMainView === 'products') fetchCatalog();
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to save dimensions');
    }
  };

  const handleDeleteSize = async (id: number, label?: string) => {
    if (!window.confirm(`Delete size ${label ? `"${label}"` : ''}?`)) return;
    try {
      // @ts-ignore
      const res = await window.electron.makeDeleteSize(id);
      if (res && res.error) {
        showFeedback('error', res.error);
        return;
      }
      setGlobalAttributes(prev => ({
        ...prev,
        sizes: prev.sizes.filter(s => s.id !== id)
      }));
      showFeedback('success', 'Size deleted.');
      if (catalogMainView === 'products') fetchCatalog();
      await fetchGlobalAttributes();
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to delete size');
    }
  };

  // Color Actions
  const handleSaveColor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingColor.color_name?.trim()) {
      showFeedback('error', 'Color name is required.');
      return;
    }
    try {
      if (selectedProduct?.id && catalogMainView === 'products') {
        // @ts-ignore
        await window.electron.makeSaveColor({ ...editingColor, product_id: selectedProduct.id });
        if (catalogMainView === 'products') fetchCatalog();
      } else {
        // @ts-ignore
        const res = await window.electron.makeSaveGlobalAttribute({
          type: 'color',
          id: editingColor.id,
          color_name: editingColor.color_name.trim(),
          color_code: editingColor.color_code?.trim() || null,
          image_url: editingColor.image_url || null,
          is_active: editingColor.is_active !== undefined ? editingColor.is_active : true
        });
        if (res && res.error) {
          showFeedback('error', res.error);
          return;
        }
        const savedColor = res?.attribute;
        if (savedColor) {
          setGlobalAttributes(prev => {
            const exists = prev.colors.some(c => c.id === savedColor.id);
            const next = exists
              ? prev.colors.map(c => c.id === savedColor.id ? savedColor : c)
              : [...prev.colors, savedColor];
            return { ...prev, colors: next.sort((a, b) => (a.color_name || '').localeCompare(b.color_name || '')) };
          });
        }
        await fetchGlobalAttributes();
      }
      setShowColorModal(false);
      showFeedback('success', editingColor.id ? 'Color finish updated.' : 'Color finish saved.');
      if (catalogMainView === 'products') fetchCatalog();
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to save color finish');
    }
  };

  const handleDeleteColor = async (id: number, name?: string) => {
    if (!window.confirm(`Delete color ${name ? `"${name}"` : ''}?`)) return;
    try {
      // @ts-ignore
      const res = await window.electron.makeDeleteColor(id);
      if (res && res.error) {
        showFeedback('error', res.error);
        return;
      }
      setGlobalAttributes(prev => ({
        ...prev,
        colors: prev.colors.filter(c => c.id !== id)
      }));
      showFeedback('success', 'Color removed.');
      if (catalogMainView === 'products') fetchCatalog();
      await fetchGlobalAttributes();
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to delete color');
    }
  };

  const filteredHistory = (historyData?.history || []).filter(item => {
    if (!historySearch.trim()) return true;
    const term = historySearch.toLowerCase();
    return (
      (item.order_number || '').toLowerCase().includes(term) ||
      (item.customer_name || '').toLowerCase().includes(term) ||
      (item.customer_phone || '').toLowerCase().includes(term) ||
      (item.location_landmark || '').toLowerCase().includes(term) ||
      (item.spec_name || '').toLowerCase().includes(term) ||
      (item.size_label || '').toLowerCase().includes(term) ||
      (item.color_name || '').toLowerCase().includes(term) ||
      (item.status || '').toLowerCase().includes(term) ||
      (item.salesperson_name || '').toLowerCase().includes(term)
    );
  });

  return (
    <DashboardLayout title="Customized Product Database">
      <div style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>MAKE Product Catalog</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Define customized furniture templates, manage specs &amp; finishes, and track complete purchasing &amp; sales history
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => { fetchCatalog(); fetchGlobalAttributes(); if (selectedProduct?.id) fetchProductHistory(selectedProduct.id); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button
              onClick={handleClearDraft}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--card-bg)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#ef4444', fontWeight: 600 }}
              title="Clear all buffered drafts and search text"
            >
              <RotateCcw size={15} /> Clear Draft
            </button>
            <button 
              onClick={handleOpenNewProduct}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(59,130,246,0.25)' }}>
              <Plus size={16} /> New Product
            </button>
          </div>
        </div>

        {/* Top View Selector: Products Catalog vs Global Attributes */}
        <div data-tutorial="make-product-catalog" style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <button
            onClick={() => {
              setCatalogMainView('products');
              saveProductCatalogDraft({ catalogMainView: 'products' });
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
              borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
              background: catalogMainView === 'products' ? '#3b82f6' : 'var(--bg-secondary)',
              color: catalogMainView === 'products' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            <Package size={16} /> Products Catalog ({products.length})
          </button>
          <button
            onClick={() => {
              setCatalogMainView('attributes');
              saveProductCatalogDraft({ catalogMainView: 'attributes' });
              fetchGlobalAttributes();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
              borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
              background: catalogMainView === 'attributes' ? '#3b82f6' : 'var(--bg-secondary)',
              color: catalogMainView === 'attributes' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            <Layers size={16} /> Global Attributes Library ({((globalAttributes?.categories?.length || 0) + (globalAttributes?.specs?.length || 0) + (globalAttributes?.sizes?.length || 0) + (globalAttributes?.colors?.length || 0))})
          </button>
        </div>

        {/* Feedback Alert */}
        <AnimatePresence>
          {msg && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ 
                padding: '12px 16px', borderRadius: '10px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px',
                background: msg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${msg.type === 'success' ? '#22c55e' : '#ef4444'}`,
                color: msg.type === 'success' ? '#16a34a' : '#dc2626', fontSize: '0.9rem', fontWeight: 500
              }}>
              {msg.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              {msg.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main 2-Panel Layout */}
        {catalogMainView === 'products' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* Left Panel: Products List */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '1.25rem', height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={17} color="#3b82f6" /> Products ({products.length})
              </h3>
            </div>

            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                placeholder="Search products..." 
                value={search} 
                onChange={(e) => {
                  const val = e.target.value;
                  setSearch(val);
                  saveProductCatalogDraft({ search: val });
                }}
                style={{ width: '100%', padding: '8px 10px 8px 32px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-primary)', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {loading && products.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>Loading catalog...</div>
              ) : products.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem', fontSize: '0.85rem' }}>No products found</div>
              ) : (
                products.map((p) => {
                  const isSelected = selectedProduct?.id === p.id;
                  const purchasedCount = p.purchased_count || 0;
                  return (
                    <div 
                      key={p.id}
                      onClick={() => setSelectedProduct(p)}
                      style={{ 
                        padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
                        background: isSelected ? 'rgba(59,130,246,0.1)' : 'var(--bg-secondary)',
                        border: `1px solid ${isSelected ? '#3b82f6' : 'var(--border-color)'}`
                      }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {p.main_image ? (
                          <img src={p.main_image} alt={p.product_name} style={{ width: '42px', height: '42px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-color)' }} />
                        ) : (
                          <div style={{ width: '42px', height: '42px', borderRadius: '6px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontWeight: 800, fontSize: '0.9rem' }}>
                            {p.product_code?.slice(0, 2) || 'PR'}
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#3b82f6', letterSpacing: '0.04em' }}>{p.product_code}</span>
                            {purchasedCount > 0 ? (
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, background: 'rgba(16,185,129,0.15)', color: '#059669', padding: '1px 6px', borderRadius: '4px' }}>
                                🛒 {purchasedCount} sold
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>0 sold</span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>{p.product_name}</div>
                          <div style={{ display: 'flex', gap: '8px', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            <span>📋 {p.specifications?.length || 0} specs</span>
                            <span>📏 {p.sizes?.length || 0} sizes</span>
                            <span>🎨 {p.colors?.length || 0} colors</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel: Selected Product, Specifications, Sizes, Colors & Purchase History */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '1.5rem', minHeight: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
            {!selectedProduct ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '3rem' }}>
                Select a product from the left or click &quot;New Product&quot; to begin
              </div>
            ) : (
              <div>
                {/* Product Overview Header Card */}
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                      {selectedProduct.main_image ? (
                        <div style={{ position: 'relative' }}>
                          <img src={selectedProduct.main_image} alt={selectedProduct.product_name} style={{ width: '90px', height: '90px', borderRadius: '10px', objectFit: 'cover', border: '1px solid var(--border-color)', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }} />
                          <span style={{ position: 'absolute', bottom: '-6px', right: '-6px', background: '#10b981', color: '#fff', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>NAS</span>
                        </div>
                      ) : (
                        <div style={{ width: '90px', height: '90px', borderRadius: '10px', background: 'rgba(59,130,246,0.1)', border: '1.5px dashed #3b82f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#3b82f6' }}>
                          <ImageIcon size={24} />
                          <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>No Image</span>
                        </div>
                      )}

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                            {selectedProduct.product_code}
                          </span>
                          <span style={{ background: selectedProduct.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: selectedProduct.is_active ? '#16a34a' : '#dc2626', padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600 }}>
                            {selectedProduct.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <span style={{ background: 'rgba(16,185,129,0.15)', color: '#059669', padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <ShoppingCart size={12} /> {historyData?.totalQuantity || selectedProduct.purchased_count || 0} Units Purchased
                          </span>
                        </div>
                        <h2 style={{ margin: '6px 0 4px', fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {selectedProduct.product_name}
                        </h2>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '650px' }}>
                          {selectedProduct.description || 'No description provided.'}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => setActiveTab('history')}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: activeTab === 'history' ? '#059669' : 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: activeTab === 'history' ? '#fff' : '#059669' }}>
                        <HistoryIcon size={14} /> Purchase History ({historyData?.totalQuantity || selectedProduct.purchased_count || 0})
                      </button>
                      <button 
                        onClick={() => handleOpenEditProduct(selectedProduct)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        <Edit2 size={13} /> Edit Product
                      </button>
                      <button 
                        onClick={() => selectedProduct.id && handleDeleteProduct(selectedProduct.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#ef4444' }}>
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </div>
                </div>

                {/* Filter Navigation Tabs */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button 
                      onClick={() => { setActiveTab('all'); saveProductCatalogDraft({ activeTab: 'all' }); }}
                      style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, background: activeTab === 'all' ? '#3b82f6' : 'var(--bg-secondary)', color: activeTab === 'all' ? '#fff' : 'var(--text-secondary)' }}>
                      All Overview
                    </button>
                    <button 
                      onClick={() => { setActiveTab('specs'); saveProductCatalogDraft({ activeTab: 'specs' }); }}
                      style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, background: activeTab === 'specs' ? '#8b5cf6' : 'var(--bg-secondary)', color: activeTab === 'specs' ? '#fff' : 'var(--text-secondary)' }}>
                      📋 Specifications ({selectedProduct.specifications?.length || 0})
                    </button>
                    <button 
                      onClick={() => { setActiveTab('sizes'); saveProductCatalogDraft({ activeTab: 'sizes' }); }}
                      style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, background: activeTab === 'sizes' ? '#10b981' : 'var(--bg-secondary)', color: activeTab === 'sizes' ? '#fff' : 'var(--text-secondary)' }}>
                      📏 Sizes &amp; Dimensions ({selectedProduct.sizes?.length || 0})
                    </button>
                    <button 
                      onClick={() => { setActiveTab('colors'); saveProductCatalogDraft({ activeTab: 'colors' }); }}
                      style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, background: activeTab === 'colors' ? '#f59e0b' : 'var(--bg-secondary)', color: activeTab === 'colors' ? '#fff' : 'var(--text-secondary)' }}>
                      🎨 Colors &amp; Finishes ({selectedProduct.colors?.length || 0})
                    </button>
                    <button 
                      onClick={() => { setActiveTab('history'); saveProductCatalogDraft({ activeTab: 'history' }); }}
                      style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, background: activeTab === 'history' ? '#059669' : 'rgba(16,185,129,0.1)', color: activeTab === 'history' ? '#fff' : '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShoppingCart size={14} /> Purchase History ({historyData?.totalQuantity || selectedProduct.purchased_count || 0})
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button 
                      onClick={() => { setEditingSpec({ is_active: true }); setShowSpecModal(true); }}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                      <Plus size={13} /> Add Spec
                    </button>
                    <button 
                      onClick={() => { setEditingSize({ unit: 'mm', is_active: true }); setShowSizeModal(true); }}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                      <Plus size={13} /> Add Size
                    </button>
                    <button 
                      onClick={() => { setEditingColor({ is_active: true }); setShowColorModal(true); }}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                      <Plus size={13} /> Add Color
                    </button>
                  </div>
                </div>

                {/* Tab Views */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  
                  {/* Purchase History Tab / Section */}
                  {(activeTab === 'all' || activeTab === 'history') && (
                    <div style={{ background: 'var(--card-bg)', border: '1.5px solid rgba(16,185,129,0.3)', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 4px 14px rgba(0,0,0,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: '#059669' }}>
                            <HistoryIcon size={18} /> Purchase &amp; Order History for {selectedProduct.product_name}
                          </h3>
                          <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Full log of customer sales orders, specifications chosen, quantities, and production lifecycle
                          </p>
                        </div>

                        {/* History Search */}
                        <div style={{ position: 'relative', minWidth: '220px' }}>
                          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                          <input 
                            type="text" 
                            placeholder="Filter order history..." 
                            value={historySearch} 
                            onChange={(e) => {
                              const val = e.target.value;
                              setHistorySearch(val);
                              saveProductCatalogDraft({ historySearch: val });
                            }}
                            style={{ width: '100%', padding: '6px 10px 6px 30px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>

                      {/* 4 Summary Stat Cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '1.25rem' }}>
                        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Purchased</div>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                            {historyData?.totalQuantity || 0} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>units</span>
                          </div>
                        </div>

                        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Distinct Orders</div>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#3b82f6', marginTop: '2px' }}>
                            {historyData?.orderCount || 0} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>orders</span>
                          </div>
                        </div>

                        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>In Production</div>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>
                            {(historyData?.history || []).filter(h => h.status === 'In Production' || h.status === 'Cutting' || h.status === 'Welding').length} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>active</span>
                          </div>
                        </div>

                        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Delivered / Done</div>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#8b5cf6', marginTop: '2px' }}>
                            {(historyData?.history || []).filter(h => h.status === 'Delivered' || h.status === 'Completed').length} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>completed</span>
                          </div>
                        </div>
                      </div>

                      {/* Orders Table */}
                      {loadingHistory ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          Loading purchase and order history...
                        </div>
                      ) : filteredHistory.length === 0 ? (
                        <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          <ShoppingCart size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                          <div>No purchase history found for this product yet.</div>
                          <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Orders created via Sales Portal or Workshop will automatically appear here.</div>
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Order Ref</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Date</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Customer &amp; Landmark</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Spec / Dimensions / Color</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>Qty</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Channel / Salesman</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Production Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredHistory.map((item) => (
                                <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#3b82f6', fontFamily: 'monospace' }}>
                                    {item.order_number}
                                  </td>
                                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                    {item.created_at ? new Date(item.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                                  </td>
                                  <td style={{ padding: '10px 12px' }}>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.customer_name}</div>
                                    {item.customer_phone && item.customer_phone !== '—' && (
                                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>📞 {item.customer_phone}</div>
                                    )}
                                    {item.location_landmark && item.location_landmark !== '—' && (
                                      <div style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: 600, marginTop: '2px' }}>📍 {item.location_landmark}</div>
                                    )}
                                  </td>
                                  <td style={{ padding: '10px 12px' }}>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.spec_name}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                      📏 {item.size_label} • 🎨 {item.color_name}
                                    </div>
                                    {item.salesperson_note && (
                                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '2px' }}>
                                        &quot;{item.salesperson_note}&quot;
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                    <span style={{ fontWeight: 800, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '3px 8px', borderRadius: '6px', fontSize: '0.85rem' }}>
                                      {item.quantity}
                                    </span>
                                  </td>
                                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.salesperson_name}</div>
                                    {item.designer_name && item.designer_name !== '—' && (
                                      <div style={{ fontSize: '0.7rem' }}>Designer: {item.designer_name}</div>
                                    )}
                                  </td>
                                  <td style={{ padding: '10px 12px' }}>
                                    <span style={{ 
                                      display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                                      background: item.status === 'Delivered' ? 'rgba(34,197,94,0.15)' : (item.status === 'In Production' ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)'),
                                      color: item.status === 'Delivered' ? '#16a34a' : (item.status === 'In Production' ? '#2563eb' : '#d97706')
                                    }}>
                                      {item.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section 1: Specifications */}
                  {(activeTab === 'all' || activeTab === 'specs') && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Layers size={18} color="#8b5cf6" /> Specifications &amp; Details ({selectedProduct.specifications?.length || 0})
                        </h3>
                        <button 
                          onClick={() => { setEditingSpec({ is_active: true }); setShowSpecModal(true); }}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                          <Plus size={13} /> Add Specification
                        </button>
                      </div>

                      {(selectedProduct.specifications || []).length === 0 ? (
                        <div style={{ background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '10px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          No specifications added yet. Add materials, build methods, or production requirements.
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                          {selectedProduct.specifications?.map((s) => (
                            <div key={s.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 14px', position: 'relative' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                  {s.spec_code && <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#8b5cf6' }}>{s.spec_code}</div>}
                                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>{s.spec_name}</div>
                                </div>
                                <div style={{ display: 'flex', gap: '3px' }}>
                                  <button onClick={() => { setEditingSpec(s); setShowSpecModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '3px' }}>
                                    <Edit2 size={13} />
                                  </button>
                                  <button onClick={() => s.id && handleDeleteSpec(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '3px' }}>
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                              {s.spec_details && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '6px 0 0', lineHeight: 1.4 }}>
                                  {s.spec_details}
                                </p>
                              )}
                              {s.image_url && (
                                <div style={{ marginTop: '8px' }}>
                                  <img src={s.image_url} alt={s.spec_name} style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section 2: Dimensions & Sizes */}
                  {(activeTab === 'all' || activeTab === 'sizes') && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Maximize2 size={18} color="#10b981" /> Sizes &amp; Dimensions Matrix ({selectedProduct.sizes?.length || 0})
                        </h3>
                        <button 
                          onClick={() => { setEditingSize({ unit: 'mm', is_active: true }); setShowSizeModal(true); }}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                          <Plus size={13} /> Add Dimensions
                        </button>
                      </div>

                      {(selectedProduct.sizes || []).length === 0 ? (
                        <div style={{ background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '10px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          No sizes configured yet. Add rectangular (L × W × H) or round (Ø × H) options for this product.
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                          {selectedProduct.sizes?.map((sz) => (
                            <div key={sz.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 14px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                  {sz.size_label && (
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: '2px' }}>
                                      {sz.size_label}
                                    </div>
                                  )}
                                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                                    {sz.diameter ? (
                                      `Ø ${sz.diameter} ${sz.unit} ${sz.height ? `× H ${sz.height} ${sz.unit}` : ''}`
                                    ) : (
                                      `${sz.length || 0} × ${sz.width || 0} × ${sz.height || 0} ${sz.unit}`
                                    )}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                    {sz.diameter ? 'Round Shape' : 'Rectangular Shape'}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '3px' }}>
                                  <button onClick={() => { setEditingSize(sz); setShowSizeModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '3px' }}>
                                    <Edit2 size={13} />
                                  </button>
                                  <button onClick={() => sz.id && handleDeleteSize(sz.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '3px' }}>
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section 3: Colors & Finishes */}
                  {(activeTab === 'all' || activeTab === 'colors') && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Palette size={18} color="#f59e0b" /> Colors &amp; Finishes ({selectedProduct.colors?.length || 0})
                        </h3>
                        <button 
                          onClick={() => { setEditingColor({ is_active: true }); setShowColorModal(true); }}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                          <Plus size={13} /> Add Color / Finish
                        </button>
                      </div>

                      {(selectedProduct.colors || []).length === 0 ? (
                        <div style={{ background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '10px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          No colors configured yet. Add finishes like Walnut, Teak, Natural, Matte Black, etc.
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                          {selectedProduct.colors?.map((c) => (
                            <div key={c.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {c.image_url ? (
                                  <img src={c.image_url} alt={c.color_name} style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-color)' }} />
                                ) : (
                                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: c.color_code || '#666', border: '2px solid rgba(255,255,255,0.2)', boxShadow: '0 2px 5px rgba(0,0,0,0.15)', flexShrink: 0 }} />
                                )}
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{c.color_name}</div>
                                  {c.color_code && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{c.color_code}</div>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '3px' }}>
                                <button onClick={() => { setEditingColor(c); setShowColorModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '3px' }}>
                                  <Edit2 size={13} />
                                </button>
                                <button onClick={() => c.id && handleDeleteColor(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '3px' }}>
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>

        </div>
        ) : (
          /* Global Attributes Management Library */
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '1.5rem', minHeight: 'calc(100vh - 200px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => { setAttrTab('categories'); saveProductCatalogDraft({ attrTab: 'categories' }); }}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
                    background: attrTab === 'categories' ? '#10b981' : 'var(--bg-secondary)',
                    color: attrTab === 'categories' ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  Categories ({globalAttributes?.categories?.length || 0})
                </button>
                <button
                  onClick={() => { setAttrTab('sizes'); saveProductCatalogDraft({ attrTab: 'sizes' }); }}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
                    background: attrTab === 'sizes' ? '#3b82f6' : 'var(--bg-secondary)',
                    color: attrTab === 'sizes' ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  Sizes ({globalAttributes?.sizes?.length || 0})
                </button>
                <button
                  onClick={() => { setAttrTab('colors'); saveProductCatalogDraft({ attrTab: 'colors' }); }}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
                    background: attrTab === 'colors' ? '#ec4899' : 'var(--bg-secondary)',
                    color: attrTab === 'colors' ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  Colors ({globalAttributes?.colors?.length || 0})
                </button>
                <button
                  onClick={() => { setAttrTab('specs'); saveProductCatalogDraft({ attrTab: 'specs' }); }}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
                    background: attrTab === 'specs' ? '#8b5cf6' : 'var(--bg-secondary)',
                    color: attrTab === 'specs' ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  Specifications ({globalAttributes?.specs?.length || 0})
                </button>
              </div>

              {canManageGlobal && (
                <button
                  onClick={() => {
                    if (attrTab === 'categories') {
                      setEditingCategory({ is_active: true });
                      setShowCategoryModal(true);
                    } else if (attrTab === 'specs') {
                      setEditingSpec({ is_active: true });
                      setShowSpecModal(true);
                    } else if (attrTab === 'sizes') {
                      setEditingSize({ unit: 'mm', is_active: true });
                      setShowSizeModal(true);
                    } else {
                      setEditingColor({ is_active: true });
                      setShowColorModal(true);
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
                >
                  <Plus size={15} /> Add Global {attrTab === 'categories' ? 'Category' : attrTab === 'sizes' ? 'Size' : attrTab === 'colors' ? 'Color' : 'Specification'}
                </button>
              )}
            </div>

            {attrTab === 'categories' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {(!globalAttributes?.categories || globalAttributes.categories.length === 0) ? (
                  <div style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center', gridColumn: '1 / -1' }}>No global categories defined yet. Click &quot;Add Global Category&quot; above to create one.</div>
                ) : (
                  (globalAttributes.categories || []).map((cat: any) => (
                    <div key={cat.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                            {cat.code || 'CAT'}
                          </span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: cat.is_active ? '#10b981' : '#94a3b8' }}>
                            {cat.is_active ? '● Active' : '○ Inactive'}
                          </span>
                        </div>
                        <h4 style={{ margin: '8px 0 2px', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{cat.name}</h4>
                        {cat.description && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{cat.description}</p>}
                      </div>
                      {canManageGlobal && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                          <button
                            type="button"
                            onClick={() => { setEditingCategory(cat); setShowCategoryModal(true); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {attrTab === 'specs' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {(!globalAttributes?.specs || globalAttributes.specs.length === 0) ? (
                  <div style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center', gridColumn: '1 / -1' }}>No global specifications defined yet. Click &quot;Add Global Specification&quot; above to create one.</div>
                ) : (
                  (globalAttributes.specs || []).map((s: any) => (
                    <div key={s.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        {s.spec_code && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{s.spec_code}</span>}
                        <h4 style={{ margin: '6px 0 2px', fontSize: '0.92rem', fontWeight: 700 }}>{s.spec_name}</h4>
                        {s.spec_details && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{s.spec_details}</p>}
                      </div>
                      {canManageGlobal && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                          <button
                            type="button"
                            onClick={() => { setEditingSpec(s); setShowSpecModal(true); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSpec(s.id, s.spec_name)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {attrTab === 'sizes' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {(!globalAttributes?.sizes || globalAttributes.sizes.length === 0) ? (
                  <div style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center', gridColumn: '1 / -1' }}>No global sizes defined yet. Click &quot;Add Global Size&quot; above to create one.</div>
                ) : (
                  (globalAttributes.sizes || []).map((sz: any) => (
                    <div key={sz.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <h4 style={{ margin: '0 0 4px', fontSize: '0.92rem', fontWeight: 700 }}>{sz.size_label || 'Standard Dimension'}</h4>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          L: {sz.length || '-'} × W: {sz.width || '-'} × H: {sz.height || '-'} {sz.unit}
                        </p>
                      </div>
                      {canManageGlobal && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                          <button
                            type="button"
                            onClick={() => { setEditingSize(sz); setShowSizeModal(true); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSize(sz.id, sz.size_label)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {attrTab === 'colors' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {(!globalAttributes?.colors || globalAttributes.colors.length === 0) ? (
                  <div style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center', gridColumn: '1 / -1' }}>No global colors defined yet. Click &quot;Add Global Color&quot; above to create one.</div>
                ) : (
                  (globalAttributes.colors || []).map((c: any) => (
                    <div key={c.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {c.color_code ? (
                            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: c.color_code, border: '1px solid rgba(0,0,0,0.2)' }} />
                          ) : (
                            <Palette size={24} color="var(--text-secondary)" />
                          )}
                          <div>
                            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>{c.color_name}</h4>
                            {c.color_code && <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{c.color_code}</span>}
                          </div>
                        </div>
                      </div>
                      {canManageGlobal && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                          <button
                            type="button"
                            onClick={() => { setEditingColor(c); setShowColorModal(true); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteColor(c.id, c.color_name)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal: Create/Edit Product */}
        {showProductModal && (
          <ProductCreateModal
            isOpen={showProductModal}
            onClose={handleCloseProductModal}
            onSuccess={handleProductSaved}
            initialProduct={editingProduct}
            globalAttributes={globalAttributes}
            onRefreshGlobalAttributes={fetchGlobalAttributes}
            isDraftManaged={!editingProduct?.id}
            onClearDraft={() => {
              setEditingProduct({ is_active: true });
            }}
          />
        )}

        {/* Modal: Create/Edit Category */}
        {showCategoryModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ background: 'var(--card-bg)', borderRadius: '16px', width: '100%', maxWidth: '450px', padding: '1.5rem', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{editingCategory.id ? 'Edit Category' : 'New Category'}</h3>
                <button onClick={() => setShowCategoryModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
              </div>
              <form onSubmit={handleSaveCategory} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>CATEGORY NAME *</label>
                  <input
                    type="text"
                    placeholder="e.g. Executive Desks, Conference Tables, Ergonomic Chairs"
                    value={editingCategory.name || ''}
                    onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                    required
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>CATEGORY CODE (OPTIONAL)</label>
                  <input
                    type="text"
                    placeholder="e.g. CAT-DESK, CAT-CONF"
                    value={editingCategory.code || ''}
                    onChange={(e) => setEditingCategory({ ...editingCategory, code: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>DESCRIPTION (OPTIONAL)</label>
                  <textarea
                    rows={3}
                    placeholder="Details about this product category..."
                    value={editingCategory.description || ''}
                    onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="cat_is_active"
                    checked={editingCategory.is_active !== false}
                    onChange={(e) => setEditingCategory({ ...editingCategory, is_active: e.target.checked })}
                  />
                  <label htmlFor="cat_is_active" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>Active in Catalog</label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => setShowCategoryModal(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ padding: '8px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Save Category</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Create/Edit Spec */}
        {showSpecModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ background: 'var(--card-bg)', borderRadius: '16px', width: '100%', maxWidth: '450px', padding: '1.5rem', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{editingSpec.id ? 'Edit Specification' : 'New Specification'}</h3>
                <button onClick={() => setShowSpecModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
              </div>
              <form onSubmit={handleSaveSpec} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>SPEC CODE</label>
                  <input type="text" placeholder="e.g. SP-WOOD-01" value={editingSpec.spec_code || ''} onChange={(e) => setEditingSpec({ ...editingSpec, spec_code: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>SPECIFICATION NAME *</label>
                  <input type="text" placeholder="e.g. Solid Teak Wood Frame + High Density Foam" value={editingSpec.spec_name || ''} onChange={(e) => setEditingSpec({ ...editingSpec, spec_name: e.target.value })} required
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>DETAILS &amp; PRODUCTION NOTES</label>
                  <textarea rows={3} placeholder="Wood seasoning details, joinery type, foam density, hardware specifications..." value={editingSpec.spec_details || ''} onChange={(e) => setEditingSpec({ ...editingSpec, spec_details: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box', resize: 'vertical' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>DRAWING / SPEC IMAGE (STORED ON NAS)</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input type="text" placeholder="https://... or click Upload" value={editingSpec.image_url || ''} onChange={(e) => setEditingSpec({ ...editingSpec, image_url: e.target.value })}
                      style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                    <button type="button" disabled={uploadingImage} onClick={() => handlePickAndUploadImage(url => setEditingSpec(prev => ({ ...prev, image_url: url })))}
                      style={{ padding: '9px 14px', background: '#8b5cf6', border: 'none', borderRadius: '8px', color: '#fff', cursor: uploadingImage ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <Upload size={14} /> {uploadingImage ? 'Uploading...' : 'Upload to NAS'}
                    </button>
                  </div>
                  {editingSpec.image_url && (
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={editingSpec.image_url} alt="Spec Preview" style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                      <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>✓ Stored on NAS Storage</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => setShowSpecModal(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ padding: '8px 18px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Save Spec</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Create/Edit Size */}
        {showSizeModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ background: 'var(--card-bg)', borderRadius: '16px', width: '100%', maxWidth: '450px', padding: '1.5rem', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{editingSize.id ? 'Edit Dimensions' : 'Add Dimensions'}</h3>
                <button onClick={() => setShowSizeModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
              </div>
              <form onSubmit={handleSaveSize} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>SIZE LABEL (OPTIONAL)</label>
                  <input type="text" placeholder="e.g. Standard King / 6-Seater / Custom 8ft" value={editingSize.size_label || ''} onChange={(e) => setEditingSize({ ...editingSize, size_label: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>LENGTH</label>
                    <input type="number" step="0.1" placeholder="e.g. 1800" value={editingSize.length || ''} onChange={(e) => setEditingSize({ ...editingSize, length: e.target.value, diameter: '' })}
                      style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>WIDTH</label>
                    <input type="number" step="0.1" placeholder="e.g. 900" value={editingSize.width || ''} onChange={(e) => setEditingSize({ ...editingSize, width: e.target.value, diameter: '' })}
                      style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>HEIGHT</label>
                    <input type="number" step="0.1" placeholder="e.g. 750" value={editingSize.height || ''} onChange={(e) => setEditingSize({ ...editingSize, height: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>DIAMETER (FOR ROUND)</label>
                    <input type="number" step="0.1" placeholder="e.g. 1200" value={editingSize.diameter || ''} onChange={(e) => setEditingSize({ ...editingSize, diameter: e.target.value, length: '', width: '' })}
                      style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>MEASUREMENT UNIT</label>
                  <select value={editingSize.unit || 'mm'} onChange={(e) => setEditingSize({ ...editingSize, unit: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }}>
                    <option value="mm">mm (Millimeters)</option>
                    <option value="cm">cm (Centimeters)</option>
                    <option value="inch">inch (Inches)</option>
                    <option value="feet">feet (Feet)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => setShowSizeModal(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ padding: '8px 18px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Save Dimensions</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Create/Edit Color */}
        {showColorModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ background: 'var(--card-bg)', borderRadius: '16px', width: '100%', maxWidth: '420px', padding: '1.5rem', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{editingColor.id ? 'Edit Color / Finish' : 'Add Color / Finish'}</h3>
                <button onClick={() => setShowColorModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
              </div>
              <form onSubmit={handleSaveColor} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>COLOR / FINISH NAME *</label>
                  <input type="text" placeholder="e.g. Natural Teak, Walnut Brown, Matte Black" value={editingColor.color_name || ''} onChange={(e) => setEditingColor({ ...editingColor, color_name: e.target.value })} required
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>COLOR CODE / HEX SWATCH</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="color" value={editingColor.color_code || '#5c3a21'} onChange={(e) => setEditingColor({ ...editingColor, color_code: e.target.value })}
                      style={{ width: '42px', height: '38px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: 'none' }} />
                    <input type="text" placeholder="#5c3a21" value={editingColor.color_code || ''} onChange={(e) => setEditingColor({ ...editingColor, color_code: e.target.value })}
                      style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>TEXTURE / FINISH SAMPLE IMAGE (STORED ON NAS)</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input type="text" placeholder="https://... or click Upload" value={editingColor.image_url || ''} onChange={(e) => setEditingColor({ ...editingColor, image_url: e.target.value })}
                      style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                    <button type="button" disabled={uploadingImage} onClick={() => handlePickAndUploadImage(url => setEditingColor(prev => ({ ...prev, image_url: url })))}
                      style={{ padding: '9px 14px', background: '#f59e0b', border: 'none', borderRadius: '8px', color: '#fff', cursor: uploadingImage ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <Upload size={14} /> {uploadingImage ? 'Uploading...' : 'Upload to NAS'}
                    </button>
                  </div>
                  {editingColor.image_url && (
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={editingColor.image_url} alt="Color Swatch Preview" style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                      <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>✓ Stored on NAS Storage</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => setShowColorModal(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ padding: '8px 18px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Save Color</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
};

export default MakeProductCatalog;
