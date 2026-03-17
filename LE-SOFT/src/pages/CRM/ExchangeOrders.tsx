import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Eye, ArrowLeftRight } from 'lucide-react';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

interface ExchangeOrder {
    id: number;
    exchange_number: string;
    customer_id: number;
    customer_name: string;
    customer_phone: string;
    total_return_value: number;
    total_new_value: number;
    difference_amount: number;
    created_at: string;
}

const ExchangeOrders: React.FC = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<ExchangeOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            const data = await window.electron?.getExchangeOrders?.();
            setOrders(data || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const viewExchange = (id: number) => {
        // Here you would navigate to detail or open a modal (Not fully detailed here for brevity)
        navigate(`/crm/exchanges/${id}`);
    };

    const filtered = orders.filter(o =>
        (o.exchange_number || '').toLowerCase().includes(search.toLowerCase()) ||
        (o.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (o.customer_phone || '').includes(search)
    );

    return (
        <DashboardLayout title="Exchange Orders">
            <div className="masters-container" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Exchange Orders</h1>
                        <p style={{ opacity: 0.6 }}>Manage product returns and exchanges</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search exchanges..."
                                style={{
                                    padding: '0.6rem 0.6rem 0.6rem 2.2rem',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    background: '#fff',
                                    minWidth: '280px',
                                    fontSize: '0.9rem'
                                }}
                            />
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={() => navigate('/crm/exchanges/create')}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                        >
                            <Plus size={18} /> New Exchange
                        </motion.button>
                    </div>
                </div>

                <div style={{ flex: 1, background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {loading ? (
                        <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>Loading...</div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>
                            <ArrowLeftRight size={32} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
                            {search ? 'No exchanges matched your search.' : 'No exchange orders found.'}
                        </div>
                    ) : (
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 2 }}>
                                    <tr>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Date</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Exchange No.</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Customer Name</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>Return Val</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>New Val</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>Difference</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, width: '100px' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((order, idx) => (
                                        <tr key={order.id} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fafbfc' : '#fff' }}>
                                            <td style={{ padding: '0.75rem 1rem', color: '#666' }}>{new Date(order.created_at).toLocaleDateString()}</td>
                                            <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--accent-color)' }}>{order.exchange_number}</td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <div style={{ fontWeight: 600 }}>{order.customer_name}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#888' }}>{order.customer_phone}</div>
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#ef4444' }}>৳{order.total_return_value.toLocaleString()}</td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#10b981' }}>৳{order.total_new_value.toLocaleString()}</td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>
                                                {order.difference_amount > 0 ? `Cust Owes: ৳${order.difference_amount}` : order.difference_amount < 0 ? `Refund: ৳${Math.abs(order.difference_amount)}` : 'Even'}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                <button onClick={() => viewExchange(order.id)} style={{ padding: '4px 10px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                                    <Eye size={14} /> View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
};

export default ExchangeOrders;
