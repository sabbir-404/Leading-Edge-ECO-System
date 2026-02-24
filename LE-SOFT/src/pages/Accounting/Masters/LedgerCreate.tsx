import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import './Masters.css';

const LedgerCreate: React.FC = () => {
    const navigate = useNavigate();
    const [groups, setGroups] = useState<any[]>([]);
    const [formData, setFormData] = useState({
        name: '',
        group: 'Sundry Debtors',
        openingBalance: 0,
        type: 'Dr',
        mailingName: '',
        address: '',
        gstin: ''
    });

    useEffect(() => {
        const fetchGroups = async () => {
            try {
                // @ts-ignore
                const result = await window.electron.getGroups();
                setGroups(result || []);
            } catch (error) {
                console.error('Failed to fetch groups:', error);
            }
        };
        fetchGroups();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // @ts-ignore
            await window.electron.createLedger(formData);
            alert('Ledger Created Successfully!');
            navigate('/masters/ledgers');
        } catch (error) {
            console.error('Error creating ledger:', error);
            alert('Failed to create ledger');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="master-create-container"
        >
            <div className="header-actions" style={{ marginBottom: '1.5rem' }}>
                <button className="back-btn" onClick={() => navigate('/masters/ledgers')}>
                    <ArrowLeft size={20} /> Back
                </button>
                <h2>Create Ledger</h2>
            </div>

            <form onSubmit={handleSubmit} className="create-form">
                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="section-divider">General Info</div>

                        <div className="form-group">
                            <label>Name</label>
                            <input name="name" value={formData.name} onChange={handleChange} required placeholder="Ledger name" />
                        </div>

                        <div className="form-group">
                            <label>Under Group</label>
                            <select name="group" value={formData.group} onChange={handleChange}>
                                {groups.map(g => (
                                    <option key={g.id} value={g.name}>{g.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div className="form-group" style={{ flex: 2 }}>
                                <label>Opening Balance</label>
                                <input type="number" name="openingBalance" value={formData.openingBalance} onChange={handleChange} />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label>Type</label>
                                <select name="type" value={formData.type} onChange={handleChange}>
                                    <option value="Dr">Dr</option>
                                    <option value="Cr">Cr</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="section-divider">Mailing Details</div>

                        <div className="form-group">
                            <label>Mailing Name</label>
                            <input name="mailingName" value={formData.mailingName} onChange={handleChange} placeholder="Optional" />
                        </div>

                        <div className="form-group">
                            <label>Address</label>
                            <textarea name="address" value={formData.address} onChange={handleChange} rows={3} style={{
                                padding: '0.75rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--input-bg)',
                                color: 'var(--text-primary)',
                                fontSize: '1rem',
                                resize: 'vertical'
                            }} />
                        </div>

                        <div className="form-group">
                            <label>Tax / GSTIN</label>
                            <input name="gstin" value={formData.gstin} onChange={handleChange} placeholder="Optional" />
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                    <button type="submit" className="save-btn">
                        <Save size={20} /> Save Ledger
                    </button>
                </div>
            </form>
        </motion.div>
    );
};

export default LedgerCreate;
