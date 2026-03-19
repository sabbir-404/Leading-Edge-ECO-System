import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Warehouse, ArrowLeft, Plus, Edit2, Trash2, X, Save, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';

interface Godown {
    id: number;
    name: string;
    location: string;
    description: string;
    total_rows?: number;
    racks_per_row?: number;
    bins_per_rack?: number;
}

interface Product {
    id: number;
    name: string;
    sku: string;
    quantity: number;
}

const Godowns: React.FC = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [godowns, setGodowns] = useState<Godown[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingGodown, setEditingGodown] = useState<Partial<Godown> | null>(null);
    const [viewingGodownProducts, setViewingGodownProducts] = useState<Godown | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    
    const fetchGodowns = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            const data = await window.electron.getGodowns();
            setGodowns(data || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    useEffect(() => { fetchGodowns(); }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (!editingGodown) return;
            const payload = { 
                ...editingGodown, 
                totalRows: editingGodown.total_rows || 0, 
                racksPerRow: editingGodown.racks_per_row || 0, 
                binsPerRack: editingGodown.bins_per_rack || 0 
            };
            if (editingGodown.id) {
                // @ts-ignore
                await window.electron.updateGodown(payload);
            } else {
                // @ts-ignore
                await window.electron.createGodown(payload);
            }
            setEditingGodown(null);
            fetchGodowns();
        } catch (e: any) {
            showToast('Save failed: ' + e.message, 'error');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this godown? Products might lose their location association.')) return;
        try {
            // @ts-ignore
            await window.electron.deleteGodown(id);
            fetchGodowns();
        } catch (e: any) {
            showToast('Delete failed: ' + e.message, 'error');
        }
    };

    const viewProducts = async (godown: Godown) => {
        setViewingGodownProducts(godown);
        setProducts([]);
        try {
            // @ts-ignore
            const allProducts = await window.electron.getProducts();
            // Filter products by godown_id
            const filtered = allProducts.filter((p: any) => p.godown_id === godown.id);
            setProducts(filtered);
        } catch (e) { console.error(e); }
    };

    return (
        <>
            <div className="master-list-container">
                <div className="list-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <button onClick={() => navigate('/masters')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><ArrowLeft size={20} /></button>
                        <h2 style={{ fontWeight: 700 }}>Godowns / Warehouses</h2>
                    </div>
                    <button className="create-btn" onClick={() => setEditingGodown({ name: '', location: '', description: '', total_rows: 0, racks_per_row: 0, bins_per_rack: 0 })}>
                        <Plus size={18} /> Create Godown
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                    {loading ? (
                        <div className="empty-state">Loading godowns...</div>
                    ) : godowns.length === 0 ? (
                        <div className="empty-state">No godowns configured yet.</div>
                    ) : (
                        godowns.map((g) => (
                            <motion.div key={g.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                style={{ padding: '1.25rem', borderRadius: '12px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', position: 'relative' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#dc262620', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Warehouse size={20} style={{ color: '#dc2626' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <strong style={{ fontSize: '1.1rem' }}>{g.name}</strong>
                                        <p style={{ fontSize: '0.8rem', opacity: 0.6, margin: '2px 0 0' }}>{g.location}</p>
                                    </div>
                                </div>
                                
                                <div style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '0.75rem', minHeight: '1.5rem' }}>
                                    {g.description || 'No description provided.'}
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', padding: '0.6rem', background: 'var(--hover-bg)', borderRadius: '8px', fontSize: '0.8rem' }}>
                                    <div><strong>{g.total_rows || 0}</strong> Rows</div>
                                    <div style={{ width: '1px', background: 'var(--border-color)' }} />
                                    <div><strong>{g.racks_per_row || 0}</strong> Racks / Row</div>
                                    <div style={{ width: '1px', background: 'var(--border-color)' }} />
                                    <div><strong>{g.bins_per_rack || 0}</strong> Bins / Rack</div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button onClick={() => viewProducts(g)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }}>
                                        <Package size={16} /> View Products
                                    </button>
                                    <button onClick={() => setEditingGodown(g)} style={{ width: '36px', height: '36px', borderRadius: '8px', border: 'none', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Edit2 size={16} />
                                    </button>
                                    <button onClick={() => handleDelete(g.id)} style={{ width: '36px', height: '36px', borderRadius: '8px', border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </div>

            {/* Edit Modal */}
            <AnimatePresence>
                {editingGodown && (
                    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className="modal-content" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ maxWidth: '450px' }}>
                            <div className="modal-header">
                                <h3>{editingGodown.id ? 'Edit Godown' : 'Create Godown'}</h3>
                                <button className="close-btn" onClick={() => setEditingGodown(null)}><X size={20} /></button>
                            </div>
                            <form onSubmit={handleSave} className="create-form" style={{ padding: '1.5rem' }}>
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label>Godown Name *</label>
                                    <input required value={editingGodown.name || ''} onChange={e => setEditingGodown({...editingGodown, name: e.target.value})} placeholder="e.g. Main Warehouse" />
                                </div>
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label>Location</label>
                                    <input value={editingGodown.location || ''} onChange={e => setEditingGodown({...editingGodown, location: e.target.value})} placeholder="e.g. Dhaka, Bangladesh" />
                                </div>
                                <div className="form-row" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', marginBottom: '1rem' }}>
                                    <div className="form-group">
                                        <label>Total Rows</label>
                                        <input type="number" min="0" value={editingGodown.total_rows || 0} onChange={e => setEditingGodown({...editingGodown, total_rows: parseInt(e.target.value) || 0})} />
                                    </div>
                                    <div className="form-group">
                                        <label>Racks per Row</label>
                                        <input type="number" min="0" value={editingGodown.racks_per_row || 0} onChange={e => setEditingGodown({...editingGodown, racks_per_row: parseInt(e.target.value) || 0})} />
                                    </div>
                                    <div className="form-group">
                                        <label>Bins per Rack</label>
                                        <input type="number" min="0" value={editingGodown.bins_per_rack || 0} onChange={e => setEditingGodown({...editingGodown, bins_per_rack: parseInt(e.target.value) || 0})} />
                                    </div>
                                </div>
                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label>Description</label>
                                    <textarea rows={3} value={editingGodown.description || ''} onChange={e => setEditingGodown({...editingGodown, description: e.target.value})} placeholder="Additional details..." />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" onClick={() => setEditingGodown(null)} className="quot-btn-secondary">Cancel</button>
                                    <button type="submit" className="create-btn">
                                        <Save size={16} /> Save Godown
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* View Products Modal */}
            <AnimatePresence>
                {viewingGodownProducts && (
                    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className="modal-content" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                            <div className="modal-header">
                                <div>
                                    <h3 style={{ margin: 0 }}>Products in {viewingGodownProducts.name}</h3>
                                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', opacity: 0.6 }}>Current stock levels in this warehouse.</p>
                                </div>
                                <button className="close-btn" onClick={() => setViewingGodownProducts(null)}><X size={20} /></button>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                                <table className="master-table">
                                    <thead>
                                        <tr>
                                            <th>Product Name</th>
                                            <th>SKU</th>
                                            <th style={{ textAlign: 'right' }}>Stock</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {products.length === 0 ? (
                                            <tr><td colSpan={3} className="empty-state">No products found in this godown.</td></tr>
                                        ) : (
                                            products.map(p => (
                                                <tr key={p.id}>
                                                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                                                    <td style={{ color: 'var(--text-secondary)' }}>{p.sku}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 700, color: p.quantity <= 0 ? '#ef4444' : 'var(--text-primary)' }}>{p.quantity}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
                                <button onClick={() => setViewingGodownProducts(null)} className="quot-btn-secondary">Close</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default Godowns;
