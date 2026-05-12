import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, ImagePlus, X, Info } from 'lucide-react';
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
    const [imagePath, setImagePath] = useState(editProduct?.image_path || '');
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({
        name:        editProduct?.name        || '',
        sku:         editProduct?.sku         || '',
        category:    editProduct?.category    || '',
        hsnCode:     editProduct?.hsn_code    || '',
        description: editProduct?.description || '',
        unit:        editProduct?.unit_name   || '',
        stockGroup:  editProduct?.group_name  || '',
        taxRate:     editProduct?.tax_rate    ?? 0,
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                // @ts-ignore
                const [u, sg] = await Promise.all([window.electron.getUnits(), window.electron.getStockGroups()]);
                setUnits(u || []);
                setStockGroups(sg || []);
            } catch (e) { console.error(e); }
        };
        fetchData();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePickImage = async () => {
        try {
            // @ts-ignore
            const path = await window.electron.pickImage();
            if (path) setImagePath(path);
        } catch (e) { console.error(e); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) { alert('Product name is required.'); return; }
        setSaving(true);
        try {
            const userName = localStorage.getItem('user_name') || 'Admin';
            // Price and stock are managed via Procurement — set to 0 on creation
            const payload = {
                ...formData,
                purchasePrice: 0,
                sellingPrice: 0,
                quantity: 0,
                imagePath,
            };
            if (isEdit) {
                // @ts-ignore
                await window.electron.updateProduct({ ...payload, id: editProduct.id, changedBy: userName });
                alert('Product updated successfully!');
            } else {
                // @ts-ignore
                await window.electron.createProduct(payload);
                alert('Product created! Pricing and stock will be set through Procurement.');
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
                    <strong>Procurement → Purchase Requisitions</strong> workflow. Fill in the product details below and save.
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

                {/* SKU / Category / HSN */}
                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <div className="form-group">
                        <label>SKU / Item Code</label>
                        <input name="sku" value={formData.sku} onChange={handleChange} placeholder="e.g., SOFA-001" />
                    </div>
                    <div className="form-group">
                        <label>Category</label>
                        <input name="category" value={formData.category} onChange={handleChange} placeholder="e.g., Furniture" />
                    </div>
                    <div className="form-group">
                        <label>HSN / SAC Code</label>
                        <input name="hsnCode" value={formData.hsnCode} onChange={handleChange} placeholder="e.g., 9403" />
                    </div>
                </div>

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
