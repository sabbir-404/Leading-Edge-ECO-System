import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Edit2 } from 'lucide-react';
import { motion } from 'framer-motion';
import '../../Accounting/Masters/Masters.css';

const StockGroupList: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchGroups = async () => {
        try {
            // @ts-ignore
            const result = await window.electron.getStockGroups();
            setGroups(result || []);
        } catch (error) {
            console.error('Failed to fetch stock groups:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchGroups(); }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this stock group?')) return;
        try {
            // @ts-ignore
            await window.electron.deleteStockGroup(id);
            fetchGroups();
        } catch (error) {
            alert('Cannot delete — stock items may belong to this group.');
        }
    };

    const filtered = groups.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="master-list-container">
            <div className="list-header">
                <h2>Stock Groups</h2>
                <button className="create-btn" onClick={() => navigate('/masters/stock-groups/create')}>
                    <Plus size={18} /> Create Stock Group
                </button>
            </div>

            <div className="search-bar">
                <Search size={18} />
                <input type="text" placeholder="Search stock groups..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

            <div className="table-container">
                <table className="master-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Under</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={3} className="empty-state">Loading...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={3} className="empty-state">No stock groups found</td></tr>
                        ) : (
                            filtered.map((group) => (
                                <motion.tr key={group.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    <td style={{ fontWeight: 500 }}>{group.name}</td>
                                    <td>{group.parent_name || 'Primary'}</td>
                                    <td>
                                        <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                                            <button className="edit-btn"><Edit2 size={16} /></button>
                                            <button className="delete-btn" onClick={() => handleDelete(group.id)}><Trash2 size={16} /></button>
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

export default StockGroupList;
