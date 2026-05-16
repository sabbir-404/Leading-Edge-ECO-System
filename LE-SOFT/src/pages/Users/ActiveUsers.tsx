// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { ShieldAlert, Laptop, Smartphone, Search, RefreshCw, XCircle, UserX, UserCheck, Activity, Users, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';
import './Users.css';

const ActiveUsers: React.FC = () => {
    const [sessions, setSessions] = useState<any[]>([]);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [tab, setTab] = useState<'active' | 'all'>('active');
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    const currentUserId = parseInt(localStorage.getItem('user_id') || '0');

    const fetchData = async () => {
        try {
            setLoading(true);
            const [sessResult, usersResult] = await Promise.all([
                window.electron.getActiveSessions(),
                window.electron.getUsers({ requestingUserId: currentUserId }),
            ]);
            if (sessResult?.success) setSessions(sessResult.data || []);
            if (Array.isArray(usersResult)) setAllUsers(usersResult);
        } catch (error) {
            console.error('Failed to fetch data', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => fetchData(), 15000);
        return () => clearInterval(interval);
    }, []);

    const handleKick = async (userId: number, username: string) => {
        if (!window.confirm(`Forcibly disconnect ${username}? They will be logged out immediately.`)) return;
        setActionLoading(userId);
        try {
            const res = await window.electron.kickUserSession(userId);
            if (res?.success) fetchData();
            else alert('Failed to kick: ' + res?.error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleBlock = async (user: any) => {
        const action = user.is_active ? 'BLOCK' : 'UNBLOCK';
        if (!window.confirm(`${action} ${user.username}? ${user.is_active ? 'They will no longer be able to log in.' : 'They will be able to log in again.'}`)) return;
        setActionLoading(user.id);
        try {
            const res = await window.electron.updateUser({
                id: user.id,
                fullName: user.full_name,
                role: user.role,
                email: user.email || '',
                phone: user.phone || '',
                isActive: user.is_active ? 0 : 1,
            });
            if (res?.success !== false) {
                // If active session AND blocking, also kick them
                if (user.is_active) {
                    const isOnline = sessions.some(s => s.id === user.id);
                    if (isOnline) await window.electron.kickUserSession(user.id);
                }
                fetchData();
            } else {
                alert('Failed to update user: ' + (res?.error || 'Unknown error'));
            }
        } finally {
            setActionLoading(null);
        }
    };

    const filteredSessions = sessions.filter(s =>
        (s.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.full_name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredUsers = allUsers.filter(u =>
        (u.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.full_name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const isOnline = (userId: number) => sessions.some(s => s.id === userId);

    return (
        <DashboardLayout title="Active Users">
            <div className="users-page">
                <div className="users-toolbar">
                    <div className="activity-heading">
                        <ShieldAlert size={22} style={{ color: 'var(--accent-color)' }} />
                        <div className="users-title">
                            <h2>User Activity</h2>
                            <p>Monitor live sessions and block or disconnect users when needed.</p>
                        </div>
                        <span className="online-pill">
                            <span />
                            {sessions.length} Online
                        </span>
                    </div>
                    <div className="users-actions">
                        <div className="users-search">
                            <Search size={16} />
                            <input type="text" placeholder="Search users..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <button className="icon-btn" onClick={fetchData} title="Refresh" aria-label="Refresh">
                            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="activity-tabs">
                    <button className={`activity-tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
                        <Activity size={14} /> Live Sessions
                    </button>
                    <button className={`activity-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
                        <Users size={14} /> All Users
                    </button>
                </div>

                {/* ── LIVE SESSIONS TAB ── */}
                {tab === 'active' && (
                    <div className="users-panel users-table-wrap">
                        <table className="users-table">
                            <thead>
                                <tr>
                                    <th>Username</th>
                                    <th>Full Name</th>
                                    <th>Device</th>
                                    <th>Last Active</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && filteredSessions.length === 0 ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading...</td></tr>
                                ) : filteredSessions.length === 0 ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No active sessions right now.</td></tr>
                                ) : filteredSessions.map((s, idx) => (
                                    <motion.tr key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
                                        <td style={{ fontWeight: 600 }}>
                                            <div className="user-presence">
                                                <span />
                                                {s.username}
                                            </div>
                                        </td>
                                        <td>{s.full_name || '—'}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                                                {s.device_type === 'Phone' ? <Smartphone size={16} /> : <Laptop size={16} />}
                                                {s.device_type || 'PC'}
                                            </div>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={13} /> {s.last_active_at ? new Date(s.last_active_at).toLocaleString() : 'N/A'}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div className="user-row-actions">
                                                <button
                                                    onClick={() => handleKick(s.id, s.username)}
                                                    disabled={actionLoading === s.id || s.id === currentUserId}
                                                    title={s.id === currentUserId ? "Can't disconnect yourself" : "Disconnect user"}
                                                    aria-label={s.id === currentUserId ? "Can't disconnect yourself" : "Disconnect user"}
                                                    className="icon-btn danger"
                                                    style={{ opacity: s.id === currentUserId ? 0.45 : 1 }}>
                                                    <XCircle size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleBlock(s)}
                                                    disabled={actionLoading === s.id || s.id === currentUserId}
                                                    title="Block this user from logging in"
                                                    aria-label="Block this user from logging in"
                                                    className="icon-btn warning"
                                                    style={{ opacity: s.id === currentUserId ? 0.45 : 1 }}>
                                                    <UserX size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── ALL USERS TAB ── */}
                {tab === 'all' && (
                    <div className="users-panel users-table-wrap">
                        <table className="users-table">
                            <thead>
                                <tr>
                                    <th>Username</th>
                                    <th>Full Name</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Online</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && filteredUsers.length === 0 ? (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading...</td></tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No users found.</td></tr>
                                ) : filteredUsers.map((user, idx) => {
                                    const online = isOnline(user.id);
                                    const blocked = !user.is_active;
                                    return (
                                        <motion.tr key={user.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
                                            <td style={{ fontWeight: 600 }}>{user.username}</td>
                                            <td>{user.full_name || '—'}</td>
                                            <td><span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 600, background: 'rgba(99,102,241,0.1)', color: '#6366f1', textTransform: 'capitalize' }}>{user.role}</span></td>
                                            <td>
                                                <span className={`status-pill ${blocked ? 'blocked' : 'enabled'}`}>
                                                    {blocked ? <><UserX size={13} /> Blocked</> : <><UserCheck size={13} /> Active</>}
                                                </span>
                                            </td>
                                            <td>
                                                {online ? (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#10b981', fontSize: '0.8rem', fontWeight: 600 }}>
                                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', animation: 'pulse 1.5s infinite' }} /> Online
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Offline</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="user-row-actions">
                                                    <button
                                                        onClick={() => handleBlock(user)}
                                                        disabled={actionLoading === user.id || user.id === currentUserId}
                                                        className={`icon-btn ${blocked ? 'success' : 'danger'}`}
                                                        title={blocked ? 'Unblock user' : 'Block user'}
                                                        aria-label={blocked ? 'Unblock user' : 'Block user'}
                                                        style={{ opacity: user.id === currentUserId ? 0.45 : 1 }}>
                                                        {blocked ? <UserCheck size={16} /> : <UserX size={16} />}
                                                    </button>
                                                    {online && user.id !== currentUserId && (
                                                        <button
                                                            onClick={() => handleKick(user.id, user.username)}
                                                            disabled={actionLoading === user.id}
                                                            className="icon-btn warning"
                                                            title="Disconnect user"
                                                            aria-label="Disconnect user">
                                                            <XCircle size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            <style>{`
                @keyframes spin { 100% { transform: rotate(360deg); } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
            `}</style>
        </DashboardLayout>
    );
};

export default ActiveUsers;
