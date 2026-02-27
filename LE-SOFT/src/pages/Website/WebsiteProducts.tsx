// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Search, Trash2, Eye, EyeOff, RefreshCw, Plus, Edit, Filter, X, CheckSquare, Square, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

interface Product {
    id: string;
    name: string;
    model_number: string;
    price: number;
    sale_price: number;
    on_sale: boolean;
    description: string;
    image: string;
    is_visible: boolean;
    categories: string; // Comma separated
}

const ProductModal = ({ product, onClose, onSave }: any) => {
    const [formData, setFormData] = useState<Product>({
        id: '', name: '', model_number: '', price: 0, sale_price: 0, on_sale: false,
        description: '', image: '', is_visible: true, categories: ''
    });

    useEffect(() => {
        if (product) setFormData(product);
        else setFormData({ ...formData, id: `PROD-${Date.now()}` });
    }, [product]);

    const handleChange = (e: any) => {
        const { name, value, type, checked } = e.target;
        setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                style={{ background: 'white', padding: '2rem', borderRadius: '16px', width: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{product ? 'Edit Product' : 'Add Product'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X /></button>
                </div>
                <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>ID</label>
                            <input name="id" value={formData.id} onChange={handleChange} disabled={!!product} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Model Number</label>
                            <input name="model_number" value={formData.model_number} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }} />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Name</label>
                        <input name="name" value={formData.name} onChange={handleChange} required style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Price</label>
                            <input type="number" name="price" value={formData.price} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Sale Price</label>
                            <input type="number" name="sale_price" value={formData.sale_price} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input type="checkbox" name="on_sale" checked={formData.on_sale} onChange={handleChange} />
                            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>On Sale</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input type="checkbox" name="is_visible" checked={formData.is_visible} onChange={handleChange} />
                            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Visible on Website</span>
                        </label>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Category Name (Type manually)</label>
                        <input name="categories" value={formData.categories || ''} onChange={handleChange} placeholder="e.g. Sofa, Living Room" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }} />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Image URL</label>
                        <input name="image" value={formData.image || ''} onChange={handleChange} placeholder="https://..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }} />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Description</label>
                        <textarea name="description" value={formData.description || ''} onChange={handleChange} rows={3} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'white', cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: 'var(--accent-color)', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Save size={18} /> Save Product
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

const WebsiteProducts: React.FC = () => {
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const fetchProducts = async () => {
        setLoading(true);
        // @ts-ignore
        const data = await window.electron.websiteGetProducts();
        setProducts(data || []);
        setLoading(false);
    };

    useEffect(() => { fetchProducts(); }, []);

    // Derived
    const categories = ['All', ...Array.from(new Set(products.flatMap(p => p.categories ? p.categories.split(',').map((c:string) => c.trim()) : [])))];
    
    const filtered = products.filter(p => {
        const matchesSearch = p.name?.toLowerCase().includes(search.toLowerCase()) || p.model_number?.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = filterCategory === 'All' || (p.categories && p.categories.includes(filterCategory));
        const matchesStatus = filterStatus === 'All' 
            ? true 
            : filterStatus === 'Visible' ? p.is_visible 
            : !p.is_visible;
        return matchesSearch && matchesCategory && matchesStatus;
    });

    // Actions
    const handleSave = async (product: Product) => {
        const payload = { ...product, categories: product.categories.split(',').map(c => c.trim()).filter(c => c) };
        if (editingProduct) {
            // @ts-ignore
            await window.electron.websiteUpdateProduct(payload);
        } else {
            // @ts-ignore
            await window.electron.websiteCreateProduct(payload);
        }
        setIsModalOpen(false);
        setEditingProduct(null);
        fetchProducts();
    };

    const handleDelete = async (ids: string | string[]) => {
        if (!confirm(`Are you sure you want to delete ${Array.isArray(ids) ? ids.length : 1} product(s)?`)) return;
        if (Array.isArray(ids)) { // @ts-ignore
            await window.electron.websiteDeleteProductsBulk(ids);
        } else { // @ts-ignore
            await window.electron.websiteDeleteProduct(ids);
        }
        setSelectedIds([]);
        fetchProducts();
    };

    const handleBulkStatus = async (isVisible: boolean) => {
        // @ts-ignore
        await window.electron.websiteUpdateProductStatusBulk(selectedIds, isVisible);
        setSelectedIds([]);
        fetchProducts();
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map(p => p.id));
    };

    return (
        <DashboardLayout title="Website Products">
            <div className="masters-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Website Products</h1>
                        <p style={{ opacity: 0.6 }}>Manage products on the live website</p>
                    </div>
                    <button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', borderRadius: '8px', background: 'var(--accent-color)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                        <Plus size={20} /> Add Product
                    </button>
                </div>

                {/* Filters */}
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or model..." style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }} />
                    </div>
                    <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', minWidth: '150px', background: '#fff' }}>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', minWidth: '120px', background: '#fff' }}>
                        <option value="All">All Status</option>
                        <option value="Visible">Visible</option>
                        <option value="Hidden">Hidden</option>
                    </select>
                    <button onClick={fetchProducts} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'white', cursor: 'pointer' }}><RefreshCw size={18} /></button>
                </div>

                {/* Bulk Actions */}
                {selectedIds.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                        style={{ background: '#e0f2fe', padding: '0.75rem 1.5rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#0369a1' }}>
                        <span style={{ fontWeight: 600 }}>{selectedIds.length} Selected</span>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button onClick={() => handleBulkStatus(true)} style={{ background: 'white', border: '1px solid #bae6fd', color: '#0284c7', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>Show</button>
                            <button onClick={() => handleBulkStatus(false)} style={{ background: 'white', border: '1px solid #bae6fd', color: '#0284c7', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>Hide</button>
                            <button onClick={() => handleDelete(selectedIds)} style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>Delete</button>
                        </div>
                    </motion.div>
                )}

                {loading ? <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>Loading website data...</div> : (
                    <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                                <tr>
                                    <th style={{ padding: '1rem', width: '40px' }}><button onClick={toggleSelectAll} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>{selectedIds.length === filtered.length && filtered.length > 0 ? <CheckSquare size={18} color="var(--accent-color)" /> : <Square size={18} opacity={0.5} />}</button></th>
                                    <th style={{ padding: '1rem', textAlign: 'left' }}>Product</th>
                                    <th style={{ padding: '1rem', textAlign: 'left' }}>Categories</th>
                                    <th style={{ padding: '1rem', textAlign: 'left' }}>Price</th>
                                    <th style={{ padding: '1rem', textAlign: 'center' }}>Status</th>
                                    <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(p => (
                                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)', background: selectedIds.includes(p.id) ? 'rgba(249,115,22,0.05)' : 'transparent' }}>
                                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                                            <button onClick={() => toggleSelect(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>{selectedIds.includes(p.id) ? <CheckSquare size={18} color="var(--accent-color)" /> : <Square size={18} opacity={0.3} />}</button>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#eee', overflow: 'hidden' }}>
                                                    {p.image ? <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>N/A</div>}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                                                    <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>{p.model_number}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            {p.categories?.split(',').map((c:string, i:number) => (
                                                <span key={i} style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontSize: '0.75rem', marginRight: '4px', marginBottom: '4px' }}>{c}</span>
                                            ))}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            {p.on_sale ? (
                                                <div>
                                                    <span style={{ fontWeight: 600, color: '#22c55e' }}>৳{p.sale_price}</span>
                                                    <br />
                                                    <span style={{ textDecoration: 'line-through', opacity: 0.5, fontSize: '0.8rem' }}>৳{p.price}</span>
                                                </div>
                                            ) : (
                                                <span style={{ fontWeight: 600 }}>৳{p.price}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                                            <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: p.is_visible ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)', color: p.is_visible ? '#22c55e' : '#64748b' }}>
                                                {p.is_visible ? 'Visible' : 'Hidden'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'white', cursor: 'pointer', color: '#3b82f6' }}><Edit size={16} /></button>
                                                <button onClick={() => handleDelete(p.id)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'white', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            
            <AnimatePresence>
                {isModalOpen && <ProductModal product={editingProduct} onClose={() => setIsModalOpen(false)} onSave={handleSave} />}
            </AnimatePresence>
        </DashboardLayout>
    );
};

export default WebsiteProducts;

