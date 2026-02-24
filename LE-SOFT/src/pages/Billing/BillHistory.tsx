import React, { useState, useEffect } from 'react';
import { Search, Printer, Eye, Calendar, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

interface Bill {
    id: number;
    invoice_number: string;
    customer_name: string;
    customer_phone: string;
    billed_by: string;
    subtotal: number;
    discount_total: number;
    grand_total: number;
    created_at: string;
}

interface BillDetail extends Bill {
    customer_email: string;
    customer_address: string;
    items: {
        id: number;
        product_name: string;
        sku: string;
        quantity: number;
        mrp: number;
        discount_pct: number;
        discount_amt: number;
        price: number;
    }[];
}

const BillHistory: React.FC = () => {
    const [bills, setBills] = useState<Bill[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedBill, setSelectedBill] = useState<BillDetail | null>(null);

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

    const viewBill = async (id: number) => {
        try {
            // @ts-ignore
            const detail = await window.electron.getBillDetails(id);
            setSelectedBill(detail);
        } catch (e) { console.error(e); }
    };

    const handlePrint = () => { window.print(); };

    const filtered = bills.filter(b =>
        (b.invoice_number || '').toLowerCase().includes(search.toLowerCase()) ||
        (b.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (b.customer_phone || '').includes(search)
    );

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <DashboardLayout title="Bill History">
            <div className="masters-container" style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Bill History</h1>
                        <p style={{ opacity: 0.6 }}>View and reprint past bills</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search invoice, customer..."
                                style={{
                                    padding: '0.6rem 0.6rem 0.6rem 2.2rem',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    background: '#fff',
                                    minWidth: '280px',
                                    fontSize: '0.9rem'
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Bills Table */}
                <div style={{ flex: 1, background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {loading ? (
                        <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>Loading...</div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>
                            {search ? 'No bills matched your search.' : 'No bills created yet.'}
                        </div>
                    ) : (
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 2 }}>
                                    <tr>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Invoice</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Customer</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Date & Time</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Billed By</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>Total</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, width: '80px' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((bill, idx) => (
                                        <tr
                                            key={bill.id}
                                            style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fafbfc' : '#fff', cursor: 'pointer' }}
                                            onClick={() => viewBill(bill.id)}
                                        >
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-color)' }}>{bill.invoice_number}</span>
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <div style={{ fontWeight: 600 }}>{bill.customer_name || 'Walk-in'}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#888' }}>{bill.customer_phone || ''}</div>
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#666' }}>
                                                    <Calendar size={14} />
                                                    {formatDate(bill.created_at)} — {formatTime(bill.created_at)}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', color: '#666' }}>{bill.billed_by}</td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, fontSize: '1rem' }}>৳{bill.grand_total?.toLocaleString()}</td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                <button
                                                    onClick={e => { e.stopPropagation(); viewBill(bill.id); }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-color)' }}
                                                    title="View Bill"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Bill Detail Modal */}
                <AnimatePresence>
                    {selectedBill && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => setSelectedBill(null)}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                onClick={e => e.stopPropagation()}
                                id="bill-detail-print"
                                style={{
                                    background: '#fff', borderRadius: '16px', width: '700px', maxHeight: '85vh', overflow: 'auto',
                                    boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: '2rem'
                                }}
                            >
                                {/* Modal Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                    <div>
                                        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.25rem' }}>Invoice Details</h2>
                                        <span style={{ fontFamily: 'monospace', color: 'var(--accent-color)', fontWeight: 600 }}>{selectedBill.invoice_number}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button onClick={handlePrint} style={{ padding: '0.5rem 1rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
                                            <Printer size={14} /> Print
                                        </button>
                                        <button onClick={() => setSelectedBill(null)} style={{ padding: '0.5rem', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* Customer Info */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                                    <div><strong>Customer:</strong> {selectedBill.customer_name}</div>
                                    <div><strong>Phone:</strong> {selectedBill.customer_phone || 'N/A'}</div>
                                    <div><strong>Address:</strong> {selectedBill.customer_address || 'N/A'}</div>
                                    <div><strong>Email:</strong> {selectedBill.customer_email || 'N/A'}</div>
                                    <div><strong>Date:</strong> {formatDate(selectedBill.created_at)} {formatTime(selectedBill.created_at)}</div>
                                    <div><strong>Billed By:</strong> {selectedBill.billed_by}</div>
                                </div>

                                {/* Items Table */}
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                                    <thead style={{ background: '#f1f5f9' }}>
                                        <tr>
                                            <th style={{ padding: '0.6rem', textAlign: 'center', width: '40px' }}>#</th>
                                            <th style={{ padding: '0.6rem', textAlign: 'left' }}>Product</th>
                                            <th style={{ padding: '0.6rem', textAlign: 'center' }}>Qty</th>
                                            <th style={{ padding: '0.6rem', textAlign: 'center' }}>Disc%</th>
                                            <th style={{ padding: '0.6rem', textAlign: 'right' }}>MRP</th>
                                            <th style={{ padding: '0.6rem', textAlign: 'right' }}>Price</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedBill.items.map((item, idx) => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                                                <td style={{ padding: '0.6rem', textAlign: 'center', color: '#888' }}>{idx + 1}</td>
                                                <td style={{ padding: '0.6rem' }}>
                                                    <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#888' }}>SKU: {item.sku}</div>
                                                </td>
                                                <td style={{ padding: '0.6rem', textAlign: 'center' }}>{item.quantity}</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'center' }}>{item.discount_pct}%</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'right' }}>৳{item.mrp}</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'right', fontWeight: 600 }}>৳{item.price?.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* Totals */}
                                <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <span style={{ color: '#666' }}>Subtotal</span>
                                        <span>৳{selectedBill.subtotal?.toLocaleString()}</span>
                                    </div>
                                    {selectedBill.discount_total > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#ef4444' }}>
                                            <span>Discount</span>
                                            <span>-৳{selectedBill.discount_total?.toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 700, paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
                                        <span>Grand Total</span>
                                        <span style={{ color: 'var(--accent-color)' }}>৳{selectedBill.grand_total?.toLocaleString()}</span>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Print styles for bill detail modal */}
                <style>{`
                    @media print {
                        body * { visibility: hidden; }
                        #bill-detail-print, #bill-detail-print * { visibility: visible; }
                        #bill-detail-print {
                            position: absolute;
                            left: 0;
                            top: 0;
                            width: 100%;
                            border-radius: 0 !important;
                            box-shadow: none !important;
                        }
                    }
                `}</style>
            </div>
        </DashboardLayout>
    );
};

export default BillHistory;
