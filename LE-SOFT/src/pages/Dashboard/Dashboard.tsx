import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    TrendingUp,
    DollarSign,
    Database,
    Package,
    Search,
    X,
    MessageSquare,
    Send,
    Paperclip,
    ArrowLeft,
    MessageCircle,
    Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    const navigate = useNavigate();

    // Stats
    const [stats, setStats] = useState<any>({
        ledgerCount: 0, groupCount: 0, voucherCount: 0,
        totalTransactions: 0, stockItemCount: 0, recentVouchers: []
    });
    const [loading, setLoading] = useState(true);

    // Product Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);

    // Notifications
    const [notifications, setNotifications] = useState<any[]>([]);

    // Chat
    const [chatUsers, setChatUsers] = useState<any[]>([]);
    const [selectedChatUser, setSelectedChatUser] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
    const [typingUserIds, setTypingUserIds] = useState<number[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<any>(null);

    // ─── Initial Data ───
    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        setCurrentUser(user);

        const fetchData = async () => {
            try {
                // @ts-ignore
                const result = await window.electron.getDashboardStats();
                setStats(result || {});
                // @ts-ignore
                const users = await window.electron.getUsers();
                setChatUsers(users.filter((u: any) => u.id !== user?.id));
            } catch (e) { console.error(e); }
            setLoading(false);
        };
        fetchData();

        // Fetch notifications
        const userId = parseInt(localStorage.getItem('user_id') || '0');
        const fetchNotifs = async () => {
            try {
                // @ts-ignore
                const data = await window.electron.getNotifications(userId);
                setNotifications(data || []);
            } catch {}
        };
        fetchNotifs();
    }, []);

    // ─── Presence Heartbeat (every 10s) ───
    useEffect(() => {
        if (!currentUser) return;
        const sendHeartbeat = () => {
            // @ts-ignore
            window.electron.updateUserPresence(currentUser.id);
        };
        sendHeartbeat();
        const interval = setInterval(sendHeartbeat, 10000);
        return () => clearInterval(interval);
    }, [currentUser]);

    // ─── Online Users (poll every 5s) ───
    useEffect(() => {
        const fetchOnline = async () => {
            try {
                // @ts-ignore
                const ids = await window.electron.getOnlineUsers();
                setOnlineUserIds(ids || []);
            } catch (e) { /* ignore */ }
        };
        fetchOnline();
        const interval = setInterval(fetchOnline, 5000);
        return () => clearInterval(interval);
    }, []);

    // ─── Typing Status (poll every 2s) ───
    useEffect(() => {
        if (!currentUser) return;
        const fetchTyping = async () => {
            try {
                // @ts-ignore
                const ids = await window.electron.getTypingStatus({ receiverId: currentUser.id });
                setTypingUserIds(ids || []);
            } catch (e) { /* ignore */ }
        };
        fetchTyping();
        const interval = setInterval(fetchTyping, 2000);
        return () => clearInterval(interval);
    }, [currentUser]);

    // ─── Product Search ───
    useEffect(() => {
        if (!searchQuery.trim()) { setSearchResults([]); return; }
        const timeout = setTimeout(async () => {
            setSearching(true);
            try {
                // @ts-ignore
                const results = await window.electron.searchProductsDetailed(searchQuery);
                setSearchResults(results || []);
            } catch (e) { console.error(e); }
            setSearching(false);
        }, 300);
        return () => clearTimeout(timeout);
    }, [searchQuery]);

    // ─── Chat Messages ───
    useEffect(() => {
        if (!selectedChatUser || !currentUser) return;
        const fetchMessages = async () => {
            try {
                // @ts-ignore
                const msgs = await window.electron.getChatMessages({ senderId: currentUser.id, receiverId: selectedChatUser.id });
                setMessages(msgs || []);
            } catch (e) { console.error(e); }
        };
        fetchMessages();
        const interval = setInterval(fetchMessages, 3000);
        return () => clearInterval(interval);
    }, [selectedChatUser, currentUser]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ─── Send Message ───
    const handleSendMessage = useCallback(async () => {
        if (!newMessage.trim() || !selectedChatUser || !currentUser) return;
        try {
            // @ts-ignore
            await window.electron.sendChatMessage({
                senderId: currentUser.id, receiverId: selectedChatUser.id,
                messageType: 'text', content: newMessage
            });
            setNewMessage('');
            // Stop typing
            // @ts-ignore
            window.electron.setTypingStatus({ senderId: currentUser.id, receiverId: selectedChatUser.id, isTyping: false });
            // Immediate refresh
            // @ts-ignore
            const msgs = await window.electron.getChatMessages({ senderId: currentUser.id, receiverId: selectedChatUser.id });
            setMessages(msgs || []);
        } catch (e) { console.error(e); }
    }, [newMessage, selectedChatUser, currentUser]);

    // ─── Typing Handler ───
    const handleTyping = useCallback((value: string) => {
        setNewMessage(value);
        if (!selectedChatUser || !currentUser) return;
        // Send typing status
        // @ts-ignore
        window.electron.setTypingStatus({ senderId: currentUser.id, receiverId: selectedChatUser.id, isTyping: value.length > 0 });
        // Auto-clear typing after 2s of inactivity
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            // @ts-ignore
            window.electron.setTypingStatus({ senderId: currentUser.id, receiverId: selectedChatUser.id, isTyping: false });
        }, 2000);
    }, [selectedChatUser, currentUser]);

    // ─── File Picker ───
    const handlePickFile = useCallback(async () => {
        if (!selectedChatUser || !currentUser) return;
        try {
            // @ts-ignore
            const file = await window.electron.pickChatFile();
            if (file) {
                // @ts-ignore
                await window.electron.sendChatMessage({
                    senderId: currentUser.id, receiverId: selectedChatUser.id,
                    messageType: file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'file',
                    content: file.path, fileName: file.name
                });
                // @ts-ignore
                const msgs = await window.electron.getChatMessages({ senderId: currentUser.id, receiverId: selectedChatUser.id });
                setMessages(msgs || []);
            }
        } catch (e) { console.error(e); }
    }, [selectedChatUser, currentUser]);

    const isUserOnline = (userId: number) => onlineUserIds.includes(userId);
    const isUserTyping = (userId: number) => typingUserIds.includes(userId);

    return (
        <DashboardLayout title="Financial Overview">
            <div className="dashboard-page">
                {/* ═══ STATS ROW (3 columns) ═══ */}
                <div className="stats-row">
                    <motion.div className="widget-card stats-card" whileHover={{ y: -3 }} transition={{ duration: 0.2 }}>
                        <div className="card-icon amber"><DollarSign size={22} /></div>
                        <div className="card-info">
                            <h3>Total Transactions</h3>
                            <p className="value">৳ {loading ? '...' : stats.totalTransactions?.toLocaleString()}</p>
                            <span className="trend positive"><TrendingUp size={14} /> {stats.voucherCount} vouchers</span>
                        </div>
                    </motion.div>
                    <motion.div className="widget-card stats-card" whileHover={{ y: -3 }} transition={{ duration: 0.2 }}>
                        <div className="card-icon blue"><Database size={22} /></div>
                        <div className="card-info">
                            <h3>Ledger Accounts</h3>
                            <p className="value">{loading ? '...' : stats.ledgerCount}</p>
                            <span className="trend neutral">{stats.groupCount} groups</span>
                        </div>
                    </motion.div>
                    <motion.div className="widget-card stats-card" whileHover={{ y: -3 }} transition={{ duration: 0.2 }}>
                        <div className="card-icon green"><Package size={22} /></div>
                        <div className="card-info">
                            <h3>Stock Items</h3>
                            <p className="value">{loading ? '...' : stats.stockItemCount}</p>
                            <span className="trend neutral">Inventory items</span>
                        </div>
                    </motion.div>
                </div>

                {/* ═══ BODY: Left Content + Right Chat ═══ */}
                <div className="dashboard-body">
                    {/* ── LEFT COLUMN ── */}
                    <div className="dashboard-left">
                        {/* Product Search */}
                        <div className="widget-card product-search-box">
                            <div className="search-header-row">
                                <h3 style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem' }}>Product Quick Search</h3>
                                <div className="search-input-wrap">
                                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                                    <input
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        placeholder="Search by name, SKU or category..."
                                    />
                                </div>
                            </div>
                            {(searchQuery || searching) && (
                                <div className="search-results-overlay">
                                    {searching ? (
                                        <div style={{ padding: '1rem', textAlign: 'center', opacity: 0.5 }}>Searching...</div>
                                    ) : searchResults.length === 0 ? (
                                        <div style={{ padding: '1rem', textAlign: 'center', opacity: 0.5 }}>No products found.</div>
                                    ) : (
                                        <table>
                                            <thead><tr>
                                                <th>SKU</th><th>Product Name</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Price</th>
                                            </tr></thead>
                                            <tbody>
                                                {searchResults.map((p: any) => (
                                                    <tr key={p.id} onClick={() => setSelectedProduct(p)}>
                                                        <td style={{ fontFamily: 'monospace' }}>{p.sku}</td>
                                                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                                                        <td style={{ textAlign: 'right' }}>{p.quantity} {p.unit_symbol}</td>
                                                        <td style={{ textAlign: 'right', fontWeight: 600 }}>৳ {p.selling_price?.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Recent Transactions */}
                        <div className="widget-card">
                            <h3 style={{ margin: '0 0 0.75rem 0', fontWeight: 600, fontSize: '0.95rem' }}>Recent Transactions</h3>
                            {loading ? (
                                <p style={{ opacity: 0.5 }}>Loading...</p>
                            ) : !stats.recentVouchers?.length ? (
                                <p style={{ opacity: 0.5, textAlign: 'center', padding: '1.5rem 0' }}>No transactions yet.</p>
                            ) : (
                                <ul className="activity-list">
                                    {stats.recentVouchers.map((v: any) => (
                                        <li key={v.id}>
                                            <span className={`activity-icon ${v.voucher_type === 'Receipt' || v.voucher_type === 'Sales' ? 'payment' : 'expense'}`}></span>
                                            <div className="activity-details">
                                                <span className="activity-title">{v.voucher_type} #{v.voucher_number}</span>
                                                <span className="activity-time">{v.date} — {v.narration || 'No narration'}</span>
                                            </div>
                                            <span className={`activity-amount ${v.voucher_type === 'Receipt' || v.voucher_type === 'Sales' ? 'positive' : 'negative'}`}>
                                                ৳ {(v.total_amount || 0).toLocaleString()}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Quick Summary */}
                        <div className="widget-card">
                            <h3 style={{ margin: '0 0 0.75rem 0', fontWeight: 600, fontSize: '0.95rem' }}>Quick Summary</h3>
                            <div className="summary-list">
                                <div className="summary-row"><span className="label">Ledger Groups</span><span className="val">{stats.groupCount}</span></div>
                                <div className="summary-row"><span className="label">Ledger Accounts</span><span className="val">{stats.ledgerCount}</span></div>
                                <div className="summary-row"><span className="label">Total Vouchers</span><span className="val">{stats.voucherCount}</span></div>
                                <div className="summary-row"><span className="label">Stock Items</span><span className="val">{stats.stockItemCount}</span></div>
                            </div>
                        </div>

                        {/* Recent Notifications */}
                        <div className="widget-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <h3 style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Bell size={16} style={{ color: 'var(--accent-color)' }} /> Notifications
                                    {notifications.filter(n => !n.is_read).length > 0 && (
                                        <span style={{ background: '#ef4444', color: 'white', fontSize: '0.7rem', padding: '1px 7px', borderRadius: '10px', fontWeight: 700 }}>
                                            {notifications.filter(n => !n.is_read).length}
                                        </span>
                                    )}
                                </h3>
                                <span
                                    onClick={() => navigate('/notifications')}
                                    style={{ fontSize: '0.8rem', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 600 }}
                                >View All</span>
                            </div>
                            {notifications.length === 0 ? (
                                <p style={{ opacity: 0.5, textAlign: 'center', padding: '1rem 0' }}>No notifications yet.</p>
                            ) : (
                                <ul className="activity-list">
                                    {notifications.slice(0, 5).map((n: any) => (
                                        <li key={n.id} style={{ opacity: n.is_read ? 0.6 : 1 }}>
                                            <span className={`activity-icon ${n.is_read ? '' : 'payment'}`}></span>
                                            <div className="activity-details">
                                                <span className="activity-title">{n.title}</span>
                                                <span className="activity-time">{n.message || 'No details'} — {n.sender_name || 'System'}</span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* ── RIGHT COLUMN: Chat Panel ── */}
                    <div className="chat-panel">
                        <div className="chat-panel-header">
                            <h3>
                                <MessageCircle size={18} />
                                {selectedChatUser ? (
                                    <div>
                                        <span>{selectedChatUser.full_name}</span>
                                        <div className="header-subtitle">
                                            {isUserTyping(selectedChatUser.id) ? 'typing...' : isUserOnline(selectedChatUser.id) ? 'online' : 'offline'}
                                        </div>
                                    </div>
                                ) : (
                                    <span>Staff Chat</span>
                                )}
                            </h3>
                            {selectedChatUser && (
                                <button onClick={() => { setSelectedChatUser(null); setMessages([]); }} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }}>
                                    <ArrowLeft size={18} />
                                </button>
                            )}
                        </div>

                        <div className="chat-panel-body">
                            {!selectedChatUser ? (
                                /* ── User List ── */
                                <div className="chat-user-list">
                                    {chatUsers.length === 0 ? (
                                        <div className="chat-empty-state">
                                            <MessageSquare size={32} />
                                            <p>No other users found.</p>
                                        </div>
                                    ) : (
                                        chatUsers.map(u => (
                                            <div key={u.id} className="chat-user-item" onClick={() => setSelectedChatUser(u)}>
                                                <div className="chat-user-avatar">
                                                    {u.full_name?.charAt(0) || u.username?.charAt(0)}
                                                    <span className={isUserOnline(u.id) ? 'online-dot' : 'offline-dot'} />
                                                </div>
                                                <div className="chat-user-info">
                                                    <div className="chat-user-name">{u.full_name || u.username}</div>
                                                    <div className={`chat-user-status ${isUserTyping(u.id) ? 'typing' : isUserOnline(u.id) ? 'online' : ''}`}>
                                                        {isUserTyping(u.id) ? 'typing...' : isUserOnline(u.id) ? 'Online' : u.role}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            ) : (
                                /* ── Conversation View ── */
                                <div className="chat-messages-panel">
                                    <div className="chat-messages-area">
                                        {messages.length === 0 && (
                                            <div className="chat-empty-state">
                                                <MessageSquare size={28} />
                                                <p>Start a conversation with {selectedChatUser.full_name}</p>
                                            </div>
                                        )}
                                        {messages.map((m: any) => (
                                            <div key={m.id} className={`message-bubble ${m.sender_id === currentUser?.id ? 'message-sent' : 'message-received'}`}>
                                                {m.message_type === 'text' ? (
                                                    <span>{m.content}</span>
                                                ) : m.message_type === 'image' ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <img src={`file://${m.content}`} alt="img" style={{ maxWidth: '100%', borderRadius: '6px', cursor: 'pointer' }} onClick={() => window.open(`file://${m.content}`)} />
                                                        <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{m.file_name}</span>
                                                    </div>
                                                ) : (
                                                    <div className="message-file-thumb" onClick={() => window.open(`file://${m.content}`)}>
                                                        <Paperclip size={14} />
                                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.file_name}</span>
                                                    </div>
                                                )}
                                                <div className="message-time">
                                                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        ))}

                                        {/* Typing indicator */}
                                        {isUserTyping(selectedChatUser.id) && (
                                            <div className="typing-indicator">
                                                <span className="typing-dot" />
                                                <span className="typing-dot" />
                                                <span className="typing-dot" />
                                            </div>
                                        )}

                                        <div ref={messagesEndRef} />
                                    </div>

                                    {/* Input Area */}
                                    <div className="chat-input-area">
                                        <button className="chat-attachment-btn" onClick={handlePickFile}>
                                            <Paperclip size={18} />
                                        </button>
                                        <input
                                            className="chat-input"
                                            placeholder="Type a message..."
                                            value={newMessage}
                                            onChange={e => handleTyping(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                        />
                                        <button className="chat-send-btn" onClick={handleSendMessage}>
                                            <Send size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ PRODUCT DETAILS MODAL ═══ */}
            <AnimatePresence>
                {selectedProduct && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                        onClick={() => setSelectedProduct(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: 'var(--card-bg)', borderRadius: '16px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: '1.75rem', color: 'var(--text-primary)' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '10px', borderRadius: '10px' }}><Package size={22} /></div>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{selectedProduct.name}</h2>
                                        <span style={{ fontFamily: 'monospace', opacity: 0.5, fontSize: '0.8rem' }}>SKU: {selectedProduct.sku}</span>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedProduct(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                <div style={{ padding: '0.75rem', background: 'var(--hover-bg)', borderRadius: '10px' }}>
                                    <span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.6, marginBottom: '0.2rem' }}>Available Stock</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{selectedProduct.quantity} {selectedProduct.unit_symbol}</span>
                                </div>
                                <div style={{ padding: '0.75rem', background: 'var(--hover-bg)', borderRadius: '10px' }}>
                                    <span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.6, marginBottom: '0.2rem' }}>Selling Price</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-color)' }}>৳ {selectedProduct.selling_price?.toLocaleString()}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.88rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ opacity: 0.6 }}>Purchase Price</span><span style={{ fontWeight: 600 }}>৳ {selectedProduct.purchase_price?.toLocaleString()}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ opacity: 0.6 }}>Stock Group</span><span style={{ fontWeight: 600 }}>{selectedProduct.group_name || 'N/A'}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ opacity: 0.6 }}>Category</span><span style={{ fontWeight: 600 }}>{selectedProduct.category || 'N/A'}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ opacity: 0.6 }}>Tax Rate</span><span style={{ fontWeight: 600 }}>{selectedProduct.tax_rate}%</span></div>
                            </div>
                            <button
                                onClick={() => { setSelectedProduct(null); navigate('/masters/products'); }}
                                style={{ width: '100%', marginTop: '1.5rem', padding: '0.7rem', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                            >
                                View in Inventory
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </DashboardLayout>
    );
};

export default Dashboard;
