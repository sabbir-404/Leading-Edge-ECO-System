import React from 'react';
import { motion } from 'framer-motion';
import { FileText, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const VoucherTypes: React.FC = () => {
    const navigate = useNavigate();
    const types = ['Payment', 'Receipt', 'Contra', 'Journal', 'Sales', 'Purchase', 'Credit Note', 'Debit Note'];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '1rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <button onClick={() => navigate('/masters')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center' }}><ArrowLeft size={20} /></button>
                <h2 style={{ fontWeight: 700 }}>Voucher Types</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                {types.map((type, i) => (
                    <motion.div key={type} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                        style={{ padding: '1rem 1.25rem', borderRadius: '10px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <FileText size={18} style={{ color: 'var(--accent-color)', opacity: 0.7 }} />
                        <span style={{ fontWeight: 500 }}>{type}</span>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
};

export default VoucherTypes;
