// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Package, ShoppingCart, DollarSign, Clock, Globe, RefreshCw, TrendingUp, Activity, AlertCircle } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

// Reuse StatCard with slightly better styling
const StatCard = ({ icon: Icon, label, value, subtext, color, index }: any) => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}
        style={{
            background: 'var(--card-bg)', borderRadius: '16px', padding: '1.5rem',
            border: '1px solid var(--border-color)', position: 'relative', overflow: 'hidden'
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
                <p style={{ fontSize: '0.85rem', opacity: 0.7, fontWeight: 600, marginBottom: '0.25rem' }}>{label}</p>
                <h3 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{value}</h3>
            </div>
            <div style={{
                width: '48px', height: '48px', borderRadius: '12px',
                background: `${color}15`, color: color,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                <Icon size={24} />
            </div>
        </div>
        {subtext && <p style={{ fontSize: '0.8rem', opacity: 0.8, color: color, fontWeight: 500 }}>{subtext}</p>}
    </motion.div>
);

const SimpleBarChart = ({ data }: { data: { name: string; sales: number }[] }) => {
    const maxValue = Math.max(...data.map(d => d.sales)) || 1;
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '200px', padding: '1rem 0' }}>
            {data.map((item, idx) => (
                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '100%',
                        height: `${(item.sales / maxValue) * 100}%`,
                        background: 'var(--accent-color)',
                        opacity: 0.8,
                        borderRadius: '4px 4px 0 0',
                        position: 'relative',
                        transition: 'height 0.5s ease'
                    }} title={`${item.name}: ${item.sales}`}>
                    </div>
                    <span style={{ fontSize: '10px', opacity: 0.7, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                        {item.name.substring(0, 10)}
                    </span>
                </div>
            ))}
        </div>
    );
};

const WebsiteDashboard: React.FC = () => {
    const [data, setData] = useState<any>({ stats: {}, trending: [], logs: [] });
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            const res = await window.electron.websiteGetDashboardData();
            setData(res);
            setConnected(true);
        } catch {
            setConnected(false);
        }
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, []);

    const { stats, trending, logs } = data;

    return (
        <DashboardLayout title="Website Admin">
            <div className="masters-container" style={{ paddingBottom: '3rem' }}>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ background: 'var(--accent-color)', padding: '10px', borderRadius: '12px', color: 'white' }}>
                            <Globe size={24} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Website Overview</h1>
                            <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Real-time connection to website database</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{
                            padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600,
                            background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            border: `1px solid ${connected ? '#22c55e' : '#ef4444'}`,
                            color: connected ? '#22c55e' : '#ef4444',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}>
                            {connected ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} /> : <AlertCircle size={14} />}
                            {connected ? 'Connected' : 'Disconnected'}
                        </span>
                        <button onClick={fetchData} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 'auto' }}>
                            <RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh
                        </button>
                    </div>
                </motion.div>

                {loading && !data.stats.totalOrders ? (
                    <div style={{ textAlign: 'center', padding: '5rem' }}>Loading data...</div>
                ) : (
                    <>
                        {/* Stats Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                            <StatCard icon={ShoppingCart} label="Orders (Month)" value={stats.totalOrdersMonth || 0} subtext="Total orders this month" color="#6366f1" index={0} />
                            <StatCard icon={DollarSign} label="Revenue (Month)" value={`৳${(stats.revenueMonth || 0).toLocaleString()}`} subtext="Total revenue this month" color="#22c55e" index={1} />
                            <StatCard icon={Package} label="Pending Orders" value={stats.pendingOrders || 0} subtext="Requires attention" color="#f97316" index={2} />
                            <StatCard icon={Activity} label="Site Visits" value={(stats.totalVisitsMonth || 0).toLocaleString()} subtext="Monthly traffic" color="#eab308" index={3} />
                        </div>

                        {/* Charts & Feed */}
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr', gap: '1.5rem' }}>
                            {/* Trending Products */}
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                                style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                    <TrendingUp size={20} color="var(--accent-color)" />
                                    <h3 style={{ fontWeight: 700 }}>Trending Products (30 Days)</h3>
                                </div>
                                {trending.length > 0 ? (
                                    <SimpleBarChart data={trending} />
                                ) : (
                                    <p style={{ textAlign: 'center', opacity: 0.5, padding: '2rem' }}>No trending data available</p>
                                )}
                            </motion.div>

                            {/* Activity Feed */}
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                                style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', maxHeight: '400px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                    <Activity size={20} color="var(--accent-color)" />
                                    <h3 style={{ fontWeight: 700 }}>Live Activity Feed</h3>
                                </div>
                                <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
                                    {logs.map((log: any, i: number) => (
                                        <div key={i} style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-color)', marginTop: '6px', flexShrink: 0 }}></div>
                                            <div>
                                                <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>{log.action_type.replace(/_/g, ' ')}</p>
                                                <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>{log.admin_email} • {new Date(log.timestamp).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {logs.length === 0 && <p style={{ opacity: 0.5 }}>No recent activity</p>}
                                </div>
                            </motion.div>
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
};

export default WebsiteDashboard;

