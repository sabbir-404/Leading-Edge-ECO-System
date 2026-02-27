import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

const UserCreate: React.FC = () => {
    const navigate = useNavigate();
    const [groups, setGroups] = useState<any[]>([]);
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        confirmPassword: '',
        fullName: '',
        role: 'operator',
        groupId: '',
        email: '',
        phone: '',
    });
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchGroups = async () => {
            try {
                // @ts-ignore
                const data = await window.electron.getUserGroups();
                setGroups(data || []);
            } catch (e) { console.error(e); }
        };
        fetchGroups();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (formData.password.length < 4) {
            setError('Password must be at least 4 characters');
            return;
        }
        try {
            // @ts-ignore
            const res = await window.electron.createUser({ ...formData, groupId: formData.groupId ? Number(formData.groupId) : null });
            if (!res?.success) {
                setError(res?.error || 'Failed to create user');
                return;
            }
            alert('User Created Successfully!');
            navigate('/users');
        } catch (error: any) {
            setError(error?.message || 'Failed to create user');
        }
    };

    return (
        <DashboardLayout title="Create User">
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="master-create-container">
                <div className="header-actions" style={{ marginBottom: '1.5rem' }}>
                    <button className="back-btn" onClick={() => navigate('/users')}>
                        <ArrowLeft size={20} /> Back
                    </button>
                    <h2>Create New User</h2>
                </div>

                {error && <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 500, marginBottom: '1rem' }}>{error}</div>}

                <form onSubmit={handleSubmit} className="create-form">
                    <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <div className="form-group">
                            <label>Username *</label>
                            <input name="username" value={formData.username} onChange={handleChange} required placeholder="e.g., johndoe" />
                        </div>
                        <div className="form-group">
                            <label>Full Name</label>
                            <input name="fullName" value={formData.fullName} onChange={handleChange} placeholder="e.g., John Doe" />
                        </div>
                    </div>

                    <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <div className="form-group">
                            <label>Password *</label>
                            <input type="password" name="password" value={formData.password} onChange={handleChange} required placeholder="Min 4 characters" />
                        </div>
                        <div className="form-group">
                            <label>Confirm Password *</label>
                            <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required placeholder="Re-enter password" />
                        </div>
                    </div>

                    <div className="section-divider">Role, Group & Contact</div>

                    <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                        <div className="form-group">
                            <label>Role</label>
                            <select name="role" value={formData.role} onChange={handleChange}>
                                <option value="admin">Admin</option>
                                <option value="manager">Manager</option>
                                <option value="operator">Operator</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>User Group</label>
                            <select name="groupId" value={formData.groupId} onChange={handleChange}>
                                <option value="">— No Group —</option>
                                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Email</label>
                            <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="user@example.com" />
                        </div>
                        <div className="form-group">
                            <label>Phone</label>
                            <input name="phone" value={formData.phone} onChange={handleChange} placeholder="+880 1234567890" />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                        <button type="submit" className="save-btn">
                            <Save size={18} /> Create User
                        </button>
                    </div>
                </form>
            </motion.div>
        </DashboardLayout>
    );
};

export default UserCreate;
