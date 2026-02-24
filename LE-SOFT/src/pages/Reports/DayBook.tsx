import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Calendar, FileDown, FileSpreadsheet } from 'lucide-react';
import { motion } from 'framer-motion';
import { exportPDF, exportExcel } from '../../utils/exportReport';
import '../Accounting/Masters/Masters.css';

const VOUCHER_COLORS: Record<string, string> = {
    'Payment': '#ef4444', 'Receipt': '#22c55e', 'Sales': '#3b82f6', 'Purchase': '#f97316',
    'Journal': '#8b5cf6', 'Contra': '#6366f1', 'Credit Note': '#ec4899', 'Debit Note': '#eab308',
};

const DayBook: React.FC = () => {
    const navigate = useNavigate();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            const rows = await window.electron.reportDayBook({ fromDate: fromDate || undefined, toDate: toDate || undefined });
            setData(rows || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, []);

    // Group entries by voucher
    const voucherMap = new Map<number, any>();
    data.forEach((entry: any) => {
        if (!voucherMap.has(entry.id)) {
            voucherMap.set(entry.id, { id: entry.id, voucherType: entry.voucher_type, voucherNumber: entry.voucher_number, date: entry.date, narration: entry.narration, totalAmount: entry.total_amount, entries: [] });
        }
        if (entry.entry_amount) {
            voucherMap.get(entry.id)!.entries.push({ ledger: entry.ledger_name, amount: entry.entry_amount, type: entry.entry_type });
        }
    });
    const vouchers = Array.from(voucherMap.values());

    const filtered = vouchers.filter(v =>
        v.voucherNumber?.toLowerCase().includes(search.toLowerCase()) ||
        v.narration?.toLowerCase().includes(search.toLowerCase()) ||
        v.voucherType?.toLowerCase().includes(search.toLowerCase()) ||
        v.entries.some((e: any) => e.ledger?.toLowerCase().includes(search.toLowerCase()))
    );

    const handlePDF = () => {
        const cols = ['Date', 'Type', 'Voucher #', 'Ledger', 'Dr', 'Cr', 'Narration'];
        const rows: (string | number)[][] = [];
        filtered.forEach(v => {
            v.entries.forEach((e: any, i: number) => {
                rows.push([i === 0 ? v.date : '', i === 0 ? v.voucherType : '', i === 0 ? v.voucherNumber : '',
                    e.ledger || '', e.type === 'Dr' ? e.amount.toFixed(2) : '', e.type === 'Cr' ? e.amount.toFixed(2) : '',
                    i === 0 ? (v.narration || '') : '']);
            });
            if (v.entries.length === 0) rows.push([v.date, v.voucherType, v.voucherNumber, '', '', '', v.narration || '']);
        });
        exportPDF({ title: 'Day Book', subtitle: fromDate && toDate ? `${fromDate} to ${toDate}` : 'All dates', columns: cols, rows, orientation: 'landscape' });
    };

    const handleExcel = () => {
        const cols = ['Date', 'Type', 'Voucher #', 'Ledger', 'Debit', 'Credit', 'Amount', 'Narration'];
        const rows: (string | number)[][] = [];
        filtered.forEach(v => {
            v.entries.forEach((e: any, i: number) => {
                rows.push([i === 0 ? v.date : '', i === 0 ? v.voucherType : '', i === 0 ? v.voucherNumber : '',
                    e.ledger || '', e.type === 'Dr' ? e.amount : '', e.type === 'Cr' ? e.amount : '',
                    i === 0 ? (v.totalAmount || 0) : '', i === 0 ? (v.narration || '') : '']);
            });
            if (v.entries.length === 0) rows.push([v.date, v.voucherType, v.voucherNumber, '', '', '', v.totalAmount || 0, v.narration || '']);
        });
        exportExcel({ title: 'Day Book', columns: cols, rows, sheetName: 'Day Book' });
    };

    const btnStyle = (bg: string, col: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: bg, color: col, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' });

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button onClick={() => navigate('/reports')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}><ArrowLeft size={20} /></button>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Day Book</h1>
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

            {/* Date Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <Calendar size={16} style={{ opacity: 0.5 }} />
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: '0.4rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'inherit', fontSize: '0.85rem' }} />
                <span style={{ opacity: 0.4 }}>to</span>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ padding: '0.4rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'inherit', fontSize: '0.85rem' }} />
                <button onClick={fetchData} style={{ padding: '0.4rem 1rem', borderRadius: '6px', background: 'var(--accent-color)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Apply</button>
                {(fromDate || toDate) && <button onClick={() => { setFromDate(''); setToDate(''); setTimeout(fetchData, 50); }} style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', cursor: 'pointer', color: 'inherit', fontSize: '0.85rem' }}>Clear</button>}
            </div>

            {loading ? <p style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>Loading...</p>
            : filtered.length === 0 ? <div style={{ textAlign: 'center', padding: '4rem 2rem' }}><p style={{ opacity: 0.5, marginBottom: '0.5rem' }}>No voucher entries found</p><p style={{ fontSize: '0.85rem', opacity: 0.35 }}>Create vouchers to see them here.</p></div>
            : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {filtered.map((v, i) => {
                        const color = VOUCHER_COLORS[v.voucherType] || '#666';
                        return (
                            <motion.div key={v.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                                style={{ background: 'var(--card-bg)', borderRadius: '10px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, background: `${color}15`, color }}>{v.voucherType}</span>
                                        <span style={{ fontWeight: 600 }}>#{v.voucherNumber}</span>
                                        <span style={{ fontSize: '0.8rem', opacity: 0.4 }}>{v.date}</span>
                                    </div>
                                    <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>৳ {(v.totalAmount || 0).toLocaleString()}</span>
                                </div>
                                {v.entries.length > 0 && <div style={{ padding: '0.5rem 1rem' }}>
                                    {v.entries.map((e: any, j: number) => (
                                        <div key={j} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', fontSize: '0.85rem' }}>
                                            <span style={{ paddingLeft: e.type === 'Cr' ? '1.5rem' : 0 }}>{e.type === 'Cr' ? 'To ' : ''}{e.ledger || 'Unknown'}</span>
                                            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: e.type === 'Dr' ? '#22c55e' : '#ef4444', fontWeight: 500 }}>৳ {(e.amount || 0).toLocaleString()} {e.type}</span>
                                        </div>
                                    ))}
                                </div>}
                                {v.narration && <div style={{ padding: '0.4rem 1rem 0.65rem', fontSize: '0.8rem', opacity: 0.4, fontStyle: 'italic' }}>{v.narration}</div>}
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {!loading && filtered.length > 0 && <p style={{ textAlign: 'right', marginTop: '0.75rem', fontSize: '0.8rem', opacity: 0.5 }}>Showing {filtered.length} voucher{filtered.length !== 1 ? 's' : ''}</p>}
        </motion.div>
    );
};

export default DayBook;
