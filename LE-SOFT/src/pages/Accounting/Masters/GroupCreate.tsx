import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import './Masters.css';

const GroupCreate: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const editGroup = location.state?.editGroup;

    const [groups, setGroups] = useState<any[]>([]);
    const [formData, setFormData] = useState({
        name: editGroup ? editGroup.name : '',
        parent: editGroup ? (editGroup.parent_name || 'Primary') : 'Primary',
        nature: editGroup ? (editGroup.nature || 'Assets') : 'Assets',
    });

    useEffect(() => {
        const fetchGroups = async () => {
            try {
                // @ts-ignore
                const result = await window.electron.getGroups();
                // Exclude current editing group to avoid setting it as its own parent
                const filtered = editGroup
                    ? (result || []).filter((g: any) => g.id !== editGroup.id)
                    : (result || []);
                setGroups(filtered);
            } catch (error) {
                console.error('Failed to fetch groups:', error);
            }
        };
        fetchGroups();
    }, [editGroup]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editGroup) {
                // @ts-ignore
                await window.electron.updateGroup(editGroup.id, formData);
                alert('Group Updated Successfully!');
            } else {
                // @ts-ignore
                await window.electron.createGroup(formData);
                alert('Group Created Successfully!');
            }
            navigate('/masters/groups');
        } catch (error: any) {
            console.error('Error saving group:', error);
            alert(error?.message || 'Failed to save group');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="master-create-container"
        >
            <div className="header-actions" style={{ marginBottom: '1.5rem' }}>
                <button className="back-btn" onClick={() => navigate('/masters/groups')}>
                    <ArrowLeft size={20} /> Back
                </button>
                <h2>{editGroup ? 'Edit Group' : 'Create Group'}</h2>
            </div>

            <form onSubmit={handleSubmit} className="create-form">
                <div className="form-group">
                    <label>Name</label>
                    <input
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        placeholder="Enter group name"
                    />
                </div>

                <div className="form-group">
                    <label>Under (Parent Group)</label>
                    <select name="parent" value={formData.parent} onChange={handleChange}>
                        <option value="Primary">Primary</option>
                        {groups.map(g => (
                            <option key={g.id} value={g.name}>{g.name}</option>
                        ))}
                    </select>
                </div>

                {formData.parent === 'Primary' && (
                    <div className="form-group">
                        <label>Nature of Group</label>
                        <select name="nature" value={formData.nature} onChange={handleChange}>
                            <option value="Assets">Assets</option>
                            <option value="Liabilities">Liabilities</option>
                            <option value="Income">Income</option>
                            <option value="Expenses">Expenses</option>
                        </select>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button type="submit" className="save-btn">
                        <Save size={18} /> {editGroup ? 'Update Group' : 'Save Group'}
                    </button>
                </div>
            </form>
        </motion.div>
    );
};

export default GroupCreate;
