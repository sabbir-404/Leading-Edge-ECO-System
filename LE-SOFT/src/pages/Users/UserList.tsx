import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Shield, UserCheck, UserX, Edit2, X, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

const UserList: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState<any>(null);

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
            await window.electron.updateUser({
                id: user.id,
                fullName: user.full_name,
                role: user.role,
                email: user.email,
                phone: user.phone,
                isActive: user.is_active ? 0 : 1 
            });
            fetchUsers();
        } catch (error) {
            alert('Failed to update user.');
        }
    };

    const handleEditSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // @ts-ignore
            await window.electron.updateUser({
                id: editingUser.id,
                fullName: editingUser.full_name,
                role: editingUser.role,
                email: editingUser.email,
                phone: editingUser.phone,
                isActive: editingUser.is_active
            });
            setEditingUser(null);
            fetchUsers();
        } catch (error) {
            alert('Failed to update user details.');
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
                                                <div className="action-buttons" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                    <button onClick={() => setEditingUser({ ...user })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '8px', border: 'none', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', cursor: 'pointer' }}>
                                                        <Edit2 size={16} />
                                                    </button>
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

            {/* Edit Modal */}
            <AnimatePresence>
                {editingUser && (
                    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className="modal-content" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ maxWidth: '500px' }}>
                            <div className="modal-header">
                                <h3>Edit User: {editingUser.username}</h3>
                                <button className="close-btn" onClick={() => setEditingUser(null)}><X size={20} /></button>
                            </div>
                            <form onSubmit={handleEditSave} className="create-form" style={{ padding: '1.5rem' }}>
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label>Full Name</label>
                                    <input value={editingUser.full_name || ''} onChange={e => setEditingUser({...editingUser, full_name: e.target.value})} />
                                </div>
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label>Role</label>
                                    <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value})}>
                                        <option value="admin">Admin</option>
                                        <option value="manager">Manager</option>
                                        <option value="operator">Operator</option>
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label>Email</label>
                                    <input type="email" value={editingUser.email || ''} onChange={e => setEditingUser({...editingUser, email: e.target.value})} />
                                </div>
                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label>Phone</label>
                                    <input value={editingUser.phone || ''} onChange={e => setEditingUser({...editingUser, phone: e.target.value})} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" onClick={() => setEditingUser(null)} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                    <button type="submit" style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none', background: 'var(--accent-color)', color: 'white', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Save size={16} /> Save Changes
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </DashboardLayout>
    );
};

export default UserList;
