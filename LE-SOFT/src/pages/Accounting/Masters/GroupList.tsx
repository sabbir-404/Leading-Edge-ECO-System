import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import './Masters.css';

const GroupList: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchGroups = async () => {
        try {
            // @ts-ignore
            const result = await window.electron.getGroups();
            setGroups(result || []);
        } catch (error) {
            console.error('Failed to fetch groups:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchGroups(); }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this group?')) return;
        try {
            // @ts-ignore
            await window.electron.deleteGroup(id);
            fetchGroups();
        } catch (error) {
            console.error('Failed to delete group:', error);
            alert('Cannot delete group — it may be in use.');
        }
    };

    const filteredGroups = groups.filter(g =>
        g.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="master-list-container">
            <div className="list-header">
                <h2>Groups</h2>
                <button className="create-btn" onClick={() => navigate('/masters/groups/create')}>
                    <Plus size={18} /> Create Group
                </button>
            </div>

            <div className="search-bar">
                <Search size={18} />
                <input
                    type="text"
                    placeholder="Search groups..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="table-container">
                <table className="master-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Under</th>
                            <th>Nature</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={4} className="empty-state">Loading...</td></tr>
                        ) : filteredGroups.length === 0 ? (
                            <tr><td colSpan={4} className="empty-state">No groups found</td></tr>
                        ) : (
                            filteredGroups.map((group) => (
                                <motion.tr
                                    key={group.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    <td>{group.name}</td>
                                    <td>{group.parent_name || 'Primary'}</td>
                                    <td>{group.nature || '—'}</td>
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

export default GroupList;
