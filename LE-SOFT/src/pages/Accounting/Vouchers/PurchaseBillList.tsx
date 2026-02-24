import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import '../Masters/Masters.css';

const PurchaseBillList: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [bills, setBills] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchBills = async () => {
        try {
            // @ts-ignore
            const result = await window.electron.getPurchaseBills();
            setBills(result || []);
        } catch (error) {
            console.error('Failed to fetch purchase bills:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchBills(); }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this purchase bill?')) return;
        try {
            // @ts-ignore
            await window.electron.deletePurchaseBill(id);
            fetchBills();
        } catch (error) {
            alert('Failed to delete purchase bill.');
        }
    };

    const filtered = bills.filter(b =>
        (b.bill_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (b.supplier_name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const statusColor = (status: string) => {
        switch (status) {
            case 'Paid': return { bg: 'rgba(34,197,94,0.1)', color: '#22c55e' };
            case 'Overdue': return { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' };
            default: return { bg: 'rgba(249,115,22,0.1)', color: '#f97316' };
        }
    };

    return (
        <div className="master-list-container">
            <div className="list-header">
                <h2>Purchase Bills</h2>
                <button className="create-btn" onClick={() => navigate('/vouchers/purchase-bill/create')}>
                    <Plus size={18} /> New Purchase Bill
                </button>
            </div>

            <div className="search-bar">
                <Search size={18} />
                <input type="text" placeholder="Search by bill number or supplier..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

            <div className="table-container">
                <table className="master-table">
                    <thead>
                        <tr>
                            <th>Bill No.</th>
                            <th>Date</th>
                            <th>Supplier</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Subtotal</th>
                            <th style={{ textAlign: 'right' }}>Tax</th>
                            <th style={{ textAlign: 'right' }}>Total</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} className="empty-state">Loading...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={8} className="empty-state">No purchase bills found. Click "New Purchase Bill" to create one.</td></tr>
                        ) : (
                            filtered.map((bill) => {
                                const sc = statusColor(bill.status);
                                return (
                                    <motion.tr key={bill.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                        <td style={{ fontWeight: 600 }}>{bill.bill_number}</td>
                                        <td>{bill.bill_date}</td>
                                        <td>{bill.supplier_name || '—'}</td>
                                        <td><span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, background: sc.bg, color: sc.color }}>{bill.status || 'Pending'}</span></td>
                                        <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>৳ {(bill.subtotal || 0).toLocaleString()}</td>
                                        <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>৳ {(bill.tax_total || 0).toLocaleString()}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>৳ {(bill.grand_total || 0).toLocaleString()}</td>
                                        <td>
                                            <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                                                <button className="delete-btn" onClick={() => handleDelete(bill.id)}><Trash2 size={16} /></button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default PurchaseBillList;
