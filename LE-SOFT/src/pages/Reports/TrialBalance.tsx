import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileDown, FileSpreadsheet } from 'lucide-react';
import { motion } from 'framer-motion';
import { exportPDF, exportExcel } from '../../utils/exportReport';
import '../Accounting/Masters/Masters.css';

const TrialBalance: React.FC = () => {
    const navigate = useNavigate();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            try {
                // @ts-ignore
                const rows = await window.electron.reportTrialBalance();
                setData(rows || []);
            } catch (e) { console.error(e); }
            setLoading(false);
        };
        fetch();
    }, []);

    const computeBalance = (row: any) => {
        const openDr = row.opening_balance_type === 'Dr' ? (row.opening_balance || 0) : 0;
        const openCr = row.opening_balance_type === 'Cr' ? (row.opening_balance || 0) : 0;
        const closingDr = openDr + (row.total_debit || 0);
        const closingCr = openCr + (row.total_credit || 0);
        return { closingDr, closingCr, net: closingDr - closingCr };
    };

    const totalDr = data.reduce((s, r) => { const b = computeBalance(r); return s + (b.net > 0 ? b.net : 0); }, 0);
    const totalCr = data.reduce((s, r) => { const b = computeBalance(r); return s + (b.net < 0 ? Math.abs(b.net) : 0); }, 0);
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const getExportData = () => {
        const columns = ['Particulars', 'Group', 'Debit (Dr)', 'Credit (Cr)'];
        const rows = data.map(row => {
            const bal = computeBalance(row);
            return [
                row.name,
                row.group_name || '—',
                bal.net > 0 ? bal.net.toFixed(2) : '',
                bal.net < 0 ? Math.abs(bal.net).toFixed(2) : '',
            ];
        });
        const footerRow = ['Total', '', totalDr.toFixed(2), totalCr.toFixed(2)];
        return { columns, rows, footerRow };
    };

    const handlePDF = () => {
        const { columns, rows, footerRow } = getExportData();
        exportPDF({ title: 'Trial Balance', subtitle: `As on ${dateStr}`, columns, rows, footerRow });
    };

    const handleExcel = () => {
        const { columns, rows } = getExportData();
        rows.push(['Total', '', totalDr.toFixed(2), totalCr.toFixed(2)]);
        exportExcel({ title: 'Trial Balance', columns, rows, sheetName: 'Trial Balance' });
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button onClick={() => navigate('/reports')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}><ArrowLeft size={20} /></button>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Trial Balance</h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', opacity: 0.5, marginRight: '0.5rem' }}>As on {dateStr}</span>
                    {data.length > 0 && (
                        <>
                            <button onClick={handlePDF} title="Export PDF" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>
                                <FileDown size={15} /> PDF
                            </button>
                            <button onClick={handleExcel} title="Export Excel" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(34,197,94,0.08)', color: '#22c55e', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>
                                <FileSpreadsheet size={15} /> Excel
                            </button>
                        </>
                    )}
                </div>
            </div>

            {loading ? (
                <p style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>Loading...</p>
            ) : data.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <p style={{ fontSize: '1.1rem', opacity: 0.5, marginBottom: '0.5rem' }}>No ledger data available</p>
                    <p style={{ fontSize: '0.85rem', opacity: 0.35 }}>Create groups and ledgers in Masters to see the Trial Balance here.</p>
                </div>
            ) : (
                <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'rgba(99,102,241,0.06)' }}>
                                <th style={{ textAlign: 'left', padding: '0.85rem 1rem', fontWeight: 700, fontSize: '0.85rem' }}>Particulars</th>
                                <th style={{ textAlign: 'left', padding: '0.85rem 1rem', fontWeight: 700, fontSize: '0.85rem' }}>Group</th>
                                <th style={{ textAlign: 'right', padding: '0.85rem 1rem', fontWeight: 700, fontSize: '0.85rem', color: '#22c55e' }}>Debit (Dr)</th>
                                <th style={{ textAlign: 'right', padding: '0.85rem 1rem', fontWeight: 700, fontSize: '0.85rem', color: '#ef4444' }}>Credit (Cr)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row, i) => {
                                const bal = computeBalance(row);
                                return (
                                    <motion.tr key={row.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                                        style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '0.7rem 1rem', fontWeight: 500 }}>{row.name}</td>
                                        <td style={{ padding: '0.7rem 1rem', fontSize: '0.85rem', opacity: 0.6 }}>{row.group_name || '—'}</td>
                                        <td style={{ padding: '0.7rem 1rem', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, color: bal.net > 0 ? '#22c55e' : undefined }}>
                                            {bal.net > 0 ? `৳ ${bal.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''}
                                        </td>
                                        <td style={{ padding: '0.7rem 1rem', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, color: bal.net < 0 ? '#ef4444' : undefined }}>
                                            {bal.net < 0 ? `৳ ${Math.abs(bal.net).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''}
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid var(--border-color)', background: 'rgba(99,102,241,0.04)' }}>
                                <td colSpan={2} style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Total</td>
                                <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#22c55e' }}>
                                    ৳ {totalDr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                                <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#ef4444' }}>
                                    ৳ {totalCr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {!loading && data.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                    <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>{data.length} ledger accounts</p>
                    <div style={{
                        padding: '6px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
                        background: Math.abs(totalDr - totalCr) < 0.01 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        color: Math.abs(totalDr - totalCr) < 0.01 ? '#22c55e' : '#ef4444'
                    }}>
                        {Math.abs(totalDr - totalCr) < 0.01 ? '✓ Balanced' : `⚠ Difference: ৳ ${Math.abs(totalDr - totalCr).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </div>
                </div>
            )}
        </motion.div>
    );
};

export default TrialBalance;
