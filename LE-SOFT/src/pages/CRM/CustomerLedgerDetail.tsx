import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, CreditCard, FileText, ArrowLeftRight, FileCheck, Phone, Mail, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

interface LedgerData {
    customer: any;
    addresses: any[];
    payments: any[];
    bills: any[];
    quotations: any[];
    exchanges: any[];
}

const CustomerLedgerDetail: React.FC = () => {
    const { id } = useParams();
    const [data, setData] = useState<LedgerData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('bills');

    // Payment Form State
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState<number | string>('');
    const [paymentType, setPaymentType] = useState('CREDIT'); // CREDIT to customer, or DEBIT
    const [paymentMethod, setPaymentMethod] = useState('CASH');
    const [paymentNote, setPaymentNote] = useState('');

    useEffect(() => {
        if (id) fetchDetail();
    }, [id]);

    const fetchDetail = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            const res = await window.electron.getCustomerLedgerDetail(parseInt(id!));
            setData(res);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const handleSavePayment = async () => {
        if (!paymentAmount || Number(paymentAmount) <= 0) return alert('Enter a valid amount');
        try {
            // @ts-ignore
            await window.electron.addCustomerPayment({
                customer_id: parseInt(id!),
                amount: Number(paymentAmount),
                payment_type: paymentType,
                payment_method: paymentMethod,
                note: paymentNote,
                recorded_by: localStorage.getItem('user_name') || 'Admin'
            });
            setShowPaymentForm(false);
            setPaymentAmount('');
            setPaymentNote('');
            fetchDetail(); // Refresh data
        } catch (e) { console.error(e); alert('Failed to save payment'); }
    };

    if (loading) return (
        <DashboardLayout title="Customer Ledger">
            <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>Loading...</div>
        </DashboardLayout>
    );

    if (!data || !data.customer) return (
        <DashboardLayout title="Customer Ledger">
            <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.8 }}>Customer not found.</div>
        </DashboardLayout>
    );

    // Calculate Balance (Bills - Payments) basic example
    const totalBilled = data.bills.reduce((sum, b) => sum + (b.grand_total || 0), 0);
    const totalPaid = data.payments.filter(p => p.payment_type === 'CREDIT').reduce((sum, p) => sum + (p.amount || 0), 0);
    const balance = totalBilled - totalPaid;

    return (
        <DashboardLayout title={`Ledger: ${data.customer.name}`}>
            <div className="masters-container" style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0 1rem' }}>
                
                {/* Header Profile */}
                <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1.5rem', display: 'flex', gap: '2rem', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700 }}>
                        {data.customer.name.charAt(0)}
                    </div>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>{data.customer.name}</h1>
                        <div style={{ display: 'flex', gap: '1.5rem', color: '#666', fontSize: '0.9rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Phone size={14} /> {data.customer.phone || 'N/A'}</span>
                            {data.customer.email && <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Mail size={14} /> {data.customer.email}</span>}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Current Balance</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: balance > 0 ? '#ef4444' : '#10b981' }}>
                            {balance > 0 ? 'Due ' : 'Cr '} ৳{Math.abs(balance).toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem', flexShrink: 0 }}>
                    {[
                        { id: 'bills', label: 'Invoices', icon: <FileText size={16} />, count: data.bills.length },
                        { id: 'payments', label: 'Payments', icon: <CreditCard size={16} />, count: data.payments.length },
                        { id: 'exchanges', label: 'Returns & Exchanges', icon: <ArrowLeftRight size={16} />, count: data.exchanges.length },
                        { id: 'quotations', label: 'Quotations', icon: <FileCheck size={16} />, count: data.quotations.length },
                        { id: 'addresses', label: 'Addresses', icon: <MapPin size={16} />, count: data.addresses.length }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem',
                                background: activeTab === tab.id ? 'var(--accent-color)' : 'transparent',
                                color: activeTab === tab.id ? 'white' : '#64748b',
                                border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s',
                                fontSize: '0.9rem'
                            }}
                        >
                            {tab.icon} {tab.label} <span style={{ background: activeTab === tab.id ? 'rgba(255,255,255,0.2)' : '#f1f5f9', padding: '2px 6px', borderRadius: '10px', fontSize: '0.75rem' }}>{tab.count}</span>
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div style={{ flex: 1, background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflowY: 'auto', padding: '1rem' }}>
                    
                    {activeTab === 'bills' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead style={{ background: '#f8fafc' }}>
                                <tr>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Date</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Invoice Number</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Billed By</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Total Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.bills.length === 0 ? <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No bills found</td></tr> : null}
                                {data.bills.map((b) => (
                                    <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.75rem', color: '#64748b' }}>{new Date(b.created_at).toLocaleDateString()}</td>
                                        <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--accent-color)' }}>{b.invoice_number}</td>
                                        <td style={{ padding: '0.75rem' }}>{b.billed_by}</td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>৳{b.grand_total.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'payments' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                                <button onClick={() => setShowPaymentForm(!showPaymentForm)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                                    <Plus size={16} /> Add Payment
                                </button>
                            </div>

                            <AnimatePresence>
                                {showPaymentForm && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: '1.5rem' }}>
                                        <div style={{ background: '#f8fafc', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Amount</label>
                                                <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc', width: '120px' }} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Type</label>
                                                <select value={paymentType} onChange={e => setPaymentType(e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}>
                                                    <option value="CREDIT">Received (Credit)</option>
                                                    <option value="DEBIT">Refund (Debit)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Method</label>
                                                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}>
                                                    <option value="CASH">Cash</option>
                                                    <option value="CARD">Card</option>
                                                    <option value="BKASH">bKash</option>
                                                    <option value="BANK">Bank Transfer</option>
                                                </select>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Note</label>
                                                <input value={paymentNote} onChange={e => setPaymentNote(e.target.value)} placeholder="Txn ID or remarks" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc', width: '100%' }} />
                                            </div>
                                            <button onClick={handleSavePayment} style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.55rem 1rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead style={{ background: '#f8fafc' }}>
                                    <tr>
                                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Date</th>
                                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Method</th>
                                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Note</th>
                                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Recorded By</th>
                                        <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.payments.length === 0 ? <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No payments found</td></tr> : null}
                                    {data.payments.map((p) => (
                                        <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.75rem', color: '#64748b' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                                            <td style={{ padding: '0.75rem', fontWeight: 600 }}>{p.payment_method}</td>
                                            <td style={{ padding: '0.75rem' }}>{p.note || '—'}</td>
                                            <td style={{ padding: '0.75rem' }}>{p.recorded_by}</td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: p.payment_type === 'CREDIT' ? '#10b981' : '#ef4444' }}>
                                                {p.payment_type === 'CREDIT' ? '+' : '-'}৳{p.amount.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'exchanges' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead style={{ background: '#f8fafc' }}>
                                <tr>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Date</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Exchange No.</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Return Val</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>New Val</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Difference</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.exchanges.length === 0 ? <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No exchanges found</td></tr> : null}
                                {data.exchanges.map((ex) => (
                                    <tr key={ex.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.75rem', color: '#64748b' }}>{new Date(ex.created_at).toLocaleDateString()}</td>
                                        <td style={{ padding: '0.75rem', fontWeight: 600, color: '#f59e0b' }}>{ex.exchange_number}</td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#ef4444' }}>৳{ex.total_return_value.toLocaleString()}</td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#10b981' }}>৳{ex.total_new_value.toLocaleString()}</td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>
                                            {ex.difference_amount > 0 ? `Cust Owes: ৳${ex.difference_amount}` : ex.difference_amount < 0 ? `Refund: ৳${Math.abs(ex.difference_amount)}` : 'Even'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    
                    {/* Render Quotations and Addresses tab similarly */}
                    {(activeTab === 'quotations' || activeTab === 'addresses') && (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} view coming soon. Length: {activeTab === 'quotations' ? data.quotations.length : data.addresses.length}.
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
};

export default CustomerLedgerDetail;
