import React from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart2, TrendingUp, DollarSign, Package, BookOpen, FileText } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

const reportCards = [
    { label: 'Trial Balance', desc: 'All ledger balances with Dr/Cr totals', path: '/reports/trial-balance', icon: BarChart2, color: '#6366f1' },
    { label: 'Balance Sheet', desc: 'Assets vs Liabilities', path: '/reports/balance-sheet', icon: DollarSign, color: '#22c55e' },
    { label: 'Profit & Loss', desc: 'Income vs Expenses summary', path: '/reports/profit-and-loss', icon: TrendingUp, color: '#f97316' },
    { label: 'Stock Summary', desc: 'Product stock levels & valuation', path: '/reports/stock-summary', icon: Package, color: '#ec4899' },
    { label: 'Day Book', desc: 'All voucher entries by date', path: '/reports/day-book', icon: BookOpen, color: '#8b5cf6' },
];

const Reports: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const isRoot = location.pathname === '/reports';

    return (
        <DashboardLayout title="Reports">
            <div className="masters-container">
                {isRoot ? (
                    <>
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                <FileText size={28} style={{ color: 'var(--accent-color)' }} />
                                <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Reports</h1>
                            </div>
                            <p style={{ opacity: 0.5, marginBottom: '1.5rem', fontSize: '0.9rem' }}>Financial statements, ledger summaries, and inventory reports</p>
                        </motion.div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                            {reportCards.map((card, i) => (
                                <motion.div key={card.path}
                                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                                    whileHover={{ scale: 1.03, y: -4 }} whileTap={{ scale: 0.98 }}
                                    onClick={() => navigate(card.path)}
                                    style={{
                                        padding: '1.5rem', borderRadius: '14px', cursor: 'pointer',
                                        background: 'var(--card-bg)', border: '1px solid var(--border-color)',
                                        transition: 'box-shadow 0.2s ease',
                                        display: 'flex', alignItems: 'flex-start', gap: '1rem'
                                    }}
                                >
                                    <div style={{
                                        width: '48px', height: '48px', borderRadius: '12px',
                                        background: `${card.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                    }}>
                                        <card.icon size={24} style={{ color: card.color }} />
                                    </div>
                                    <div>
                                        <h3 style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.3rem' }}>{card.label}</h3>
                                        <p style={{ fontSize: '0.82rem', opacity: 0.5, lineHeight: 1.4 }}>{card.desc}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </>
                ) : (
                    <Outlet />
                )}
            </div>
        </DashboardLayout>
    );
};

export default Reports;
