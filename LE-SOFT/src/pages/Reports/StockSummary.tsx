import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, FileDown, FileSpreadsheet } from 'lucide-react';
import { motion } from 'framer-motion';
import { exportPDF, exportExcel } from '../../utils/exportReport';
import '../Accounting/Masters/Masters.css';

const StockSummary: React.FC = () => {
    const navigate = useNavigate();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const fetch = async () => {
            try {
                // @ts-ignore
                const rows = await window.electron.reportStockSummary();
                setData(rows || []);
            } catch (e) { console.error(e); }
            setLoading(false);
        };
        fetch();
    }, []);

    const filtered = data.filter(r =>
        r.name?.toLowerCase().includes(search.toLowerCase()) ||
        (r.sku || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.category || '').toLowerCase().includes(search.toLowerCase())
    );

    const totalStockValue = filtered.reduce((s, r) => s + ((r.quantity || 0) * (r.purchase_price || 0)), 0);
    const totalSellingValue = filtered.reduce((s, r) => s + ((r.quantity || 0) * (r.selling_price || 0)), 0);
    const totalQty = filtered.reduce((s, r) => s + (r.quantity || 0), 0);
    const formatAmt = (amt: number) => `৳ ${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    const handlePDF = () => {
        const cols = ['Product', 'SKU', 'Category', 'On Hand', 'Cost', 'Sell', 'Value'];
        const rows = filtered.map(r => [r.name, r.sku || '—', r.category || '—', `${r.quantity || 0}`, (r.purchase_price || 0).toFixed(2), (r.selling_price || 0).toFixed(2), ((r.quantity || 0) * (r.purchase_price || 0)).toFixed(2)]);
        rows.push(['Total', '', '', totalQty.toString(), '', '', totalStockValue.toFixed(2)]);
        exportPDF({ title: 'Stock Summary', subtitle: `${filtered.length} products`, columns: cols, rows, orientation: 'landscape' });
    };

    const handleExcel = () => {
        const cols = ['Product', 'SKU', 'Category', 'On Hand', 'Cost Price', 'Sell Price', 'Stock Value'];
        const rows = filtered.map(r => [r.name, r.sku || '', r.category || '', r.quantity || 0, r.purchase_price || 0, r.selling_price || 0, (r.quantity || 0) * (r.purchase_price || 0)]);
        rows.push(['Total', '', '', totalQty, '', '', totalStockValue]);
        exportExcel({ title: 'Stock Summary', columns: cols, rows, sheetName: 'Stock' });
    };

    const btnStyle = (bg: string, col: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: bg, color: col, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' });

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button onClick={() => navigate('/reports')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}><ArrowLeft size={20} /></button>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Stock Summary</h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.4rem 0.75rem', gap: '0.5rem' }}>
                        <Search size={16} style={{ opacity: 0.5 }} />
                        <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ background: 'none', border: 'none', outline: 'none', color: 'inherit', fontSize: '0.85rem', width: '120px' }} />
                    </div>
                    {filtered.length > 0 && <>
                        <button onClick={handlePDF} title="PDF" style={btnStyle('rgba(239,68,68,0.08)', '#ef4444')}><FileDown size={15} /> PDF</button>
                        <button onClick={handleExcel} title="Excel" style={btnStyle('rgba(34,197,94,0.08)', '#22c55e')}><FileSpreadsheet size={15} /> Excel</button>
                    </>}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {[
                    { label: 'Total Products', value: filtered.length, color: '#6366f1' },
                    { label: 'Total Quantity', value: totalQty, color: '#f97316' },
                    { label: 'Value (Cost)', value: formatAmt(totalStockValue), color: '#22c55e' },
                    { label: 'Value (Sell)', value: formatAmt(totalSellingValue), color: '#ec4899' },
                ].map((c, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                        style={{ padding: '1rem', borderRadius: '10px', background: 'var(--card-bg)', border: '1px solid var(--border-color)' }}>
                        <p style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '0.3rem' }}>{c.label}</p>
                        <p style={{ fontSize: '1.2rem', fontWeight: 700, color: c.color }}>{c.value}</p>
                    </motion.div>
                ))}
            </div>

            {loading ? <p style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>Loading...</p>
            : filtered.length === 0 ? <div style={{ textAlign: 'center', padding: '4rem 2rem' }}><p style={{ opacity: 0.5 }}>No stock data</p></div>
            : (
                <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr style={{ background: 'rgba(236,72,153,0.05)' }}>
                            {['Product','SKU','Category','On Hand','Purchased','Cost','Sell','Stock Value'].map(h => <th key={h} style={{ textAlign: h === 'Product' || h === 'SKU' || h === 'Category' ? 'left' : 'right', padding: '0.75rem 1rem', fontWeight: 700, fontSize: '0.82rem' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {filtered.map((r, i) => (
                                <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '0.65rem 1rem', fontWeight: 500 }}>{r.name}</td>
                                    <td style={{ padding: '0.65rem 1rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.82rem', opacity: 0.6 }}>{r.sku || '—'}</td>
                                    <td style={{ padding: '0.65rem 1rem', fontSize: '0.85rem' }}>{r.category || '—'}</td>
                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 600, color: (r.quantity||0) > 0 ? '#22c55e' : '#ef4444' }}>{r.quantity||0}</td>
                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', opacity: 0.6 }}>{r.purchased_qty||0}</td>
                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>৳ {(r.purchase_price||0).toLocaleString()}</td>
                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>৳ {(r.selling_price||0).toLocaleString()}</td>
                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{formatAmt((r.quantity||0)*(r.purchase_price||0))}</td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </motion.div>
    );
};

export default StockSummary;
