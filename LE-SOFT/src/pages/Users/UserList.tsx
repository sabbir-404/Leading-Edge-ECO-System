import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Shield, UserCheck, UserX, Edit2, X, Save, Lock, AtSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import { useToast } from '../../context/ToastContext';
import '../Accounting/Masters/Masters.css';

const UserList: React.FC = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [users, setUsers] = useState<any[]>([]);
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [usernameError, setUsernameError] = useState('');
    const [usernameChecking, setUsernameChecking] = useState(false);

    const userRole = localStorage.getItem('user_role') || '';
    let perms: any = {};
    try { perms = JSON.parse(localStorage.getItem('user_permissions') || '{}'); } catch {}
    const isSuperAdmin = userRole === 'superadmin';
    const canCreateUser = isSuperAdmin || userRole === 'admin' || perms.can_create_user;
    const canEditUser = isSuperAdmin || userRole === 'admin' || perms.can_edit_user;
    const canDeleteUser = isSuperAdmin || userRole === 'admin' || perms.can_delete_user;

    const fetchData = async () => {
        setLoading(true);
        try {
            const requestingUserId = parseInt(localStorage.getItem('user_id') || '0');
            // @ts-ignore
            const [usersData, groupsData] = await Promise.all([
                window.electron.getUsers({ requestingUserId }),
                window.electron.getUserGroups({ requestingUserId })
            ]);
            setUsers(usersData || []);
            setGroups(groupsData || []);
        } catch (error) {
            console.error('Failed to fetch data:', error);
            showToast('Failed to load users and groups.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this user? This action cannot be undone.')) return;
        try {
            // @ts-ignore
            await window.electron.deleteUser(id);
            showToast('User deleted successfully.', 'success');
            fetchData();
        } catch (error) {
            showToast('Failed to delete user.', 'error');
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
            showToast(`User ${user.is_active ? 'disabled' : 'enabled'} successfully.`, 'success');
            fetchData();
        } catch (error) {
            showToast('Failed to update user status.', 'error');
        }
    };

    // Username validation – check uniqueness against current users list
    const handleUsernameChange = (newUsername: string) => {
        setEditingUser((prev: any) => ({ ...prev, new_username: newUsername }));
        setUsernameError('');
        if (!newUsername.trim()) return;
        setUsernameChecking(true);
        // Check locally (no extra API call)
        setTimeout(() => {
            const conflict = users.find(
                u => u.id !== editingUser?.id &&
                     u.username?.toLowerCase() === newUsername.trim().toLowerCase()
            );
            if (conflict) {
                setUsernameError(`Username "${newUsername}" is already taken.`);
            }
            setUsernameChecking(false);
        }, 300);
    };

    const handleEditSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (usernameError) {
            showToast('Please fix the username error before saving.', 'error');
            return;
        }
        if (editingUser.new_username?.trim()) {
            // Final uniqueness check before submit
            const conflict = users.find(
                u => u.id !== editingUser.id &&
                     u.username?.toLowerCase() === editingUser.new_username.trim().toLowerCase()
            );
            if (conflict) {
                setUsernameError(`Username "${editingUser.new_username}" is already taken.`);
                showToast('Username already taken. Please choose a different one.', 'error');
                return;
            }
        }
        try {
            // @ts-ignore
            await window.electron.updateUser({
                id: editingUser.id,
                fullName: editingUser.full_name,
                role: editingUser.role,
                email: editingUser.email,
                phone: editingUser.phone,
                isActive: editingUser.is_active,
                groupId: editingUser.group_id,
                password: editingUser.new_password,
                ...(editingUser.new_username?.trim() ? { username: editingUser.new_username.trim() } : {})
            });
            showToast('User updated successfully.', 'success');
            setEditingUser(null);
            setUsernameError('');
            fetchData();
        } catch (error) {
            showToast('Failed to update user details.', 'error');
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
                    {canCreateUser && (
                        <button className="create-btn" onClick={() => navigate('/users/create')}>
                            <Plus size={18} /> Add User
                        </button>
                    )}
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
                                <th>Group</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="empty-state">Loading...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={6} className="empty-state">No users found.</td></tr>
                            ) : (
                                filtered.map((user) => {
                                    const rc = roleColor(user.role);
                                    const groupName = groups.find(g => g.id === user.group_id)?.name || '—';
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
                                            <td style={{ color: 'var(--text-secondary)' }}>{groupName}</td>
                                            <td>
                                                <button onClick={() => toggleActive(user)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '4px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: user.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: user.is_active ? '#22c55e' : '#ef4444' }}>
                                                    {user.is_active ? <><UserCheck size={14} /> Active</> : <><UserX size={14} /> Inactive</>}
                                                </button>
                                            </td>
                                            <td>
                                                <div className="action-buttons" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                    {canEditUser && (
                                                        <button onClick={() => { setEditingUser({ ...user, new_password: '', new_username: user.username }); setUsernameError(''); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '8px', border: 'none', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', cursor: 'pointer' }}>
                                                            <Edit2 size={16} />
                                                        </button>
                                                    )}
                                                    {canDeleteUser && (
                                                        <button className="delete-btn" onClick={() => handleDelete(user.id)}><Trash2 size={16} /></button>
                                                    )}
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
                        <motion.div className="modal-content" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ maxWidth: '520px' }}>
                            <div className="modal-header">
                                <h3>Edit User</h3>
                                <button className="close-btn" onClick={() => { setEditingUser(null); setUsernameError(''); }}><X size={20} /></button>
                            </div>
                            <form onSubmit={handleEditSave} className="create-form" style={{ padding: '1.5rem' }}>

                                {/* Username change section */}
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <AtSign size={14} /> Username
                                    </label>
                                    <input
                                        value={editingUser.new_username || ''}
                                        onChange={e => handleUsernameChange(e.target.value)}
                                        placeholder="Username"
                                        style={{ borderColor: usernameError ? '#ef4444' : undefined }}
                                    />
                                    {usernameChecking && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>Checking...</p>}
                                    {usernameError && <p style={{ fontSize: '0.8rem', color: '#ef4444', margin: '4px 0 0', fontWeight: 600 }}>⚠ {usernameError}</p>}
                                    {!usernameError && !usernameChecking && editingUser.new_username?.trim() && (
                                        <p style={{ fontSize: '0.8rem', color: '#22c55e', margin: '4px 0 0', fontWeight: 600 }}>✓ Username is available</p>
                                    )}
                                </div>

                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label>Full Name</label>
                                    <input value={editingUser.full_name || ''} onChange={e => setEditingUser({...editingUser, full_name: e.target.value})} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                    <div className="form-group">
                                        <label>Role</label>
                                        <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value})}>
                                            <option value="admin">Admin</option>
                                            <option value="manager">Manager</option>
                                            <option value="operator">Operator</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>User Group</label>
                                        <select value={editingUser.group_id || ''} onChange={e => setEditingUser({...editingUser, group_id: e.target.value})}>
                                            <option value="">None</option>
                                            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                    <div className="form-group">
                                        <label>Email</label>
                                        <input type="email" value={editingUser.email || ''} onChange={e => setEditingUser({...editingUser, email: e.target.value})} />
                                    </div>
                                    <div className="form-group">
                                        <label>Phone</label>
                                        <input value={editingUser.phone || ''} onChange={e => setEditingUser({...editingUser, phone: e.target.value})} />
                                    </div>
                                </div>
                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Lock size={14} /> Reset Password
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>(leave blank to keep current)</span>
                                    </label>
                                    <input type="password" value={editingUser.new_password || ''} onChange={e => setEditingUser({...editingUser, new_password: e.target.value})} placeholder="Enter new password" />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" onClick={() => { setEditingUser(null); setUsernameError(''); }} className="quot-btn-secondary">Cancel</button>
                                    <button type="submit" className="create-btn" disabled={!!usernameError || usernameChecking}>
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
