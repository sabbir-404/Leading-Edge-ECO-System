import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import '../Masters/Masters.css';

type VoucherType = 'Payment' | 'Receipt' | 'Journal' | 'Contra' | 'Sales' | 'Purchase';

interface VoucherRow {
    id: number;
    type: 'Dr' | 'Cr';
    particulars: string;
    debit: number;
    credit: number;
}

const VoucherEntry: React.FC = () => {
    const navigate = useNavigate();
    const [voucherType, setVoucherType] = useState<VoucherType>('Payment');
    const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);

    const [rows, setRows] = useState<VoucherRow[]>([
        { id: 1, type: 'Dr', particulars: '', debit: 0, credit: 0 },
        { id: 2, type: 'Cr', particulars: '', debit: 0, credit: 0 }
    ]);

    const [narration, setNarration] = useState('');
    const [ledgers, setLedgers] = useState<any[]>([]);

    useEffect(() => {
        const fetchLedgers = async () => {
            try {
                // @ts-ignore
                const result = await window.electron.getLedgers();
                setLedgers(result || []);
            } catch (error) {
                console.error('Failed to fetch ledgers:', error);
            }
        };
        fetchLedgers();
    }, []);

    const handleRowChange = (id: number, field: keyof VoucherRow, value: any) => {
        setRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
    };

    const addRow = () => {
        setRows(prev => [...prev, { id: Date.now(), type: 'Dr', particulars: '', debit: 0, credit: 0 }]);
    };

    const removeRow = (id: number) => {
        if (rows.length > 2) setRows(prev => prev.filter(row => row.id !== id));
    };

    const totalDebit = rows.reduce((acc, row) => acc + Number(row.debit || 0), 0);
    const totalCredit = rows.reduce((acc, row) => acc + Number(row.credit || 0), 0);
    const isBalanced = totalDebit === totalCredit && totalDebit > 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isBalanced) {
            alert('Debit and Credit totals must match!');
            return;
        }
        try {
            // @ts-ignore
            const result = await window.electron.createVoucher({
                voucherType, voucherDate, narration, rows
            });
            alert(`Voucher #${result.voucherNumber} saved successfully!`);
            navigate('/vouchers');
        } catch (error) {
            console.error('Failed to save voucher:', error);
            alert('Error saving voucher');
        }
    };

    const typeColors: Record<string, string> = {
        Payment: '#f97316', Receipt: '#22c55e', Sales: '#3b82f6',
        Purchase: '#dc2626', Journal: '#a855f7', Contra: '#6b7280',
    };
    const typeColor = typeColors[voucherType] || '#f97316';

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="master-create-container"
            style={{ maxWidth: '1000px' }}
        >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button className="back-btn" onClick={() => navigate('/vouchers')}>
                        <ArrowLeft size={20} />
                    </button>
                    <h2 style={{ margin: 0 }}>{voucherType} Voucher</h2>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {(['Contra', 'Payment', 'Receipt', 'Journal', 'Sales', 'Purchase'] as VoucherType[]).map(type => (
                        <button
                            key={type}
                            onClick={() => setVoucherType(type)}
                            style={{
                                padding: '6px 14px', borderRadius: '20px', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer',
                                border: `1px solid ${voucherType === type ? typeColors[type] : 'var(--border-color)'}`,
                                background: voucherType === type ? typeColors[type] : 'transparent',
                                color: voucherType === type ? '#fff' : 'var(--text-primary)',
                            }}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="create-form">
                {/* Date & Info */}
                <div style={{ display: 'flex', gap: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                    <div className="form-group" style={{ width: '200px' }}>
                        <label>Date</label>
                        <input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
                    </div>
                </div>

                {/* Grid Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '60px 3fr 1fr 1fr 40px', gap: '0.75rem', padding: '0.75rem 0', fontWeight: 600, borderBottom: '2px solid var(--border-color)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                    <div>Dr/Cr</div>
                    <div>Particulars</div>
                    <div style={{ textAlign: 'right' }}>Debit</div>
                    <div style={{ textAlign: 'right' }}>Credit</div>
                    <div></div>
                </div>

                {/* Rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem', minHeight: '150px' }}>
                    {rows.map((row) => (
                        <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '60px 3fr 1fr 1fr 40px', gap: '0.75rem', alignItems: 'center' }}>
                            <select
                                value={row.type}
                                onChange={(e) => handleRowChange(row.id, 'type', e.target.value)}
                                style={{ padding: '8px 4px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                            >
                                <option value="Dr">Dr</option>
                                <option value="Cr">Cr</option>
                            </select>

                            <input
                                type="text"
                                list="ledger-list"
                                placeholder="Select Ledger"
                                value={row.particulars}
                                onChange={(e) => handleRowChange(row.id, 'particulars', e.target.value)}
                                style={{ padding: '8px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                            />

                            <input
                                type="number"
                                placeholder="0.00"
                                value={row.debit || ''}
                                onChange={(e) => handleRowChange(row.id, 'debit', e.target.value)}
                                disabled={row.type === 'Cr'}
                                style={{ padding: '8px', textAlign: 'right', background: row.type === 'Cr' ? 'transparent' : 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', opacity: row.type === 'Cr' ? 0.3 : 1 }}
                            />

                            <input
                                type="number"
                                placeholder="0.00"
                                value={row.credit || ''}
                                onChange={(e) => handleRowChange(row.id, 'credit', e.target.value)}
                                disabled={row.type === 'Dr'}
                                style={{ padding: '8px', textAlign: 'right', background: row.type === 'Dr' ? 'transparent' : 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', opacity: row.type === 'Dr' ? 0.3 : 1 }}
                            />

                            <button type="button" onClick={() => removeRow(row.id)} className="delete-btn" style={{ padding: '6px' }}>
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}

                    <button type="button" onClick={addRow} style={{ width: 'fit-content', background: 'transparent', border: 'none', color: typeColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', fontWeight: 500 }}>
                        <Plus size={16} /> Add Line
                    </button>
                </div>

                <datalist id="ledger-list">
                    {ledgers.map((l: any) => <option key={l.id} value={l.name} />)}
                </datalist>

                {/* Totals */}
                <div style={{ borderTop: '2px solid var(--border-color)', paddingTop: '1rem', display: 'grid', gridTemplateColumns: '60px 3fr 1fr 1fr 40px', gap: '0.75rem', fontWeight: 'bold' }}>
                    <div></div>
                    <div style={{ textAlign: 'right' }}>Total</div>
                    <div style={{ textAlign: 'right', color: isBalanced ? 'var(--text-primary)' : '#dc2626' }}>{totalDebit.toFixed(2)}</div>
                    <div style={{ textAlign: 'right', color: isBalanced ? 'var(--text-primary)' : '#dc2626' }}>{totalCredit.toFixed(2)}</div>
                    <div></div>
                </div>

                {/* Narration */}
                <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label>Narration</label>
                    <textarea
                        rows={3}
                        value={narration}
                        onChange={(e) => setNarration(e.target.value)}
                        placeholder="Enter narration..."
                        style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '1rem', resize: 'vertical' }}
                    />
                </div>

                {/* Save */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button
                        type="submit"
                        disabled={!isBalanced}
                        className="save-btn"
                        style={{
                            background: isBalanced ? typeColor : 'var(--border-color)',
                            cursor: isBalanced ? 'pointer' : 'not-allowed',
                            opacity: isBalanced ? 1 : 0.6,
                            padding: '12px 30px',
                        }}
                    >
                        <Save size={20} /> Save Voucher
                    </button>
                </div>
            </form>
        </motion.div>
    );
};

export default VoucherEntry;
