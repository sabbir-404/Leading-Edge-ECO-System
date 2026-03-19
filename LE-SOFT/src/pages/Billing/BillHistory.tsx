import React, { useState, useEffect, useMemo } from 'react';
import { Search, Printer, Eye, Calendar, X, Star, Filter, ChevronDown, ChevronUp, Package } from 'lucide-react';
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
    is_altered: boolean;
    created_at: string;
}

interface BillItem {
    id: number;
    product_name: string;
    sku: string;
    quantity: number;
    mrp: number;
    discount_pct: number;
    discount_amt: number;
    price: number;
}

interface BillDetail extends Bill {
    customer_email: string;
    customer_address: string;
    installation_charge?: number;
    installation_note?: string;
    items: BillItem[];
}

// ── Client-side decryption safety net ──────────────────────────────────────────
// If the Electron main process didn't decrypt (e.g., old build still running),
// this strips the gibberish prefix so the UI degrades gracefully.
const safeDecrypt = (val: any): string => {
    if (!val || typeof val !== 'string') return String(val || '');
    // If still starts with e1: or e2: (backend didn't decrypt), strip it
    if (val.startsWith('e1:') || val.startsWith('e2:')) {
        return '🔒 [encrypted]';
    }
    return val;
};

const BillHistory: React.FC = () => {
    const [bills, setBills] = useState<Bill[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedBill, setSelectedBill] = useState<BillDetail | null>(null);

    // ── Filters ───────────────────────────────────────────────────────────────
    const [showFilters, setShowFilters] = useState(false);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filterBilledBy, setFilterBilledBy] = useState('');
    const [filterAlteredOnly, setFilterAlteredOnly] = useState(false);

    useEffect(() => { fetchBills(); }, []);

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

    // Unique billed-by options for the filter dropdown
    const billedByOptions = useMemo(() => {
        const set = new Set<string>();
        bills.forEach(b => { if (b.billed_by && !b.billed_by.startsWith('e')) set.add(b.billed_by); });
        return Array.from(set).sort();
    }, [bills]);

    // Active filter count badge
    const activeFilterCount = [dateFrom, dateTo, filterBilledBy, filterAlteredOnly ? '1' : ''].filter(Boolean).length;

    const filtered = useMemo(() => {
        return bills.filter(b => {
            const inv = (b.invoice_number || '').toLowerCase();
            const cust = (b.customer_name || '').toLowerCase();
            const phone = (b.customer_phone || '');
            const q = search.toLowerCase();

            if (q && !inv.includes(q) && !cust.includes(q) && !phone.includes(q)) return false;
            if (filterAlteredOnly && !b.is_altered) return false;
            if (filterBilledBy && b.billed_by !== filterBilledBy) return false;

            if (dateFrom) {
                const from = new Date(dateFrom);
                from.setHours(0, 0, 0, 0);
                if (new Date(b.created_at) < from) return false;
            }
            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                if (new Date(b.created_at) > to) return false;
            }
            return true;
        });
    }, [bills, search, dateFrom, dateTo, filterBilledBy, filterAlteredOnly]);

    const clearFilters = () => {
        setDateFrom(''); setDateTo(''); setFilterBilledBy(''); setFilterAlteredOnly(false);
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    // Summary stats
    const totalAmount = filtered.reduce((s, b) => s + (b.grand_total || 0), 0);

    return (
        <DashboardLayout title="Bill History">
            <div className="masters-container" style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                {/* ── Header ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Bill History</h1>
                        <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>
                            {filtered.length} bill{filtered.length !== 1 ? 's' : ''} &nbsp;·&nbsp; Total: <strong>৳{totalAmount.toLocaleString()}</strong>
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* search */}
                        <div style={{ position: 'relative' }}>
                            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search invoice, customer..."
                                style={{ padding: '0.6rem 0.6rem 0.6rem 2.2rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff', minWidth: '240px', fontSize: '0.85rem' }}
                            />
                        </div>
                        {/* filter toggle */}
                        <button
                            onClick={() => setShowFilters(v => !v)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: showFilters ? 'var(--accent-color)' : '#fff', color: showFilters ? '#fff' : 'inherit', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, position: 'relative' }}
                        >
                            <Filter size={14} />
                            Filters
                            {activeFilterCount > 0 && (
                                <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                    {activeFilterCount}
                                </span>
                            )}
                            {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                    </div>
                </div>

                {/* ── Filter Panel ── */}
                <AnimatePresence>
                    {showFilters && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ overflow: 'hidden' }}
                        >
                            <div style={{ display: 'flex', gap: '0.75rem', padding: '1rem', background: '#f8f9fa', borderRadius: '10px', border: '1px solid var(--border-color)', flexWrap: 'wrap', alignItems: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.7 }}>From Date</label>
                                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                        style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: '#fff' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.7 }}>To Date</label>
                                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                        style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: '#fff' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.7 }}>Billed By</label>
                                    <select value={filterBilledBy} onChange={e => setFilterBilledBy(e.target.value)}
                                        style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: '#fff', minWidth: '140px' }}>
                                        <option value="">All Staff</option>
                                        {billedByOptions.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '1rem' }}>
                                    <input type="checkbox" id="alteredOnly" checked={filterAlteredOnly} onChange={e => setFilterAlteredOnly(e.target.checked)}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                                    <label htmlFor="alteredOnly" style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <Star size={14} fill="#f97316" color="#f97316" /> Altered Only
                                    </label>
                                </div>
                                {activeFilterCount > 0 && (
                                    <button onClick={clearFilters}
                                        style={{ marginTop: '1rem', padding: '0.45rem 0.9rem', borderRadius: '6px', border: '1px solid #ef4444', color: '#ef4444', background: 'rgba(239,68,68,0.05)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <X size={13} /> Clear Filters
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Bills Table ── */}
                <div style={{ flex: 1, background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {loading ? (
                        <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>Loading bills...</div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>
                            {search || activeFilterCount > 0 ? 'No bills matched your filters.' : 'No bills created yet.'}
                        </div>
                    ) : (
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 2 }}>
                                    <tr>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Invoice</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Customer</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Date & Time</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Billed By</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>Total</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, width: '60px' }}>View</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((bill, idx) => (
                                        <tr
                                            key={bill.id}
                                            onClick={() => viewBill(bill.id)}
                                            style={{
                                                borderBottom: '1px solid #f0f0f0',
                                                background: bill.is_altered ? 'rgba(249, 115, 22, 0.04)' : (idx % 2 === 0 ? '#fafbfc' : '#fff'),
                                                cursor: 'pointer',
                                                boxShadow: bill.is_altered ? 'inset 3px 0 0 var(--accent-color)' : 'none',
                                                transition: 'background 0.1s'
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
                                            onMouseLeave={e => (e.currentTarget.style.background = bill.is_altered ? 'rgba(249,115,22,0.04)' : (idx % 2 === 0 ? '#fafbfc' : '#fff'))}
                                        >
                                            <td style={{ padding: '0.7rem 1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-color)', fontSize: '0.82rem' }}>
                                                        {safeDecrypt(bill.invoice_number)}
                                                    </span>
                                                    {bill.is_altered && <Star size={12} fill="#f97316" color="#f97316" />}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.7rem 1rem' }}>
                                                <div style={{ fontWeight: 600 }}>{safeDecrypt(bill.customer_name) || 'Walk-in'}</div>
                                                <div style={{ fontSize: '0.78rem', color: '#888' }}>{safeDecrypt(bill.customer_phone)}</div>
                                            </td>
                                            <td style={{ padding: '0.7rem 1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#555', fontSize: '0.82rem' }}>
                                                    <Calendar size={12} />
                                                    {formatDate(bill.created_at)}
                                                </div>
                                                <div style={{ fontSize: '0.78rem', color: '#888' }}>{formatTime(bill.created_at)}</div>
                                            </td>
                                            <td style={{ padding: '0.7rem 1rem', color: '#666', fontSize: '0.85rem' }}>
                                                {safeDecrypt(bill.billed_by) || '—'}
                                            </td>
                                            <td style={{ padding: '0.7rem 1rem', textAlign: 'right', fontWeight: 700, fontSize: '1rem' }}>
                                                ৳{(bill.grand_total || 0).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.7rem 1rem', textAlign: 'center' }}>
                                                <button onClick={e => { e.stopPropagation(); viewBill(bill.id); }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-color)' }} title="View Bill">
                                                    <Eye size={17} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ── Bill Detail Modal ── */}
                <AnimatePresence>
                    {selectedBill && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => setSelectedBill(null)}>
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                onClick={e => e.stopPropagation()}
                                id="bill-detail-print"
                                style={{ background: '#fff', borderRadius: '16px', width: '720px', maxHeight: '88vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: '2rem' }}
                            >
                                {/* Modal Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                    <div>
                                        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.25rem' }}>Invoice Details</h2>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span style={{ fontFamily: 'monospace', color: 'var(--accent-color)', fontWeight: 600, fontSize: '1rem' }}>
                                                {safeDecrypt(selectedBill.invoice_number)}
                                            </span>
                                            {selectedBill.is_altered && (
                                                <span style={{ padding: '0.2rem 0.5rem', background: 'rgba(249,115,22,0.1)', color: '#f97316', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Star size={12} fill="#f97316" /> ALTERED
                                                </span>
                                            )}
                                        </div>
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
                                    <div><strong>Customer:</strong> {safeDecrypt(selectedBill.customer_name) || 'Walk-in'}</div>
                                    <div><strong>Phone:</strong> {safeDecrypt(selectedBill.customer_phone) || 'N/A'}</div>
                                    <div><strong>Address:</strong> {safeDecrypt(selectedBill.customer_address) || 'N/A'}</div>
                                    <div><strong>Email:</strong> {safeDecrypt(selectedBill.customer_email) || 'N/A'}</div>
                                    <div><strong>Date:</strong> {formatDate(selectedBill.created_at)} {formatTime(selectedBill.created_at)}</div>
                                    <div><strong>Billed By:</strong> {safeDecrypt(selectedBill.billed_by) || '—'}</div>
                                </div>

                                {/* Items Table */}
                                {(!selectedBill.items || selectedBill.items.length === 0) ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', background: '#f8f9fa', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', opacity: 0.6 }}>
                                        <Package size={32} />
                                        <p style={{ fontSize: '0.9rem' }}>No products found for this bill.</p>
                                        <p style={{ fontSize: '0.78rem' }}>This may be an older bill created before items tracking was active.</p>
                                    </div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                                        <thead style={{ background: '#f1f5f9' }}>
                                            <tr>
                                                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', width: '36px', fontWeight: 700 }}>#</th>
                                                <th style={{ padding: '0.6rem', textAlign: 'left', fontWeight: 700 }}>Product</th>
                                                <th style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 700 }}>Qty</th>
                                                <th style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 700 }}>Disc%</th>
                                                <th style={{ padding: '0.6rem', textAlign: 'right', fontWeight: 700 }}>MRP</th>
                                                <th style={{ padding: '0.6rem', textAlign: 'right', fontWeight: 700 }}>Price</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedBill.items.map((item, idx) => (
                                                <tr key={item.id || idx} style={{ borderBottom: '1px solid #eee' }}>
                                                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: '#888' }}>{idx + 1}</td>
                                                    <td style={{ padding: '0.6rem' }}>
                                                        <div style={{ fontWeight: 600 }}>{safeDecrypt(item.product_name) || '—'}</div>
                                                        {item.sku && <div style={{ fontSize: '0.75rem', color: '#888' }}>SKU: {safeDecrypt(item.sku)}</div>}
                                                    </td>
                                                    <td style={{ padding: '0.6rem', textAlign: 'center' }}>{item.quantity}</td>
                                                    <td style={{ padding: '0.6rem', textAlign: 'center' }}>{item.discount_pct ?? 0}%</td>
                                                    <td style={{ padding: '0.6rem', textAlign: 'right' }}>৳{(item.mrp || 0).toLocaleString()}</td>
                                                    <td style={{ padding: '0.6rem', textAlign: 'right', fontWeight: 600 }}>৳{(item.price || 0).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                {/* Totals */}
                                <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                                        <span style={{ color: '#666' }}>Subtotal</span>
                                        <span>৳{(selectedBill.subtotal || 0).toLocaleString()}</span>
                                    </div>
                                    {(selectedBill.discount_total || 0) > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.9rem', color: '#ef4444' }}>
                                            <span>Discount</span>
                                            <span>-৳{selectedBill.discount_total.toLocaleString()}</span>
                                        </div>
                                    )}
                                    {(selectedBill.installation_charge || 0) > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.9rem', color: '#666' }}>
                                            <span>Installation {selectedBill.installation_note ? `(${selectedBill.installation_note})` : ''}</span>
                                            <span>৳{selectedBill.installation_charge!.toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 700, paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
                                        <span>Grand Total</span>
                                        <span style={{ color: 'var(--accent-color)' }}>৳{(selectedBill.grand_total || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Print styles */}
                <style>{`
                    @media print {
                        body * { visibility: hidden; }
                        #bill-detail-print, #bill-detail-print * { visibility: visible; }
                        #bill-detail-print {
                            position: absolute; left: 0; top: 0; width: 100%;
                            border-radius: 0 !important; box-shadow: none !important;
                        }
                    }
                `}</style>
            </div>
        </DashboardLayout>
    );
};

export default BillHistory;
