import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Search, Truck, Phone, Mail, MapPin, FileText, Clock, CreditCard } from 'lucide-react';
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
                window.electron.getSupplierSettlements?.(selectedSupplierId || undefined),
            ]);
            setLedgers(ledgerRows || []);
            setPurchaseBills(billRows || []);
            setSettlements(settlementRows || []);
            if (!selectedSupplierId && ledgerRows?.length) {
                const firstSupplier = ledgerRows.find((ledger: any) => ledger.group_name === 'Sundry Creditors');
                if (firstSupplier) setSelectedSupplierId(firstSupplier.id);
            }
        } catch (error) {
            console.error('Failed to fetch suppliers:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [selectedSupplierId]);

    const suppliers = ledgers.filter((ledger: any) => ledger.group_name === 'Sundry Creditors');

    const filteredSuppliers = useMemo(() => {
        return suppliers.filter((supplier: any) => {
            const haystack = [supplier.name, supplier.contact_person, supplier.contact_number, supplier.email, supplier.address]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(searchTerm.toLowerCase());
        });
    }, [suppliers, searchTerm]);

    const selectedSupplier = suppliers.find((supplier: any) => supplier.id === selectedSupplierId) || null;
    const supplierBills = purchaseBills.filter((bill: any) => bill.supplier_ledger_id === selectedSupplierId);
    const supplierPurchaseTotal = supplierBills.reduce((sum: number, bill: any) => sum + (Number(bill.grand_total) || 0), 0);
    const supplierSettlements = settlements.filter((settlement: any) => settlement.supplier_ledger_id === selectedSupplierId);
    const supplierSettlementTotal = supplierSettlements.reduce((sum: number, settlement: any) => sum + (Number(settlement.settlement_amount) || 0), 0);
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

            setFormData({
                name: '',
                contactPerson: '',
                contactNumber: '',
                email: '',
                address: '',
                openingBalance: 0,
                notes: '',
            });
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

            setSettlementForm({
                purchaseBillId: '',
                settlementDate: new Date().toISOString().split('T')[0],
                settlementAmount: '',
                paymentMethod: 'Cash',
                referenceNumber: '',
                settlementStatus: 'POSTED',
                remarks: '',
            });
            await fetchData();
        } catch (error) {
            console.error('Failed to create settlement:', error);
            alert('Failed to record supplier settlement');
        } finally {
            setSettlementSaving(false);
        }
    };
    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="master-list-container">
            <div className="list-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button className="create-btn" onClick={() => navigate('/masters')} style={{ background: 'transparent', color: 'var(--text-primary)' }}>
                        <ArrowLeft size={18} /> Back
                    </button>
                    <h2>Supplier Management</h2>
                </div>
                <button className="create-btn" onClick={() => document.getElementById('supplier-form')?.scrollIntoView({ behavior: 'smooth' })}>
                    <Plus size={18} /> New Supplier
                </button>
            </div>

            <div className="search-bar">
                <Search size={18} />
                <input
                    type="text"
                    placeholder="Search suppliers by name, contact, phone, email, or address..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem', alignItems: 'start' }}>
                <div>
                    <div className="table-container">
                        <table className="master-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Contact Person</th>
                                    <th>Contact</th>
                                    <th>Balance</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} className="empty-state">Loading...</td></tr>
                                ) : filteredSuppliers.length === 0 ? (
                                    <tr><td colSpan={6} className="empty-state">No suppliers found</td></tr>
                                ) : (
                                    filteredSuppliers.map((supplier: any) => (
                                        <motion.tr key={supplier.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                            <td style={{ fontWeight: 500 }}>{supplier.name}</td>
                                            <td>{supplier.contact_person || '—'}</td>
                                            <td>{supplier.contact_number || supplier.email || '—'}</td>
                                            <td>
                                                {(supplier.opening_balance || 0).toLocaleString()}
                                                <span style={{ fontSize: '0.8rem', opacity: 0.7, marginLeft: '4px' }}>{supplier.opening_balance_type}</span>
                                            </td>
                                            <td>{supplier.payment_status || 'OPEN'}</td>
                                            <td>
                                                <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                                                    <button className="edit-btn" onClick={() => setSelectedSupplierId(supplier.id)}>
                                                        <FileText size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div id="supplier-form" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="master-create-container" style={{ padding: '1.25rem' }}>
                        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Truck size={18} /> Create Supplier
                        </h3>
                        <form onSubmit={handleCreateSupplier} className="create-form">
                            <div className="form-group">
                                <label>Supplier Name *</label>
                                <input value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} required />
                            </div>
                            <div className="form-group">
                                <label>Contact Person</label>
                                <input value={formData.contactPerson} onChange={(e) => setFormData((prev) => ({ ...prev, contactPerson: e.target.value }))} />
                            </div>
                            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                <div className="form-group">
                                    <label>Contact Number</label>
                                    <input value={formData.contactNumber} onChange={(e) => setFormData((prev) => ({ ...prev, contactNumber: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label>Email</label>
                                    <input type="email" value={formData.email} onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Address</label>
                                <textarea value={formData.address} onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))} rows={3} style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '1rem', resize: 'vertical' }} />
                            </div>
                            <div className="form-group">
                                <label>Opening Balance</label>
                                <input type="number" value={formData.openingBalance} onChange={(e) => setFormData((prev) => ({ ...prev, openingBalance: Number(e.target.value) }))} />
                            </div>
                            <div className="form-group">
                                <label>Notes</label>
                                <textarea value={formData.notes} onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))} rows={3} style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '1rem', resize: 'vertical' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button type="submit" className="save-btn" disabled={saving}>
                                    <Plus size={18} /> {saving ? 'Saving…' : 'Save Supplier'}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="master-create-container" style={{ padding: '1.25rem' }}>
                        <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Clock size={18} /> Supplier Overview
                        </h3>
                        {selectedSupplier ? (
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                                <div><strong>{selectedSupplier.name}</strong></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Phone size={14} /> {selectedSupplier.contact_number || '—'}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Mail size={14} /> {selectedSupplier.email || '—'}</div>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}><MapPin size={14} style={{ marginTop: '0.15rem' }} /> <span>{selectedSupplier.address || '—'}</span></div>
                                <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(14, 165, 233, 0.08)' }}>
                                    <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Outstanding Balance</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>৳ {outstandingBalance.toLocaleString()}</div>
                                </div>
                                <div>
                                    <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Recent Purchase Bills</div>
                                    {supplierBills.length === 0 ? (
                                        <div className="empty-state" style={{ padding: '1rem 0' }}>No purchase bills yet</div>
                                    ) : (
                                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                                            {supplierBills.slice(0, 5).map((bill: any) => (
                                                <div key={bill.id} style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--card-bg)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                                                        <strong>{bill.bill_number}</strong>
                                                        <span>৳ {(bill.grand_total || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.85rem', opacity: 0.75, marginTop: '0.25rem' }}>
                                                        {bill.bill_date ? new Date(bill.bill_date).toLocaleDateString() : 'No date'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <div style={{ marginBottom: '0.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <CreditCard size={14} /> Settlements
                                    </div>
                                    {supplierSettlements.length === 0 ? (
                                        <div className="empty-state" style={{ padding: '1rem 0' }}>No settlements recorded</div>
                                    ) : (
                                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                                            {supplierSettlements.slice(0, 5).map((settlement: any) => (
                                                <div key={settlement.id} style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--card-bg)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                                                        <strong>{settlement.settlement_status}</strong>
                                                        <span>৳ {(settlement.settlement_amount || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.85rem', opacity: 0.75, marginTop: '0.25rem' }}>
                                                        {settlement.payment_method || '—'} {settlement.reference_number ? `• ${settlement.reference_number}` : ''}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="empty-state" style={{ padding: '1rem 0' }}>Select a supplier to see purchase history</div>
                        )}
                    </div>

                    <div className="master-create-container" style={{ padding: '1.25rem' }}>
                        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <CreditCard size={18} /> Record Settlement
                        </h3>
                        <form onSubmit={handleCreateSettlement} className="create-form">
                            <div className="form-group">
                                <label>Linked Purchase Bill</label>
                                <select value={settlementForm.purchaseBillId} onChange={(e) => setSettlementForm((prev) => ({ ...prev, purchaseBillId: e.target.value }))}>
                                    <option value="">— Optional —</option>
                                    {supplierBills.map((bill: any) => (
                                        <option key={bill.id} value={bill.id}>{bill.bill_number}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                <div className="form-group">
                                    <label>Settlement Date</label>
                                    <input type="date" value={settlementForm.settlementDate} onChange={(e) => setSettlementForm((prev) => ({ ...prev, settlementDate: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label>Amount</label>
                                    <input type="number" value={settlementForm.settlementAmount} onChange={(e) => setSettlementForm((prev) => ({ ...prev, settlementAmount: e.target.value }))} />
                                </div>
                            </div>
                            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                <div className="form-group">
                                    <label>Payment Method</label>
                                    <input value={settlementForm.paymentMethod} onChange={(e) => setSettlementForm((prev) => ({ ...prev, paymentMethod: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label>Reference Number</label>
                                    <input value={settlementForm.referenceNumber} onChange={(e) => setSettlementForm((prev) => ({ ...prev, referenceNumber: e.target.value }))} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Status</label>
                                <select value={settlementForm.settlementStatus} onChange={(e) => setSettlementForm((prev) => ({ ...prev, settlementStatus: e.target.value }))}>
                                    <option value="POSTED">Posted</option>
                                    <option value="PARTIAL">Partial</option>
                                    <option value="SETTLED">Settled</option>
                                    <option value="VOID">Void</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Remarks</label>
                                <textarea value={settlementForm.remarks} onChange={(e) => setSettlementForm((prev) => ({ ...prev, remarks: e.target.value }))} rows={3} style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '1rem', resize: 'vertical' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button type="submit" className="save-btn" disabled={settlementSaving}>
                                    <Plus size={18} /> {settlementSaving ? 'Saving…' : 'Save Settlement'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default SupplierManagement;