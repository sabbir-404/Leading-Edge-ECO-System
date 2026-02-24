import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import '../../Accounting/Masters/Masters.css';

const StockItemCreate: React.FC = () => {
    const navigate = useNavigate();
    const [stockGroups, setStockGroups] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [formData, setFormData] = useState({
        name: '',
        group: '',
        unit: '',
        openingQty: 0,
        openingRate: 0,
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                // @ts-ignore
                const [groupsResult, unitsResult] = await Promise.all([
                    // @ts-ignore
                    window.electron.getStockGroups(),
                    // @ts-ignore
                    window.electron.getUnits()
                ]);
                setStockGroups(groupsResult || []);
                setUnits(unitsResult || []);
            } catch (error) {
                console.error('Failed to fetch data:', error);
            }
        };
        fetchData();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const openingValue = (Number(formData.openingQty) || 0) * (Number(formData.openingRate) || 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // @ts-ignore
            await window.electron.createStockItem(formData);
            alert('Stock Item Created Successfully!');
            navigate('/masters/stock-items');
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to create stock item');
        }
    };

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="master-create-container">
            <div className="header-actions" style={{ marginBottom: '1.5rem' }}>
                <button className="back-btn" onClick={() => navigate('/masters/stock-items')}>
                    <ArrowLeft size={20} /> Back
                </button>
                <h2>Create Stock Item</h2>
            </div>

            <form onSubmit={handleSubmit} className="create-form">
                <div className="form-group">
                    <label>Item Name</label>
                    <input name="name" value={formData.name} onChange={handleChange} required placeholder="e.g., Sofa Leg Golden" />
                </div>

                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group">
                        <label>Stock Group</label>
                        <select name="group" value={formData.group} onChange={handleChange}>
                            <option value="">— Select Group —</option>
                            {stockGroups.map(g => (
                                <option key={g.id} value={g.name}>{g.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Unit</label>
                        <select name="unit" value={formData.unit} onChange={handleChange}>
                            <option value="">— Select Unit —</option>
                            {units.map(u => (
                                <option key={u.id} value={u.name}>{u.name} ({u.symbol})</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="section-divider">Opening Balance</div>

                <div className="form-row">
                    <div className="form-group">
                        <label>Opening Quantity</label>
                        <input type="number" name="openingQty" value={formData.openingQty} onChange={handleChange} min={0} />
                    </div>
                    <div className="form-group">
                        <label>Rate (per unit)</label>
                        <input type="number" name="openingRate" value={formData.openingRate} onChange={handleChange} min={0} />
                    </div>
                    <div className="form-group">
                        <label>Value</label>
                        <input type="text" value={`৳ ${openingValue.toLocaleString()}`} readOnly style={{ fontWeight: 600, opacity: 0.8 }} />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                    <button type="submit" className="save-btn">
                        <Save size={18} /> Save Stock Item
                    </button>
                </div>
            </form>
        </motion.div>
    );
};

export default StockItemCreate;
