import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileDown, FileSpreadsheet } from 'lucide-react';
import { motion } from 'framer-motion';
import { exportPDF, exportExcel } from '../../utils/exportReport';
import '../Accounting/Masters/Masters.css';

const BalanceSheet: React.FC = () => {
    const navigate = useNavigate();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            try {
                // @ts-ignore
                const rows = await window.electron.reportBalanceSheet();
                setData(rows || []);
            } catch (e) { console.error(e); }
            setLoading(false);
        };
        fetch();
    }, []);

    const computeNet = (row: any) => {
        const openDr = row.opening_balance_type === 'Dr' ? (row.opening_balance || 0) : 0;
        const openCr = row.opening_balance_type === 'Cr' ? (row.opening_balance || 0) : 0;
        return (openDr + (row.total_debit || 0)) - (openCr + (row.total_credit || 0));
    };

    const assets = data.filter(r => r.nature === 'Assets');
    const liabilities = data.filter(r => r.nature === 'Liabilities');
    const totalAssets = assets.reduce((s, r) => s + computeNet(r), 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + Math.abs(computeNet(r)), 0);
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const formatAmt = (amt: number) => `৳ ${Math.abs(amt).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    const handlePDF = () => {
        const columns = ['Nature', 'Group', 'Ledger', 'Amount'];
        const rows = data.map(row => [row.nature, row.group_name, row.ledger_name, Math.abs(computeNet(row)).toFixed(2)]);
        rows.push(['', '', 'Total Assets', totalAssets.toFixed(2)]);
        rows.push(['', '', 'Total Liabilities', totalLiabilities.toFixed(2)]);
        rows.push(['', '', 'Difference', (totalAssets - totalLiabilities).toFixed(2)]);
        exportPDF({ title: 'Balance Sheet', subtitle: `As on ${dateStr}`, columns, rows });
    };

    const handleExcel = () => {
        const columns = ['Nature', 'Group', 'Ledger', 'Amount'];
        const rows = data.map(row => [row.nature, row.group_name, row.ledger_name, Math.abs(computeNet(row)).toFixed(2)]);
        rows.push(['', '', 'Total Assets', totalAssets.toFixed(2)]);
        rows.push(['', '', 'Total Liabilities', totalLiabilities.toFixed(2)]);
        rows.push(['', '', 'Difference', (totalAssets - totalLiabilities).toFixed(2)]);
        exportExcel({ title: 'Balance Sheet', columns, rows, sheetName: 'Balance Sheet' });
    };

    const renderSection = (title: string, items: any[], color: string, total: number) => (
        <div style={{ flex: 1, minWidth: '320px' }}>
            <div style={{ background: `${color}12`, padding: '0.85rem 1rem', borderRadius: '10px 10px 0 0', borderBottom: `2px solid ${color}` }}>
                <h3 style={{ fontWeight: 700, color }}>{title}</h3>
            </div>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderTop: 'none', borderRadius: '0 0 10px 10px' }}>
                {items.length === 0 ? (
                    <p style={{ padding: '2rem', textAlign: 'center', opacity: 0.4 }}>No {title.toLowerCase()} ledgers found</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '0.6rem 1rem', fontWeight: 600, fontSize: '0.8rem', opacity: 0.6 }}>Ledger</th>
                                <th style={{ textAlign: 'left', padding: '0.6rem 1rem', fontWeight: 600, fontSize: '0.8rem', opacity: 0.6 }}>Group</th>
                                <th style={{ textAlign: 'right', padding: '0.6rem 1rem', fontWeight: 600, fontSize: '0.8rem', opacity: 0.6 }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((row, i) => {
                                const net = computeNet(row);
                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '0.6rem 1rem', fontWeight: 500 }}>{row.ledger_name}</td>
                                        <td style={{ padding: '0.6rem 1rem', fontSize: '0.8rem', opacity: 0.5 }}>{row.group_name}</td>
                                        <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
                                            {formatAmt(net)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid var(--border-color)', background: `${color}08` }}>
                                <td colSpan={2} style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Total {title}</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color }}>{formatAmt(total)}</td>
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>
        </div>
    );

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button onClick={() => navigate('/reports')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}><ArrowLeft size={20} /></button>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Balance Sheet</h1>
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
                    <p style={{ fontSize: '1.1rem', opacity: 0.5, marginBottom: '0.5rem' }}>No balance sheet data</p>
                    <p style={{ fontSize: '0.85rem', opacity: 0.35 }}>Create Asset and Liability groups/ledgers in Masters.</p>
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                        {renderSection('Assets', assets, '#22c55e', totalAssets)}
                        {renderSection('Liabilities', liabilities, '#ef4444', totalLiabilities)}
                    </div>
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                        style={{ marginTop: '1.25rem', padding: '1rem 1.5rem', borderRadius: '10px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <span style={{ fontWeight: 700, fontSize: '1rem' }}>Difference (Assets − Liabilities)</span>
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '1.1rem', fontFamily: "'JetBrains Mono', monospace", color: totalAssets >= totalLiabilities ? '#22c55e' : '#ef4444' }}>
                            {formatAmt(totalAssets - totalLiabilities)}
                        </span>
                    </motion.div>
                </>
            )}
        </motion.div>
    );
};

export default BalanceSheet;
