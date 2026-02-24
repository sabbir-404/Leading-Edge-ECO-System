import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Shield, UserCheck, UserX } from 'lucide-react';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

const UserList: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchUsers = async () => {
        try {
            // @ts-ignore
            const result = await window.electron.getUsers();
            setUsers(result || []);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUsers(); }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this user? This action cannot be undone.')) return;
        try {
            // @ts-ignore
            await window.electron.deleteUser(id);
            fetchUsers();
        } catch (error) {
            alert('Failed to delete user.');
        }
    };

    const toggleActive = async (user: any) => {
        try {
            // @ts-ignore
            await window.electron.updateUser({ ...user, isActive: user.is_active ? 0 : 1 });
            fetchUsers();
        } catch (error) {
            alert('Failed to update user.');
        }
    };

    const filtered = users.filter(u =>
        (u.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const roleColor = (role: string) => {
        switch (role) {
            case 'admin': return { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' };
            case 'manager': return { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' };
            default: return { bg: 'rgba(34,197,94,0.1)', color: '#22c55e' };
        }
    };

    return (
        <DashboardLayout title="User Management">
            <div className="master-list-container">
                <div className="list-header">
                    <h2>Users</h2>
                    <button className="create-btn" onClick={() => navigate('/users/create')}>
                        <Plus size={18} /> Add User
                    </button>
                </div>

                <div className="search-bar">
                    <Search size={18} />
                    <input type="text" placeholder="Search users by name, username, email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>

                <div className="table-container">
                    <table className="master-table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Full Name</th>
                                <th>Role</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7} className="empty-state">Loading...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={7} className="empty-state">No users found.</td></tr>
                            ) : (
                                filtered.map((user) => {
                                    const rc = roleColor(user.role);
                                    return (
                                        <motion.tr key={user.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                            <td style={{ fontWeight: 600 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <Shield size={16} style={{ color: rc.color }} />
                                                    {user.username}
                                                </div>
                                            </td>
                                            <td>{user.full_name || '—'}</td>
                                            <td><span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, background: rc.bg, color: rc.color, textTransform: 'capitalize' }}>{user.role}</span></td>
                                            <td style={{ color: 'var(--text-secondary)' }}>{user.email || '—'}</td>
                                            <td style={{ color: 'var(--text-secondary)' }}>{user.phone || '—'}</td>
                                            <td>
                                                <button onClick={() => toggleActive(user)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '4px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: user.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: user.is_active ? '#22c55e' : '#ef4444' }}>
                                                    {user.is_active ? <><UserCheck size={14} /> Active</> : <><UserX size={14} /> Inactive</>}
                                                </button>
                                            </td>
                                            <td>
                                                <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                                                    <button className="delete-btn" onClick={() => handleDelete(user.id)}><Trash2 size={16} /></button>
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
        </DashboardLayout>
    );
};

export default UserList;
