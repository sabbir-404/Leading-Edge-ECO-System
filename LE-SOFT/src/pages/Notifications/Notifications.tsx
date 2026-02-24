import React, { useState, useEffect } from 'react';
import { Bell, Send, Trash2, CheckCheck, Users, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

interface Notification {
    id: number;
    title: string;
    message: string;
    sender_id: number;
    sender_name: string;
    recipient_id: number | null;
    is_read: number;
    created_at: string;
}

interface UserItem {
    id: number;
    full_name: string;
    username: string;
    role: string;
}

const Notifications: React.FC = () => {
    const userId = parseInt(localStorage.getItem('user_id') || '0');
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [users, setUsers] = useState<UserItem[]>([]);
    const [tab, setTab] = useState<'inbox' | 'compose'>('inbox');
    const [search, setSearch] = useState('');

    // Compose state
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
    const [sendToAll, setSendToAll] = useState(false);
    const [sending, setSending] = useState(false);
    const [sendSuccess, setSendSuccess] = useState('');

    const fetchNotifications = async () => {
        try {
            // @ts-ignore
            const data = await window.electron.getNotifications(userId);
            setNotifications(data || []);
        } catch { }
    };

    const fetchUsers = async () => {
        try {
            // @ts-ignore
            const data = await window.electron.getUsers();
            setUsers((data || []).filter((u: UserItem) => u.id !== userId));
        } catch { }
    };

    useEffect(() => { fetchNotifications(); fetchUsers(); }, []);

    const unreadCount = notifications.filter(n => !n.is_read).length;

    const handleMarkRead = async (id: number) => {
        // @ts-ignore
        await window.electron.markNotificationRead(id);
        fetchNotifications();
    };

    const handleMarkAllRead = async () => {
        // @ts-ignore
        await window.electron.markAllNotificationsRead(userId);
        fetchNotifications();
    };

    const handleDelete = async (id: number) => {
        // @ts-ignore
        await window.electron.deleteNotification(id);
        fetchNotifications();
    };

    const handleSend = async () => {
        if (!title.trim()) return;
        setSending(true);
        try {
            // @ts-ignore
            await window.electron.sendNotification({
                title,
                message,
                senderId: userId,
                recipientIds: sendToAll ? [] : selectedUsers
            });
            setSendSuccess(`Notification sent to ${sendToAll ? 'all users' : selectedUsers.length + ' user(s)'}!`);
            setTitle('');
            setMessage('');
            setSelectedUsers([]);
            setSendToAll(false);
            setTimeout(() => setSendSuccess(''), 3000);
        } catch { }
        setSending(false);
    };

    const toggleUser = (id: number) => {
        setSelectedUsers(prev =>
            prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
        );
    };

    const filteredNotifs = notifications.filter(n =>
        n.title?.toLowerCase().includes(search.toLowerCase()) ||
        n.message?.toLowerCase().includes(search.toLowerCase())
    );

    const timeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    };

    return (
        <DashboardLayout title="Notifications">
            <div className="masters-container">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Bell size={24} style={{ color: 'var(--accent-color)' }} />
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Notifications</h1>
                        {unreadCount > 0 && (
                            <span style={{ background: '#ef4444', color: 'white', padding: '2px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700 }}>{unreadCount} unread</span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => setTab('inbox')} style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: tab === 'inbox' ? '2px solid var(--accent-color)' : '1px solid var(--border-color)', background: tab === 'inbox' ? 'rgba(99,102,241,0.1)' : 'var(--card-bg)', color: tab === 'inbox' ? 'var(--accent-color)' : 'inherit', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                            <Bell size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Inbox
                        </button>
                        <button onClick={() => setTab('compose')} style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: tab === 'compose' ? '2px solid var(--accent-color)' : '1px solid var(--border-color)', background: tab === 'compose' ? 'rgba(99,102,241,0.1)' : 'var(--card-bg)', color: tab === 'compose' ? 'var(--accent-color)' : 'inherit', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                            <Send size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Compose
                        </button>
                    </div>
                </motion.div>

                {/* INBOX TAB */}
                {tab === 'inbox' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem 1rem', gap: '0.5rem' }}>
                                <Search size={18} style={{ opacity: 0.5 }} />
                                <input placeholder="Search notifications..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'inherit', fontSize: '0.9rem' }} />
                            </div>
                            {unreadCount > 0 && (
                                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleMarkAllRead} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                    <CheckCheck size={16} /> Mark All Read
                                </motion.button>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <AnimatePresence>
                                {filteredNotifs.map((n, i) => (
                                    <motion.div key={n.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ delay: i * 0.03 }}
                                        style={{
                                            padding: '1rem 1.25rem', borderRadius: '10px', cursor: 'pointer',
                                            border: n.is_read ? '1px solid var(--border-color)' : '2px solid var(--accent-color)',
                                            background: n.is_read ? 'var(--card-bg)' : 'rgba(99,102,241,0.05)',
                                            display: 'flex', alignItems: 'flex-start', gap: '1rem',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onClick={() => !n.is_read && handleMarkRead(n.id)}
                                    >
                                        <div style={{
                                            width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                            background: n.is_read ? 'var(--hover-bg)' : 'rgba(99,102,241,0.15)',
                                            color: n.is_read ? 'var(--text-secondary)' : 'var(--accent-color)'
                                        }}>
                                            <Bell size={18} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                                <strong style={{ fontSize: '0.95rem', color: n.is_read ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{n.title}</strong>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</span>
                                            </div>
                                            {n.message && <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{n.message}</p>}
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem', opacity: 0.7 }}>
                                                From: {n.sender_name || 'System'} {n.recipient_id === null && '• Broadcast'}
                                            </div>
                                        </div>
                                        <button onClick={e => { e.stopPropagation(); handleDelete(n.id); }} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer', flexShrink: 0 }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {filteredNotifs.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>
                                    <Bell size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                                    <p style={{ fontSize: '1rem' }}>No notifications yet</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* COMPOSE TAB */}
                {tab === 'compose' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        {sendSuccess && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontWeight: 600, border: '1px solid rgba(34,197,94,0.3)' }}>
                                ✓ {sendSuccess}
                            </motion.div>
                        )}

                        <div style={{ display: 'grid', gap: '1.25rem', maxWidth: '700px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.9rem' }}>Title *</label>
                                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Notification title..." style={{ width: '100%', padding: '0.7rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'inherit', fontSize: '0.9rem' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.9rem' }}>Message</label>
                                <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Write your notification message..." rows={3} style={{ width: '100%', padding: '0.7rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'inherit', fontSize: '0.9rem', resize: 'vertical' }} />
                            </div>

                            {/* Recipients */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                    <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                        <Users size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                                        Recipients
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                        <input type="checkbox" checked={sendToAll} onChange={e => { setSendToAll(e.target.checked); if (e.target.checked) setSelectedUsers([]); }} style={{ accentColor: 'var(--accent-color)' }} />
                                        <strong>Broadcast to all users</strong>
                                    </label>
                                </div>

                                {!sendToAll && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                                        {users.map(u => {
                                            const selected = selectedUsers.includes(u.id);
                                            return (
                                                <motion.div key={u.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                                    onClick={() => toggleUser(u.id)}
                                                    style={{
                                                        padding: '0.75rem', borderRadius: '8px', cursor: 'pointer',
                                                        border: selected ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                                                        background: selected ? 'rgba(99,102,241,0.08)' : 'var(--card-bg)',
                                                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <div style={{
                                                        width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        background: selected ? 'var(--accent-color)' : 'var(--hover-bg)',
                                                        color: selected ? 'white' : 'var(--text-secondary)',
                                                        fontWeight: 700, fontSize: '0.8rem'
                                                    }}>
                                                        {(u.full_name || u.username).charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{u.full_name || u.username}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{u.role}</div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                        {users.length === 0 && <p style={{ opacity: 0.5, gridColumn: '1 / -1', textAlign: 'center', padding: '1rem' }}>No other users found</p>}
                                    </div>
                                )}
                            </div>

                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                onClick={handleSend}
                                disabled={sending || !title.trim() || (!sendToAll && selectedUsers.length === 0)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    padding: '0.75rem 2rem', borderRadius: '10px', border: 'none',
                                    background: (!title.trim() || (!sendToAll && selectedUsers.length === 0)) ? 'var(--hover-bg)' : 'var(--accent-color)',
                                    color: (!title.trim() || (!sendToAll && selectedUsers.length === 0)) ? 'var(--text-secondary)' : 'white',
                                    fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                                    opacity: sending ? 0.7 : 1,
                                    maxWidth: '250px'
                                }}
                            >
                                <Send size={18} /> {sending ? 'Sending...' : 'Send Notification'}
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </div>
        </DashboardLayout>
    );
};

export default Notifications;
