import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import '../../Accounting/Masters/Masters.css';

const StockGroupCreate: React.FC = () => {
    const navigate = useNavigate();
    const [stockGroups, setStockGroups] = useState<any[]>([]);
    const [formData, setFormData] = useState({
        name: '',
        parent: 'Primary',
    });

    useEffect(() => {
        const fetchGroups = async () => {
            try {
                // @ts-ignore
                const result = await window.electron.getStockGroups();
                setStockGroups(result || []);
            } catch (error) {
                console.error('Failed to fetch stock groups:', error);
            }
        };
        fetchGroups();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // @ts-ignore
            await window.electron.createStockGroup(formData);
            alert('Stock Group Created Successfully!');
            navigate('/masters/stock-groups');
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to create stock group');
        }
    };

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="master-create-container">
            <div className="header-actions" style={{ marginBottom: '1.5rem' }}>
                <button className="back-btn" onClick={() => navigate('/masters/stock-groups')}>
                    <ArrowLeft size={20} /> Back
                </button>
                <h2>Create Stock Group</h2>
            </div>

            <form onSubmit={handleSubmit} className="create-form">
                <div className="form-group">
                    <label>Group Name</label>
                    <input name="name" value={formData.name} onChange={handleChange} required placeholder="e.g., Electronics" />
                </div>

                <div className="form-group">
                    <label>Under (Parent Group)</label>
                    <select name="parent" value={formData.parent} onChange={handleChange}>
                        <option value="Primary">Primary</option>
                        {stockGroups.map(g => (
                            <option key={g.id} value={g.name}>{g.name}</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button type="submit" className="save-btn">
                        <Save size={18} /> Save Stock Group
                    </button>
                </div>
            </form>
        </motion.div>
    );
};

export default StockGroupCreate;
