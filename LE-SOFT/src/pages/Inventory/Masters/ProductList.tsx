import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Edit2, Barcode, Eye, RotateCcw, Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';
import BarcodeStickerModal, { StickerSize } from '../../../components/BarcodeStickerModal';
import { resolveImageSrc } from '../../../utils/imageSrc';
import '../../Accounting/Masters/Masters.css';

const ProductList: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [groupFilter, setGroupFilter] = useState('All');
    const [statusFilter, setStatusFilter] = useState('ACTIVE');
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // Deletion approval states
    const [requestModalOpen, setRequestModalOpen] = useState(false);
    const [requestProductId, setRequestProductId] = useState<number | null>(null);
    const [stashingReason, setStashingReason] = useState('');
    const userName = localStorage.getItem('user_name') || 'desktop-user';

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
            const result = await window.electron.getProducts({ includeStashed: true });
            setProducts(result || []);
        } catch (error) {
            console.error('Failed to fetch products:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchProducts(); }, []);

    useAutoRefresh(['products', 'stock_items', 'stock_groups', 'units'], fetchProducts);

    const handleDeleteClick = (id: number) => {
        setRequestProductId(id);
        setStashingReason('');
        setRequestModalOpen(true);
    };

    const submitStashRequest = async () => {
        if (!stashingReason.trim()) {
            alert('Please provide a reason for stashing this product.');
            return;
        }
        try {
            // @ts-ignore
            await window.electron.requestProductDeletion(requestProductId!, userName, stashingReason);
            setRequestModalOpen(false);
            setStashingReason('');
            fetchProducts();
            alert('Stashing request submitted successfully for approval.');
        } catch (error: any) {
            console.error('Failed to submit stash request:', error);
            alert(error?.message || 'Failed to submit stash request.');
        }
    };

    const handleApproveStash = async (id: number) => {
        if (!confirm('Approve stashing for this product? It will be archived.')) return;
        try {
            // @ts-ignore
            await window.electron.approveProductDeletion(id, userName);
            fetchProducts();
        } catch (error: any) {
            console.error('Failed to approve stashing:', error);
            alert(error?.message || 'Failed to approve stashing.');
        }
    };

    const handleRejectStash = async (id: number) => {
        if (!confirm('Reject stashing for this product? It will remain active.')) return;
        try {
            // @ts-ignore
            await window.electron.rejectProductDeletion(id);
            fetchProducts();
        } catch (error: any) {
            console.error('Failed to reject stashing:', error);
            alert(error?.message || 'Failed to reject stashing.');
        }
    };

    const handleRestore = async (id: number) => {
        if (!confirm('Restore this product to Active?')) return;
        try {
            // @ts-ignore
            await window.electron.restoreProduct(id);
            fetchProducts();
        } catch (error: any) {
            console.error('Failed to restore product:', error);
            alert(error?.message || 'Failed to restore product.');
        }
    };

    const filtered = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.sku || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.category || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesCategory = categoryFilter === 'All' || (p.category || 'Uncategorized') === categoryFilter;
        const matchesGroup = groupFilter === 'All' || (p.group_name || 'No Group') === groupFilter;

        let matchesStatus = true;
        if (statusFilter === 'ACTIVE') {
            matchesStatus = p.status !== 'STASHED' && p.is_active !== false && p.deletion_status !== 'PENDING_APPROVAL';
        } else if (statusFilter === 'PENDING') {
            matchesStatus = p.deletion_status === 'PENDING_APPROVAL';
        } else if (statusFilter === 'STASHED') {
            matchesStatus = p.status === 'STASHED';
        }

        return matchesSearch && matchesCategory && matchesGroup && matchesStatus;
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
        const totalSelected = selectedIds.size;
        const reason = prompt(`Enter reason to request stashing for ${totalSelected} selected product(s):`);
        if (reason === null) return;
        if (!reason.trim()) {
            alert('A reason is required to request stashing.');
            return;
        }
        
        let successCount = 0;
        for (const id of Array.from(selectedIds)) {
            try {
                // @ts-ignore
                await window.electron.requestProductDeletion(id, userName, reason);
                successCount++;
            } catch (err: any) {
                console.error('Failed to submit stash request for ID', id, err);
            }
        }
        setSelectedIds(new Set());
        fetchProducts();
        alert(`Successfully submitted stashing requests for ${successCount} product(s).`);
    };

    const handleBulkPrint = () => {
        if (selectedIds.size === 0) return;
        const firstSelected = products.find(p => p.id === Array.from(selectedIds)[0]);
        if (firstSelected) setBarcodeProduct(firstSelected);
    };

    const userRole = localStorage.getItem('user_role') || '';
    let perms: any = {};
    try { perms = JSON.parse(localStorage.getItem('user_permissions') || '{}'); } catch {}
    const canDeleteProducts = userRole === 'superadmin' || userRole === 'admin' || perms.delete_products;
    const canEditProducts = userRole === 'superadmin' || userRole === 'admin' || perms.write_products || perms.edit_product_information;
    const canViewLedger = userRole === 'superadmin' || userRole === 'admin' || perms.read_product_ledger;

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

                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="ACTIVE">Active Products</option>
                        <option value="PENDING">Pending Deletions</option>
                        <option value="STASHED">Stashed / Archived</option>
                    </select>

                    { (searchTerm || categoryFilter !== 'All' || groupFilter !== 'All' || statusFilter !== 'ACTIVE') && (
                        <button className="clear-filters" onClick={() => {
                            setSearchTerm('');
                            setCategoryFilter('All');
                            setGroupFilter('All');
                            setStatusFilter('ACTIVE');
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
                            <th>Product ID</th>
                            <th>Category</th>
                            <th>Unit</th>
                            <th style={{ textAlign: 'right' }}>Stock</th>
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
                                            <img src={resolveImageSrc(product.image_path)} alt="" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px' }} onError={(e: any) => { e.target.style.display = 'none'; }} />
                                        ) : (
                                            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', opacity: 0.4 }}>N/A</div>
                                        )}
                                    </td>
                                    <td style={{ fontWeight: 500 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                            {product.name}
                                            {product.deletion_status === 'REJECTED' && (
                                                <span style={{ fontSize: '0.7rem', background: '#fee2e2', color: '#ef4444', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                                    Stash Rejected
                                                </span>
                                            )}
                                            {product.deletion_status === 'PENDING_APPROVAL' && (
                                                <span style={{ fontSize: '0.7rem', background: '#fef3c7', color: '#d97706', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                                    Pending Deletion
                                                </span>
                                            )}
                                        </div>
                                        {product.deletion_status === 'PENDING_APPROVAL' && (
                                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.3rem', background: 'var(--hover-bg)', padding: '0.4rem 0.6rem', borderRadius: '6px', borderLeft: '3px solid #f59e0b', maxWidth: '300px', lineHeight: '1.2' }}>
                                                <strong>By:</strong> {product.deletion_requested_by}<br/>
                                                <strong>Reason:</strong> {product.deletion_notes || 'No reason provided.'}
                                            </div>
                                        )}
                                    </td>
                                    <td><span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontWeight: 500, fontSize: '0.85rem' }}>{product.product_code || product.model_number || product.sku || '—'}</span></td>
                                    <td>{product.category || '—'}</td>
                                    <td>{product.unit_symbol || product.unit_name || '—'}</td>
                                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>
                                        {Number(product.quantity || 0).toLocaleString()}
                                        {Number(product.damaged_quantity || 0) > 0 && (
                                            <div style={{ color: '#ef4444', fontSize: '0.75rem', fontFamily: 'Inter, sans-serif' }}>
                                                {Number(product.damaged_quantity || 0).toLocaleString()} of {Number(product.total_stock_including_damaged || 0).toLocaleString()} damaged
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>৳ {(product.purchase_price || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>৳ {(product.selling_price || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right' }}>{product.tax_rate || 0}%</td>
                                    <td>
                                        <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                                            {canViewLedger && <button className="edit-btn" title="View Product Ledger" onClick={() => navigate(`/masters/products/${product.id}/ledger`)}><Eye size={16} /></button>}
                                            <button
                                                className="edit-btn"
                                                title="Print Barcode Sticker"
                                                onClick={() => setBarcodeProduct(product)}
                                                style={{ color: '#f97316' }}
                                            >
                                                <Barcode size={16} />
                                            </button>
                                            {canEditProducts && <button className="edit-btn" onClick={() => navigate('/masters/products/create', { state: { editProduct: product } })}><Edit2 size={16} /></button>}
                                            {canDeleteProducts && (
                                                statusFilter === 'STASHED' ? (
                                                    <button className="edit-btn" title="Restore Product" onClick={() => handleRestore(product.id)} style={{ color: 'var(--accent-color)' }}>
                                                        <RotateCcw size={16} />
                                                    </button>
                                                ) : statusFilter === 'PENDING' ? (
                                                    <>
                                                        <button className="edit-btn" title="Approve Stash" onClick={() => handleApproveStash(product.id)} style={{ color: '#10b981', marginRight: '0.3rem' }}>
                                                            <Check size={16} />
                                                        </button>
                                                        <button className="delete-btn" title="Reject Stash" onClick={() => handleRejectStash(product.id)} style={{ color: '#ef4444' }}>
                                                            <X size={16} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button className="delete-btn" title="Stash Product" onClick={() => handleDeleteClick(product.id)}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                )
                                            )}
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

            {/* Request Product Stashing Modal */}
            {requestModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', width: '400px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-color)' }}>Request Product Stashing</h3>
                        <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 1.5rem' }}>Please enter the reason for archiving this product. This request will be submitted for higher authority review and approval.</p>
                        <textarea
                            value={stashingReason}
                            onChange={(e) => setStashingReason(e.target.value)}
                            placeholder="Reason for stashing (e.g., Obsolete model, Discontinued by supplier)..."
                            style={{ width: '100%', minHeight: '100px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-color)', resize: 'vertical', fontSize: '0.9rem', marginBottom: '1.5rem', outline: 'none' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                onClick={() => setRequestModalOpen(false)}
                                style={{ padding: '0.5rem 1rem', background: 'var(--hover-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, color: 'var(--text-color)' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submitStashRequest}
                                style={{ padding: '0.5rem 1rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Submit Request
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default ProductList;
