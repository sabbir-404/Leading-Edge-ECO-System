import React, { useState, useEffect, useCallback } from 'react';
import { 
    Search, Edit3, Save, Clock, ChevronDown, ChevronUp, Minus, Plus, 
    Trash2, Star, Package, Shield, Tag, DollarSign, Lock, 
    PlusCircle, X 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { resolveImageSrc } from '../../utils/imageSrc';
import { 
    getCallerContext, 
    getUserPricingPermissions 
} from '../../utils/permissions';

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
    cost_price: number | string;
    mrp: number;
    discount_pct: number;
    discount_amt: number;
    price: number;
    image_path?: string;
    notes?: string;
    is_customized?: boolean;
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
    const pricingPerms = getUserPricingPermissions();
    const isSuperadmin = pricingPerms.isSuperadmin;
    const canDelete = isSuperadmin || pricingPerms.isAdmin || !!(user.permissions?.['delete_bill']);
    const canAddItems = isSuperadmin || pricingPerms.isAdmin || pricingPerms.isDesigner || pricingPerms.isSalesperson || !!(user.permissions?.['add_bill_items']);

    // ── Product search for add-item ─────────────────────────────────────────
    const [allProducts, setAllProducts] = useState<any[]>([]);
    const [productsLoaded, setProductsLoaded] = useState(false);
    const [addSearch, setAddSearch] = useState('');
    const [showAddDropdown, setShowAddDropdown] = useState(false);
    const [newlyAddedItems, setNewlyAddedItems] = useState<BillItem[]>([]);

    // ── Custom Product Modal ────────────────────────────────────────────────
    const [showCustomModal, setShowCustomModal] = useState(false);
    const [customItemForm, setCustomItemForm] = useState({
        name: '',
        sku: '',
        quantity: 1,
        cost_price: '' as number | string,
        sale_price: '' as number | string,
        discount_pct: '' as number | string,
        notes: ''
    });

    // ── Payment method popup ────────────────────────────────────────────────
    const [showPaymentPopup, setShowPaymentPopup] = useState(false);
    const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
    const [selectedPayment, setSelectedPayment] = useState('');
    const [paymentRef, setPaymentRef] = useState('');
    const [pendingSave, setPendingSave] = useState(false);

    const ensureProductsLoaded = useCallback(async () => {
        if (productsLoaded) return;
        try {
            // @ts-ignore
            const [pData, pmData] = await Promise.all([
                window.electron.getProducts(),
                // @ts-ignore
                window.electron.getPaymentMethods?.(),
            ]);
            setAllProducts(pData || []);
            setPaymentMethods(pmData || []);
            if ((pmData || []).length > 0) setSelectedPayment(pmData[0].name);
            setProductsLoaded(true);
        } catch (e) { console.error(e); }
    }, [productsLoaded]);

    useEffect(() => {
        fetchBills();
    }, []);

    const fetchBills = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            const data = await window.electron.getBills(getCallerContext());
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
                cost_price: i.cost_price !== undefined && i.cost_price !== null ? Number(i.cost_price) : 0,
                mrp: Number(i.mrp || 0),
                discount_pct: Number(i.discount_pct || 0),
                discount_amt: Number(i.discount_amt || 0),
                price: Number(i.price || 0),
                image_path: i.image_path || '',
                notes: i.notes || '',
                is_customized: i.product_id < 0 || (i.sku || '').startsWith('CUSTOM-')
            })));
            // Fetch audit log
            // @ts-ignore
            const audit = await window.electron.getBillAudit(bill.id);
            setAuditLog(audit || []);
            setShowAudit(false);
            setSaveMsg('');
        } catch (e) { console.error(e); }
    };

    const updateItem = (idx: number, field: string, rawValue: any) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== idx) return item;
            let updated = { ...item, [field]: rawValue };
            
            if (field === 'cost_price') {
                updated.cost_price = rawValue === '' ? '' : Math.max(0, Number(rawValue) || 0);
            } else if (field === 'mrp') {
                const newMrp = Math.max(0, Number(rawValue) || 0);
                updated.mrp = newMrp;
                const discPct = Number(updated.discount_pct || 0);
                updated.discount_amt = newMrp * updated.quantity * (discPct / 100);
                updated.price = newMrp * updated.quantity - updated.discount_amt;
            } else if (field === 'quantity' || field === 'discount_pct') {
                const qty = field === 'quantity' ? Math.max(1, Number(rawValue) || 1) : updated.quantity;
                const discPct = field === 'discount_pct' ? Math.max(0, Math.min(100, Number(rawValue) || 0)) : updated.discount_pct;
                updated.quantity = qty;
                updated.discount_pct = discPct;
                updated.discount_amt = updated.mrp * qty * (discPct / 100);
                updated.price = updated.mrp * qty - updated.discount_amt;
            }
            return updated;
        }));
    };

    const removeItem = (idx: number) => {
        setItems(prev => prev.filter((_, i) => i !== idx));
    };

    const handleAddCustomProduct = () => {
        if (!customItemForm.name.trim()) return alert('Please enter product / furniture name.');
        const qty = Math.max(1, Number(customItemForm.quantity) || 1);
        const cost = Math.max(0, Number(customItemForm.cost_price) || 0);
        const sale = Math.max(0, Number(customItemForm.sale_price) || 0);
        const disc = Math.min(100, Math.max(0, Number(customItemForm.discount_pct) || 0));
        const discAmt = sale * qty * (disc / 100);
        const finalPrice = sale * qty - discAmt;
        const customId = -Date.now();

        const newItem: BillItem = {
            product_id: customId,
            product_name: customItemForm.name.trim(),
            sku: customItemForm.sku.trim() || `CUSTOM-${Date.now().toString().slice(-4)}`,
            quantity: qty,
            cost_price: cost,
            mrp: sale,
            discount_pct: disc,
            discount_amt: discAmt,
            price: finalPrice,
            is_customized: true,
            notes: customItemForm.notes.trim() || undefined,
        };

        setItems(prev => [...prev, newItem]);
        setNewlyAddedItems(prev => [...prev, newItem]);
        setCustomItemForm({
            name: '',
            sku: '',
            quantity: 1,
            cost_price: '',
            sale_price: '',
            discount_pct: '',
            notes: ''
        });
        setShowCustomModal(false);
    };

    const subtotal = items.reduce((s, i) => s + Number(i.mrp || 0) * i.quantity, 0);
    const discountTotal = items.reduce((s, i) => s + Number(i.discount_amt || 0), 0);
    const grandTotal = subtotal - discountTotal;

    const handleSave = async () => {
        if (!selectedBill) return;
        // If new items were added, show payment popup first
        if (newlyAddedItems.length > 0 && !pendingSave) {
            await ensureProductsLoaded();
            setShowPaymentPopup(true);
            return;
        }
        setSaving(true);
        setPendingSave(false);
        try {
            // @ts-ignore
            const result = await window.electron.updateBill({
                bill_id: selectedBill.id,
                items: items.map(i => ({
                    ...i,
                    cost_price: Number(i.cost_price || 0),
                    mrp: Number(i.mrp || 0),
                    price: Number(i.price || 0)
                })),
                subtotal,
                discount_total: discountTotal,
                grand_total: grandTotal,
                changed_by: user.full_name || user.username || 'Admin',
                ...(newlyAddedItems.length > 0 ? { added_items_payment: selectedPayment, added_items_payment_ref: paymentRef } : {}),
            });
            if (result?.success) {
                setSaveMsg('Bill updated successfully!');
                setNewlyAddedItems([]);
                setPaymentRef('');
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
        <DashboardLayout title="Alter Bill & Pricing Management">
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
                                        {!!b.is_altered && <Star size={12} fill="#f97316" color="#f97316" />}
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
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>
                    {!selectedBill ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                            <div style={{ textAlign: 'center', opacity: 0.4 }}>
                                <Edit3 size={48} style={{ marginBottom: '1rem' }} />
                                <p style={{ fontSize: '1.1rem' }}>Select a bill from the list to view and alter pricing or items</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Role-Based Capability Banner */}
                            <div style={{
                                padding: '0.55rem 1rem',
                                borderRadius: '10px',
                                background: pricingPerms.canModifyAll 
                                    ? 'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, rgba(168,85,247,0.08) 100%)'
                                    : pricingPerms.isDesigner
                                        ? 'linear-gradient(90deg, rgba(16,185,129,0.08) 0%, rgba(59,130,246,0.08) 100%)'
                                        : 'linear-gradient(90deg, rgba(249,115,22,0.08) 0%, rgba(234,88,12,0.08) 100%)',
                                border: `1px solid ${pricingPerms.canModifyAll ? 'rgba(99,102,241,0.25)' : pricingPerms.isDesigner ? 'rgba(16,185,129,0.25)' : 'rgba(249,115,22,0.25)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '0.8rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Shield size={16} color={pricingPerms.canModifyAll ? '#6366f1' : pricingPerms.isDesigner ? '#10b981' : '#f97316'} />
                                    <span>
                                        Active Group: <strong>{pricingPerms.displayRoleName}</strong>
                                        {' — '}
                                        {pricingPerms.canModifyAll && 'You can modify ALL information (cost, sale prices, product specs, quantities & customer details) freely.'}
                                        {pricingPerms.isDesigner && 'You have permission to enter and modify both Cost Price and Sale Price.'}
                                        {pricingPerms.isSalesperson && 'You can enter Cost Price. Sale prices are determined by catalog/designer.'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: pricingPerms.canEditCostPrice ? 'rgba(249,115,22,0.15)' : 'rgba(150,150,150,0.1)', color: pricingPerms.canEditCostPrice ? '#ea580c' : '#888', fontWeight: 700 }}>
                                        Cost Price: {pricingPerms.canEditCostPrice ? 'Editable' : 'Locked'}
                                    </span>
                                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: pricingPerms.canEditSalePrice ? 'rgba(16,185,129,0.15)' : 'rgba(150,150,150,0.1)', color: pricingPerms.canEditSalePrice ? '#10b981' : '#888', fontWeight: 700 }}>
                                        Sale Price: {pricingPerms.canEditSalePrice ? 'Editable' : 'Locked'}
                                    </span>
                                    {pricingPerms.canModifyAll && (
                                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(99,102,241,0.15)', color: '#6366f1', fontWeight: 700 }}>
                                            Full Admin Control
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Bill Header */}
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1rem 1.25rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-color)' }}>
                                                {safeDecrypt(selectedBill.invoice_number)}
                                            </div>
                                            {!!selectedBill.is_altered && (
                                                <span style={{ padding: '0.2rem 0.5rem', background: 'rgba(249,115,22,0.1)', color: '#f97316', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800 }}>ALTERED</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            {safeDecrypt(selectedBill.customer_name) || 'Walk-in'} • {formatDate(selectedBill.created_at)} • By: {safeDecrypt(selectedBill.billed_by)}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
                                                <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center', width: '40px', fontWeight: 700 }}>No.</th>
                                                <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left', fontWeight: 700 }}>Product / Details</th>
                                                <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center', width: '100px', fontWeight: 700 }}>Qty</th>
                                                
                                                {/* Cost Price Column */}
                                                <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right', width: '120px', fontWeight: 700, color: '#c2410c' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                                                        <DollarSign size={13} /> Cost Price
                                                    </div>
                                                </th>

                                                {/* Sale Price / MRP Column */}
                                                <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right', width: '125px', fontWeight: 700, color: '#15803d' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                                                        <Tag size={13} /> Sale Price (MRP)
                                                    </div>
                                                </th>

                                                <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center', width: '85px', fontWeight: 700 }}>Disc %</th>
                                                <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right', width: '115px', fontWeight: 700 }}>Final Total</th>
                                                <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center', width: '45px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.length === 0 ? (
                                                <tr><td colSpan={8}>
                                                    <div style={{ padding: '2.5rem', textAlign: 'center', opacity: 0.45, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                                        <Package size={36} />
                                                        <p>No items found for this bill.</p>
                                                        <p style={{ fontSize: '0.78rem' }}>Add a catalog product or custom item below.</p>
                                                    </div>
                                                </td></tr>
                                            ) : items.map((item, idx) => (
                                                <tr key={item.product_id ?? idx} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fafbfc' : '#fff' }}>
                                                    <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center', fontWeight: 600, color: '#888' }}>{String(idx + 1).padStart(2, '0')}.</td>
                                                    <td style={{ padding: '0.6rem 0.8rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            {item.image_path ? (
                                                                <img src={resolveImageSrc(item.image_path)} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #eee' }} />
                                                            ) : (
                                                                <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: item.is_customized ? 'rgba(249,115,22,0.1)' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: item.is_customized ? '#f97316' : '#94a3b8', fontWeight: 700 }}>
                                                                    {item.is_customized ? 'CUST' : 'IMG'}
                                                                </div>
                                                            )}
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                {pricingPerms.canModifyAll ? (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                        <input
                                                                            type="text"
                                                                            value={item.product_name}
                                                                            onChange={e => updateItem(idx, 'product_name', e.target.value)}
                                                                            style={{ ...inputStyle, padding: '2px 6px', fontSize: '0.85rem', fontWeight: 700 }}
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            placeholder="SKU"
                                                                            value={item.sku}
                                                                            onChange={e => updateItem(idx, 'sku', e.target.value)}
                                                                            style={{ border: 'none', background: 'transparent', fontSize: '0.72rem', color: '#888', padding: 0, outline: 'none' }}
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <div>
                                                                        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            {safeDecrypt(item.product_name)}
                                                                            {item.is_customized && (
                                                                                <span style={{ fontSize: '0.65rem', background: 'rgba(249,115,22,0.15)', color: '#ea580c', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>Custom</span>
                                                                            )}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.75rem', color: '#888' }}>SKU: {safeDecrypt(item.sku) || 'N/A'}</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '0.6rem 0.4rem', textAlign: 'center' }}>
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

                                                    {/* Cost Price: Salesperson, Designer, Admin, Superadmin */}
                                                    <td style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>
                                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                            <span style={{ position: 'absolute', left: '6px', fontSize: '0.75rem', color: '#ea580c', fontWeight: 600 }}>৳</span>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                placeholder="0"
                                                                value={item.cost_price === 0 ? '' : item.cost_price}
                                                                onChange={e => updateItem(idx, 'cost_price', e.target.value)}
                                                                disabled={!pricingPerms.canEditCostPrice}
                                                                title="Cost Price (Entered by Salesperson / Designer / Admin)"
                                                                style={{
                                                                    width: '100px',
                                                                    textAlign: 'right',
                                                                    border: '1px solid #fed7aa',
                                                                    borderRadius: '6px',
                                                                    padding: '4px 6px 4px 16px',
                                                                    fontSize: '0.85rem',
                                                                    fontWeight: 600,
                                                                    color: '#c2410c',
                                                                    background: pricingPerms.canEditCostPrice ? '#fffaf5' : '#f9fafb',
                                                                    outline: 'none'
                                                                }}
                                                            />
                                                        </div>
                                                    </td>

                                                    {/* Sale Price / MRP: Designer, Admin, Superadmin (Read-only for Salesperson) */}
                                                    <td style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>
                                                        {pricingPerms.canEditSalePrice ? (
                                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                                <span style={{ position: 'absolute', left: '6px', fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>৳</span>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    placeholder="0"
                                                                    value={item.mrp === 0 ? '' : item.mrp}
                                                                    onChange={e => updateItem(idx, 'mrp', e.target.value)}
                                                                    title="Sale Price (Entered by Designer / Admin)"
                                                                    style={{
                                                                        width: '105px',
                                                                        textAlign: 'right',
                                                                        border: '1px solid #bbf7d0',
                                                                        borderRadius: '6px',
                                                                        padding: '4px 6px 4px 16px',
                                                                        fontSize: '0.85rem',
                                                                        fontWeight: 700,
                                                                        color: '#15803d',
                                                                        background: '#f0fdf4',
                                                                        outline: 'none'
                                                                    }}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', fontWeight: 700, color: '#334155' }}>
                                                                <Lock size={11} color="#94a3b8" />
                                                                <span>৳{Number(item.mrp || 0).toLocaleString()}</span>
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Discount % */}
                                                    <td style={{ padding: '0.6rem 0.4rem', textAlign: 'center' }}>
                                                        <input type="number" value={item.discount_pct}
                                                            onChange={e => updateItem(idx, 'discount_pct', Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                                                            style={{ width: '50px', textAlign: 'center', border: '1px solid #ddd', borderRadius: '4px', padding: '3px', fontSize: '0.85rem' }}
                                                            min={0} max={100}
                                                        />
                                                    </td>

                                                    {/* Price Total */}
                                                    <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)' }}>
                                                        ৳{Number(item.price || 0).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                                                        <button onClick={() => removeItem(idx)} style={{ padding: '4px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* ── Add Product Row (permission-gated) ── */}
                                {canAddItems && (
                                    <div style={{ borderTop: '2px dashed var(--border-color)', padding: '1rem 1.25rem', background: 'rgba(249,115,22,0.02)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                + Add Products to Bill
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setShowCustomModal(true)}
                                                style={{
                                                    background: 'rgba(249,115,22,0.1)',
                                                    border: '1px solid rgba(249,115,22,0.3)',
                                                    color: 'var(--accent-color)',
                                                    borderRadius: '6px',
                                                    padding: '4px 10px',
                                                    fontSize: '0.78rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                <PlusCircle size={13} /> + Add Custom Item
                                            </button>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none' }} />
                                            <input
                                                value={addSearch}
                                                onChange={async e => {
                                                    setAddSearch(e.target.value);
                                                    setShowAddDropdown(e.target.value.length > 0);
                                                    if (!productsLoaded) await ensureProductsLoaded();
                                                }}
                                                onFocus={async () => { if (!productsLoaded) await ensureProductsLoaded(); }}
                                                placeholder="Search catalog by product name or SKU..."
                                                style={{
                                                    width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.2rem',
                                                    borderRadius: '8px', border: '1px solid var(--border-color)',
                                                    background: 'var(--input-bg)', fontSize: '0.88rem', boxSizing: 'border-box'
                                                }}
                                            />
                                            {showAddDropdown && addSearch.trim() && (
                                                <div style={{
                                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 500,
                                                    background: '#fff', border: '1px solid var(--border-color)',
                                                    borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: '200px', overflowY: 'auto', marginTop: '4px'
                                                }}>
                                                    {allProducts
                                                        .filter(p => (p.name || '').toLowerCase().includes(addSearch.toLowerCase()) || (p.sku || '').toLowerCase().includes(addSearch.toLowerCase()))
                                                        .slice(0, 10)
                                                        .map(p => (
                                                            <div
                                                                key={p.id}
                                                                onClick={() => {
                                                                    const salePrice = parseFloat(p.selling_price || p.mrp || 0);
                                                                    const costPrice = parseFloat(p.purchase_price || 0);
                                                                    const newItem: BillItem = {
                                                                        product_id: p.id,
                                                                        product_name: p.name,
                                                                        sku: p.sku || '',
                                                                        quantity: 1,
                                                                        cost_price: costPrice,
                                                                        mrp: salePrice,
                                                                        discount_pct: 0,
                                                                        discount_amt: 0,
                                                                        price: salePrice,
                                                                        image_path: p.image_path || ''
                                                                    };
                                                                    setItems(prev => [...prev, newItem]);
                                                                    setNewlyAddedItems(prev => [...prev, newItem]);
                                                                    setAddSearch('');
                                                                    setShowAddDropdown(false);
                                                                }}
                                                                style={{ padding: '0.6rem 1rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                                onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                                                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                                                            >
                                                                <div>
                                                                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{p.name}</div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#888' }}>
                                                                        SKU: {p.sku || 'N/A'} {p.purchase_price ? `• Cost: ৳${Number(p.purchase_price).toLocaleString()}` : ''}
                                                                    </div>
                                                                </div>
                                                                <div style={{ fontWeight: 700, color: 'var(--accent-color)', fontSize: '0.9rem' }}>
                                                                    ৳{parseFloat(p.selling_price || p.mrp || 0).toLocaleString()}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    {allProducts.filter(p => (p.name || '').toLowerCase().includes(addSearch.toLowerCase()) || (p.sku || '').toLowerCase().includes(addSearch.toLowerCase())).length === 0 && (
                                                        <div style={{ padding: '1rem', color: '#888', textAlign: 'center', fontSize: '0.85rem' }}>No products matched</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {newlyAddedItems.length > 0 && (
                                            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--accent-color)', fontWeight: 600 }}>
                                                ⚡ {newlyAddedItems.length} new item{newlyAddedItems.length > 1 ? 's' : ''} added — payment method will be asked when you save.
                                            </div>
                                        )}
                                    </div>
                                )}

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

                {/* Custom Product Modal */}
                <AnimatePresence>
                    {showCustomModal && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                                style={{ background: '#fff', borderRadius: '16px', width: '520px', padding: '1.75rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(249,115,22,0.1)', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <PlusCircle size={20} />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Add Custom / Non-Catalog Product</h3>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#666' }}>Role: {pricingPerms.displayRoleName}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowCustomModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#999' }}>
                                        <X size={18} />
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>Product / Furniture Name *</label>
                                        <input
                                            placeholder="e.g. Custom Executive Conference Table"
                                            value={customItemForm.name}
                                            onChange={e => setCustomItemForm(p => ({ ...p, name: e.target.value }))}
                                            style={inputStyle}
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>SKU / Identifier (Optional)</label>
                                            <input
                                                placeholder="e.g. CUST-CONF-01"
                                                value={customItemForm.sku}
                                                onChange={e => setCustomItemForm(p => ({ ...p, sku: e.target.value }))}
                                                style={inputStyle}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>Quantity *</label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={customItemForm.quantity}
                                                onChange={e => setCustomItemForm(p => ({ ...p, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                                                style={inputStyle}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        {/* Cost Price: Salesperson, Designer, Admin */}
                                        <div style={{ background: '#fffaf5', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#c2410c', marginBottom: '4px' }}>
                                                Cost Price (৳) *
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                placeholder="Entered by Sales / Designer"
                                                value={customItemForm.cost_price}
                                                onChange={e => setCustomItemForm(p => ({ ...p, cost_price: e.target.value }))}
                                                style={{ ...inputStyle, background: '#fff', borderColor: '#fed7aa', fontWeight: 700, color: '#c2410c' }}
                                            />
                                            <span style={{ fontSize: '0.68rem', color: '#ea580c', display: 'block', marginTop: '3px' }}>
                                                Salesperson enters cost price
                                            </span>
                                        </div>

                                        {/* Sale Price: Designer, Admin */}
                                        <div style={{ background: '#f0fdf4', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#15803d', marginBottom: '4px' }}>
                                                Sale Price (৳) {pricingPerms.canEditSalePrice ? '*' : '(Designer Only)'}
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                disabled={!pricingPerms.canEditSalePrice}
                                                placeholder={pricingPerms.canEditSalePrice ? 'Unit selling price' : 'Set by designer'}
                                                value={customItemForm.sale_price}
                                                onChange={e => setCustomItemForm(p => ({ ...p, sale_price: e.target.value }))}
                                                style={{ ...inputStyle, background: pricingPerms.canEditSalePrice ? '#fff' : '#f8fafc', borderColor: '#bbf7d0', fontWeight: 700, color: '#15803d' }}
                                            />
                                            <span style={{ fontSize: '0.68rem', color: '#16a34a', display: 'block', marginTop: '3px' }}>
                                                {pricingPerms.canEditSalePrice ? 'Designer & Admin set sale price' : '🔒 Locked for salesperson'}
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>Specifications / Custom Notes</label>
                                        <textarea
                                            rows={2}
                                            placeholder="e.g. 2400x1200mm, Italian Walnut veneer finish with cable manager"
                                            value={customItemForm.notes}
                                            onChange={e => setCustomItemForm(p => ({ ...p, notes: e.target.value }))}
                                            style={{ ...inputStyle, resize: 'vertical' }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowCustomModal(false)}
                                            style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleAddCustomProduct}
                                            style={{ flex: 2, padding: '0.65rem', borderRadius: '8px', border: 'none', background: 'var(--accent-color)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            Add Custom Product to Bill
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Payment Method Popup */}
                <AnimatePresence>
                    {showPaymentPopup && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                                style={{ background: '#fff', borderRadius: '16px', width: '460px', padding: '2rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                                <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.2rem', fontWeight: 700 }}>💳 Payment for Added Products</h3>
                                <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem', color: '#666' }}>
                                    You added <strong>{newlyAddedItems.length} new product{newlyAddedItems.length > 1 ? 's' : ''}</strong> to this bill. How were they paid?
                                </p>

                                {/* New items summary */}
                                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.75rem', marginBottom: '1.25rem', border: '1px solid #e2e8f0' }}>
                                    {newlyAddedItems.map((it, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '2px 0' }}>
                                            <span>{it.product_name} ×{it.quantity}</span>
                                            <span style={{ fontWeight: 600 }}>৳{(it.price).toLocaleString()}</span>
                                        </div>
                                    ))}
                                    <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                                        <span>Total Added</span>
                                        <span style={{ color: 'var(--accent-color)' }}>৳{newlyAddedItems.reduce((s, i) => s + i.price, 0).toLocaleString()}</span>
                                    </div>
                                </div>

                                {/* Payment method selector */}
                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Payment Method</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
                                    {(paymentMethods.length > 0 ? paymentMethods : [
                                        { id: 'Cash', name: 'Cash' }, { id: 'bKash', name: 'bKash' }, { id: 'Card', name: 'Card' }
                                    ]).map(pm => (
                                        <button
                                            key={pm.id || pm.name}
                                            onClick={() => setSelectedPayment(pm.name)}
                                            style={{
                                                padding: '0.6rem 0.75rem', borderRadius: '8px', border: '2px solid',
                                                borderColor: selectedPayment === pm.name ? 'var(--accent-color)' : 'var(--border-color)',
                                                background: selectedPayment === pm.name ? 'rgba(249,115,22,0.08)' : '#fff',
                                                color: selectedPayment === pm.name ? 'var(--accent-color)' : '#333',
                                                fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.15s'
                                            }}
                                        >{pm.name}</button>
                                    ))}
                                </div>

                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reference / Transaction ID (optional)</label>
                                <input
                                    value={paymentRef}
                                    onChange={e => setPaymentRef(e.target.value)}
                                    placeholder="e.g. bKash TrxID, cheque no..."
                                    style={{ width: '100%', padding: '0.65rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1.5rem', boxSizing: 'border-box', fontSize: '0.88rem' }}
                                />

                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button onClick={() => setShowPaymentPopup(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                    <button
                                        disabled={!selectedPayment}
                                        onClick={() => { setShowPaymentPopup(false); setPendingSave(true); setTimeout(() => handleSave(), 50); }}
                                        style={{ flex: 2, padding: '0.75rem', borderRadius: '8px', border: 'none', background: selectedPayment ? 'var(--accent-color)' : '#ccc', color: '#fff', fontWeight: 700, cursor: selectedPayment ? 'pointer' : 'not-allowed', fontSize: '0.9rem', transition: 'all 0.15s' }}
                                    >Confirm & Save Bill</button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

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
