import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Search, Truck, Phone, Mail, MapPin, FileText, Clock, CreditCard, X } from 'lucide-react';
import './Masters.css';

const SupplierManagement: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [purchaseBills, setPurchaseBills] = useState<any[]>([]);
    const [settlements, setSettlements] = useState<any[]>([]);
    const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showSettlementForm, setShowSettlementForm] = useState(false);
    const [settlementSaving, setSettlementSaving] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        contactPerson: '',
        contactNumber: '',
        email: '',
        address: '',
        openingBalance: 0,
        notes: '',
    });

    const [settlementForm, setSettlementForm] = useState({
        purchaseBillId: '',
        settlementDate: new Date().toISOString().split('T')[0],
        settlementAmount: '',
        paymentMethod: 'Cash',
        referenceNumber: '',
        settlementStatus: 'POSTED',
        remarks: '',
    });

    const fetchData = async () => {
        try {
            setLoading(true);
            // @ts-ignore
            const [ledgerRows, billRows, settlementRows] = await Promise.all([
                window.electron.getLedgers(),
                window.electron.getPurchaseBills(),
                (window as any).electron.getSupplierSettlements?.(selectedSupplierId || undefined),
            ]);
            setLedgers(ledgerRows || []);
            setPurchaseBills(billRows || []);
            setSettlements(settlementRows || []);
        } catch (error) {
            console.error('Failed to fetch suppliers:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [selectedSupplierId]);

    const suppliers = ledgers.filter((l: any) => l.group_name === 'Sundry Creditors');

    const filteredSuppliers = useMemo(() =>
        suppliers.filter((s: any) =>
            [s.name, s.contact_person, s.contact_number, s.email, s.address]
                .filter(Boolean).join(' ').toLowerCase()
                .includes(searchTerm.toLowerCase())
        ), [suppliers, searchTerm]);

    const selectedSupplier = suppliers.find((s: any) => s.id === selectedSupplierId) || null;
    const supplierBills = purchaseBills.filter((b: any) => b.supplier_ledger_id === selectedSupplierId);
    const supplierSettlements = settlements.filter((s: any) => s.supplier_ledger_id === selectedSupplierId);
    const supplierPurchaseTotal = supplierBills.reduce((sum: number, b: any) => sum + (Number(b.grand_total) || 0), 0);
    const supplierSettlementTotal = supplierSettlements.reduce((sum: number, s: any) => sum + (Number(s.settlement_amount) || 0), 0);
    const outstandingBalance = (Number(selectedSupplier?.opening_balance) || 0) + supplierPurchaseTotal - supplierSettlementTotal;

    const handleCreateSupplier = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            // @ts-ignore
            await window.electron.createLedger({
                name: formData.name,
                group: 'Sundry Creditors',
                openingBalance: formData.openingBalance,
                type: 'Cr',
                mailingName: formData.contactPerson,
                address: formData.address,
                gstin: '',
                contactPerson: formData.contactPerson,
                contactNumber: formData.contactNumber,
                email: formData.email,
                notes: formData.notes,
                paymentStatus: 'OPEN',
            });
            setFormData({ name: '', contactPerson: '', contactNumber: '', email: '', address: '', openingBalance: 0, notes: '' });
            setShowCreateForm(false);
            await fetchData();
        } catch (error) {
            console.error('Failed to create supplier:', error);
            alert('Failed to create supplier');
        } finally {
            setSaving(false);
        }
    };

    const handleCreateSettlement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSupplierId) return;
        try {
            setSettlementSaving(true);
            // @ts-ignore
            await window.electron.createSupplierSettlement({
                supplierLedgerId: selectedSupplierId,
                purchaseBillId: settlementForm.purchaseBillId || null,
                settlementDate: settlementForm.settlementDate,
                settlementAmount: settlementForm.settlementAmount,
                paymentMethod: settlementForm.paymentMethod,
                referenceNumber: settlementForm.referenceNumber,
                settlementStatus: settlementForm.settlementStatus,
                remarks: settlementForm.remarks,
            });
            setSettlementForm({ purchaseBillId: '', settlementDate: new Date().toISOString().split('T')[0], settlementAmount: '', paymentMethod: 'Cash', referenceNumber: '', settlementStatus: 'POSTED', remarks: '' });
            setShowSettlementForm(false);
            await fetchData();
        } catch (error) {
            console.error('Failed to create settlement:', error);
            alert('Failed to record supplier settlement');
        } finally {
            setSettlementSaving(false);
        }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '0.7rem 0.85rem',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        background: 'var(--input-bg)',
        color: 'var(--text-primary)',
        fontSize: '0.92rem',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
        transition: 'border-color 0.2s',
        outline: 'none',
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontWeight: 500,
        fontSize: '0.85rem',
        color: 'var(--text-secondary)',
        marginBottom: '0.4rem',
    };

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="master-list-container" style={{ maxWidth: '100%' }}>
            {/* ── Header ─────────────────────────────────────── */}
            <div className="list-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button className="back-btn" onClick={() => navigate('/masters')}>
                        <ArrowLeft size={18} /> Back
                    </button>
                    <h2 style={{ margin: 0 }}>Supplier Management</h2>
                </div>
                <button className="create-btn" onClick={() => setShowCreateForm(v => !v)}>
                    {showCreateForm ? <X size={16} /> : <Plus size={16} />}
                    {showCreateForm ? 'Cancel' : 'New Supplier'}
                </button>
            </div>

            {/* ── Create Supplier Panel (collapsible) ─────────── */}
            <AnimatePresence>
                {showCreateForm && (
                    <motion.div
                        key="create-panel"
                        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginBottom: '1.5rem' }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div style={{ background: 'var(--hover-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
                            <h3 style={{ margin: '0 0 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: 'var(--text-primary)' }}>
                                <Truck size={18} /> Create New Supplier
                            </h3>
                            <form onSubmit={handleCreateSupplier}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                    <div>
                                        <label style={labelStyle}>Supplier Name *</label>
                                        <input style={inputStyle} value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} required placeholder="e.g., ABC Traders" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Contact Person</label>
                                        <input style={inputStyle} value={formData.contactPerson} onChange={e => setFormData(p => ({ ...p, contactPerson: e.target.value }))} placeholder="e.g., Mr. Rahman" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Contact Number</label>
                                        <input style={inputStyle} value={formData.contactNumber} onChange={e => setFormData(p => ({ ...p, contactNumber: e.target.value }))} placeholder="+880 1XXX XXXXXX" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Email</label>
                                        <input type="email" style={inputStyle} value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="supplier@email.com" />
                                    </div>
                                </div>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={labelStyle}>Address</label>
                                    <textarea
                                        value={formData.address}
                                        onChange={e => setFormData(p => ({ ...p, address: e.target.value }))}
                                        rows={2}
                                        placeholder="Full address..."
                                        style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                    <div>
                                        <label style={labelStyle}>Opening Balance (৳)</label>
                                        <input type="number" style={inputStyle} value={formData.openingBalance} onChange={e => setFormData(p => ({ ...p, openingBalance: Number(e.target.value) }))} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Notes</label>
                                        <input style={inputStyle} value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button type="submit" className="save-btn" disabled={saving}>
                                        <Plus size={16} /> {saving ? 'Saving…' : 'Save Supplier'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Search ─────────────────────────────────────── */}
            <div className="search-bar" style={{ marginBottom: '1.25rem' }}>
                <Search size={16} />
                <input
                    type="text"
                    placeholder="Search by name, contact, phone, email, or address..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            {/* ── Supplier Table ──────────────────────────────── */}
            <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                <table className="master-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Contact Person</th>
                            <th>Phone / Email</th>
                            <th>Balance</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="empty-state">Loading suppliers…</td></tr>
                        ) : filteredSuppliers.length === 0 ? (
                            <tr><td colSpan={6} className="empty-state">No suppliers found. Click <strong>New Supplier</strong> to add one.</td></tr>
                        ) : filteredSuppliers.map((supplier: any) => (
                            <motion.tr
                                key={supplier.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={{ cursor: 'pointer', background: selectedSupplierId === supplier.id ? 'rgba(249,115,22,0.06)' : undefined }}
                                onClick={() => setSelectedSupplierId(supplier.id === selectedSupplierId ? null : supplier.id)}
                            >
                                <td style={{ fontWeight: 600, color: 'var(--accent-color)' }}>{supplier.name}</td>
                                <td>{supplier.contact_person || '—'}</td>
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        {supplier.contact_number && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}><Phone size={12} />{supplier.contact_number}</span>}
                                        {supplier.email && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}><Mail size={12} />{supplier.email}</span>}
                                        {!supplier.contact_number && !supplier.email && '—'}
                                    </div>
                                </td>
                                <td style={{ fontWeight: 500 }}>৳ {(supplier.opening_balance || 0).toLocaleString()}</td>
                                <td>
                                    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '5px', fontSize: '0.78rem', fontWeight: 600, background: 'rgba(34,197,94,0.12)', color: '#16a34a' }}>
                                        {supplier.payment_status || 'OPEN'}
                                    </span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    <button className="edit-btn" title="View Details" onClick={e => { e.stopPropagation(); setSelectedSupplierId(supplier.id); }}>
                                        <FileText size={15} />
                                    </button>
                                </td>
                            </motion.tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ── Supplier Detail Panel (expands inline when selected) ── */}
            <AnimatePresence>
                {selectedSupplier && (
                    <motion.div
                        key="detail-panel"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem' }}>
                            {/* Detail Header */}
                            <div style={{ background: 'var(--hover-bg)', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{selectedSupplier.name}</div>
                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.3rem', fontSize: '0.85rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                                        {selectedSupplier.contact_person && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FileText size={12} /> {selectedSupplier.contact_person}</span>}
                                        {selectedSupplier.contact_number && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={12} /> {selectedSupplier.contact_number}</span>}
                                        {selectedSupplier.email && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={12} /> {selectedSupplier.email}</span>}
                                        {selectedSupplier.address && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {selectedSupplier.address}</span>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outstanding</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: outstandingBalance > 0 ? '#ef4444' : '#22c55e' }}>
                                            ৳ {outstandingBalance.toLocaleString()}
                                        </div>
                                    </div>
                                    <button className="delete-btn" onClick={() => setSelectedSupplierId(null)} title="Close"><X size={16} /></button>
                                </div>
                            </div>

                            {/* Stats Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0', borderBottom: '1px solid var(--border-color)' }}>
                                {[
                                    { label: 'Total Purchases', value: `৳ ${supplierPurchaseTotal.toLocaleString()}`, color: '#3b82f6' },
                                    { label: 'Total Settled', value: `৳ ${supplierSettlementTotal.toLocaleString()}`, color: '#22c55e' },
                                    { label: 'Outstanding Due', value: `৳ ${outstandingBalance.toLocaleString()}`, color: outstandingBalance > 0 ? '#ef4444' : '#22c55e' },
                                ].map((stat, i) => (
                                    <div key={i} style={{ padding: '0.9rem 1.25rem', borderRight: i < 2 ? '1px solid var(--border-color)' : undefined, background: 'var(--card-bg)' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '0.2rem' }}>{stat.label}</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: stat.color }}>{stat.value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Bills & Settlements */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--card-bg)' }}>
                                {/* Purchase Bills */}
                                <div style={{ padding: '1.25rem', borderRight: '1px solid var(--border-color)' }}>
                                    <div style={{ fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                                        <Clock size={15} /> Recent Purchase Bills
                                    </div>
                                    {supplierBills.length === 0 ? (
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '1rem 0', textAlign: 'center' }}>No purchase bills yet</div>
                                    ) : supplierBills.slice(0, 5).map((bill: any) => (
                                        <div key={bill.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.88rem' }}>
                                            <span style={{ fontWeight: 600 }}>{bill.bill_number}</span>
                                            <span>৳ {(bill.grand_total || 0).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Settlements */}
                                <div style={{ padding: '1.25rem' }}>
                                    <div style={{ fontWeight: 600, marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><CreditCard size={15} /> Settlements</span>
                                        <button className="create-btn" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setShowSettlementForm(v => !v)}>
                                            {showSettlementForm ? <X size={13} /> : <Plus size={13} />} {showSettlementForm ? 'Cancel' : 'Record'}
                                        </button>
                                    </div>
                                    {supplierSettlements.length === 0 && !showSettlementForm ? (
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '1rem 0', textAlign: 'center' }}>No settlements recorded</div>
                                    ) : supplierSettlements.slice(0, 4).map((s: any) => (
                                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.88rem' }}>
                                            <span>{s.payment_method || '—'}</span>
                                            <span style={{ fontWeight: 600 }}>৳ {(s.settlement_amount || 0).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Settlement Form (inline) */}
                            <AnimatePresence>
                                {showSettlementForm && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                                        <div style={{ padding: '1.25rem', borderTop: '1px solid var(--border-color)', background: 'var(--hover-bg)' }}>
                                            <div style={{ fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                                                <CreditCard size={15} /> Record Settlement
                                            </div>
                                            <form onSubmit={handleCreateSettlement}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                                    <div>
                                                        <label style={labelStyle}>Date</label>
                                                        <input type="date" style={inputStyle} value={settlementForm.settlementDate} onChange={e => setSettlementForm(p => ({ ...p, settlementDate: e.target.value }))} />
                                                    </div>
                                                    <div>
                                                        <label style={labelStyle}>Amount (৳)</label>
                                                        <input type="number" style={inputStyle} value={settlementForm.settlementAmount} onChange={e => setSettlementForm(p => ({ ...p, settlementAmount: e.target.value }))} placeholder="0" required />
                                                    </div>
                                                    <div>
                                                        <label style={labelStyle}>Payment Method</label>
                                                        <input style={inputStyle} value={settlementForm.paymentMethod} onChange={e => setSettlementForm(p => ({ ...p, paymentMethod: e.target.value }))} />
                                                    </div>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                                    <div>
                                                        <label style={labelStyle}>Reference No.</label>
                                                        <input style={inputStyle} value={settlementForm.referenceNumber} onChange={e => setSettlementForm(p => ({ ...p, referenceNumber: e.target.value }))} />
                                                    </div>
                                                    <div>
                                                        <label style={labelStyle}>Status</label>
                                                        <select style={inputStyle} value={settlementForm.settlementStatus} onChange={e => setSettlementForm(p => ({ ...p, settlementStatus: e.target.value }))}>
                                                            <option value="POSTED">Posted</option>
                                                            <option value="PARTIAL">Partial</option>
                                                            <option value="SETTLED">Settled</option>
                                                            <option value="VOID">Void</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label style={labelStyle}>Linked Bill</label>
                                                        <select style={inputStyle} value={settlementForm.purchaseBillId} onChange={e => setSettlementForm(p => ({ ...p, purchaseBillId: e.target.value }))}>
                                                            <option value="">— Optional —</option>
                                                            {supplierBills.map((b: any) => <option key={b.id} value={b.id}>{b.bill_number}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                    <button type="submit" className="save-btn" disabled={settlementSaving}>
                                                        <Plus size={16} /> {settlementSaving ? 'Saving…' : 'Save Settlement'}
                                                    </button>
                                                </div>
                                            </form>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default SupplierManagement;