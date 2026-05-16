import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, ImagePlus, X, Info, Truck, SlidersHorizontal, BellRing } from 'lucide-react';
import { motion } from 'framer-motion';
import { resolveImageSrc } from '../../../utils/imageSrc';
import '../../Accounting/Masters/Masters.css';

const ProductCreate: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const editProduct: any | null = (location.state as any)?.editProduct || null;
    const isEdit = !!editProduct;

    const [units, setUnits] = useState<any[]>([]);
    const [stockGroups, setStockGroups] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [origins, setOrigins] = useState<any[]>([
        { name: 'Local', origin_key: 'LOCAL', requires_superadmin: false, is_active: true },
        { name: 'Imported', origin_key: 'IMPORTED', requires_superadmin: true, is_active: true },
    ]);
    const [attributes, setAttributes] = useState<any[]>([]);
    const [imagePath, setImagePath] = useState(editProduct?.image_path || '');
    const [imageGallery, setImageGallery] = useState<string[]>(Array.isArray(editProduct?.image_gallery) ? editProduct.image_gallery : []);
    const [attributeValues, setAttributeValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const userRole = localStorage.getItem('user_role') || '';
    const userPermissions = (() => {
        try { return JSON.parse(localStorage.getItem('user_permissions') || '{}'); } catch { return {}; }
    })();
    const canCreateImported = userRole === 'superadmin';
    const canManageLowStockAlerts = userRole === 'superadmin' || !!userPermissions.manage_low_stock_alerts;
    const [formData, setFormData] = useState({
        name:        editProduct?.name        || '',
        category:    editProduct?.category    || '',
        description: editProduct?.description || '',
        unit:        editProduct?.unit_name   || '',
        stockGroup:  editProduct?.group_name  || '',
        taxRate:     editProduct?.tax_rate    ?? 0,
        originType:  editProduct?.origin_type || 'LOCAL',
        supplierLedgerId: editProduct?.supplier_ledger_id || '',
        importedSupplierName: editProduct?.imported_supplier_name || '',
        importReference: editProduct?.import_reference || '',
        importCountry: editProduct?.import_country || '',
        lowStockThreshold: editProduct?.low_stock_threshold ?? 0,
        lowStockAlertEnabled: editProduct?.low_stock_alert_enabled !== false,
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                // @ts-ignore
                const [u, sg, ledgers, attrs, originRows, fullProduct] = await Promise.all([
                    window.electron.getUnits(),
                    window.electron.getStockGroups(),
                    window.electron.getLedgers(),
                    window.electron.getProductAttributes?.(),
                    window.electron.getProductOrigins?.(),
                    isEdit ? window.electron.getProduct?.(editProduct.id) : Promise.resolve(null),
                ]);
                setUnits(u || []);
                setStockGroups(sg || []);
                setSuppliers((ledgers || []).filter((l: any) => l.group_name === 'Sundry Creditors' || l.group?.name === 'Sundry Creditors'));
                setAttributes((attrs || []).filter((attr: any) => attr.is_active !== false));
                setOrigins((originRows || [
                    { name: 'Local', origin_key: 'LOCAL', requires_superadmin: false, is_active: true },
                    { name: 'Imported', origin_key: 'IMPORTED', requires_superadmin: true, is_active: true },
                ]).filter((origin: any) => origin.is_active !== false));
                if (fullProduct?.attributes) {
                    const values: Record<string, string> = {};
                    fullProduct.attributes.forEach((entry: any) => {
                        if (entry.attribute?.id) values[String(entry.attribute.id)] = entry.value || '';
                    });
                    setAttributeValues(values);
                }
            } catch (e) { console.error(e); }
        };
        fetchData();
    }, [isEdit, editProduct?.id]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handlePickImage = async () => {
        try {
            // @ts-ignore
            const path = await window.electron.pickImage();
            if (path) setImagePath(path);
        } catch (e) { console.error(e); }
    };

    const handleAddGalleryImage = async () => {
        try {
            // @ts-ignore
            const path = await window.electron.pickImage();
            if (path) setImageGallery(prev => [...prev, path]);
        } catch (e) { console.error(e); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) { alert('Product name is required.'); return; }
        if (!formData.stockGroup) { alert('Stock group is required to generate the product model number.'); return; }
        const selectedOrigin = origins.find(origin => origin.origin_key === formData.originType);
        if ((selectedOrigin?.requires_superadmin || formData.originType === 'IMPORTED') && !canCreateImported) {
            alert(`${selectedOrigin?.name || 'Imported'} products can only be created or updated by Super Admin.`);
            return;
        }
        setSaving(true);
        try {
            const userName = localStorage.getItem('user_name') || 'Admin';
            const specs = Object.fromEntries(
                attributes
                    .filter(attr => attributeValues[String(attr.id)] !== undefined && attributeValues[String(attr.id)] !== '')
                    .map(attr => [attr.name, attributeValues[String(attr.id)]])
            );
            // Price and stock are managed via Procurement — set to 0 on creation
            const payload = {
                ...formData,
                purchasePrice: isEdit ? Number(editProduct?.purchase_price || 0) : 0,
                sellingPrice: isEdit ? Number(editProduct?.selling_price || 0) : 0,
                quantity: isEdit ? Number(editProduct?.quantity || 0) : 0,
                imagePath,
                imageGallery,
                userRole,
                specs,
                attributes: Object.entries(attributeValues).map(([attributeId, value]) => ({ attributeId, value })),
            };
            if (isEdit) {
                // @ts-ignore
                await window.electron.updateProduct({ ...payload, id: editProduct.id, changedBy: userName });
                alert('Product updated successfully!');
            } else {
                // @ts-ignore
                await window.electron.createProduct(payload);
                alert('Product created! The model number was generated from the active model rule.');
            }
            navigate('/masters/products');
        } catch (error: any) {
            console.error('Error:', error);
            alert(isEdit ? 'Failed to update product: ' + error?.message : 'Failed to create product: ' + error?.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="master-create-container">
            <div className="header-actions" style={{ marginBottom: '1.5rem' }}>
                <button className="back-btn" onClick={() => navigate('/masters/products')}>
                    <ArrowLeft size={20} /> Back to Products
                </button>
                <h2>{isEdit ? `Edit Product — ${editProduct.name}` : 'Add New Product'}</h2>
            </div>

            {/* Info Banner */}
            <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: '10px', padding: '0.9rem 1.1rem', marginBottom: '1.5rem',
                color: '#3b82f6', fontSize: '0.88rem', lineHeight: 1.5,
            }}>
                <Info size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                    <strong>Purchase Price, Selling Price, and Stock</strong> are managed through the{' '}
                    <strong>Procurement → Purchase Requisitions</strong> workflow. Product ID / model number is generated automatically from the selected origin and stock group.
                </span>
            </div>

            <form onSubmit={handleSubmit} className="create-form">
                {/* Product Name */}
                <div className="form-group">
                    <label>Product Name *</label>
                    <input name="name" value={formData.name} onChange={handleChange} required placeholder="e.g., Sofa Set Premium" />
                </div>

                {/* Image Picker */}
                <div className="form-group">
                    <label>Product Image</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {imagePath ? (
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                <img
                                    src={resolveImageSrc(imagePath)}
                                    alt="Product"
                                    style={{ width: '88px', height: '88px', objectFit: 'cover', borderRadius: '10px', border: '2px solid var(--border-color)', display: 'block' }}
                                    onError={(e: any) => { e.target.style.opacity = '0.3'; }}
                                />
                                <button type="button" onClick={() => setImagePath('')}
                                    style={{ position: 'absolute', top: -7, right: -7, width: '22px', height: '22px', borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                                    <X size={13} />
                                </button>
                            </div>
                        ) : (
                            <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handlePickImage}
                                style={{ width: '88px', height: '88px', flexShrink: 0, borderRadius: '10px', border: '2px dashed var(--border-color)', background: 'var(--hover-bg)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', color: 'var(--accent-color)' }}>
                                <ImagePlus size={22} />
                                <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>Browse</span>
                            </motion.button>
                        )}
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '320px' }}>
                            {imagePath || 'No image selected — click to upload'}
                        </span>
                    </div>
                </div>

                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group">
                        <label>Product ID / Model Number</label>
                        <input value={editProduct?.product_code || editProduct?.model_number || editProduct?.sku || (isEdit ? '—' : 'Auto-generated on save')} readOnly disabled />
                    </div>
                    <div className="form-group">
                        <label>Category</label>
                        <input name="category" value={formData.category} onChange={handleChange} placeholder="e.g., Furniture" />
                    </div>
                </div>

                <div className="section-divider"><Truck size={16} /> Product Source</div>
                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <div className="form-group">
                        <label>Origin</label>
                        <select name="originType" value={formData.originType} onChange={handleChange}>
                            {origins.map(origin => (
                                <option
                                    key={origin.id || origin.origin_key}
                                    value={origin.origin_key}
                                    disabled={(origin.requires_superadmin || origin.origin_key === 'IMPORTED') && !canCreateImported}
                                >
                                    {origin.name}{origin.requires_superadmin ? ' (Super Admin only)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Supplier / Vendor</label>
                        <select name="supplierLedgerId" value={formData.supplierLedgerId} onChange={handleChange}>
                            <option value="">— Select Supplier —</option>
                            {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Import Country</label>
                        <input name="importCountry" value={formData.importCountry} onChange={handleChange} placeholder="e.g., China" disabled={formData.originType !== 'IMPORTED'} />
                    </div>
                </div>

                {formData.originType === 'IMPORTED' && (
                    <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <div className="form-group">
                            <label>Imported Supplier Name</label>
                            <input name="importedSupplierName" value={formData.importedSupplierName} onChange={handleChange} placeholder="Overseas supplier name" />
                        </div>
                        <div className="form-group">
                            <label>Import Reference</label>
                            <input name="importReference" value={formData.importReference} onChange={handleChange} placeholder="LC / PI / shipment reference" />
                        </div>
                    </div>
                )}

                {/* Stock Group / Unit / Tax Rate */}
                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <div className="form-group">
                        <label>Stock Group</label>
                        <select name="stockGroup" value={formData.stockGroup} onChange={handleChange}>
                            <option value="">— Select Group —</option>
                            {stockGroups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Unit of Measurement</label>
                        <select name="unit" value={formData.unit} onChange={handleChange}>
                            <option value="">— Select Unit —</option>
                            {units.map(u => <option key={u.id} value={u.name}>{u.name} ({u.symbol})</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Tax Rate (%)</label>
                        <input type="number" name="taxRate" value={formData.taxRate} onChange={handleChange} min={0} max={100} step="0.01" placeholder="0" />
                    </div>
                </div>

                <div className="section-divider"><BellRing size={16} /> Stock Alerts</div>
                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group">
                        <label>Low Stock Threshold</label>
                        <input
                            type="number"
                            name="lowStockThreshold"
                            value={formData.lowStockThreshold}
                            onChange={handleChange}
                            min={0}
                            step="0.001"
                            placeholder="Alert when usable stock is at or below this quantity"
                            disabled={!canManageLowStockAlerts}
                        />
                    </div>
                    <div className="form-group">
                        <label>Low Stock Alert</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minHeight: 44, fontWeight: 700 }}>
                            <input
                                type="checkbox"
                                name="lowStockAlertEnabled"
                                checked={formData.lowStockAlertEnabled}
                                onChange={handleChange}
                                disabled={!canManageLowStockAlerts}
                                style={{ width: 18, height: 18, accentColor: 'var(--accent-color)' }}
                            />
                            Enable product-specific low stock notification
                        </label>
                    </div>
                </div>

                {/* Description */}
                <div className="form-group">
                    <label>Description</label>
                    <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows={3}
                        placeholder="Product description (optional)"
                        style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.95rem', resize: 'vertical', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                </div>

                <div className="section-divider"><ImagePlus size={16} /> Picture Gallery</div>
                <div className="product-gallery-grid">
                    {imageGallery.map((image, index) => (
                        <div key={`${image}-${index}`} style={{ position: 'relative' }}>
                            <img src={resolveImageSrc(image)} alt={`Gallery ${index + 1}`} />
                            <button type="button" className="delete-btn" onClick={() => setImageGallery(prev => prev.filter((_, i) => i !== index))} style={{ position: 'absolute', top: 6, right: 6, background: '#fee2e2' }}><X size={14} /></button>
                        </div>
                    ))}
                    <button type="button" onClick={handleAddGalleryImage} style={{ minHeight: 120, border: '2px dashed var(--border-color)', borderRadius: 10, background: 'var(--hover-bg)', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 700 }}>
                        Add Image
                    </button>
                </div>

                <div className="section-divider"><SlidersHorizontal size={16} /> Product Specs</div>
                {attributes.length === 0 ? (
                    <div className="empty-inline">No product attributes created yet. Create attributes from Masters → Product Attributes.</div>
                ) : (
                    <div className="form-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                        {attributes.map((attribute) => (
                            <div className="form-group" key={attribute.id}>
                                <label>{attribute.name}</label>
                                {attribute.input_type === 'select' ? (
                                    <select value={attributeValues[String(attribute.id)] || ''} onChange={(e) => setAttributeValues(prev => ({ ...prev, [attribute.id]: e.target.value }))}>
                                        <option value="">— Select —</option>
                                        {(Array.isArray(attribute.options) ? attribute.options : []).map((option: string) => <option key={option} value={option}>{option}</option>)}
                                    </select>
                                ) : (
                                    <input
                                        type={attribute.input_type === 'number' ? 'number' : attribute.input_type === 'color' ? 'color' : 'text'}
                                        value={attributeValues[String(attribute.id)] || ''}
                                        onChange={(e) => setAttributeValues(prev => ({ ...prev, [attribute.id]: e.target.value }))}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                    <button type="button" className="back-btn" onClick={() => navigate('/masters/products')} style={{ padding: '0.65rem 1.25rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--hover-bg)', color: 'var(--text-primary)' }}>
                        Cancel
                    </button>
                    <button type="submit" className="save-btn" disabled={saving}>
                        <Save size={18} /> {saving ? 'Saving…' : (isEdit ? 'Update Product' : 'Save Product')}
                    </button>
                </div>
            </form>
        </motion.div>
    );
};

export default ProductCreate;
