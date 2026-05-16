import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Search, Truck, Phone, Mail, FileText, X } from 'lucide-react';
import './Masters.css';

const SupplierManagement: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        contactPerson: '',
        contactNumber: '',
        email: '',
        address: '',
        openingBalance: 0,
        notes: '',
        storeName: '',
        paymentMethod: '',
    });

    const fetchData = async () => {
        try {
            setLoading(true);
            // @ts-ignore
            const ledgerRows = await window.electron.getLedgers();
            setLedgers(ledgerRows || []);
        } catch (error) {
            console.error('Failed to fetch suppliers:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const suppliers = ledgers.filter((l: any) => l.group_name === 'Sundry Creditors');

    const filteredSuppliers = useMemo(() =>
        suppliers.filter((s: any) =>
            [s.name, s.contact_person, s.contact_number, s.email, s.address]
                .filter(Boolean).join(' ').toLowerCase()
                .includes(searchTerm.toLowerCase())
        ), [suppliers, searchTerm]);

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
                storeName: formData.storeName,
                paymentMethod: formData.paymentMethod,
            });
            setFormData({ name: '', contactPerson: '', contactNumber: '', email: '', address: '', openingBalance: 0, notes: '', storeName: '', paymentMethod: '' });
            setShowCreateForm(false);
            await fetchData();
        } catch (error) {
            console.error('Failed to create supplier:', error);
            alert('Failed to create supplier');
        } finally {
            setSaving(false);
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
                                        <label style={labelStyle}>Store Name</label>
                                        <input style={inputStyle} value={formData.storeName} onChange={e => setFormData(p => ({ ...p, storeName: e.target.value }))} placeholder="e.g., ABC Store" />
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
                                    <div>
                                        <label style={labelStyle}>Payment Method</label>
                                        <input style={inputStyle} value={formData.paymentMethod} onChange={e => setFormData(p => ({ ...p, paymentMethod: e.target.value }))} placeholder="e.g., Cash, Bank, Mobile" />
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
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigate(`/masters/suppliers/ledger/${supplier.id}`)}
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
                                    <button className="edit-btn" title="View Details" onClick={e => { e.stopPropagation(); navigate(`/masters/suppliers/ledger/${supplier.id}`); }}>
                                        <FileText size={15} />
                                    </button>
                                </td>
                            </motion.tr>
                        ))}
                    </tbody>
                </table>
            </div>


        </motion.div>
    );
};

export default SupplierManagement;
