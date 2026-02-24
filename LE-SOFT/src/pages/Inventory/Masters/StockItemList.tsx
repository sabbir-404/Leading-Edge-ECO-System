import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Edit2 } from 'lucide-react';
import { motion } from 'framer-motion';
import '../../Accounting/Masters/Masters.css';

const StockItemList: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchItems = async () => {
        try {
            // @ts-ignore
            const result = await window.electron.getStockItems();
            setItems(result || []);
        } catch (error) {
            console.error('Failed to fetch stock items:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchItems(); }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this stock item?')) return;
        try {
            // @ts-ignore
            await window.electron.deleteStockItem(id);
            fetchItems();
        } catch (error) {
            alert('Failed to delete stock item.');
        }
    };

    const filtered = items.filter(i =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.group_name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="master-list-container">
            <div className="list-header">
                <h2>Stock Items</h2>
                <button className="create-btn" onClick={() => navigate('/masters/stock-items/create')}>
                    <Plus size={18} /> Create Stock Item
                </button>
            </div>

            <div className="search-bar">
                <Search size={18} />
                <input type="text" placeholder="Search stock items..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

            <div className="table-container">
                <table className="master-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Group</th>
                            <th>Unit</th>
                            <th style={{ textAlign: 'right' }}>Opening Qty</th>
                            <th style={{ textAlign: 'right' }}>Rate</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="empty-state">Loading...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={6} className="empty-state">No stock items found</td></tr>
                        ) : (
                            filtered.map((item) => (
                                <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    <td style={{ fontWeight: 500 }}>{item.name}</td>
                                    <td>{item.group_name || '—'}</td>
                                    <td>{item.unit_symbol || item.unit_name || '—'}</td>
                                    <td style={{ textAlign: 'right' }}>{item.opening_qty}</td>
                                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>৳ {(item.opening_rate || 0).toLocaleString()}</td>
                                    <td>
                                        <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                                            <button className="edit-btn"><Edit2 size={16} /></button>
                                            <button className="delete-btn" onClick={() => handleDelete(item.id)}><Trash2 size={16} /></button>
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

export default StockItemList;
