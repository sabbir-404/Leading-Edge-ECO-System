import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

const PERMISSION_OPTIONS = [
    { key: 'masters', label: 'Masters', desc: 'Groups, Ledgers, Stock Items' },
    { key: 'vouchers', label: 'Vouchers', desc: 'Create & manage vouchers and bills' },
    { key: 'inventory', label: 'Inventory', desc: 'Products, Units, Stock Groups' },
    { key: 'users', label: 'User Management', desc: 'Manage users and groups' },
    { key: 'settings', label: 'Settings', desc: 'Company and app settings' },
    { key: 'website', label: 'Website Admin', desc: 'Manage website products and orders' },
    { key: 'reports', label: 'Reports', desc: 'View reports and analytics' },
    { key: 'can_create_user', label: 'Add User', desc: 'Allow adding new employee accounts' },
    { key: 'can_delete_user', label: 'Delete User', desc: 'Allow permanently deleting users' },
    { key: 'can_edit_user', label: 'Edit User', desc: 'Allow modifying user profiles and roles' },
    { key: 'can_edit_groups', label: 'Edit Groups', desc: 'Allow changing permission groups' },
    { key: 'can_create_bill', label: 'Create Bill', desc: 'Allow creating new POS bills' },
    { key: 'can_alter_bill', label: 'Alter Bill', desc: 'Allow altering existing bills' },
    { key: 'can_delete_bill', label: 'Delete Bill', desc: 'Allow deleting bills' },
    { key: 'can_create_order', label: 'Create Order', desc: 'Create MAKE manufacturing orders' },
    { key: 'can_alter_order', label: 'Alter Order', desc: 'Alter MAKE manufacturing orders' },
    { key: 'can_view_payroll', label: 'View Payroll', desc: 'View and generate employee payrolls' },
    { key: 'can_approve_leave', label: 'Approve Leave', desc: 'Approve or Reject staff leave requests' }
];

const UserGroupCreate: React.FC = () => {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [permissions, setPermissions] = useState<Record<string, boolean>>({});
    const [error, setError] = useState('');

    const togglePerm = (key: string) => {
        setPermissions(p => ({ ...p, [key]: !p[key] }));
    };

    const selectAll = () => {
        const all: Record<string, boolean> = {};
        PERMISSION_OPTIONS.forEach(p => all[p.key] = true);
        setPermissions(all);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setError('Group name is required'); return; }
        try {
            // @ts-ignore
            await window.electron.createUserGroup({ name, description, permissions });
            navigate('/users/groups');
        } catch (err: any) {
            setError(err.message || 'Failed to create group');
        }
    };

    return (
        <DashboardLayout title="Create User Group">
            <div className="masters-container">
                <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>
                    Create User Group
                </motion.h1>

                {error && <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem' }}>{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gap: '1rem', maxWidth: '600px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, fontSize: '0.9rem' }}>Group Name *</label>
                            <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Sales Team" style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'inherit', fontSize: '0.9rem' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, fontSize: '0.9rem' }}>Description</label>
                            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What this group does..." rows={2} style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'inherit', fontSize: '0.9rem', resize: 'vertical' }} />
                        </div>
                    </div>

                    <div style={{ marginTop: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <h3 style={{ fontWeight: 600 }}>Permissions</h3>
                            <button type="button" onClick={selectAll} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Select All</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.75rem' }}>
                            {PERMISSION_OPTIONS.map(perm => (
                                <motion.div key={perm.key}
                                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                    onClick={() => togglePerm(perm.key)}
                                    style={{
                                        padding: '1rem', borderRadius: '10px', cursor: 'pointer',
                                        border: permissions[perm.key] ? '2px solid var(--accent-color)' : '2px solid var(--border-color)',
                                        background: permissions[perm.key] ? 'rgba(99,102,241,0.08)' : 'var(--card-bg)',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div style={{
                                            width: '20px', height: '20px', borderRadius: '4px',
                                            border: permissions[perm.key] ? 'none' : '2px solid var(--border-color)',
                                            background: permissions[perm.key] ? 'var(--accent-color)' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px'
                                        }}>
                                            {permissions[perm.key] && '✓'}
                                        </div>
                                        <strong style={{ fontSize: '0.95rem' }}>{perm.label}</strong>
                                    </div>
                                    <p style={{ margin: '0.35rem 0 0 1.75rem', fontSize: '0.8rem', opacity: 0.6 }}>{perm.desc}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
                        <motion.button type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} style={{ padding: '0.6rem 2rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
                            Create Group
                        </motion.button>
                        <button type="button" onClick={() => navigate('/users/groups')} style={{ padding: '0.6rem 2rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'inherit' }}>Cancel</button>
                    </div>
                </form>
            </div>
        </DashboardLayout>
    );
};

export default UserGroupCreate;
