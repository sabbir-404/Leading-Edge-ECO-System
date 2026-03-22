import React, { useState, useEffect } from 'react';
import { Search, Edit3, Save, Clock, ChevronDown, ChevronUp, Minus, Plus, Trash2, Star, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import DashboardLayout from '../../components/DashboardLayout';

// Graceful fallback if Electron main hasn't been restarted with decryption fix
const safeDecrypt = (val: any): string => {
    if (!val || typeof val !== 'string') return String(val || '');
    if (val.startsWith('e1:') || val.startsWith('e2:')) return '🔒 [encrypted]';
    return val;
};

interface BillItem {
    product_id: number;
    product_name: string;
    sku: string;
    quantity: number;
    mrp: number;
    discount_pct: number;
    discount_amt: number;
    price: number;
    image_path?: string;
}

interface AuditEntry {
    id: number;
    bill_id: number;
    field_changed: string;
    old_value: string;
    new_value: string;
    changed_by: string;
    changed_at: string;
}

const AlterBill: React.FC = () => {
    const [bills, setBills] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedBill, setSelectedBill] = useState<any>(null);
    const [items, setItems] = useState<BillItem[]>([]);
    const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
    const [showAudit, setShowAudit] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteReason, setDeleteReason] = useState('');

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const canDelete = user.role === 'Superadmin' || (user.permissions && user.permissions.includes('delete_bill'));

    useEffect(() => {
        fetchBills();
    }, []);

    const fetchBills = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            const data = await window.electron.getBills();
            setBills(data || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    useAutoRefresh(['bills', 'bill_items', 'billing_customers'], fetchBills);

    const selectBill = async (bill: any) => {
        try {
            // @ts-ignore
            const detail = await window.electron.getBillDetails(bill.id);
            setSelectedBill(detail);
            setItems((detail.items || []).map((i: any) => ({
                product_id: i.product_id,
                product_name: i.product_name,
                sku: i.sku || '',
                quantity: i.quantity,
                mrp: i.mrp,
                discount_pct: i.discount_pct || 0,
                discount_amt: i.discount_amt || 0,
                price: i.price,
                image_path: i.image_path || '',
            })));
            // Fetch audit log
            // @ts-ignore
            const audit = await window.electron.getBillAudit(bill.id);
            setAuditLog(audit || []);
            setShowAudit(false);
            setSaveMsg('');
        } catch (e) { console.error(e); }
    };

    const updateItem = (idx: number, field: string, value: number) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== idx) return item;
            const updated = { ...item, [field]: value };
            if (field === 'quantity' || field === 'discount_pct') {
                updated.discount_amt = updated.mrp * updated.quantity * (updated.discount_pct / 100);
                updated.price = updated.mrp * updated.quantity - updated.discount_amt;
            }
            return updated;
        }));
    };

    const removeItem = (idx: number) => {
        setItems(prev => prev.filter((_, i) => i !== idx));
    };

    const subtotal = items.reduce((s, i) => s + i.mrp * i.quantity, 0);
    const discountTotal = items.reduce((s, i) => s + i.discount_amt, 0);
    const grandTotal = subtotal - discountTotal;

    const handleSave = async () => {
        if (!selectedBill) return;
        setSaving(true);
        try {
            // @ts-ignore
            const result = await window.electron.updateBill({
                bill_id: selectedBill.id,
                items,
                subtotal,
                discount_total: discountTotal,
                grand_total: grandTotal,
                changed_by: user.full_name || user.username || 'Admin',
            });
            if (result?.success) {
                setSaveMsg('Bill updated successfully!');
                // Refresh audit log
                // @ts-ignore
                const audit = await window.electron.getBillAudit(selectedBill.id);
                setAuditLog(audit || []);
            } else {
                setSaveMsg(result?.error || 'Failed to update bill');
            }
        } catch (e) {
            console.error(e);
            setSaveMsg('Failed to update bill');
        }
        setSaving(false);
        setTimeout(() => setSaveMsg(''), 4000);
    };

    const handleDelete = async () => {
        if (!selectedBill || !canDelete) return;
        try {
            // @ts-ignore
            const res = await window.electron.deleteBill({
                billId: selectedBill.id,
                reason: deleteReason,
                deletedBy: user.full_name || user.username || 'Admin'
            });
            if (res.success) {
                setShowDeleteConfirm(false);
                setSelectedBill(null);
                setItems([]);
                fetchBills();
                alert('Bill deleted successfully and stock restored.');
            } else {
                alert('Failed to delete bill.');
            }
        } catch (e) {
            console.error(e);
            alert('Error deleting bill.');
        }
    };

    const filtered = bills.filter(b =>
        (b.invoice_number || '').toLowerCase().includes(search.toLowerCase()) ||
        (b.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (b.customer_phone || '').includes(search)
    );

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const inputStyle: React.CSSProperties = {
        padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)',
        background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.85rem', width: '100%'
    };

    return (
        <DashboardLayout title="Alter Bill">
            <div style={{ display: 'flex', height: 'calc(100vh - 90px)', gap: '1rem', padding: '0 0.5rem' }}>

                {/* LEFT: Bill List */}
                <div style={{ width: '320px', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                    {/* Search */}
                    <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                            <input
                                value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search invoice, name or phone..."
                                style={{ ...inputStyle, paddingLeft: '2rem' }}
                            />
                        </div>
                    </div>
                    {/* List */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {loading ? (
                            <p style={{ padding: '1.5rem', textAlign: 'center', opacity: 0.5 }}>Loading...</p>
                        ) : filtered.length === 0 ? (
                            <p style={{ padding: '1.5rem', textAlign: 'center', opacity: 0.5 }}>No bills found</p>
                        ) : (
                            filtered.map(b => (
                                <div
                                    key={b.id}
                                    onClick={() => selectBill(b)}
                                    style={{
                                        padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)',
                                        background: selectedBill?.id === b.id ? 'var(--hover-bg)' : 'transparent',
                                        transition: 'background 0.15s',
                                        boxShadow: b.is_altered ? 'inset 4px 0 0 var(--accent-color)' : 'none'
                                    }}
                                    onMouseEnter={e => { if (selectedBill?.id !== b.id) (e.currentTarget.style.background = 'var(--hover-bg)'); }}
                                    onMouseLeave={e => { if (selectedBill?.id !== b.id) (e.currentTarget.style.background = 'transparent'); }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-color)' }}>{safeDecrypt(b.invoice_number)}</div>
                                        {b.is_altered && <Star size={12} fill="#f97316" color="#f97316" />}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>{safeDecrypt(b.customer_name) || 'Walk-in'}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                        <span>{formatDate(b.created_at)}</span>
                                        <span style={{ fontWeight: 700 }}>৳{(b.grand_total || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* RIGHT: Edit Panel */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {!selectedBill ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                            <div style={{ textAlign: 'center', opacity: 0.4 }}>
                                <Edit3 size={48} style={{ marginBottom: '1rem' }} />
                                <p style={{ fontSize: '1.1rem' }}>Select a bill from the list to edit</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Bill Header */}
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1rem 1.25rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-color)' }}>
                                                {safeDecrypt(selectedBill.invoice_number)}
                                            </div>
                                            {selectedBill.is_altered && (
                                                <span style={{ padding: '0.2rem 0.5rem', background: 'rgba(249,115,22,0.1)', color: '#f97316', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800 }}>ALTERED</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            {safeDecrypt(selectedBill.customer_name) || 'Walk-in'} • {formatDate(selectedBill.created_at)} • By: {safeDecrypt(selectedBill.billed_by)}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        {saveMsg && (
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: saveMsg.includes('success') ? '#22c55e' : '#ef4444' }}>
                                                {saveMsg}
                                            </span>
                                        )}
                                        <button
                                            onClick={() => setShowAudit(!showAudit)}
                                            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--hover-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}
                                        >
                                            <Clock size={14} /> Audit Log {showAudit ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </button>
                                        
                                        <button
                                            onClick={() => setShowDeleteConfirm(true)}
                                            title={canDelete ? "Delete Bill" : "You don't have permission to delete bills"}
                                            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: canDelete ? 'pointer' : 'not-allowed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', opacity: canDelete ? 1 : 0.6 }}
                                        >
                                            <Trash2 size={14} /> Delete Bill
                                        </button>

                                        <button
                                            onClick={handleSave}
                                            disabled={saving}
                                            style={{ padding: '0.5rem 1.2rem', borderRadius: '8px', border: 'none', background: 'var(--accent-color)', color: 'white', cursor: saving ? 'default' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem', opacity: saving ? 0.7 : 1, fontSize: '0.85rem' }}
                                        >
                                            <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Audit Log Panel */}
                            <AnimatePresence>
                                {showAudit && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                        style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                        <div style={{ padding: '1rem 1.25rem', maxHeight: '200px', overflowY: 'auto' }}>
                                            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 700 }}>
                                                <Clock size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Change History
                                            </h4>
                                            {auditLog.length === 0 ? (
                                                <p style={{ opacity: 0.5, fontSize: '0.85rem' }}>No changes recorded yet.</p>
                                            ) : (
                                                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                                                    <thead>
                                                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                            <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', fontWeight: 700 }}>Field</th>
                                                            <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', fontWeight: 700 }}>Old</th>
                                                            <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', fontWeight: 700 }}>New</th>
                                                            <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', fontWeight: 700 }}>By</th>
                                                            <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', fontWeight: 700 }}>When</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {auditLog.map(a => (
                                                            <tr key={a.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                                <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>{a.field_changed}</td>
                                                                <td style={{ padding: '0.3rem 0.5rem', color: '#ef4444' }}>{a.old_value || '—'}</td>
                                                                <td style={{ padding: '0.3rem 0.5rem', color: '#22c55e' }}>{a.new_value}</td>
                                                                <td style={{ padding: '0.3rem 0.5rem' }}>{a.changed_by}</td>
                                                                <td style={{ padding: '0.3rem 0.5rem', whiteSpace: 'nowrap' }}>{a.changed_at}</td>
                                                            </tr>
                                                    ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Items Table */}
                            <div style={{ flex: 1, background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 5 }}>
                                            <tr>
                                                <th style={{ padding: '0.6rem 1rem', textAlign: 'center', width: '50px', fontWeight: 700 }}>No.</th>
                                                <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700 }}>Product</th>
                                                <th style={{ padding: '0.6rem 1rem', textAlign: 'center', width: '110px', fontWeight: 700 }}>Quantity</th>
                                                <th style={{ padding: '0.6rem 1rem', textAlign: 'center', width: '100px', fontWeight: 700 }}>Discount %</th>
                                                <th style={{ padding: '0.6rem 1rem', textAlign: 'right', width: '100px', fontWeight: 700 }}>MRP</th>
                                                <th style={{ padding: '0.6rem 1rem', textAlign: 'right', width: '120px', fontWeight: 700 }}>Price</th>
                                                <th style={{ padding: '0.6rem 1rem', textAlign: 'center', width: '50px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.length === 0 ? (
                                            <tr><td colSpan={7}>
                                                <div style={{ padding: '2.5rem', textAlign: 'center', opacity: 0.45, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                                    <Package size={36} />
                                                    <p>No items found for this bill.</p>
                                                    <p style={{ fontSize: '0.78rem' }}>This may be an older bill with no item records.</p>
                                                </div>
                                            </td></tr>
                                         ) : items.map((item, idx) => (
                                                <tr key={item.product_id ?? idx} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fafbfc' : '#fff' }}>
                                                    <td style={{ padding: '0.6rem 1rem', textAlign: 'center', fontWeight: 600, color: '#888' }}>{String(idx + 1).padStart(2, '0')}.</td>
                                                    <td style={{ padding: '0.6rem 1rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            {item.image_path && (
                                                                <img src={`file://${item.image_path}`} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #eee' }} />
                                                            )}
                                                            <div>
                                                                <div style={{ fontWeight: 600 }}>{safeDecrypt(item.product_name)}</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#888' }}>SKU: {safeDecrypt(item.sku) || 'N/A'}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                            <button onClick={() => updateItem(idx, 'quantity', Math.max(1, item.quantity - 1))} style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}><Minus size={12} /></button>
                                                            <input type="number" value={item.quantity}
                                                                onChange={e => updateItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                                                                style={{ width: '40px', textAlign: 'center', border: '1px solid #ddd', borderRadius: '4px', padding: '2px', fontSize: '0.85rem' }}
                                                                min={1}
                                                            />
                                                            <button onClick={() => updateItem(idx, 'quantity', item.quantity + 1)} style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}><Plus size={12} /></button>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                                                        <input type="number" value={item.discount_pct}
                                                            onChange={e => updateItem(idx, 'discount_pct', Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                                                            style={{ width: '55px', textAlign: 'center', border: '1px solid #ddd', borderRadius: '4px', padding: '2px', fontSize: '0.85rem' }}
                                                            min={0} max={100}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>৳{item.mrp.toLocaleString()}</td>
                                                    <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 700 }}>৳{item.price.toLocaleString()}</td>
                                                    <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                                                        <button onClick={() => removeItem(idx)} style={{ padding: '4px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Totals Footer */}
                                <div style={{ padding: '1rem 1.25rem', borderTop: '2px solid var(--border-color)', background: '#f8fafc' }}>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '2rem' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Subtotal</div>
                                            <div style={{ fontWeight: 600 }}>৳{subtotal.toLocaleString()}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.8rem', color: '#ef4444' }}>Discount</div>
                                            <div style={{ fontWeight: 600, color: '#ef4444' }}>-৳{discountTotal.toLocaleString()}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--accent-color)', fontWeight: 700 }}>Grand Total</div>
                                            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--accent-color)' }}>৳{grandTotal.toLocaleString()}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Delete Confirmation Modal */}
                <AnimatePresence>
                    {showDeleteConfirm && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                                style={{ background: '#fff', borderRadius: '16px', width: '400px', padding: '2rem', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
                                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                                        <Trash2 size={30} />
                                    </div>
                                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111' }}>Delete Bill?</h3>
                                    <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                                        This action cannot be undone. Inventory stock will be restored automatically.
                                    </p>
                                </div>
                                
                                {!canDelete ? (
                                    <div style={{ padding: '1rem', background: '#fff7ed', borderRadius: '8px', border: '1px solid #ffedd5', color: '#9a3412', fontSize: '0.85rem', textAlign: 'center' }}>
                                        <strong>Permission Required</strong><br/>
                                        Only administrators can delete bills. Please contact your manager.
                                        <button onClick={() => setShowDeleteConfirm(false)} style={{ width: '100%', marginTop: '1rem', padding: '0.6rem', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>Close</button>
                                    </div>
                                ) : (
                                    <>
                                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>Reason for deletion:</label>
                                        <textarea 
                                            value={deleteReason} onChange={e => setDeleteReason(e.target.value)}
                                            placeholder="Required..."
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.85rem', resize: 'none', height: '80px', marginBottom: '1.5rem' }}
                                        />
                                        
                                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                                            <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                            <button 
                                                onClick={handleDelete}
                                                disabled={!deleteReason.trim()}
                                                style={{ flex: 2, padding: '0.75rem', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', cursor: deleteReason.trim() ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: deleteReason.trim() ? 1 : 0.6 }}
                                            >
                                                Confirm Delete
                                            </button>
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </DashboardLayout>
    );
};

export default AlterBill;
