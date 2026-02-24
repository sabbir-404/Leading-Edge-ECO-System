import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import '../Masters/Masters.css';

const VoucherList: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [vouchers, setVouchers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchVouchers = async () => {
        try {
            // @ts-ignore
            const result = await window.electron.getVouchers();
            setVouchers(result || []);
        } catch (error) {
            console.error('Failed to fetch vouchers:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchVouchers(); }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this voucher? This action cannot be undone.')) return;
        try {
            // @ts-ignore
            await window.electron.deleteVoucher(id);
            fetchVouchers();
        } catch (error) {
            console.error('Failed to delete:', error);
        }
    };

    const filteredVouchers = vouchers.filter(v =>
        (v.voucher_type || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.narration || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.particulars || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getTypeBadge = (type: string) => {
        const colors: Record<string, { bg: string; color: string }> = {
            Receipt: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
            Payment: { bg: 'rgba(220,38,38,0.12)', color: '#dc2626' },
            Sales: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
            Purchase: { bg: 'rgba(249,115,22,0.12)', color: '#f97316' },
            Journal: { bg: 'rgba(168,85,247,0.12)', color: '#a855f7' },
            Contra: { bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
        };
        const c = colors[type] || colors.Contra;
        return <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 500, background: c.bg, color: c.color }}>{type}</span>;
    };

    return (
        <div className="master-list-container">
            <div className="list-header">
                <h2>Vouchers</h2>
                <button className="create-btn" onClick={() => navigate('/vouchers/create')}>
                    <Plus size={18} /> Create Voucher
                </button>
            </div>

            <div className="search-bar">
                <Search size={18} />
                <input
                    type="text"
                    placeholder="Search vouchers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="table-container">
                <table className="master-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>No.</th>
                            <th>Type</th>
                            <th>Particulars</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="empty-state">Loading...</td></tr>
                        ) : filteredVouchers.length === 0 ? (
                            <tr><td colSpan={6} className="empty-state">No vouchers found. Create your first voucher!</td></tr>
                        ) : (
                            filteredVouchers.map((voucher) => (
                                <motion.tr
                                    key={voucher.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    <td>{voucher.date}</td>
                                    <td>#{voucher.voucher_number}</td>
                                    <td>{getTypeBadge(voucher.voucher_type)}</td>
                                    <td style={{ fontWeight: 500 }}>{voucher.particulars || voucher.narration || '—'}</td>
                                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                                        ৳ {(voucher.total_amount || 0).toLocaleString()}
                                    </td>
                                    <td>
                                        <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                                            <button className="delete-btn" onClick={() => handleDelete(voucher.id)}><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </motion.tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default VoucherList;
