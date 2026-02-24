import React from 'react';
import { motion } from 'framer-motion';
import { Warehouse, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Godowns: React.FC = () => {
    const navigate = useNavigate();
    const godowns = [
        { name: 'Main Warehouse', location: 'Dhaka, Bangladesh' },
        { name: 'Showroom', location: 'Mirpur, Dhaka' },
    ];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '1rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <button onClick={() => navigate('/masters')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center' }}><ArrowLeft size={20} /></button>
                <h2 style={{ fontWeight: 700 }}>Godowns / Warehouses</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                {godowns.map((g, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                        style={{ padding: '1.25rem', borderRadius: '10px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#dc262620', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Warehouse size={20} style={{ color: '#dc2626' }} />
                        </div>
                        <div>
                            <strong>{g.name}</strong>
                            <p style={{ fontSize: '0.8rem', opacity: 0.5, margin: '2px 0 0' }}>{g.location}</p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
};

export default Godowns;
