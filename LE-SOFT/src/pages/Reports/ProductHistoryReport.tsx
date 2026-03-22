import React, { useState, useEffect } from 'react';
import { Download, Search, History } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

const ProductHistoryReport: React.FC = () => {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchHistory = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            const res = await window.electron.getProductPriceHistory();
            if (res) setHistory(res);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    useAutoRefresh(['product_price_history', 'products'], fetchHistory);

    const filtered = history.filter(h => 
        (h.products?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (h.changed_by || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (h.products?.sku || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={{ background: 'var(--bg-color)', minHeight: '100%', padding: '1.5rem', fontFamily: 'Inter, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <History size={24} style={{ color: 'var(--accent-color)' }} />
                        Product Price History
                    </h2>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Audit log of product price modifications and details
                    </p>
                </div>
                <button style={{ padding: '0.5rem 1rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                    <Download size={16} /> Export CSV
                </button>
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input 
                            type="text" 
                            placeholder="Search by product, SKU, or user..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ width: '100%', padding: '0.6rem 1rem 0.6rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }}
                        />
                    </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ background: 'var(--bg-color)' }}>
                            <tr>
                                <th style={{ padding: '1rem 1.5rem', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>Date</th>
                                <th style={{ padding: '1rem 1.5rem', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>Product</th>
                                <th style={{ padding: '1rem 1.5rem', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>Changed By</th>
                                <th style={{ padding: '1rem 1.5rem', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>Purchase Price</th>
                                <th style={{ padding: '1rem 1.5rem', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>Selling Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading history...</td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No price history found.</td>
                                </tr>
                            ) : (
                                filtered.map((item, idx) => (
                                    <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.05 }} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-primary)' }}>
                                            {new Date(item.created_at).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', fontWeight: 600, color: 'var(--accent-color)' }}>
                                            {item.products?.name} <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '0.5rem', fontWeight: 400 }}>{item.products?.sku}</span>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-primary)' }}>
                                            {item.changed_by}
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <span style={{ color: 'var(--text-secondary)', textDecoration: 'line-through', marginRight: '0.5rem', fontSize: '0.9rem' }}>৳{item.old_purchase_price}</span>
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>৳{item.new_purchase_price}</span>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <span style={{ color: 'var(--text-secondary)', textDecoration: 'line-through', marginRight: '0.5rem', fontSize: '0.9rem' }}>৳{item.old_selling_price}</span>
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>৳{item.new_selling_price}</span>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ProductHistoryReport;
