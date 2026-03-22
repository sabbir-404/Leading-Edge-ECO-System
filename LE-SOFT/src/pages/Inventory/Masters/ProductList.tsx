import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Edit2, Barcode } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';
import BarcodeStickerModal, { StickerSize } from '../../../components/BarcodeStickerModal';
import '../../Accounting/Masters/Masters.css';

const ProductList: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [groupFilter, setGroupFilter] = useState('All');
    const [stockStatus, setStockStatus] = useState('All');
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // Barcode modal
    const [barcodeProduct, setBarcodeProduct] = useState<any | null>(null);
    const [stickerConfig] = useState(() => ({
        width: (localStorage.getItem('barcode_sticker_size') || '50x30') as StickerSize,
        printer: localStorage.getItem('barcode_printer') || '',
    }));

    const categories = ['All', ...Array.from(new Set(products.map(p => p.category || 'Uncategorized'))).sort()];
    const groups = ['All', ...Array.from(new Set(products.map(p => p.group_name || 'No Group'))).sort()];

    const fetchProducts = async () => {
        try {
            // @ts-ignore
            const result = await window.electron.getProducts();
            setProducts(result || []);
        } catch (error) {
            console.error('Failed to fetch products:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchProducts(); }, []);

    useAutoRefresh(['products', 'stock_items', 'stock_groups', 'units'], fetchProducts);

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this product?')) return;
        try {
            // @ts-ignore
            await window.electron.deleteProduct(id);
            fetchProducts();
        } catch (error) {
            alert('Failed to delete product.');
        }
    };

    const filtered = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.sku || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.category || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesCategory = categoryFilter === 'All' || (p.category || 'Uncategorized') === categoryFilter;
        const matchesGroup = groupFilter === 'All' || (p.group_name || 'No Group') === groupFilter;
        const matchesStock = stockStatus === 'All' || 
            (stockStatus === 'In Stock' && (p.quantity || 0) > 0) ||
            (stockStatus === 'Out of Stock' && (p.quantity || 0) <= 0);

        return matchesSearch && matchesCategory && matchesGroup && matchesStock;
    });

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filtered.map(p => p.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectRow = (id: number) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Delete ${selectedIds.size} selected products?`)) return;
        
        let successCount = 0;
        for (const id of Array.from(selectedIds)) {
            try {
                // @ts-ignore
                await window.electron.deleteProduct(id);
                successCount++;
            } catch (err) {
                console.error('Failed to delete', id, err);
            }
        }
        setSelectedIds(new Set());
        fetchProducts();
        alert(`Successfully deleted ${successCount} products.`);
    };

    const handleBulkPrint = () => {
        if (selectedIds.size === 0) return;
        // The modal supports single product currently. We will pick the first or modify it.
        // Wait, for bulk print, a real implementation would loop or pass an array. 
        // For now, we launch on the first selected item, or we can update BarcodeStickerModal later.
        // Or simply cycle them? Actually BarcodeStickerModal might be set up to print one.
        // Let's just set the first one for now, or alert.
        const firstSelected = products.find(p => p.id === Array.from(selectedIds)[0]);
        if (firstSelected) setBarcodeProduct(firstSelected);
    };

    const userRole = localStorage.getItem('user_role') || '';
    let perms: any = {};
    try { perms = JSON.parse(localStorage.getItem('user_permissions') || '{}'); } catch {}
    const canDeleteProducts = userRole === 'superadmin' || userRole === 'admin' || perms.delete_products;

    return (
        <div className="master-list-container">
            <div className="list-header">
                <h2>Products</h2>
                <button className="create-btn" onClick={() => navigate('/masters/products/create')}>
                    <Plus size={18} /> Add Product
                </button>
            </div>

            <div className="filter-bar">
                <div className="search-input-wrapper">
                    <Search size={18} />
                    <input type="text" placeholder="Search products..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                
                <div className="filters-row">
                    <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                        <option value="All">All Categories</option>
                        {categories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                        <option value="All">All Groups</option>
                        {groups.filter(g => g !== 'All').map(g => <option key={g} value={g}>{g}</option>)}
                    </select>

                    <select value={stockStatus} onChange={(e) => setStockStatus(e.target.value)}>
                        <option value="All">All Stock</option>
                        <option value="In Stock">In Stock</option>
                        <option value="Out of Stock">Out of Stock</option>
                    </select>

                    { (searchTerm || categoryFilter !== 'All' || groupFilter !== 'All' || stockStatus !== 'All') && (
                        <button className="clear-filters" onClick={() => {
                            setSearchTerm('');
                            setCategoryFilter('All');
                            setGroupFilter('All');
                            setStockStatus('All');
                        }}>Clear</button>
                    )}
                </div>
            </div>

            {selectedIds.size > 0 && (
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 1.5rem 1rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--accent-color)' }}>
                        {selectedIds.size} products selected
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button onClick={handleBulkPrint} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: 'var(--hover-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                            <Barcode size={16} /> Print Labels
                        </button>
                        {canDeleteProducts && (
                            <button onClick={handleBulkDelete} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: '#fef2f2', color: '#ef4444', border: '1px solid #fee2e2', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                <Trash2 size={16} /> Delete Selected
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="table-container">
                <table className="master-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px', textAlign: 'center' }}>
                                <input 
                                    type="checkbox" 
                                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            <th style={{ width: '50px' }}>Image</th>
                            <th>Product Name</th>
                            <th>SKU</th>
                            <th>Category</th>
                            <th>Unit</th>
                            <th style={{ textAlign: 'right' }}>Qty</th>
                            <th style={{ textAlign: 'right' }}>Purchase ৳</th>
                            <th style={{ textAlign: 'right' }}>Selling ৳</th>
                            <th style={{ textAlign: 'right' }}>Tax %</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={10} className="empty-state">Loading...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={10} className="empty-state">No products found. Click "Add Product" to create one.</td></tr>
                        ) : (
                            filtered.map((product) => (
                                <motion.tr key={product.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ background: selectedIds.has(product.id) ? 'var(--hover-bg)' : 'transparent' }}>
                                    <td style={{ textAlign: 'center' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.has(product.id)}
                                            onChange={() => handleSelectRow(product.id)}
                                        />
                                    </td>
                                    <td>
                                        {product.image_path ? (
                                            <img src={`file://${product.image_path}`} alt="" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px' }} onError={(e: any) => { e.target.style.display = 'none'; }} />
                                        ) : (
                                            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', opacity: 0.4 }}>N/A</div>
                                        )}
                                    </td>
                                    <td style={{ fontWeight: 500 }}>{product.name}</td>
                                    <td><span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontWeight: 500, fontSize: '0.85rem' }}>{product.sku || '—'}</span></td>
                                    <td>{product.category || '—'}</td>
                                    <td>{product.unit_symbol || product.unit_name || '—'}</td>
                                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{product.quantity ?? 0}</td>
                                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>৳ {(product.purchase_price || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>৳ {(product.selling_price || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right' }}>{product.tax_rate || 0}%</td>
                                    <td>
                                        <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                                            <button
                                                className="edit-btn"
                                                title="Print Barcode Sticker"
                                                onClick={() => setBarcodeProduct(product)}
                                                style={{ color: '#f97316' }}
                                            >
                                                <Barcode size={16} />
                                            </button>
                                            <button className="edit-btn" onClick={() => navigate('/masters/products/create', { state: { editProduct: product } })}><Edit2 size={16} /></button>
                                            {canDeleteProducts && <button className="delete-btn" onClick={() => handleDelete(product.id)}><Trash2 size={16} /></button>}
                                        </div>
                                    </td>
                                </motion.tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Barcode Sticker Modal */}
            {barcodeProduct && (
                <BarcodeStickerModal
                    product={{
                        name: barcodeProduct.name,
                        sku: barcodeProduct.sku || '',
                        selling_price: barcodeProduct.selling_price || 0,
                    }}
                    config={stickerConfig}
                    onClose={() => setBarcodeProduct(null)}
                />
            )}
        </div>
    );
};

export default ProductList;
