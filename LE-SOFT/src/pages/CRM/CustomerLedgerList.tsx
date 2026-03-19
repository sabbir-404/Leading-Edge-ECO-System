import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, UserSearch } from 'lucide-react';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

const safeDecrypt = (val: any): string => {
    if (!val || typeof val !== 'string') return String(val || '');
    if (val.startsWith('e1:') || val.startsWith('e2:')) return '🔒 [encrypted]';
    return val;
};

interface Customer {
    id: number;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    total_bills?: number;
    balance?: number; // Calculated on backend or default 0
}

const CustomerLedgerList: React.FC = () => {
    const navigate = useNavigate();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            const data = await window.electron?.getCustomerLedgerList?.();
            setCustomers(data || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const viewLedger = (id: number) => {
        navigate(`/crm/ledger/${id}`);
    };

    const filtered = customers.filter(c =>
        (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.phone || '').includes(search)
    );

    return (
        <DashboardLayout title="Customer Ledger">
            <div className="masters-container" style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Customer Ledger</h1>
                        <p style={{ opacity: 0.6 }}>View customer financial history and balances</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search by name or phone..."
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
                    </div>
                </div>

                {/* Customers Table */}
                <div style={{ flex: 1, background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {loading ? (
                        <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>Loading...</div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>
                            <UserSearch size={32} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
                            {search ? 'No customers matched your search.' : 'No customers found.'}
                        </div>
                    ) : (
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 2 }}>
                                    <tr>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Customer Name</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Contact</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Email</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700 }}>Total Bills</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>Current Balance</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, width: '100px' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((customer, idx) => (
                                        <motion.tr
                                            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}
                                            key={customer.id}
                                            style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fafbfc' : '#fff', cursor: 'pointer' }}
                                            onClick={() => viewLedger(customer.id)}
                                            whileHover={{ backgroundColor: '#f8fafc' }}
                                        >
                                            <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{safeDecrypt(customer.name)}</td>
                                            <td style={{ padding: '0.75rem 1rem' }}>{safeDecrypt(customer.phone) || 'N/A'}</td>
                                            <td style={{ padding: '0.75rem 1rem', color: '#666' }}>{safeDecrypt(customer.email) || 'N/A'}</td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                <span style={{ padding: '2px 8px', background: '#e0f2fe', color: '#0369a1', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
                                                    {customer.total_bills || 0}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, fontSize: '1rem', color: (customer.balance || 0) < 0 ? '#ef4444' : 'inherit' }}>
                                                ৳{((customer.balance || 0)).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                <button
                                                    onClick={e => { e.stopPropagation(); viewLedger(customer.id); }}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                                                >
                                                    <Eye size={14} /> View
                                                </button>
                                            </td>
                                        </motion.tr>
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

export default CustomerLedgerList;
