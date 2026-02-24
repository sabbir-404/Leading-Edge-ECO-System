import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, ImagePlus, X } from 'lucide-react';
import { motion } from 'framer-motion';
import '../../Accounting/Masters/Masters.css';

const ProductCreate: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // If navigated with state.editProduct, we are in edit mode
    const editProduct: any | null = (location.state as any)?.editProduct || null;
    const isEdit = !!editProduct;

    const [units, setUnits] = useState<any[]>([]);
    const [stockGroups, setStockGroups] = useState<any[]>([]);
    const [imagePath, setImagePath] = useState(editProduct?.image_path || '');
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({
        name:          editProduct?.name          || '',
        sku:           editProduct?.sku           || '',
        category:      editProduct?.category      || '',
        purchasePrice: editProduct?.purchase_price ?? 0,
        sellingPrice:  editProduct?.selling_price  ?? 0,
        taxRate:       editProduct?.tax_rate        ?? 0,
        hsnCode:       editProduct?.hsn_code       || '',
        description:   editProduct?.description    || '',
        unit:          editProduct?.unit_name       || '',
        stockGroup:    editProduct?.group_name      || '',
        quantity:      editProduct?.quantity        ?? 0,
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

    const margin = (Number(formData.sellingPrice) || 0) - (Number(formData.purchasePrice) || 0);
    const marginPct = (Number(formData.purchasePrice) || 0) > 0
        ? ((margin / Number(formData.purchasePrice)) * 100).toFixed(1) : '0.0';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (isEdit) {
                // @ts-ignore
                await window.electron.updateProduct({ ...formData, id: editProduct.id, imagePath });
                alert('Product updated successfully!');
            } else {
                // @ts-ignore
                await window.electron.createProduct({ ...formData, imagePath });
                alert('Product created successfully!');
            }
            navigate('/masters/products');
        } catch (error) {
            console.error('Error:', error);
            alert(isEdit ? 'Failed to update product' : 'Failed to create product');
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="master-create-container">
            <div className="header-actions" style={{ marginBottom: '1.5rem' }}>
                <button className="back-btn" onClick={() => navigate('/masters/products')}>
                    <ArrowLeft size={20} /> Back
                </button>
                <h2>{isEdit ? `Edit Product — ${editProduct.name}` : 'Add Product'}</h2>
            </div>

            <form onSubmit={handleSubmit} className="create-form">
                <div className="form-group">
                    <label>Product Name *</label>
                    <input name="name" value={formData.name} onChange={handleChange} required placeholder="e.g., Sofa Set Premium" />
                </div>

                {/* Image Picker */}
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, fontSize: '0.9rem' }}>Product Image</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {imagePath ? (
                            <div style={{ position: 'relative' }}>
                                {/* Show file:// for local paths, direct src for data URIs */}
                                <img
                                    src={imagePath.startsWith('data:') || imagePath.startsWith('http') ? imagePath : `file://${imagePath}`}
                                    alt="Product"
                                    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '10px', border: '2px solid var(--border-color)' }}
                                    onError={(e: any) => { e.target.style.opacity = '0.3'; }}
                                />
                                <button type="button" onClick={() => setImagePath('')}
                                    style={{ position: 'absolute', top: -6, right: -6, width: '20px', height: '20px', borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                                    <X size={12} />
                                </button>
                            </div>
                        ) : (
                            <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handlePickImage}
                                style={{ width: '80px', height: '80px', borderRadius: '10px', border: '2px dashed var(--border-color)', background: 'var(--card-bg)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', color: 'var(--accent-color)' }}>
                                <ImagePlus size={20} />
                                <span style={{ fontSize: '0.65rem' }}>Browse</span>
                            </motion.button>
                        )}
                        <span style={{ fontSize: '0.8rem', opacity: 0.5, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {imagePath || 'No image selected'}
                        </span>
                    </div>
                </div>

                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
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
                    <div className="form-group">
                        <label>Quantity</label>
                        <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} min={0} />
                    </div>
                </div>

                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
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
                </div>

                <div className="section-divider">Pricing</div>

                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                    <div className="form-group">
                        <label>Purchase Price (৳)</label>
                        <input type="number" name="purchasePrice" value={formData.purchasePrice} onChange={handleChange} min={0} step="0.01" />
                    </div>
                    <div className="form-group">
                        <label>Selling Price (৳)</label>
                        <input type="number" name="sellingPrice" value={formData.sellingPrice} onChange={handleChange} min={0} step="0.01" />
                    </div>
                    <div className="form-group">
                        <label>Tax Rate (%)</label>
                        <input type="number" name="taxRate" value={formData.taxRate} onChange={handleChange} min={0} max={100} step="0.01" />
                    </div>
                    <div className="form-group">
                        <label>Margin</label>
                        <input type="text" value={`৳ ${margin.toLocaleString()} (${marginPct}%)`} readOnly style={{ fontWeight: 600, color: margin >= 0 ? '#22c55e' : '#ef4444' }} />
                    </div>
                </div>

                <div className="form-group">
                    <label>Description</label>
                    <textarea name="description" value={formData.description} onChange={handleChange} rows={3} placeholder="Product description (optional)" style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '1rem', resize: 'vertical' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                    <button type="submit" className="save-btn" disabled={saving}>
                        <Save size={18} /> {saving ? 'Saving…' : (isEdit ? 'Update Product' : 'Save Product')}
                    </button>
                </div>
            </form>
        </motion.div>
    );
};

export default ProductCreate;
