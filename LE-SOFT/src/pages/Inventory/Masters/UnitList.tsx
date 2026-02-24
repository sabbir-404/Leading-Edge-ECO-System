import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Edit2 } from 'lucide-react';
import { motion } from 'framer-motion';
import '../../Accounting/Masters/Masters.css';

const UnitList: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [units, setUnits] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchUnits = async () => {
        try {
            // @ts-ignore
            const result = await window.electron.getUnits();
            setUnits(result || []);
        } catch (error) {
            console.error('Failed to fetch units:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUnits(); }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this unit?')) return;
        try {
            // @ts-ignore
            await window.electron.deleteUnit(id);
            fetchUnits();
        } catch (error) {
            alert('Cannot delete unit — it may be in use by stock items.');
        }
    };

    const filtered = units.filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.symbol.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="master-list-container">
            <div className="list-header">
                <h2>Units of Measurement</h2>
                <button className="create-btn" onClick={() => navigate('/masters/units/create')}>
                    <Plus size={18} /> Create Unit
                </button>
            </div>

            <div className="search-bar">
                <Search size={18} />
                <input type="text" placeholder="Search units..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

            <div className="table-container">
                <table className="master-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Symbol</th>
                            <th>Decimal Places</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={4} className="empty-state">Loading...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={4} className="empty-state">No units found</td></tr>
                        ) : (
                            filtered.map((unit) => (
                                <motion.tr key={unit.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    <td style={{ fontWeight: 500 }}>{unit.name}</td>
                                    <td><span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(249,115,22,0.1)', color: 'var(--accent-color)', fontWeight: 500 }}>{unit.symbol}</span></td>
                                    <td>{unit.precision}</td>
                                    <td>
                                        <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                                            <button className="edit-btn"><Edit2 size={16} /></button>
                                            <button className="delete-btn" onClick={() => handleDelete(unit.id)}><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </motion.tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default UnitList;
