import React, { useState, useEffect } from 'react';
import { X, Plus, Upload, RotateCcw } from 'lucide-react';
import { canManageGlobalProductAttributes } from '../../../utils/permissions';
import { clearProductFormDraft, hasMeaningfulDraftContent, saveProductCatalogDraft } from '../../../utils/productCatalogDraft';
import { resolveImageSrc, handleImageLoadError } from '../../../utils/imageSrc';
import { formatSizeDisplay } from '../../../utils/formatSize';

export interface ProductCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (product: any) => void;
  initialProduct?: any | null;
  globalAttributes?: { categories: any[]; specs: any[]; sizes: any[]; colors: any[] };
  onRefreshGlobalAttributes?: () => Promise<void>;
  isDraftManaged?: boolean;
  onDraftChange?: (form: any) => void;
  onClearDraft?: () => void;
}

export const ProductCreateModal: React.FC<ProductCreateModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialProduct,
  globalAttributes: initialGlobalAttrs,
  onRefreshGlobalAttributes,
  isDraftManaged = false,
  onDraftChange,
  onClearDraft
}) => {
  const [internalAttrs, setInternalAttrs] = useState<{ categories: any[]; specs: any[]; sizes: any[]; colors: any[] }>({
    categories: [],
    specs: [],
    sizes: [],
    colors: []
  });

  const attrs = initialGlobalAttrs && initialGlobalAttrs.categories.length > 0 ? initialGlobalAttrs : internalAttrs;

  // Permissions
  const canManageGlobal = canManageGlobalProductAttributes();

  // Form State
  const [formData, setFormData] = useState<any>({
    product_code: '',
    product_name: '',
    description: '',
    category_id: null,
    category: null,
    main_image: '',
    is_active: true
  });

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<(number | string)[]>([]);
  const [selectedSpecIds, setSelectedSpecIds] = useState<(number | string)[]>([]);
  const [selectedSizeIds, setSelectedSizeIds] = useState<(number | string)[]>([]);
  const [selectedColorIds, setSelectedColorIds] = useState<(number | string)[]>([]);

  // Inline attribute creation state
  const [inlineNewAttrType, setInlineNewAttrType] = useState<'category' | 'spec' | 'size' | 'color' | null>(null);
  const [inlineAttrName, setInlineAttrName] = useState('');
  const [inlineAttrExtra, setInlineAttrExtra] = useState('');

  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch global attributes if not provided or empty
  const fetchGlobalAttrs = async () => {
    try {
      // @ts-ignore
      if (window.electron?.makeGetGlobalAttributes) {
        // @ts-ignore
        const res = await window.electron.makeGetGlobalAttributes();
        if (res) {
          setInternalAttrs({
            categories: res.categories || [],
            specs: res.specs || [],
            sizes: res.sizes || [],
            colors: res.colors || []
          });
        }
      }
    } catch (e) {
      console.error('[ProductCreateModal] Failed to fetch global attributes:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (!initialGlobalAttrs || !initialGlobalAttrs.categories || initialGlobalAttrs.categories.length === 0) {
        fetchGlobalAttrs();
      }
    }
  }, [isOpen, initialGlobalAttrs]);

  // Sync initial product data on modal open
  useEffect(() => {
    if (!isOpen) return;

    if (initialProduct) {
      setFormData({
        id: initialProduct.id,
        product_code: initialProduct.product_code || '',
        product_name: initialProduct.product_name || '',
        description: initialProduct.description || '',
        category_id: initialProduct.category_id || null,
        category: initialProduct.category || null,
        main_image: initialProduct.main_image || '',
        is_active: initialProduct.is_active !== undefined ? initialProduct.is_active : true
      });
      const catIds = Array.isArray(initialProduct.category_ids) && initialProduct.category_ids.length > 0
        ? initialProduct.category_ids
        : (initialProduct.category_id ? [initialProduct.category_id] : []);
      setSelectedCategoryIds(catIds);
      setSelectedSpecIds((initialProduct.specifications || []).map((s: any) => s.id));
      setSelectedSizeIds((initialProduct.sizes || []).map((s: any) => s.id));
      setSelectedColorIds((initialProduct.colors || []).map((c: any) => c.id));
    } else {
      setFormData({
        product_code: '',
        product_name: '',
        description: '',
        category_id: null,
        category: null,
        main_image: '',
        is_active: true
      });
      setSelectedCategoryIds([]);
      setSelectedSpecIds([]);
      setSelectedSizeIds([]);
      setSelectedColorIds([]);
    }
    setErrorMessage(null);
    setInlineNewAttrType(null);
  }, [isOpen, initialProduct]);

  // Notify parent of draft updates (only when drafting a new product)
  const notifyDraftUpdate = (updatedForm: any, catIds: any[], specIds: any[], sizeIds: any[], colorIds: any[]) => {
    if (isDraftManaged && !initialProduct?.id) {
      const payload = {
        ...updatedForm,
        selectedCategoryIds: catIds,
        selectedSpecIds: specIds,
        selectedSizeIds: sizeIds,
        selectedColorIds: colorIds,
        isOpen: true
      };
      saveProductCatalogDraft({ productForm: payload });
      if (onDraftChange) onDraftChange(payload);
    }
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData((prev: any) => {
      const next = { ...prev, [field]: value };
      notifyDraftUpdate(next, selectedCategoryIds, selectedSpecIds, selectedSizeIds, selectedColorIds);
      return next;
    });
  };

  const handlePickAndUploadImage = async () => {
    setUploadingImage(true);
    setErrorMessage(null);
    try {
      // @ts-ignore
      const url = await window.electron.pickImage();
      if (url) {
        handleFieldChange('main_image', url);
      }
    } catch (e: any) {
      console.error(e);
      setErrorMessage('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCreateInlineAttribute = async () => {
    if (!inlineAttrName.trim() || !inlineNewAttrType) return;
    if (!canManageGlobal) {
      alert('Forbidden: Global attribute management requires "manage_global_product_attributes" permission.');
      return;
    }

    try {
      const payload: any = { type: inlineNewAttrType };
      if (inlineNewAttrType === 'category') {
        payload.name = inlineAttrName.trim();
        payload.code = inlineAttrExtra.trim() || undefined;
      } else if (inlineNewAttrType === 'spec') {
        payload.spec_name = inlineAttrName.trim();
        payload.spec_details = inlineAttrExtra.trim() || undefined;
      } else if (inlineNewAttrType === 'size') {
        payload.size_label = inlineAttrName.trim();
        payload.unit = inlineAttrExtra.trim() || 'mm';
      } else if (inlineNewAttrType === 'color') {
        payload.color_name = inlineAttrName.trim();
        payload.color_code = inlineAttrExtra.trim() || undefined;
      }

      // @ts-ignore
      if (window.electron?.makeSaveGlobalAttribute) {
        // @ts-ignore
        const created = await window.electron.makeSaveGlobalAttribute(payload);
        if (created && created.error) {
          alert('Failed to create attribute: ' + created.error);
          return;
        }

        await fetchGlobalAttrs();
        if (onRefreshGlobalAttributes) {
          await onRefreshGlobalAttributes();
        }

        const attrId = created?.attribute?.id ?? created?.id;
        if (attrId) {
          if (inlineNewAttrType === 'category') {
            setSelectedCategoryIds(prev => {
              const next = [...prev, attrId];
              notifyDraftUpdate(formData, next, selectedSpecIds, selectedSizeIds, selectedColorIds);
              return next;
            });
            handleFieldChange('category_id', attrId);
            handleFieldChange('category', inlineAttrName.trim());
          } else if (inlineNewAttrType === 'spec') {
            setSelectedSpecIds(prev => {
              const next = [...prev, attrId];
              notifyDraftUpdate(formData, selectedCategoryIds, next, selectedSizeIds, selectedColorIds);
              return next;
            });
          } else if (inlineNewAttrType === 'size') {
            setSelectedSizeIds(prev => {
              const next = [...prev, attrId];
              notifyDraftUpdate(formData, selectedCategoryIds, selectedSpecIds, next, selectedColorIds);
              return next;
            });
          } else if (inlineNewAttrType === 'color') {
            setSelectedColorIds(prev => {
              const next = [...prev, attrId];
              notifyDraftUpdate(formData, selectedCategoryIds, selectedSpecIds, selectedSizeIds, next);
              return next;
            });
          }
        }
      }

      setInlineNewAttrType(null);
      setInlineAttrName('');
      setInlineAttrExtra('');
    } catch (err: any) {
      alert('Failed to create attribute: ' + (err.message || 'Permission denied'));
    }
  };

  const handleClearFormDraft = () => {
    const hasContent = hasMeaningfulDraftContent({
      productForm: {
        ...formData,
        selectedCategoryIds,
        selectedSpecIds,
        selectedSizeIds,
        selectedColorIds
      }
    });

    if (hasContent) {
      if (!window.confirm('Clear all unsaved inputs in this product draft?')) {
        return;
      }
    }

    clearProductFormDraft();
    setFormData({
      product_code: '',
      product_name: '',
      description: '',
      category_id: null,
      category: null,
      main_image: '',
      is_active: true
    });
    setSelectedCategoryIds([]);
    setSelectedSpecIds([]);
    setSelectedSizeIds([]);
    setSelectedColorIds([]);
    setErrorMessage(null);
    if (onClearDraft) onClearDraft();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const code = (formData.product_code || '').trim().toUpperCase();
    const name = (formData.product_name || '').trim();

    if (!code || !name) {
      setErrorMessage('Product Code and Product Name are required.');
      return;
    }

    setSaving(true);
    try {
      const primaryCatId = selectedCategoryIds.length > 0 ? Number(selectedCategoryIds[0]) : null;
      const primaryCat = (attrs.categories || []).find((c: any) => c.id === primaryCatId);

      const payload = {
        ...formData,
        product_code: code,
        product_name: name,
        category_id: primaryCatId,
        category: primaryCat ? primaryCat.name : (formData.category || null),
        category_ids: selectedCategoryIds.map(Number),
        specIds: selectedSpecIds,
        sizeIds: selectedSizeIds,
        colorIds: selectedColorIds
      };

      // @ts-ignore
      const saved = await window.electron.makeSaveCatalogProduct(payload);
      if (!saved || !saved.id) {
        throw new Error('Server returned invalid product record');
      }

      // Assemble full product representation for immediate selection
      const fullProduct = {
        ...saved,
        specifications: (attrs.specs || []).filter((s: any) => selectedSpecIds.includes(s.id)),
        sizes: (attrs.sizes || []).filter((s: any) => selectedSizeIds.includes(s.id)),
        colors: (attrs.colors || []).filter((c: any) => selectedColorIds.includes(c.id))
      };

      // Clear the product form draft upon successful save
      clearProductFormDraft();

      onSuccess(fullProduct);
      onClose();
    } catch (err: any) {
      console.error('[ProductCreateModal] Save error:', err);
      setErrorMessage(err.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="make-modal-container" style={{ background: 'var(--card-bg)', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
            {formData.id ? 'Edit Product' : 'New Product'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {errorMessage && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: 600 }}>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              PRODUCT CODE *
            </label>
            <input
              type="text"
              placeholder="e.g. DT-01"
              value={formData.product_code || ''}
              onChange={(e) => handleFieldChange('product_code', e.target.value.toUpperCase())}
              required
              style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              PRODUCT NAME *
            </label>
            <input
              type="text"
              placeholder="e.g. Solid Teak Dining Table"
              value={formData.product_name || ''}
              onChange={(e) => handleFieldChange('product_name', e.target.value)}
              required
              style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              DESCRIPTION
            </label>
            <textarea
              rows={3}
              placeholder="General design notes, material overview..."
              value={formData.description || ''}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box', resize: 'vertical' }}
            />
          </div>

          {/* Category Selection (Multi-select) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                ASSIGN CATEGORIES ({selectedCategoryIds.length} selected)
              </label>
              {canManageGlobal && (
                <button
                  type="button"
                  onClick={() => { setInlineNewAttrType('category'); setInlineAttrName(''); setInlineAttrExtra(''); }}
                  style={{ background: 'none', border: 'none', color: '#10b981', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                >
                  <Plus size={12} /> Add New Category
                </button>
              )}
            </div>

            {inlineNewAttrType === 'category' && (
              <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px dashed #10b981', borderRadius: '8px', padding: '8px', marginBottom: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  placeholder="Category Name (e.g. Table, Sofa, Chair)..."
                  value={inlineAttrName}
                  onChange={e => setInlineAttrName(e.target.value)}
                  style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}
                  autoFocus
                />
                <button type="button" onClick={handleCreateInlineAttribute} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Add</button>
                <button type="button" onClick={() => setInlineNewAttrType(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={14} /></button>
              </div>
            )}

            <div style={{ maxHeight: '110px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {(!attrs?.categories || attrs.categories.length === 0) ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No global categories found</span>
              ) : (
                (attrs.categories || []).map((cat: any) => (
                  <label key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.includes(cat.id)}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...selectedCategoryIds, cat.id]
                          : selectedCategoryIds.filter(id => id !== cat.id);
                        setSelectedCategoryIds(next);
                        notifyDraftUpdate(formData, next, selectedSpecIds, selectedSizeIds, selectedColorIds);
                      }}
                    />
                    <span>{cat.name} {cat.code ? `[${cat.code}]` : ''}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              PRODUCT IMAGE
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                disabled={uploadingImage}
                onClick={handlePickAndUploadImage}
                style={{ padding: '9px 14px', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', cursor: uploadingImage ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                <Upload size={14} /> {uploadingImage ? 'Uploading...' : 'Upload Image'}
              </button>
              {formData.main_image && (
                <button
                  type="button"
                  onClick={() => handleFieldChange('main_image', '')}
                  style={{ padding: '9px 12px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                  Remove
                </button>
              )}
            </div>
            {formData.main_image && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img src={resolveImageSrc(formData.main_image)} alt="Preview" onError={e => handleImageLoadError(e, formData.main_image)} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>✓ Image uploaded</span>
              </div>
            )}
          </div>

          {/* Attributes Assignment */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Specifications */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  ASSIGN SPECIFICATIONS ({selectedSpecIds.length} selected)
                </label>
                {canManageGlobal && (
                  <button
                    type="button"
                    onClick={() => { setInlineNewAttrType('spec'); setInlineAttrName(''); setInlineAttrExtra(''); }}
                    style={{ background: 'none', border: 'none', color: '#8b5cf6', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    <Plus size={12} /> Add New Spec
                  </button>
                )}
              </div>

              {inlineNewAttrType === 'spec' && (
                <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px dashed #8b5cf6', borderRadius: '8px', padding: '8px', marginBottom: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    placeholder="Spec Name..."
                    value={inlineAttrName}
                    onChange={e => setInlineAttrName(e.target.value)}
                    style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}
                  />
                  <button type="button" onClick={handleCreateInlineAttribute} style={{ background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Add</button>
                  <button type="button" onClick={() => setInlineNewAttrType(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={14} /></button>
                </div>
              )}

              <div style={{ maxHeight: '110px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(!attrs?.specs || attrs.specs.length === 0) ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No global specs found</span>
                ) : (
                  (attrs.specs || []).map((s: any) => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedSpecIds.includes(s.id)}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...selectedSpecIds, s.id]
                            : selectedSpecIds.filter(id => id !== s.id);
                          setSelectedSpecIds(next);
                          notifyDraftUpdate(formData, selectedCategoryIds, next, selectedSizeIds, selectedColorIds);
                        }}
                      />
                      <span>{s.spec_name} {s.spec_code ? `[${s.spec_code}]` : ''}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Sizes */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  ASSIGN SIZES ({selectedSizeIds.length} selected)
                </label>
                {canManageGlobal && (
                  <button
                    type="button"
                    onClick={() => { setInlineNewAttrType('size'); setInlineAttrName(''); setInlineAttrExtra('mm'); }}
                    style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    <Plus size={12} /> Add New Size
                  </button>
                )}
              </div>

              {inlineNewAttrType === 'size' && (
                <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px dashed #3b82f6', borderRadius: '8px', padding: '8px', marginBottom: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    placeholder="Size Label (e.g. King, 120x60cm)..."
                    value={inlineAttrName}
                    onChange={e => setInlineAttrName(e.target.value)}
                    style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}
                  />
                  <button type="button" onClick={handleCreateInlineAttribute} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Add</button>
                  <button type="button" onClick={() => setInlineNewAttrType(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={14} /></button>
                </div>
              )}

              <div style={{ maxHeight: '110px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(!attrs?.sizes || attrs.sizes.length === 0) ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No global sizes found</span>
                ) : (
                  (attrs.sizes || []).map((sz: any) => (
                    <label key={sz.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedSizeIds.includes(sz.id)}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...selectedSizeIds, sz.id]
                            : selectedSizeIds.filter(id => id !== sz.id);
                          setSelectedSizeIds(next);
                          notifyDraftUpdate(formData, selectedCategoryIds, selectedSpecIds, next, selectedColorIds);
                        }}
                      />
                      <span>{formatSizeDisplay(sz)}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Colors */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  ASSIGN COLORS ({selectedColorIds.length} selected)
                </label>
                {canManageGlobal && (
                  <button
                    type="button"
                    onClick={() => { setInlineNewAttrType('color'); setInlineAttrName(''); setInlineAttrExtra('#000000'); }}
                    style={{ background: 'none', border: 'none', color: '#ec4899', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    <Plus size={12} /> Add New Color
                  </button>
                )}
              </div>

              {inlineNewAttrType === 'color' && (
                <div style={{ background: 'rgba(236,72,153,0.06)', border: '1px dashed #ec4899', borderRadius: '8px', padding: '8px', marginBottom: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    placeholder="Color Name..."
                    value={inlineAttrName}
                    onChange={e => setInlineAttrName(e.target.value)}
                    style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}
                  />
                  <button type="button" onClick={handleCreateInlineAttribute} style={{ background: '#ec4899', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Add</button>
                  <button type="button" onClick={() => setInlineNewAttrType(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={14} /></button>
                </div>
              )}

              <div style={{ maxHeight: '110px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(!attrs?.colors || attrs.colors.length === 0) ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No global colors found</span>
                ) : (
                  (attrs.colors || []).map((c: any) => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedColorIds.includes(c.id)}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...selectedColorIds, c.id]
                            : selectedColorIds.filter(id => id !== c.id);
                          setSelectedColorIds(next);
                          notifyDraftUpdate(formData, selectedCategoryIds, selectedSpecIds, selectedSizeIds, next);
                        }}
                      />
                      {c.color_code && (
                        <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: c.color_code, border: '1px solid #ccc', display: 'inline-block' }} />
                      )}
                      <span>{c.color_name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              {!formData.id && (
                <button
                  type="button"
                  onClick={handleClearFormDraft}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '7px 12px', background: 'transparent', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                  title="Discard draft product inputs"
                >
                  <RotateCcw size={13} /> Clear Draft
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{ padding: '8px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                {saving ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
