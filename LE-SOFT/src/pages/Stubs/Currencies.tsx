import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Currencies: React.FC = () => {
    const navigate = useNavigate();
    const currencies = [
        { symbol: '৳', name: 'Bangladeshi Taka (BDT)', rate: 1.00 },
        { symbol: '$', name: 'US Dollar (USD)', rate: 0.0091 },
        { symbol: '€', name: 'Euro (EUR)', rate: 0.0084 },
        { symbol: '₹', name: 'Indian Rupee (INR)', rate: 0.76 },
        { symbol: '£', name: 'British Pound (GBP)', rate: 0.0072 },
    ];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '1rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <button onClick={() => navigate('/masters')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center' }}><ArrowLeft size={20} /></button>
                <h2 style={{ fontWeight: 700 }}>Currencies</h2>
            </div>
            <table style={{ width: '100%', maxWidth: '600px', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                        <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600, fontSize: '0.85rem', opacity: 0.7 }}>Symbol</th>
                        <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600, fontSize: '0.85rem', opacity: 0.7 }}>Currency</th>
                        <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600, fontSize: '0.85rem', opacity: 0.7 }}>Rate (vs BDT)</th>
                    </tr>
                </thead>
                <tbody>
                    {currencies.map((c, i) => (
                        <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.75rem', fontSize: '1.2rem', fontWeight: 700 }}>{c.symbol}</td>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>{c.name}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{c.rate.toFixed(4)}</td>
                        </motion.tr>
                    ))}
                </tbody>
            </table>
        </motion.div>
    );
};

export default Currencies;
