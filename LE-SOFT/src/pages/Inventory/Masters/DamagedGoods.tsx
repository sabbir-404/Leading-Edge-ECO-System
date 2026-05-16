import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Hammer, PackageMinus, RefreshCw, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import '../../Accounting/Masters/Masters.css';

const DamagedGoods: React.FC = () => {
    const [rows, setRows] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ productId: '', quantity: '', notes: '' });
    const userName = localStorage.getItem('user_name') || 'desktop-user';
    const userRole = localStorage.getItem('user_role') || '';
    const userPermissions = useMemo(() => {
        try { return JSON.parse(localStorage.getItem('user_permissions') || '{}'); } catch { return {}; }
    }, []);
    const canManageDamaged = userRole === 'superadmin' || !!userPermissions.manage_damaged_goods;

    const fetchData = async () => {
        setLoading(true);
        try {
            const [damagedRows, productRows] = await Promise.all([
                (window as any).electron?.getDamagedGoods?.(),
                (window as any).electron?.getProducts?.(),
            ]);
            setRows(Array.isArray(damagedRows) ? damagedRows : []);
            setProducts(Array.isArray(productRows) ? productRows : []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData().catch(console.error); }, []);

    const activeDamagedQty = useMemo(() => rows
        .filter(row => row.status === 'DAMAGED' || row.status === 'IN_REPAIR')
        .reduce((sum, row) => sum + Number(row.quantity || 0), 0), [rows]);

    const inRepairQty = useMemo(() => rows
        .filter(row => row.status === 'IN_REPAIR')
        .reduce((sum, row) => sum + Number(row.quantity || 0), 0), [rows]);

    const writeOffQty = useMemo(() => rows
        .filter(row => row.status === 'WRITTEN_OFF')
        .reduce((sum, row) => sum + Number(row.quantity || 0), 0), [rows]);

    const transferDamaged = async (e: React.FormEvent) => {
        e.preventDefault();
        const quantity = Number(form.quantity);
        if (!form.productId || quantity <= 0) {
            alert('Select a product and enter damaged quantity.');
            return;
        }
        const result = await (window as any).electron?.createDamagedGoods?.({
            productId: Number(form.productId),
            quantity,
            notes: form.notes,
            performedByName: userName,
            userRole,
            canManageDamaged,
        });
        if (result?.success) {
            setForm({ productId: '', quantity: '', notes: '' });
            fetchData();
        } else if (result?.error) {
            alert(result.error);
        }
    };

    const changeStatus = async (id: number, status: string) => {
        const label = status === 'IN_REPAIR' ? 'move this damaged stock to repair' : status === 'REPAIRED' ? 'mark this item repaired and return it to stock' : 'write off this damaged stock';
        if (!confirm(`Are you sure you want to ${label}?`)) return;
        const notes = status === 'WRITTEN_OFF' ? prompt('Write-off notes (optional):') || '' : status === 'REPAIRED' ? prompt('Repair notes (optional):') || '' : '';
        await (window as any).electron?.updateDamagedGoodsStatus?.(id, status, { notes, performedByName: userName, userRole, canManageDamaged });
        fetchData();
    };

    const statusClass = (status: string) => status.toLowerCase().replace(/_/g, '-');

    return (
        <motion.div className="master-list-container" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="list-header">
                <div>
                    <h2>Damaged Goods</h2>
                    <p className="page-subtitle">Transfer stocked goods to damaged, move them to repair, return repaired goods, or write them off.</p>
                </div>
                <button className="create-btn" onClick={fetchData}><RefreshCw size={18} /> Refresh</button>
            </div>

            <div className="detail-metrics-grid">
                <div><span>Active Damaged</span><strong>{activeDamagedQty.toLocaleString()}</strong></div>
                <div><span>In Repair</span><strong>{inRepairQty.toLocaleString()}</strong></div>
                <div><span>Written Off</span><strong>{writeOffQty.toLocaleString()}</strong></div>
            </div>

            {canManageDamaged ? (
                <form className="create-form" onSubmit={transferDamaged} style={{ marginBottom: '1.5rem' }}>
                    <div className="section-divider"><PackageMinus size={16} /> Transfer Stock to Damaged</div>
                    <div className="form-row" style={{ gridTemplateColumns: '1.4fr 0.6fr 1.4fr auto' }}>
                        <div className="form-group">
                            <label>Product</label>
                            <select value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })} required>
                                <option value="">Select product</option>
                                {products.map(product => (
                                    <option key={product.id} value={product.id}>
                                        {product.name} ({product.product_code || product.model_number || product.sku || 'No ID'}) - Stock {product.quantity || 0}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Damaged Qty</label>
                            <input type="number" min="0.001" step="0.001" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Notes</label>
                            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Reason / finding" />
                        </div>
                        <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                            <label>&nbsp;</label>
                            <button className="save-btn"><AlertTriangle size={18} /> Transfer</button>
                        </div>
                    </div>
                </form>
            ) : (
                <div className="empty-inline" style={{ marginBottom: '1.5rem' }}>
                    You can view damaged goods, but your user group cannot transfer or update damaged stock.
                </div>
            )}

            <div className="table-container">
                <table className="master-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Source</th>
                            <th>Qty</th>
                            <th>Status</th>
                            <th>Reported</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="empty-state">Loading damaged goods...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={6} className="empty-state">No damaged goods recorded.</td></tr>
                        ) : rows.map(row => (
                            <tr key={row.id}>
                                <td>
                                    <strong>{row.product_name}</strong>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{row.product_code || 'No product ID'} · usable stock {row.usable_stock || 0}</div>
                                </td>
                                <td>{row.requisition?.requisition_number || (row.source_type === 'MANUAL' ? 'Manual transfer' : 'Purchase receipt')}</td>
                                <td>{Number(row.quantity || 0).toLocaleString()} {row.unit_symbol}</td>
                                <td><span className={`status-badge ${statusClass(row.status)}`}>{row.status.replace(/_/g, ' ')}</span></td>
                                <td>{row.reported_at ? new Date(row.reported_at).toLocaleDateString() : '—'}</td>
                                <td style={{ textAlign: 'right' }}>
                                    <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                                        {canManageDamaged && row.status === 'DAMAGED' && <button className="edit-btn" title="Move to repair" onClick={() => changeStatus(row.id, 'IN_REPAIR')}><Hammer size={16} /></button>}
                                        {canManageDamaged && (row.status === 'DAMAGED' || row.status === 'IN_REPAIR') && <button className="approve-btn" title="Repair successful" onClick={() => changeStatus(row.id, 'REPAIRED')}><Check size={16} /></button>}
                                        {canManageDamaged && (row.status === 'DAMAGED' || row.status === 'IN_REPAIR') && <button className="delete-btn" title="Write off" onClick={() => changeStatus(row.id, 'WRITTEN_OFF')}><Trash2 size={16} /></button>}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
};

export default DamagedGoods;
