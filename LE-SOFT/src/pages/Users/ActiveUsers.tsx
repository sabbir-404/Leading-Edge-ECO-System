// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { ShieldAlert, Laptop, Smartphone, Search, RefreshCw, XCircle, UserX, UserCheck, Activity, Users, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

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

    const tabStyle = (active: boolean) => ({
        padding: '0.5rem 1.25rem',
        borderRadius: '8px',
        border: 'none',
        background: active ? 'var(--accent-color)' : 'var(--input-bg)',
        color: active ? 'white' : 'var(--text-secondary)',
        fontWeight: 600,
        cursor: 'pointer',
        fontSize: '0.9rem',
        transition: 'all 0.2s',
    });

    return (
        <DashboardLayout title="Active Users">
            <div className="master-list-container">
                <div className="list-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <ShieldAlert size={22} style={{ color: 'var(--accent-color)' }} />
                        <h2 style={{ margin: 0 }}>User Activity</h2>
                        {/* Live dot */}
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '2px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                            {sessions.length} Online
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <div className="search-bar">
                            <Search size={16} />
                            <input type="text" placeholder="Search users..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500 }}>
                            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <button style={tabStyle(tab === 'active')} onClick={() => setTab('active')}>
                        <Activity size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Live Sessions
                    </button>
                    <button style={tabStyle(tab === 'all')} onClick={() => setTab('all')}>
                        <Users size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> All Users
                    </button>
                </div>

                {/* ── LIVE SESSIONS TAB ── */}
                {tab === 'active' && (
                    <div className="table-container">
                        <table className="master-table">
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
                                        <td style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block', flexShrink: 0, animation: 'pulse 1.5s infinite' }} />
                                            {s.username}
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
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={() => handleKick(s.id, s.username)}
                                                    disabled={actionLoading === s.id || s.id === currentUserId}
                                                    title={s.id === currentUserId ? "Can't kick yourself" : "Force disconnect"}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '7px', border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: s.id === currentUserId ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.8rem', opacity: s.id === currentUserId ? 0.4 : 1 }}>
                                                    <XCircle size={14} /> Disconnect
                                                </button>
                                                <button
                                                    onClick={() => handleBlock(s)}
                                                    disabled={actionLoading === s.id || s.id === currentUserId}
                                                    title="Block this user from logging in"
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '7px', border: 'none', background: 'rgba(234,179,8,0.1)', color: '#ca8a04', cursor: s.id === currentUserId ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.8rem', opacity: s.id === currentUserId ? 0.4 : 1 }}>
                                                    <UserX size={14} /> Block
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
                    <div className="table-container">
                        <table className="master-table">
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
                                                <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 600, background: blocked ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: blocked ? '#ef4444' : '#22c55e' }}>
                                                    {blocked ? '⛔ Blocked' : '✓ Active'}
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
                                                <button
                                                    onClick={() => handleBlock(user)}
                                                    disabled={actionLoading === user.id || user.id === currentUserId}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '7px', border: 'none', background: blocked ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: blocked ? '#22c55e' : '#ef4444', cursor: user.id === currentUserId ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.8rem', opacity: user.id === currentUserId ? 0.4 : 1 }}>
                                                    {blocked ? <><UserCheck size={14} /> Unblock</> : <><UserX size={14} /> Block</>}
                                                </button>
                                                {online && user.id !== currentUserId && (
                                                    <button
                                                        onClick={() => handleKick(user.id, user.username)}
                                                        disabled={actionLoading === user.id}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '7px', border: 'none', background: 'rgba(234,179,8,0.1)', color: '#ca8a04', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                                                        <XCircle size={14} /> Kick
                                                    </button>
                                                )}
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
