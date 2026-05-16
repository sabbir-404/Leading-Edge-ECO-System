import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Truck, Phone, FileText, CreditCard, ShoppingCart, Trash2, Package } from 'lucide-react';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';
import './Masters.css';

interface LedgerData {
    supplier: any;
    bills: any[];
    settlements: any[];
    requisitions: any[];
}

const SupplierLedgerDetail: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<LedgerData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('products');

    useEffect(() => {
        if (!id) return;
        fetchDetail();
    }, [id]);

    const fetchDetail = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            const res = await window.electron.getSupplierLedgerDetail(parseInt(id!));
            setData(res);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    useAutoRefresh(['ledgers', 'purchase_bills', 'supplier_settlements', 'purchase_requisitions'], () => {
        if (id) fetchDetail();
    });

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const canDelete = (user.role || '').toLowerCase() === 'superadmin';

    const handleDeleteSupplier = async () => {
        if (!confirm('Are you absolutely sure you want to delete this supplier? This action cannot be undone.')) return;
        try {
            setLoading(true);
            // @ts-ignore
            await window.electron.deleteLedger(parseInt(id!));
            navigate('/masters/suppliers');
        } catch (e: any) {
            console.error(e);
            alert(`Failed to delete supplier: ${e.message}`);
            setLoading(false);
        }
    };

    if (loading) return (
        <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>Loading...</div>
    );

    if (!data || !data.supplier) return (
        <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.8 }}>Supplier not found.</div>
    );

    const totalBilled = data.bills.reduce((sum, b) => sum + (b.grand_total || 0), 0);
    const totalSettled = data.settlements.reduce((sum, s) => sum + (s.settlement_amount || 0), 0);
    const balance = totalBilled - totalSettled; // >0 means we owe them (Credit balance)

    // Aggregate products purchased
    const purchasedProducts: any[] = [];
    data.bills.forEach(bill => {
        if (bill.items) {
            bill.items.forEach((item: any) => {
                purchasedProducts.push({
                    ...item,
                    bill_number: bill.bill_number,
                    bill_date: bill.bill_date
                });
            });
        }
    });

    return (
        <div className="supplier-ledger-detail">
                
                {/* Header Profile */}
                <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1.5rem', display: 'flex', gap: '2rem', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#ffedd5', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700 }}>
                        {data.supplier.name.charAt(0)}
                    </div>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>{data.supplier.name}</h1>
                        <div style={{ display: 'flex', gap: '1.5rem', color: '#666', fontSize: '0.9rem', flexWrap: 'wrap' }}>
                            {data.supplier.store_name && <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Truck size={14} /> {data.supplier.store_name}</span>}
                            {data.supplier.contact_person && <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><FileText size={14} /> {data.supplier.contact_person}</span>}
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Phone size={14} /> {data.supplier.contact_number || 'N/A'}</span>
                            {data.supplier.payment_method && <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><CreditCard size={14} /> {data.supplier.payment_method}</span>}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Due Balance</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: balance > 0 ? '#ef4444' : '#10b981' }}>
                                {balance > 0 ? 'Owe ' : 'Advance '} ৳{Math.abs(balance).toLocaleString()}
                            </div>
                        </div>
                        {canDelete && (
                            <button 
                                onClick={handleDeleteSupplier}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, marginTop: '0.2rem' }}
                            >
                                <Trash2 size={14} /> Delete Supplier
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem', flexShrink: 0 }}>
                    {[
                        { id: 'products', label: 'Products Purchased', icon: <Package size={16} />, count: purchasedProducts.length },
                        { id: 'bills', label: 'Purchase Bills', icon: <FileText size={16} />, count: data.bills.length },
                        { id: 'settlements', label: 'Settlements', icon: <CreditCard size={16} />, count: data.settlements.length },
                        { id: 'requisitions', label: 'Requisitions', icon: <ShoppingCart size={16} />, count: data.requisitions.length }
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
                <div style={{ flex: 1, background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'auto', padding: '1rem' }}>
                    
                    {activeTab === 'products' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead style={{ background: '#f8fafc' }}>
                                <tr>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Date</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Bill Number</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Product Details</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Quantity</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Rate</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {purchasedProducts.length === 0 ? <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No products found</td></tr> : null}
                                {purchasedProducts.map((p, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.75rem', color: '#64748b' }}>{new Date(p.bill_date).toLocaleDateString()}</td>
                                        <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--accent-color)' }}>{p.bill_number}</td>
                                        <td style={{ padding: '0.75rem' }}>{p.description || 'Unknown Product'}</td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>{p.qty}</td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>৳{p.rate?.toLocaleString()}</td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>৳{p.amount?.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'bills' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead style={{ background: '#f8fafc' }}>
                                <tr>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Date</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Bill Number</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Total Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.bills.length === 0 ? <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No bills found</td></tr> : null}
                                {data.bills.map((b) => (
                                    <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.75rem', color: '#64748b' }}>{new Date(b.bill_date).toLocaleDateString()}</td>
                                        <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--accent-color)' }}>{b.bill_number}</td>
                                        <td style={{ padding: '0.75rem' }}>{b.status}</td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>৳{b.grand_total?.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'settlements' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead style={{ background: '#f8fafc' }}>
                                <tr>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Date</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Method</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Reference</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.settlements.length === 0 ? <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No settlements found</td></tr> : null}
                                {data.settlements.map((s) => (
                                    <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.75rem', color: '#64748b' }}>{new Date(s.settlement_date).toLocaleDateString()}</td>
                                        <td style={{ padding: '0.75rem', fontWeight: 600 }}>{s.payment_method}</td>
                                        <td style={{ padding: '0.75rem' }}>{s.payment_reference || '—'}</td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                                            ৳{s.settlement_amount?.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'requisitions' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead style={{ background: '#f8fafc' }}>
                                <tr>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Date</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Requisition Number</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Est. Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.requisitions.length === 0 ? <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No requisitions found</td></tr> : null}
                                {data.requisitions.map((r) => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.75rem', color: '#64748b' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                                        <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--accent-color)' }}>{r.requisition_number}</td>
                                        <td style={{ padding: '0.75rem' }}>{r.status}</td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>
                                            {r.estimated_price ? `৳${r.estimated_price.toLocaleString()}` : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
        </div>
    );
};

export default SupplierLedgerDetail;
