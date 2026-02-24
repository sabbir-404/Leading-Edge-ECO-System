import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import '../../Accounting/Masters/Masters.css';

const UnitCreate: React.FC = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        symbol: '',
        precision: 0,
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'precision' ? Number(value) : value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // @ts-ignore
            await window.electron.createUnit(formData);
            alert('Unit Created Successfully!');
            navigate('/masters/units');
        } catch (error) {
            console.error('Error creating unit:', error);
            alert('Failed to create unit');
        }
    };

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="master-create-container">
            <div className="header-actions" style={{ marginBottom: '1.5rem' }}>
                <button className="back-btn" onClick={() => navigate('/masters/units')}>
                    <ArrowLeft size={20} /> Back
                </button>
                <h2>Create Unit</h2>
            </div>

            <form onSubmit={handleSubmit} className="create-form">
                <div className="form-group">
                    <label>Unit Name</label>
                    <input name="name" value={formData.name} onChange={handleChange} required placeholder="e.g., Kilogram" />
                </div>

                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group">
                        <label>Symbol</label>
                        <input name="symbol" value={formData.symbol} onChange={handleChange} required placeholder="e.g., kg" />
                    </div>
                    <div className="form-group">
                        <label>Decimal Places</label>
                        <input type="number" name="precision" value={formData.precision} onChange={handleChange} min={0} max={4} />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button type="submit" className="save-btn">
                        <Save size={18} /> Save Unit
                    </button>
                </div>
            </form>
        </motion.div>
    );
};

export default UnitCreate;
