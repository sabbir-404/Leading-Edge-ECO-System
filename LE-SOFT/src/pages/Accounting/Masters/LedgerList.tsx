import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import './Masters.css';

const LedgerList: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLedgers = async () => {
        try {
            // @ts-ignore
            const result = await window.electron.getLedgers();
            setLedgers(result || []);
        } catch (error) {
            console.error('Failed to fetch ledgers:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchLedgers(); }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this ledger?')) return;
        try {
            // @ts-ignore
            await window.electron.deleteLedger(id);
            fetchLedgers();
        } catch (error) {
            console.error('Failed to delete ledger:', error);
            alert('Cannot delete ledger — it may be referenced by vouchers.');
        }
    };

    const filteredLedgers = ledgers.filter(l =>
        l.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="master-list-container">
            <div className="list-header">
                <h2>Ledgers</h2>
                <button className="create-btn" onClick={() => navigate('/masters/ledgers/create')}>
                    <Plus size={18} /> Create Ledger
                </button>
            </div>

            <div className="search-bar">
                <Search size={18} />
                <input
                    type="text"
                    placeholder="Search ledgers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="table-container">
                <table className="master-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Under Group</th>
                            <th>Opening Balance</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={4} className="empty-state">Loading...</td></tr>
                        ) : filteredLedgers.length === 0 ? (
                            <tr><td colSpan={4} className="empty-state">No ledgers found</td></tr>
                        ) : (
                            filteredLedgers.map((ledger) => (
                                <motion.tr
                                    key={ledger.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    <td style={{ fontWeight: 500 }}>{ledger.name}</td>
                                    <td>{ledger.group_name || '—'}</td>
                                    <td>
                                        {(ledger.opening_balance || 0).toLocaleString()}
                                        <span style={{ fontSize: '0.8rem', opacity: 0.7, marginLeft: '4px' }}>{ledger.opening_balance_type}</span>
                                    </td>
                                    <td>
                                        <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                                            <button className="edit-btn"><Edit2 size={16} /></button>
                                            <button className="delete-btn" onClick={() => handleDelete(ledger.id)}><Trash2 size={16} /></button>
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

export default LedgerList;
